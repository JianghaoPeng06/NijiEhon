// Integration checks using the real SDK and an intercepted Supabase API.
// No email is sent; no real cloud credentials or user accounts are used.
// Start a local server first, then: node tests/auth-browser.cjs
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:8001';
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9341;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${port}`, '--user-data-dir=' + fs.mkdtempSync(path.join(os.tmpdir(), 'nijiehon-auth-')), 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const sockets = [];
let configured = false, failOtp = false, expireUser = false, sends = 0, uploads = 0;
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
      else if (url.pathname === '/auth/v1/otp') { sends++; if (failOtp) { code = 429; body = { code: 'over_email_send_rate_limit', msg: 'rate limited' }; } }
      else if (url.pathname === '/auth/v1/verify') {
        const input = JSON.parse(request.postData);
        if (input.token === '123456' && input.type === 'email') body = session();
        else { code = 403; body = { code: 'otp_expired', msg: 'Token has expired or is invalid' }; }
      } else if (url.pathname === '/auth/v1/token') body = session();
      else if (url.pathname === '/auth/v1/user') {
        if (expireUser) { code = 401; body = { code: 'session_not_found', msg: 'Session not found' }; }
        else { if (request.method === 'PUT') Object.assign(account.user_metadata, JSON.parse(request.postData).data); body = account; }
      } else if (url.pathname === '/auth/v1/logout') body = {};
      else if (url.pathname.includes('/storage/v1/object/')) {
        assert(url.pathname.endsWith(account.id + '/avatar.png'), 'avatar uses authenticated user id');
        if (request.method === 'POST') { uploads++; body = { Key: 'avatars/' + account.id + '/avatar.png' }; }
        else { type = 'image/png'; body = fs.readFileSync(path.join(__dirname, '../assets/default-avatar.png')); }
      } else { code = 404; body = { error: 'Unmocked endpoint' }; }
      const raw = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
      await send('Fetch.fulfillRequest', { requestId, responseCode: code, responseHeaders: [ {name:'X-Supabase-Api-Version',value:'2024-01-01'}, {name:'Access-Control-Expose-Headers',value:'X-Supabase-Api-Version'}, { name: 'Content-Type', value: type }, { name: 'Access-Control-Allow-Origin', value: origin }, { name: 'Access-Control-Allow-Headers', value: '*' }, { name: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' } ], body: raw.toString('base64') });
    }
  };
  await send('Fetch.enable', { patterns: [ { urlPattern: '*auth-config.js' }, { urlPattern: 'https://fixture.supabase.co/*' } ] });
  const run = async expression => { const value = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (value.exceptionDetails) throw Error(JSON.stringify(value.exceptionDetails)); return value.result.value; };
  const until = async expression => { for (let i=0; i<80; i++) { if (await run(expression)) return; await sleep(100); } throw Error('Timed out: '+expression+'; status='+await run('document.querySelector("[data-auth-status]").textContent')); };
  const navigate = async page => { await send('Page.navigate', { url: origin + '/' + page }); await until('document.readyState === "complete" && !!document.querySelector("[data-auth-status]") && !document.querySelector("[data-auth-status]").textContent.includes("正在确认")'); };
  return { send, run, until, navigate };
}
(async () => {
  let pages;
  for (let i=0; i<50; i++) { try { pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(100); } }
  const main = await connect(pages.find(page => page.type === 'page').id);
  await main.navigate('index.html');
  assert(await main.run('document.querySelector("#email-submit").disabled && document.querySelector("[data-auth-status]").textContent.includes("即将开放")'));
  configured = true;
  await main.navigate('index.html');
  await main.run('sessionStorage.setItem("nijiehon.demoEmail","fake@example.com")');
  await main.navigate('index.html');
  assert(await main.run('!document.querySelector("#login").hidden && document.querySelector("#account-card").hidden && !sessionStorage.getItem("nijiehon.demoEmail")'));
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
  const secondId = (await main.send('Target.createTarget', { url: 'about:blank' })).targetId;
  const second = await connect(secondId);
  await second.navigate('account.html');
  assert.equal(await second.run('document.querySelector("#email").textContent'), account.email);
  await second.run('document.querySelector("#avatar-preview").click()');
  assert(await second.run('document.querySelector("#avatar-dialog").open && !document.querySelector("#avatar-settings").hidden'));
  await second.run(`(async()=>{const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;canvas.getContext('2d').fillRect(32,32,64,64);const blob=await new Promise(r=>canvas.toBlob(r));const dt=new DataTransfer();dt.items.add(new File([blob],'avatar.png',{type:'image/png'}));const input=document.querySelector('#avatar-file');input.files=dt.files;input.dispatchEvent(new Event('change'));})()`);
  await second.until('document.querySelector("#avatar-status").textContent.includes("已保存")');
  assert.equal(uploads, 1);
  await second.until('document.querySelector(".portrait").src.startsWith("blob:")');
  await main.until('document.querySelector(".account-card-avatar").src.startsWith("blob:")');
  await second.run('document.querySelector("#avatar-close").click();document.querySelector("[data-sign-out]").click()');
  await main.until('!document.querySelector("#login").hidden && document.querySelector("#account-card").hidden');
  assert(await second.run('document.querySelector("#name").textContent === "访客" && document.querySelector(".portrait").getAttribute("src") === "assets/default-avatar.png"'));
  await main.navigate('index.html');
  assert(await main.run('!document.querySelector("#login").hidden'));
  await main.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert(await main.run('document.documentElement.scrollWidth <= innerWidth'));
  fs.writeFileSync(path.join(os.tmpdir(),'nijiehon-login-mobile.png'),Buffer.from((await main.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await main.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  fs.writeFileSync(path.join(os.tmpdir(),'nijiehon-login-desktop.png'),Buffer.from((await main.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  // Create a session, then reject it on restoration: stale local tokens cannot display a user.
  await main.run('document.querySelector("#login-email").value="test@example.com";document.querySelector("#login").requestSubmit()');
  await main.until('!document.querySelector("#email-code-step").hidden && document.querySelector("#login").getAttribute("aria-busy") === "false"');
  await main.run('document.querySelector("#login-code").value="123456";document.querySelector("#login").requestSubmit()');
  await main.until('document.querySelector("#login").hidden');
  expireUser = true;
  await main.navigate('account.html');
  assert(await main.run('document.querySelector("#name").textContent === "访客"'));
  console.log('PASS: missing config; demo rejection; rate limit; OTP send/invalid/valid; real SDK session restore; two-tab signout; private avatar upload/sync; revoked session; mobile layout. Mock API only.');
  await main.send('Browser.close');
})().catch(error => { console.error(error); process.exitCode=1; }).finally(() => { sockets.forEach(socket=>socket.close()); browser.kill(); });
