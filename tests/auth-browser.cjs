// Integration checks using the real SDK and an intercepted Supabase API.
// No email is sent; no real cloud credentials or user accounts are used.
// Start a local server first, then: node tests/auth-browser.cjs
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:8001';
const corsOrigin = new URL(origin).origin;
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9341;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${port}`, '--user-data-dir=' + fs.mkdtempSync(path.join(os.tmpdir(), 'nijiehon-auth-')), 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const sockets = [];
let configured = false, failOtp = false, expireUser = false, sends = 0, uploads = 0;
let signupSends = 0, signupResends = 0, recoverySends = 0, passwordUpdates = 0, savedPassword = '';
let verificationType = 'email';
const account = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'test@example.com', email_confirmed_at: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [] };
const token = () => [ { alg: 'HS256', typ: 'JWT' }, { sub: account.id, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now()/1000)+3600, iat: Math.floor(Date.now()/1000) } ].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.')+'.test-signature';
const session = () => ({ access_token: token(), refresh_token: 'test-refresh-token', expires_in: 3600, token_type: 'bearer', user: account });
async function connect(id) {
  const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const ws = new WebSocket(pages.find(page => page.id === id).webSocketDebuggerUrl); sockets.push(ws);
  await new Promise(resolve => { ws.onopen = resolve; });
  let counter = 0; const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++counter; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  ws.onmessage = async message => {
    const value = JSON.parse(message.data);
    if (value.id) { const waiter = pending.get(value.id); pending.delete(value.id); value.error ? waiter.reject(value.error) : waiter.resolve(value.result); }
    if (value.method === 'Fetch.requestPaused') {
      const { requestId, request } = value.params;
      let body = {}, code = 200, type = 'application/json';
      const url = new URL(request.url);
      if (url.pathname.endsWith('/auth-config.js')) {
        type = 'text/javascript';
        body = configured
          ? 'window.NIJI_AUTH_CONFIG={supabaseUrl:"https://fixture.supabase.co",publishableKey:"sb_publishable_fixture",emailEnabled:true};'
          : 'window.NIJI_AUTH_CONFIG={supabaseUrl:"",publishableKey:"",emailEnabled:true};';
      } else if (request.method === 'OPTIONS') { body = ''; }
      else if (url.pathname === '/auth/v1/otp') {
        sends++; verificationType = 'email';
        if (failOtp) { code = 429; body = { code: 'over_email_send_rate_limit', msg: 'rate limited' }; }
        else Object.assign(account.user_metadata, JSON.parse(request.postData).data);
      } else if (url.pathname === '/auth/v1/signup') {
        const { email, password, data } = JSON.parse(request.postData);
        assert.equal(email, account.email);
        assert.equal(password, 'SignupPass123');
        signupSends++; verificationType = 'signup'; savedPassword = password;
        Object.assign(account.user_metadata, data);
        body = account;
      } else if (url.pathname === '/auth/v1/resend') {
        const { type: resendType, email } = JSON.parse(request.postData);
        assert.equal(resendType, 'signup');
        assert.equal(email, account.email);
        signupResends++;
      } else if (url.pathname === '/auth/v1/recover') {
        assert.equal(JSON.parse(request.postData).email, account.email);
        recoverySends++; verificationType = 'recovery';
      }
      else if (url.pathname === '/auth/v1/verify') {
        const input = JSON.parse(request.postData);
        assert.equal(input.email, account.email);
        if (input.token === '123456' && input.type === verificationType) body = session();
        else { code = 403; body = { code: 'otp_expired', msg: 'Token has expired or is invalid' }; }
      } else if (url.pathname === '/auth/v1/token') {
        if (url.searchParams.get('grant_type') === 'password') {
          const { email, password } = JSON.parse(request.postData);
          if (email !== account.email || !savedPassword || password !== savedPassword) {
            code = 400; body = { code: 'invalid_credentials', msg: 'Invalid login credentials' };
          } else body = session();
        } else body = session();
      }
      else if (url.pathname === '/auth/v1/user') {
        if (expireUser) { code = 401; body = { code: 'session_not_found', msg: 'Session not found' }; }
        else {
          if (request.method === 'PUT') {
            const { data, password } = JSON.parse(request.postData);
            if (password) { savedPassword = password; passwordUpdates++; }
            Object.assign(account.user_metadata, data);
          }
          body = account;
        }
      } else if (url.pathname === '/auth/v1/logout') body = {};
      else if (url.pathname.includes('/storage/v1/object/')) {
        assert(url.pathname.endsWith(account.id + '/avatar.png'), 'avatar uses authenticated user id');
        if (request.method === 'POST') { uploads++; body = { Key: 'avatars/' + account.id + '/avatar.png' }; }
        else { type = 'image/png'; body = fs.readFileSync(path.join(__dirname, '../assets/default-avatar.png')); }
      } else { code = 404; body = { error: 'Unmocked endpoint' }; }
      const raw = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
      await send('Fetch.fulfillRequest', { requestId, responseCode: code, responseHeaders: [ {name:'X-Supabase-Api-Version',value:'2024-01-01'}, {name:'Access-Control-Expose-Headers',value:'X-Supabase-Api-Version'}, { name: 'Content-Type', value: type }, { name: 'Cache-Control', value: 'no-store' }, { name: 'Access-Control-Allow-Origin', value: corsOrigin }, { name: 'Access-Control-Allow-Headers', value: '*' }, { name: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' } ], body: raw.toString('base64') });
    }
  };
  await send('Fetch.enable', { patterns: [ { urlPattern: '*auth-config.js' }, { urlPattern: 'https://fixture.supabase.co/*' } ] });
  const run = async expression => { const value = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (value.exceptionDetails) throw Error(JSON.stringify(value.exceptionDetails)); return value.result.value; };
  const until = async expression => { for (let i=0; i<80; i++) { if (await run(expression)) return; await sleep(100); } throw Error('Timed out: '+expression+'; status='+await run('document.querySelector("[data-auth-status]")?.textContent')); };
  const navigate = async page => {
    const url = origin + '/' + page;
    const { loaderId, errorText } = await send('Page.navigate', { url });
    assert(!errorText, errorText);
    if (loaderId) {
      let loaded;
      for (let attempt = 0; attempt < 80 && loaded !== loaderId; attempt++) {
        loaded = (await send('Page.getFrameTree')).frameTree.frame.loaderId;
        if (loaded !== loaderId) await sleep(100);
      }
      assert.equal(loaded, loaderId, 'navigation committed for ' + page);
    }
    await until(`location.href === ${JSON.stringify(url)} && document.readyState === "complete"
      && !document.querySelector("[data-auth-status]")?.textContent.includes("正在确认")`);
    await run('document.fonts.ready.then(() => true)');
  };
  return { send, run, until, navigate };
}
(async () => {
  let pages;
  for (let i=0; i<50; i++) { try { pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(100); } }
  const main = await connect(pages.find(page => page.type === 'page').id);
  await main.navigate('index.html');
  assert(await main.run('document.querySelector("#email-submit").disabled && document.querySelector("[data-auth-status]").textContent.includes("即将开放")'));
  configured = true;
  await main.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 860, deviceScaleFactor: 1, mobile: false });
  await main.navigate('index.html');
  await main.run('sessionStorage.setItem("nijiehon.demoEmail","fake@example.com")');
  await main.navigate('index.html');
  assert(await main.run('!document.querySelector("#login").hidden && document.querySelector("#account-card").hidden && !sessionStorage.getItem("nijiehon.demoEmail")'));
  assert(await main.run('!document.querySelector("#login-password").parentElement.hidden && document.querySelector("#email-code-step").hidden'));
  assert(await main.run(`(async () => {
    const mark = document.querySelector(".brand-mark");
    const [font] = await document.fonts.load('400 22px "Noto Sans Cuneiform"', mark.textContent);
    const name = document.createRange();
    name.selectNode(mark.nextSibling);
    return mark.textContent === "𒀭" && font?.status === "loaded"
      && mark.getBoundingClientRect().right < name.getBoundingClientRect().left;
  })()`), 'the locally hosted logo renders to the left of NijiEhon');
  const equalLoginControls = `(() => {
    const email = document.querySelector("#login-email");
    const submit = document.querySelector("#email-submit");
    const controls = [email, submit].map(node => node.getBoundingClientRect());
    return controls[0].height >= 46 && controls[0].height <= 50
      && controls.every(box => Math.abs(box.height - controls[0].height) < .1 && Math.abs(box.width - controls[0].width) < .1)
      && [email, submit].every(node => parseFloat(getComputedStyle(node).borderTopLeftRadius) >= controls[0].height / 2);
  })()`;
  const alignedLoginOptions = `(() => {
    const submit = document.querySelector("#email-submit").getBoundingClientRect();
    const choices = [...document.querySelectorAll("#login-options button:not([hidden])")].map(node => node.getBoundingClientRect());
    return choices.length === 3 && choices[0].left === submit.left && Math.abs(choices.at(-1).right - submit.right) < 1
      && choices.every(box => box.y === choices[0].y && box.height === 44 && Math.abs(box.width - choices[0].width) < 1);
  })()`;
  const point = (page, selector) => page.run(`(() => {
    const box = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  })()`);
  assert(await main.run(equalLoginControls), 'desktop form controls share pill dimensions');
  assert(await main.run(alignedLoginOptions), 'desktop login options fill the same width');
  assert(await main.run(`(() => {
    const controls = [...document.querySelectorAll("header nav .nav-group summary")];
    const boxes = controls.map(node => node.getBoundingClientRect());
    const search = document.querySelector("header .search");
    const searchBox = search.getBoundingClientRect();
    const header = search.closest("header").getBoundingClientRect();
    const brand = document.querySelector(".brand").getBoundingClientRect();
    const hero = document.querySelector(".hero").getBoundingClientRect();
    return controls.map(node => node.textContent).join(",") === "研究,产品,关于,联系"
      && searchBox.width === 44 && searchBox.height === 44
      && Math.abs(searchBox.top - header.top - (header.height - searchBox.height) / 2) < 1
      && search.querySelector(".search-symbol")
      && search.getAttribute("aria-label") === "搜索" && !search.textContent.trim()
      && boxes.every(box => box.height === header.height && box.y === header.y)
      && Math.abs(brand.left - hero.left) < 1;
  })()`), 'search aligns with the four main navigation items');
  const searchCentered = `(() => {
    const dialog = document.querySelector("#site-search");
    const box = dialog.getBoundingClientRect();
    return Math.abs(box.left + box.right - document.body.clientWidth) < 1
      && box.bottom <= innerHeight && document.activeElement === dialog.querySelector("input");
  })()`;
  await main.run(`document.querySelector("header .search").focus(); document.activeElement.click();`);
  await main.until('document.querySelector("#site-search").open && !document.querySelector("#site-search").getAnimations().length');
  assert(await main.run(searchCentered), 'desktop search centers in the available viewport');
  await main.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 400, deviceScaleFactor: 1, mobile: false });
  await main.until(searchCentered);
  assert(await main.run(`(() => {
    const dialog = document.querySelector("#site-search");
    const results = dialog.querySelector(".search-results");
    return dialog.scrollHeight <= dialog.clientHeight + 1 && results.scrollHeight > results.clientHeight;
  })()`), 'short windows scroll search results inside the dialog');
  await main.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 860, deviceScaleFactor: 1, mobile: false });
  await main.until(searchCentered);
  await main.run(`(() => {
    const input = document.querySelector("#site-search-query");
    input.value = "giffgaff 未激活";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await main.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
  await main.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
  assert(await main.run('document.activeElement.matches(".search-results a") && document.activeElement.getAttribute("href") === "product-1.html"'));
  await main.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await main.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await main.until('!document.querySelector("#site-search").open && document.activeElement.matches("header .search")');
  assert(await main.run(`(() => {
    const poster = document.querySelector(".banner").getBoundingClientRect();
    const articles = [...document.querySelectorAll(".article-list > a")];
    return Math.abs(poster.width / poster.height - 16 / 9) < 0.01
      && articles.length === 3 && articles.every(link => {
        const image = link.querySelector(".mini").getBoundingClientRect();
        return Math.abs(image.width - image.height) < 1 && getComputedStyle(link).borderBottomWidth === "0px"
          && !!link.querySelector("time[datetime='2026-11-28']");
      });
  })()`), 'poster ratio, square article thumbnails and dates are present');
  assert(await main.run(`(() => {
    const button = document.querySelector("header .login");
    const login = getComputedStyle(button);
    const { width, height } = button.getBoundingClientRect();
    return login.color === "rgb(255, 255, 255)" && login.backgroundColor === "rgb(32, 32, 35)"
      && width >= 84 && height === 36 && getComputedStyle(button, "::after").height === "44px"
      && getComputedStyle(document.querySelector(".login-privacy")).textAlign === "center";
  })()`), 'the low, wide dark login pill retains a 44px hit area');
  const researchPage = await (await fetch(origin + '/research.html')).text();
  const featured = researchPage.match(/<div class="grid">([\s\S]*?)<\/div>\s*(?:<div class="article-list">|<!-- END ADMIN: research -->)/)?.[1];
  assert.equal(featured?.match(/class="article-meta"/g)?.length, 3, 'all featured research cards show dates and reading times');
  assert(await main.run('getComputedStyle(document.querySelector("header"), "::after").transitionDuration === "0.22s"'));
  const productCards = '[...document.querySelectorAll(".grid > .tile")]';
  const revealIsPlaying = 'card => card.getAnimations().some(animation => animation.animationName === "reveal-in")';
  assert(await main.run(`!${productCards}.some(${revealIsPlaying})`));
  await main.run('document.querySelector(".grid").scrollIntoView({ block: "center" })');
  await main.until(`${productCards}.every(${revealIsPlaying})`);
  assert.deepEqual(await main.run(`${productCards}.map(card => getComputedStyle(card).animationDelay)`), ['0s', '0.05s', '0.1s']);
  await main.until(`!${productCards}.some(${revealIsPlaying})`);
  await main.run(`(async () => {
    window.scrollTo(0, 0);
    await new Promise(requestAnimationFrame);
    document.querySelector(".grid").scrollIntoView({ block: "center" });
    await new Promise(requestAnimationFrame);
  })()`);
  assert(await main.run(`!${productCards}.some(${revealIsPlaying})`), 'product cards reveal only once when scrolled into view');
  await main.run('window.scrollTo(0, 0)');
  const hover = async selector =>
    main.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...await point(main, selector) });
  const linkColor = selector => `getComputedStyle(document.querySelector(${JSON.stringify(selector)})).color`;
  const mutedColor = 'rgb(85, 85, 92)';
  const submenuLink = '#contact-menu a[href="donate.html"]';
  await hover('#contact-menu summary');
  await main.until('document.querySelector("#contact-menu").open');
  await main.until('getComputedStyle(document.body, "::before").opacity === "1"');
  assert(await main.run(`(() => {
    const header = document.querySelector("header");
    const panel = document.querySelector("#contact-menu > div").getBoundingClientRect();
    const background = getComputedStyle(document.body, "::before");
    return background.backdropFilter === "blur(10px)" && background.pointerEvents === "auto"
      && header.clientWidth === document.body.clientWidth && panel.width === header.clientWidth;
  })()`), 'desktop menu spans the viewport above the blurred page');
  const submenuRest = await main.run(linkColor(submenuLink));
  assert.notEqual(submenuRest, mutedColor);
  await hover(submenuLink);
  await main.until(`${linkColor(submenuLink)} === "${mutedColor}"`);
  await hover('#contact-menu summary');
  await main.until(`${linkColor(submenuLink)} === "${submenuRest}"`);
  await main.run('document.querySelector("#contact-menu summary").click()');
  assert(await main.run('!document.querySelector("#contact-menu").open'), 'desktop hover menu still accepts click');
  await main.until('getComputedStyle(document.body, "::before").visibility === "hidden"');
  const footerLink = '.footer-links a[href="terms.html"]';
  await main.run(`document.querySelector(${JSON.stringify(footerLink)}).scrollIntoView({ block: "center" })`);
  const footerRest = await main.run(linkColor(footerLink));
  assert.notEqual(footerRest, mutedColor);
  await hover(footerLink);
  await main.until(`${linkColor(footerLink)} === "${mutedColor}"`);
  await main.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
  await main.until(`${linkColor(footerLink)} === "${footerRest}"`);
  await main.run(`document.querySelector(${JSON.stringify(footerLink)}).focus()`);
  await main.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await main.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await main.until(`document.activeElement.matches('.footer-links a[href="privacy.html"]:focus-visible')
    && getComputedStyle(document.activeElement).outlineStyle === "solid"`);
  await main.run('document.activeElement.blur(); window.scrollTo(0, 0)');
  await main.send('Emulation.setDeviceMetricsOverride', { width: 895, height: 740, deviceScaleFactor: 1, mobile: false });
  await main.until('document.querySelector("#site-navigation").inert && getComputedStyle(document.querySelector(".nav-toggle")).display !== "none"');
  await main.run('document.querySelector(".nav-toggle").focus()');
  await main.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
  await main.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await main.until('document.activeElement.matches("#research-menu summary") && document.querySelector("main").inert').catch(async error => {
    const state = await main.run(`JSON.stringify({
      focus: document.activeElement.outerHTML.slice(0, 150),
      expanded: document.querySelector(".nav-toggle").getAttribute("aria-expanded"),
      visible: getComputedStyle(document.querySelector("#site-navigation")).visibility
    })`);
    throw new Error(error.message + '; ' + state);
  });
  await main.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await main.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await main.until('document.activeElement.matches(".nav-toggle") && !document.querySelector("main").inert');
  await main.send('Emulation.setDeviceMetricsOverride', { width: 896, height: 740, deviceScaleFactor: 1, mobile: false });
  await main.until('getComputedStyle(document.querySelector(".nav-toggle")).display === "none" && !document.querySelector("#site-navigation").inert');
  await main.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 740, deviceScaleFactor: 1, mobile: true });
  await main.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await main.navigate('index.html?mobile');
  await main.until('location.search === "?mobile"');
  await main.run('document.querySelector(".article-list > a").scrollIntoView({ block: "center" })');
  await main.until('document.querySelector(".article-list > a").classList.contains("scroll-reveal")');
  assert.equal(await main.run('getComputedStyle(document.querySelector(".article-list > a")).getPropertyValue("--reveal-distance").trim()'), '.75rem');
  await main.run('window.scrollTo(0, 0)');
  const tap = async selector => {
    await main.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [await point(main, selector)] });
    await main.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  assert(await main.run('document.querySelector("header").getBoundingClientRect().height === 52 && document.querySelector("#site-navigation").inert'));
  await tap('.nav-toggle');
  await main.until('getComputedStyle(document.querySelector("#site-navigation")).clipPath === "inset(0px)"');
  assert(await main.run('document.querySelector("main").inert && !document.querySelector("#site-navigation").inert'));
  await tap('#contact-menu summary');
  await main.until('document.querySelector("#contact-menu").open');
  await tap('.nav-back');
  await main.until('!document.querySelector("#contact-menu").open && document.querySelector("header").hasAttribute("data-drawer-open")');
  await tap('#contact-menu summary');
  await main.until('document.querySelector("#contact-menu").open');
  await tap('header .search');
  await main.until('document.querySelector("#site-search").open && !document.querySelector("header").hasAttribute("data-drawer-open")');
  await main.until('!document.querySelector("#site-search").getAnimations().length');
  assert(await main.run(searchCentered), 'search remains centered with focus on its input');
  assert(await main.run('document.querySelector(".search-close").getBoundingClientRect().width === 44 && document.documentElement.scrollWidth <= innerWidth'));
  await tap('.search-close');
  await main.until('!document.querySelector("#site-search").open');
  await main.run('document.querySelector(\'[data-login-mode="otp"]\').click()');
  assert(await main.run(equalLoginControls), 'mobile email field matches send-code button');
  assert(await main.run(alignedLoginOptions), 'mobile login options fill the same width');
  assert(await main.run('document.documentElement.scrollWidth <= innerWidth && document.querySelector(".back-to-top").hidden'));
  await main.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  assert(await main.run('getComputedStyle(document.querySelector("header")).animationName === "none"'));
  await main.run('document.querySelector(".grid > .tile").scrollIntoView({ block: "center" })');
  assert(await main.run(`!${productCards}.some(${revealIsPlaying})`), 'reduced motion shows cards immediately');
  await main.run('window.scrollTo(0, document.body.scrollHeight)');
  await main.until(`(() => {
    const button = document.querySelector(".back-to-top");
    return !button.hidden && button.getBoundingClientRect().bottom <= document.querySelector(".footer-bottom").getBoundingClientRect().top;
  })()`);
  const footerLayout = await main.run(`(() => {
    const copyright = document.querySelector(".footer-copyright");
    const label = document.querySelector(".footer-language summary").getBoundingClientRect();
    const text = copyright.getBoundingClientRect();
    const footer = document.querySelector(".footer-bottom").getBoundingClientRect();
    const back = document.querySelector(".back-to-top").getBoundingClientRect();
    return { text: text.toJSON(), label: label.toJSON(), footer: footer.toJSON(), back: back.toJSON(),
      lineHeight: parseFloat(getComputedStyle(copyright).lineHeight), viewport: innerWidth };
  })()`);
  const { text, label, footer, back, lineHeight, viewport } = footerLayout;
  assert(text.right <= label.left && Math.abs(text.height - lineHeight) < 1
    && Math.abs((text.top + text.bottom) - (label.top + label.bottom)) < 1
    && label.right <= viewport && back.bottom <= footer.top,
  'footer copyright and language fit on one row at 320px: ' + JSON.stringify(footerLayout));
  await tap('.footer-language summary');
  await main.until('document.querySelector(".footer-language").open');
  await tap('.language-options button');
  await main.until('!document.querySelector(".footer-language").open');
  await tap('.back-to-top');
  await main.until('window.scrollY === 0 && document.querySelector(".back-to-top").hidden && document.activeElement.classList.contains("brand")');
  await main.send('Emulation.setEmulatedMedia', { features: [] });
  await main.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await main.send('Emulation.clearDeviceMetricsOverride');
  failOtp = true;
  await main.run('document.querySelector("#login-email").value="test@example.com";document.querySelector("#login").requestSubmit()');
  await main.until('document.querySelector("[data-auth-status]").textContent.includes("过于频繁")');
  failOtp = false;
  await main.run('document.querySelector("#login").requestSubmit()');
  await main.until('!document.querySelector("#email-code-step").hidden && document.querySelector("#login").getAttribute("aria-busy") === "false"');
  assert(await main.run('!document.querySelector("#login").hidden && document.querySelector("#resend-code").disabled'));
  await main.run('document.querySelector("#login-code").value="999999";document.querySelector("#login").requestSubmit()');
  await main.until('document.querySelector("[data-auth-status]").textContent.includes("验证码无效")');
  assert(await main.run('document.querySelector("#account-card").hidden'));
  await main.run('document.querySelector("#login-code").value="123456";document.querySelector("#login").requestSubmit()');
  await main.until('document.querySelector("#login").hidden && !document.querySelector("#account-card").hidden');
  const homeAvatarCentered = `(() => {
    const card = document.querySelector("#account-card").getBoundingClientRect();
    const avatar = document.querySelector(".account-card-avatar").getBoundingClientRect();
    return avatar.width > 0 && Math.abs((card.left + card.right) - (avatar.left + avatar.right)) < 1;
  })()`;
  assert(await main.run(homeAvatarCentered), 'default avatar is centered in the welcome card on desktop');
  const secondId = (await main.send('Target.createTarget', { url: 'about:blank' })).targetId;
  const second = await connect(secondId);
  await second.navigate('account.html');
  assert.equal(await second.run('document.querySelector("#email").textContent'), account.email);
  await second.run(`(() => {
    const form = document.querySelector('#shipping-address form');
    const address = { recipient: '测试收件人', phone: '0000000000', country: '中国', city: '测试市', street: '测试路 1 号' };
    for (const [name, value] of Object.entries(address)) form.elements[name].value = value;
    form.requestSubmit();
  })()`);
  assert(await second.run('document.querySelector("#shipping-address address").textContent.includes("测试收件人")'));
  await second.navigate('account.html');
  assert(await second.run('!document.querySelector("[data-address-saved]").hidden && document.querySelector("#shipping-address address").textContent.includes("测试路")'));
  assert(await second.run(`(() => {
    const button = document.querySelector("#account-settings");
    return button.classList.contains("icon-button") && button.getAttribute("aria-label") === "设置"
      && button.querySelector("svg") && !button.textContent.trim();
  })()`), 'account settings is an accessible icon button');
  const accountHeadingAligned = `(() => {
    const title = document.querySelector("main h1").getBoundingClientRect();
    const settings = document.querySelector("#account-settings").getBoundingClientRect();
    const header = document.querySelector("header").getBoundingClientRect();
    return title.right < settings.left && Math.abs((title.top + title.bottom) - (settings.top + settings.bottom)) < 1
      && Math.min(title.top, settings.top) - header.bottom >= 24;
  })()`;
  assert(await second.run(accountHeadingAligned), 'account title and settings align on desktop with space below the header');
  await second.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert(await second.run(accountHeadingAligned), 'account title and settings align on mobile with space below the header');
  assert.equal(await second.run('document.querySelector("#password-help").textContent'), '现在设置密码');
  await second.run('document.querySelector("#password-help").click()');
  assert(await second.run('document.querySelector("#password-help-dialog").open && document.querySelector("#password-help-message").textContent.includes("右上角")'));
  await second.run('document.querySelector("#go-to-password-settings").click()');
  assert(await second.run('document.querySelector("#settings-dialog").open && document.querySelector("#password-settings").open && document.activeElement.id === "account-password"'));
  assert(await second.run('document.querySelector("#settings-dialog").getBoundingClientRect().right <= innerWidth && document.documentElement.scrollWidth <= innerWidth'));
  await second.run('document.querySelector("#account-password").value="OriginalPass123";document.querySelector("#account-password-confirm").value="OriginalPass123";document.querySelector(\'[aria-controls="account-password"]\').click()');
  assert(await second.run('document.querySelector("#account-password").type === "text" && document.querySelector("#account-password-confirm").type === "password"'));
  await second.run('document.querySelector("#password-settings-form").requestSubmit()');
  await second.until('document.querySelector("#password-status").textContent.includes("密码已保存")');
  assert.equal(passwordUpdates, 1);
  assert(await second.run('document.querySelector("#password-help").hidden && document.querySelector("#password-settings summary").textContent === "修改密码" && document.querySelector("#account-password").type === "password"'));
  await second.run('document.querySelector("#profile-settings-form").closest("details").open=true;document.querySelector("#account-nickname").value="  彩虹  ";document.querySelector("#profile-settings-form").requestSubmit()');
  await second.until('document.querySelector("#profile-status").textContent.includes("昵称已保存")');
  assert.equal(account.user_metadata.nickname, '彩虹');
  assert.equal(await second.run('document.querySelector("#name").textContent'), '彩虹');
  await main.until('document.querySelector("[data-account-name]").textContent === "彩虹"');
  await second.run('document.querySelector("#settings-avatar").click()');
  assert(await second.run('document.querySelector("#avatar-dialog").open && document.querySelector("#settings-dialog").open'));
  await second.run('document.querySelector("#avatar-close").click();document.querySelector("#settings-dialog [data-close-dialog]").click()');
  await second.run('document.querySelector("#avatar-preview").click()');
  assert(await second.run('document.querySelector("#avatar-dialog").open && !document.querySelector("#avatar-settings").hidden && !document.querySelector("#settings-dialog").open'));
  await second.run(`(async()=>{const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;canvas.getContext('2d').fillRect(32,32,64,64);const blob=await new Promise(r=>canvas.toBlob(r));const dt=new DataTransfer();dt.items.add(new File([blob],'avatar.png',{type:'image/png'}));const input=document.querySelector('#avatar-file');input.files=dt.files;input.dispatchEvent(new Event('change'));})()`);
  await second.until('document.querySelector("#avatar-status").textContent.includes("已保存")');
  assert.equal(uploads, 1);
  await second.until('document.querySelector(".portrait").src.startsWith("blob:")');
  await main.until('document.querySelector(".account-card-avatar").src.startsWith("blob:")');
  await main.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert(await main.run(homeAvatarCentered), 'custom avatar is centered in the welcome card on mobile');
  await main.send('Emulation.clearDeviceMetricsOverride');
  const signOut = () => second.run('document.querySelector("#account-settings").click();document.querySelector("#settings-dialog [data-sign-out]").click()');
  await second.run('document.querySelector("#avatar-close").click()');
  await signOut();
  await main.until('!document.querySelector("#login").hidden && document.querySelector("#account-card").hidden');
  assert(await second.run('document.querySelector("#name").textContent === "访客" && document.querySelector(".portrait").getAttribute("src") === "assets/default-avatar.png"'));
  assert(await second.run('document.querySelector("[data-address-member]").hidden && !document.querySelector("#shipping-address address").textContent'));
  await main.navigate('index.html');
  assert(await main.run('!document.querySelector("#login").hidden'));
  await main.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert(await main.run('document.documentElement.scrollWidth <= innerWidth'));
  fs.writeFileSync(path.join(os.tmpdir(),'nijiehon-login-mobile.png'),Buffer.from((await main.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await main.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  fs.writeFileSync(path.join(os.tmpdir(),'nijiehon-login-desktop.png'),Buffer.from((await main.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  const emailCount = sends;
  await main.run('document.querySelector("#login-email").value="test@example.com";document.querySelector("#login-password").value="WrongPass123";document.querySelector("#login").requestSubmit()');
  await main.until('document.querySelector("[data-auth-status]").textContent.includes("邮箱或密码有误")');
  delete account.user_metadata.password_configured;
  await main.run('document.querySelector("#login-password").value="OriginalPass123";document.querySelector("#login").requestSubmit()');
  await main.until('document.querySelector("#login").hidden && document.querySelector("#login").getAttribute("aria-busy") === "false"');
  assert.equal(account.user_metadata.password_configured, true);
  assert.equal(sends, emailCount);
  assert.equal(signupSends + recoverySends, 0);
  assert(await main.run('!document.querySelector("#account-card [data-sign-out]")'));
  await second.until('document.querySelector("#account-login").hidden');
  await signOut();
  await main.until('!document.querySelector("#login").hidden && document.querySelector("#login").getAttribute("aria-busy") === "false"');

  await main.run('document.querySelector(\'[data-login-mode="signup"]\').click();document.querySelector("#login-email").value="test@example.com";document.querySelector("#login-password").value="SignupPass123";document.querySelector("#login-password-confirm").value="MismatchPass123";document.querySelector("#login").requestSubmit()');
  await main.until('document.querySelector("[data-auth-status]").textContent.includes("不一致")');
  assert.equal(signupSends, 0);
  await main.run('document.querySelector("#login-password-confirm").value="SignupPass123";document.querySelector("#login").requestSubmit()');
  await main.until('!document.querySelector("#email-code-step").hidden && document.querySelector("#login").getAttribute("aria-busy") === "false"');
  assert.equal(signupSends, 1);
  assert(await main.run('document.querySelector("#login-password").value === ""'));
  await main.run('window.actualNow=Date.now.bind(Date);Date.now=()=>window.actualNow()+61000');
  await main.until('!document.querySelector("#resend-code").disabled');
  await main.run('document.querySelector("#resend-code").click()');
  await main.until('document.querySelector("#login").getAttribute("aria-busy") === "false"');
  assert.equal(signupResends, 1);
  assert.equal(signupSends, 1);
  await main.run('document.querySelector("#login-code").value="123456";document.querySelector("#login").requestSubmit()');
  await main.until('document.querySelector("#login").hidden');
  await second.until('document.querySelector("#account-login").hidden');
  await signOut();
  await main.until('!document.querySelector("#login").hidden && document.querySelector("#login").getAttribute("aria-busy") === "false"');

  await main.run('Date.now=()=>window.actualNow()+122000;document.querySelector(\'[data-login-mode="recovery"]\').click();document.querySelector("#login-email").value="test@example.com";document.querySelector("#login").requestSubmit()');
  await main.until('!document.querySelector("#email-code-step").hidden && document.querySelector("#login").getAttribute("aria-busy") === "false"');
  assert.equal(recoverySends, 1);
  await main.run('document.querySelector("#login-code").value="123456";document.querySelector("#login").requestSubmit()');
  await main.until('document.querySelector("#login-title").textContent === "设置新密码" && document.querySelector("#login").getAttribute("aria-busy") === "false"');
  assert(await main.run('!document.querySelector("#login").hidden && document.querySelector("#account-card").hidden && document.querySelector("#login-code").value === ""'));
  await main.run('document.querySelector(\'[aria-controls="login-password-confirm"]\').click()');
  assert(await main.run('document.querySelector("#login-password-confirm").type === "text" && document.querySelector("#login-password").type === "password"'));
  await main.run('document.querySelector("#login-password").value="RecoveryPass123";document.querySelector("#login-password-confirm").value="RecoveryPass123";document.querySelector("#login").requestSubmit()');
  await main.until('document.querySelector("#login").hidden && !document.querySelector("#account-card").hidden');
  assert.equal(passwordUpdates, 2);
  assert.equal(savedPassword, 'RecoveryPass123');
  // Reject the current session on restoration: stale local tokens cannot display a user.
  expireUser = true;
  await main.navigate('account.html');
  assert(await main.run('document.querySelector("#name").textContent === "访客"'));
  await main.send('Emulation.setDeviceMetricsOverride', { width: 1096, height: 773, deviceScaleFactor: 1, mobile: false });
  await main.navigate('research.html');
  assert(await main.run(`(() => {
    const cards = [...document.querySelectorAll(".grid .cover, .article-list .mini")];
    return cards.length > 3 && cards.every(card => card.clientWidth > 0 && Math.abs(card.clientWidth - card.clientHeight) < 1);
  })()`), 'research covers and thumbnails stay square');
  await main.navigate('product-1.html');
  assert(await main.run(`(() => {
    const price = document.querySelector(".product-price").getBoundingClientRect();
    const button = document.querySelector(".product-offer .favorite-button").getBoundingClientRect();
    return price.right < button.left && Math.abs(price.top + price.bottom - button.top - button.bottom) < 1;
  })()`), 'product price and favorite action share a row');
  console.log('PASS: password sign-in without email; OTP fallback; password help, setup and visibility; nickname and avatar settings; signup, resend and recovery; session restoration and logout; responsive controls, hover navigation, touch and back to top. Mock API only.');
  await main.send('Browser.close');
})().catch(error => { console.error(error); process.exitCode=1; }).finally(() => { sockets.forEach(socket=>socket.close()); browser.kill(); });
