const header = document.querySelector("header");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const externalArrow = header.querySelector(".external-icon");
function markExternalLinks(root) {
  if (!externalArrow) return;
  for (const link of root.querySelectorAll("a[href]")) {
    if (!["http:", "https:"].includes(link.protocol) || link.origin === location.origin || link.querySelector(".external-icon")) continue;
    const icon = externalArrow.cloneNode(true);
    icon.setAttribute("style", "width: .75em; height: .75em; vertical-align: -.05em");
    link.append(" ", icon);
  }
}
markExternalLinks(document);

const mobileOutline = document.querySelector(".article-outline-mobile");
if (mobileOutline) {
  const mobile = mobileOutline;
  const articleLayout = mobile.closest(".article-layout");
  const body = articleLayout.querySelector(".content-body");
  const desktop = articleLayout.querySelector(".article-outline-desktop");
  const toggle = mobile.querySelector(".article-outline-toggle");
  const close = mobile.querySelector(".article-outline-close");
  const menu = mobile.querySelector(".article-outline-sections");
  const mobileTitle = toggle.querySelector("span");
  const wide = window.matchMedia("(min-width: 60rem)");
  const mobileLinks = [...menu.querySelectorAll("a")];
  const sections = [...desktop.querySelectorAll("a")].map((link, index) => ({
    target: document.getElementById(link.hash.slice(1)),
    links: [link, mobileLinks[index]]
  }));
  let current;
  let frame;

  function revealLink(container, link) {
    const bounds = container.getBoundingClientRect();
    const item = link.getBoundingClientRect();
    if (!bounds.height) return;
    if (item.top < bounds.top) container.scrollTop -= bounds.top - item.top;
    else if (item.bottom > bounds.bottom) container.scrollTop += item.bottom - bounds.bottom;
  }

  function showMenu(expanded, restoreFocus = false) {
    if (expanded === !menu.hidden) return;
    toggle.hidden = expanded;
    toggle.setAttribute("aria-expanded", String(expanded));
    close.hidden = menu.hidden = !expanded;
    if (expanded) {
      revealLink(menu, current.links[1]);
      close.focus({ preventScroll: true });
    } else if (restoreFocus) {
      toggle.focus({ preventScroll: true });
    }
  }

  function updateOutline() {
    frame = undefined;
    const headerHeight = header.offsetHeight;
    articleLayout.style.setProperty("--article-header-height", `${headerHeight}px`);
    const bounds = body.getBoundingClientRect();
    mobile.inert = wide.matches || bounds.top > headerHeight || bounds.bottom <= headerHeight;
    desktop.hidden = bounds.bottom <= headerHeight;
    if (mobile.inert) showMenu(false);
    const cutoff = Number.parseFloat(getComputedStyle(sections[0].target).scrollMarginBlockStart) + 1;
    const active = sections.findLast(section => section.target.getBoundingClientRect().top <= cutoff) || sections[0];
    if (active === current) return;
    current?.links.forEach(link => link.removeAttribute("aria-current"));
    current = active;
    current.links.forEach(link => link.setAttribute("aria-current", "location"));
    mobileTitle.textContent = current.links[1].textContent;
    revealLink(desktop, current.links[0]);
  }

  function scheduleOutline() {
    frame ??= requestAnimationFrame(updateOutline);
  }

  toggle.addEventListener("click", () => showMenu(true));
  close.addEventListener("click", () => showMenu(false, true));
  mobile.addEventListener("click", event => {
    const link = event.target.closest("a");
    if (!link) return;
    const sameSection = link.getAttribute("aria-current") === "location";
    showMenu(false, sameSection);
    if (sameSection) event.preventDefault();
  });
  mobile.addEventListener("keydown", event => {
    if (event.key === "Escape" && !menu.hidden) {
      event.preventDefault();
      showMenu(false, true);
    }
  });
  window.addEventListener("scroll", () => {
    showMenu(false);
    scheduleOutline();
  }, { passive: true });
  window.addEventListener("resize", scheduleOutline);
  window.addEventListener("hashchange", scheduleOutline);
  const outlineObserver = new ResizeObserver(scheduleOutline);
  outlineObserver.observe(header);
  outlineObserver.observe(articleLayout.closest("article"));
  updateOutline();
}

for (const frame of document.querySelectorAll('[data-article-html]')) {
  let observer;
  const resize = () => {
    observer?.disconnect();
    const body = frame.contentDocument?.body;
    if (!body) return;
    markExternalLinks(body);
    observer = new ResizeObserver(() => {
      const height = Math.min(1600, Math.ceil(body.getBoundingClientRect().height));
      if (height > 0) frame.style.height = `${height}px`;
    });
    observer.observe(body);
  };
  frame.addEventListener('load', resize);
  resize();
}

const navigation = header.querySelector("#site-navigation");
const menus = [...navigation.querySelectorAll("details")];
const navToggle = header.querySelector(".nav-toggle");
const navBack = navigation.querySelector(".nav-back");
const desktopNavigation = window.matchMedia("(min-width: 56rem)");
const pageRegions = document.querySelectorAll("main, footer");
let activeMenu = null;
let hoverTimer;

function sizePanel() {
  const height = desktopNavigation.matches ? activeMenu?.querySelector("div").offsetHeight || 0 : 0;
  header.style.setProperty("--menu-height", height + "px");
}

function selectMenu(next) {
  clearTimeout(hoverTimer);
  if (activeMenu !== next && activeMenu) activeMenu.open = false;
  activeMenu = next;
  if (next) next.open = true;
  header.toggleAttribute("data-menu-open", desktopNavigation.matches && !!next);
  navigation.toggleAttribute("data-submenu", !desktopNavigation.matches && !!next);
  if (next) navigation.removeAttribute("data-returning");
  navBack.hidden = desktopNavigation.matches || !next;
  if (next) navigation.scrollTop = 0;
  sizePanel();
}

function showNavigation(open) {
  const mobile = !desktopNavigation.matches;
  const visible = mobile && open;
  header.toggleAttribute("data-drawer-open", visible);
  navToggle.setAttribute("aria-expanded", String(visible));
  navToggle.setAttribute("aria-label", visible ? "关闭导航" : "打开导航");
  navigation.inert = mobile && !visible;
  for (const region of pageRegions) region.inert = visible;
  if (visible) {
    navigation.setAttribute("role", "dialog");
    navigation.setAttribute("aria-modal", "true");
    navigation.scrollTop = 0;
  } else {
    navigation.removeAttribute("role");
    navigation.removeAttribute("aria-modal");
    navigation.removeAttribute("data-returning");
    selectMenu(null);
  }
}

navToggle.addEventListener("click", event => {
  const open = !header.hasAttribute("data-drawer-open");
  showNavigation(open);
  if (open && event.detail === 0) {
    requestAnimationFrame(() => {
      if (header.hasAttribute("data-drawer-open")) menus[0]?.querySelector("summary").focus({ preventScroll: true });
    });
  }
});
navBack.addEventListener("click", () => {
  const trigger = activeMenu?.querySelector("summary");
  selectMenu(null);
  navigation.setAttribute("data-returning", "");
  navigation.scrollTop = 0;
  trigger?.focus({ preventScroll: true });
});
desktopNavigation.addEventListener("change", () => showNavigation(false));
showNavigation(false);

for (const menu of menus) {
  const summary = menu.querySelector("summary");
  summary.addEventListener("click", event => {
    event.preventDefault();
    selectMenu(menu.open ? null : menu);
  });
  menu.parentElement.addEventListener("pointerenter", event => {
    if (!desktopNavigation.matches || event.pointerType !== "mouse") return;
    clearTimeout(hoverTimer);
    if (activeMenu) selectMenu(menu);
    else hoverTimer = setTimeout(() => selectMenu(menu), 150);
  });
  menu.parentElement.addEventListener("pointerleave", () => clearTimeout(hoverTimer));
}

header.addEventListener("pointerleave", event => {
  if (desktopNavigation.matches && event.pointerType === "mouse" && !activeMenu?.contains(document.activeElement)) {
    hoverTimer = setTimeout(() => selectMenu(null), 150);
  }
});
header.addEventListener("pointerenter", () => clearTimeout(hoverTimer));
document.addEventListener("click", event => {
  if (event.target.closest("[data-open-contact]")) return;
  if (header.hasAttribute("data-drawer-open")) {
    if (!event.target.closest("header") || event.target.closest("header a")) showNavigation(false);
  } else if (!event.target.closest("header nav") || event.target.closest("header nav a")) {
    selectMenu(null);
  }
});
document.addEventListener("focusin", event => {
  if (desktopNavigation.matches && activeMenu && !activeMenu.parentElement.contains(event.target)) selectMenu(null);
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && header.hasAttribute("data-drawer-open")) {
    event.preventDefault();
    if (activeMenu) navBack.click();
    else {
      showNavigation(false);
      navToggle.focus();
    }
    return;
  }
  if (event.key === "Escape" && activeMenu) {
    activeMenu.querySelector("summary").focus();
    selectMenu(null);
  }
});
window.addEventListener("resize", sizePanel);
window.addEventListener("pageshow", () => showNavigation(false));
header.querySelectorAll(".nav-link").forEach(link => {
  link.addEventListener("pointerenter", () => {
    if (desktopNavigation.matches) selectMenu(null);
  });
});
const pageName = location.pathname.split("/").pop() || "index.html";
header.querySelectorAll("nav a").forEach(link => {
  if (link.getAttribute("href") === pageName) link.setAttribute("aria-current", "page");
});
if (/^guide-/.test(pageName)) header.querySelector('#research-menu summary').setAttribute("aria-current", "location");
if (/^product-/.test(pageName)) header.querySelector('#products-menu summary').setAttribute("aria-current", "location");
header.querySelector('nav a[aria-current="page"]')?.closest("details")?.querySelector("summary").setAttribute("aria-current", "location");
document.querySelectorAll(".footer-links a").forEach(link => {
  if (link.getAttribute("href") === pageName) link.setAttribute("aria-current", "page");
});
if (pageName === "donate.html") header.querySelector("#contact-menu summary").setAttribute("aria-current", "location");
function openContact() {
  const menu = header.querySelector("#contact-menu");
  if (!desktopNavigation.matches) showNavigation(true);
  selectMenu(menu);
  menu.querySelector("summary").focus();
}
document.querySelectorAll("[data-open-contact]").forEach(link => {
  link.addEventListener("click", event => {
    event.preventDefault();
    openContact();
  });
});
window.addEventListener("pageshow", () => {
  if (new URLSearchParams(location.search).has("contact")) openContact();
});
const filters = {};
const empty = document.querySelector("#empty");
document.querySelectorAll("fieldset[data-filter], fieldset[data-amount]").forEach(group => {
  group.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    group.querySelectorAll("button").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
    const value = button.textContent.trim();
    if (group.hasAttribute("data-amount")) {
      document.querySelector("#custom").hidden = value !== "自定义";
      return;
    }
    filters[group.dataset.filter] = value;
    const cards = [...document.querySelectorAll(".tile")];
    cards.forEach(card => {
      card.hidden = Object.entries(filters).some(([key, selection]) => selection !== "全部" && card.dataset[key] !== selection);
    });
    empty.hidden = cards.some(card => !card.hidden);
  });
});

// Animate only the first time each below-the-fold element approaches the viewport.
if ("IntersectionObserver" in window) {
  const reveals = document.querySelectorAll(
    "main :is(.banner, .section-heading, .grid > .tile, .article-list > a), main > section:not(.statement) > h2"
  );
  const revealObserver = new IntersectionObserver(entries => {
    const groupCounts = new Map();
    for (const { target, isIntersecting } of entries) {
      if (!isIntersecting) continue;
      revealObserver.unobserve(target);
      if (prefersReducedMotion.matches || target.matches(":focus-within")) continue;
      if (target.matches(".tile, .article-list > a")) {
        const group = target.parentElement;
        const count = groupCounts.get(group) || 0;
        if (count) target.style.setProperty("--reveal-delay", `${Math.min(count, 2) * 50}ms`);
        groupCounts.set(group, count + 1);
      }
      target.classList.add("scroll-reveal");
    }
  }, { rootMargin: "0px 0px 16px 0px" });
  for (const element of reveals) {
    if (element.getBoundingClientRect().top >= window.innerHeight) revealObserver.observe(element);
  }
  function clearReveal(event) {
    if (event.animationName !== "reveal-in") return;
    event.target.classList.remove("scroll-reveal");
    event.target.style.removeProperty("--reveal-delay");
  }
  document.addEventListener("animationend", clearReveal);
  document.addEventListener("animationcancel", clearReveal);
}

// Shared search dialog keeps visitors on the page until they choose a result.
const searchTrigger = header.querySelector(".search");
const searchItems = [
  // BEGIN ADMIN: search
  ["guide-gemini-4-neon.html","Google Gemini 4 Neon 发布，世界前沿 AI 实力大洗牌","指南","Google Gemini 4 Neon Artificial Analysis AI 排行 榜单 Intelligence Index GPT-6.2 Astra Claude Fable 5.2 Gemini 4 Neon 在 Artificial Analysis 最新榜单上追平 GPT-6.2 Astra 的 62 分。Claude Fable 5.2 仍以 65 分领先，但做完一道题的成本差距更大。 Codex by OpenAI 人工智能 Gemini 模型评测"],
  ["guide-0.html","为什么需要一个海外号码","指南","+86 海外手机号 美国号码 英国号码 国际短信 验证码 SIM eSIM giffgaff Ultra Mobile 当一个表单只认当地号码，或者一条验证码迟迟不到，一张提前准备好的第二张卡，可以让你少错过一次机会。 Codex by OpenAI 海外号码 SIM 卡 国际生活"],
  ["guide-1.html","收到SIM卡后如何开始","指南","收到 SIM 卡 激活 开卡 安装 eSIM 二维码 giffgaff Ultra Mobile 短信 漫游 保号 从辨认规格、安装到收发测试，按顺序把新号码准备好。适用于本站的英国 giffgaff 和美国 Ultra Mobile 电话卡。 Codex by OpenAI SIM 卡 开卡激活 使用指南"],
  ["guide-why-email-matters-more-than-a-phone-number.html","为什么邮箱比手机号重要","指南","电子邮件 手机号 国际邮箱 Gmail 登录 找回账户 保号 Wi-Fi Calling 两步验证 换手机、换运营商、换一个国家生活，常用邮箱都可以继续用。把它当成长期的账户入口，再让手机号负责当地联系。 Codex by OpenAI 电子邮箱 账号安全 国际生活"],
  ["guide-ai-that-reaches-out-first.html","能主动找你的AI，不需要你先下达指令","指南","主动 AI 个人智能体 Grokbot Grok Bot Meta Muse OpenAI Dots Dot Claude Duet Anthropic 小豆 DouOS 从定时汇报到主动跟进，了解 Grok Bot、Muse、ChatGPT 的 dot、Claude Duet 和小豆分别擅长什么。 Codex by OpenAI 人工智能 个人智能体 主动式 AI"],
  ["product-0.html","美国 Ultra Mobile 电话卡","产品","Ultra Mobile SIM eSIM 美国 电话卡 手机卡 包激活 等补货 需要一个美国号码用于日常联系或低频收发短信？实体 SIM 和 eSIM 两种规格均包含激活服务。 通信 美国"],
  ["product-1.html","英国 giffgaff 电话卡","产品","giffgaff SIM eSIM 英国 电话卡 手机卡 未激活 包激活 需要英国号码，可以选择自行激活的实体卡，或选含激活服务的实体卡和 eSIM。 通信 英国"],
  ["product-2.html","Apple 账号注册","产品","苹果 Apple ID Apple 账户 Apple 账号 注册教学 代注册 想为特定地区的 App 或 Apple 服务准备账号？可选注册教学或代注册。 账户 多地区"],
  ["product-google-account.html","Google 账号注册","产品","谷歌 Google 账户 Google 账号 注册教学 代注册 为日常邮件或 Google 服务准备账号，可按需选择注册教学或代注册。 账户 多地区"],
  ["product-ai-account.html","AI 账号注册","产品","人工智能 AI 账户 AI 账号 注册教学 代注册 提供ChatGPT，Claude，Gemini，Grok，Muse等主流AI的使用教程，请在受支持的地区使用。 账户 多地区"],
  // END ADMIN: search
  ["favorite-products.html", "商品收藏", "产品", "我的收藏 收藏商品"],
  ["favorite-articles.html", "收藏夹", "研究", "我的收藏 收藏文章"],
  ["terms.html", "服务条款", "关于", "购买 开通 售后"],
  ["privacy.html", "隐私政策", "关于", "邮箱 会话存储 搜索"],
  ["statement.html", "声明", "关于", "地区 价格 官方"]
];
const searchDialog = document.createElement("dialog");
searchDialog.id = "site-search";
searchDialog.className = "search-dialog";
searchDialog.setAttribute("aria-label", "站内搜索");
searchDialog.innerHTML = `
  <div class="search-bar">
    <div class="search-field">
      <span class="search-symbol" aria-hidden="true"></span>
      <input id="site-search-query" type="search" placeholder="搜索站内内容…" aria-label="搜索站内内容" autocomplete="off" autofocus>
    </div>
    <button class="search-close icon-button" type="button" aria-label="关闭搜索" title="关闭搜索">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
    </button>
  </div>
  <div class="search-suggestions">
    <p>搜索产品、指南与关于文章，多个关键词用空格分隔</p>
    <div class="search-tags">
      <button type="button" data-search-term="SIM">SIM 卡</button>
      <button type="button" data-search-term="Apple">Apple 账户</button>
      <button type="button" data-search-term="云服务器">云服务器</button>
    </div>
  </div>
  <div class="search-results"></div>
  <p class="search-status" role="status" aria-live="polite"></p>`;
document.body.append(searchDialog);
const searchInput = searchDialog.querySelector("input");
const searchResults = searchDialog.querySelector(".search-results");
const searchStatus = searchDialog.querySelector(".search-status");
let searchReturnFocus;

function renderSearch() {
  const words = searchInput.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = searchItems.filter(item => words.every(word => item.slice(1).join(" ").toLowerCase().includes(word)));
  searchDialog.querySelector(".search-suggestions").hidden = words.length > 0;
  searchResults.replaceChildren(...matches.map(([href, title, category]) => {
    const link = document.createElement("a");
    link.href = href;
    const name = document.createElement("span");
    name.textContent = title;
    const type = document.createElement("small");
    type.textContent = category;
    link.append(name, type);
    return link;
  }));
  searchStatus.textContent = matches.length ? `共 ${matches.length} 项内容` : "没有找到相关内容，试试其他关键词。";
}

function openSearch() {
  if (document.querySelector("dialog[open]")) return;
  searchReturnFocus = navigation.contains(document.activeElement) ? searchTrigger : document.activeElement;
  showNavigation(false);
  searchInput.value = "";
  renderSearch();
  searchDialog.showModal();
  document.documentElement.classList.add("search-open");
  searchTrigger.setAttribute("aria-expanded", "true");
  searchInput.focus();
}
searchTrigger.addEventListener("click", openSearch);
searchInput.addEventListener("input", renderSearch);
searchDialog.querySelector(".search-close").addEventListener("click", () => searchDialog.close());
let searchBackdropDown = false;
searchDialog.addEventListener("pointerdown", event => {
  searchBackdropDown = event.target === searchDialog;
});
searchDialog.addEventListener("click", event => {
  if (event.target === searchDialog && searchBackdropDown) searchDialog.close();
  const chip = event.target.closest("[data-search-term]");
  if (chip) {
    searchInput.value = chip.dataset.searchTerm;
    renderSearch();
    searchInput.focus();
  }
});
searchDialog.addEventListener("close", () => {
  document.documentElement.classList.remove("search-open");
  searchTrigger.setAttribute("aria-expanded", "false");
  searchReturnFocus?.focus({ preventScroll: true });
});
searchDialog.addEventListener("keydown", event => {
  if (event.isComposing) return;
  if (event.key === "Escape") {
    event.preventDefault();
    searchDialog.close();
    return;
  }
  const links = [...searchResults.querySelectorAll("a")];
  if ((event.key === "ArrowDown" || event.key === "ArrowUp") && links.length) {
    event.preventDefault();
    const current = links.indexOf(document.activeElement);
    const next = current < 0 ? (event.key === "ArrowDown" ? 0 : links.length - 1)
      : (current + (event.key === "ArrowDown" ? 1 : -1) + links.length) % links.length;
    links[next].focus();
  } else if (event.key === "Enter" && event.target === searchInput && links.length) {
    event.preventDefault();
    links[0].click();
  }
});
document.addEventListener("keydown", event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (searchDialog.open) searchDialog.close();
    else openSearch();
  }
});
if (new URLSearchParams(location.search).has("search")) openSearch();


const languageMenu = document.querySelector(".footer-language");
const footerBottom = languageMenu?.closest(".footer-bottom");
languageMenu?.querySelector("button").addEventListener("click", () => {
  document.documentElement.lang = "zh-CN";
  languageMenu.open = false;
  languageMenu.querySelector("summary").focus();
});
document.addEventListener("click", event => {
  if (languageMenu && !languageMenu.contains(event.target)) languageMenu.open = false;
});
languageMenu?.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    event.preventDefault();
    languageMenu.open = false;
    languageMenu.querySelector("summary").focus();
  }
});
languageMenu?.addEventListener("focusout", event => {
  if (!languageMenu.contains(event.relatedTarget)) languageMenu.open = false;
});

const backToTop = document.createElement("button");
backToTop.type = "button";
backToTop.className = "back-to-top icon-button";
backToTop.setAttribute("aria-label", "回到顶部");
backToTop.title = "回到顶部";
backToTop.hidden = true;
backToTop.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20V4m-6 6 6-6 6 6"/></svg>';
document.body.append(backToTop);

function updateBackToTop() {
  const nearTop = window.scrollY <= Math.min(480, window.innerHeight * 0.6);
  if (backToTop.hidden !== nearTop) backToTop.hidden = nearTop;
  if (!nearTop && footerBottom) {
    const clearance = Math.max(0, Math.ceil(window.innerHeight - footerBottom.getBoundingClientRect().top));
    backToTop.style.setProperty("--footer-clearance", clearance + "px");
  }
}

window.addEventListener("scroll", updateBackToTop, { passive: true });
window.addEventListener("resize", updateBackToTop);
window.addEventListener("pageshow", updateBackToTop);
backToTop.addEventListener("click", () => {
  header.querySelector(".brand").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: prefersReducedMotion.matches ? "instant" : "smooth" });
});
updateBackToTop();
