const header = document.querySelector("header");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

for (const frame of document.querySelectorAll('[data-article-html]')) {
  let observer;
  const resize = () => {
    observer?.disconnect();
    const body = frame.contentDocument?.body;
    if (!body) return;
    observer = new ResizeObserver(() => {
      const height = Math.min(1600, Math.ceil(body.getBoundingClientRect().height));
      if (height > 0) frame.style.height = `${height}px`;
    });
    observer.observe(body);
  };
  frame.addEventListener('load', resize);
  resize();
}

const menus = [...header.querySelectorAll("nav details")];
let activeMenu = null;
let hoverTimer;

function sizePanel() {
  const height = activeMenu?.querySelector("div").offsetHeight || 0;
  header.style.setProperty("--menu-height", height + "px");
}

function selectMenu(next) {
  clearTimeout(hoverTimer);
  if (activeMenu === next) return;
  if (activeMenu) activeMenu.open = false;
  activeMenu = next;
  if (next) next.open = true;
  sizePanel();
}

for (const menu of menus) {
  const summary = menu.querySelector("summary");
  summary.addEventListener("click", event => {
    event.preventDefault();
    selectMenu(menu.open ? null : menu);
  });
  menu.parentElement.addEventListener("pointerenter", event => {
    if (event.pointerType !== "mouse") return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => selectMenu(menu), 90);
  });
  menu.parentElement.addEventListener("pointerleave", () => clearTimeout(hoverTimer));
}

header.addEventListener("pointerleave", event => {
  if (event.pointerType === "mouse" && !activeMenu?.contains(document.activeElement)) {
    hoverTimer = setTimeout(() => selectMenu(null), 180);
  }
});
header.addEventListener("pointerenter", () => clearTimeout(hoverTimer));
document.addEventListener("click", event => {
  if (event.target.closest("[data-open-contact]")) return;
  if (!event.target.closest("header nav") || event.target.closest("header nav a")) selectMenu(null);
});
document.addEventListener("focusin", event => {
  if (activeMenu && !activeMenu.parentElement.contains(event.target)) selectMenu(null);
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && activeMenu) {
    activeMenu.querySelector("summary").focus();
    selectMenu(null);
  }
});
window.addEventListener("resize", sizePanel);
window.addEventListener("pageshow", () => selectMenu(null));
header.querySelectorAll(".nav-link").forEach(link => {
  link.addEventListener("pointerenter", () => selectMenu(null));
});
const pageName = location.pathname.split("/").pop() || "index.html";
header.querySelectorAll("nav a").forEach(link => {
  if (link.getAttribute("href") === pageName) link.setAttribute("aria-current", "page");
});
if (/^guide-/.test(pageName)) header.querySelector('[href="research.html"]').setAttribute("aria-current", "location");
if (/^product-/.test(pageName)) header.querySelector('[href="products.html"]').setAttribute("aria-current", "location");
header.querySelector('nav a[aria-current="page"]')?.closest("details")?.querySelector("summary").setAttribute("aria-current", "location");
if (pageName === "donate.html") header.querySelector("#contact-menu summary").setAttribute("aria-current", "location");
function openContact() {
  const menu = header.querySelector("#contact-menu");
  menu.querySelector("summary").focus();
  selectMenu(menu);
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
document.querySelectorAll("fieldset").forEach(group => {
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
  ["guide-0.html","第一次选择海外号码","指南","电话卡 SIM 美国 英国 NijiEhon 海外号码 SIM 卡 运营商"],
  ["guide-1.html","收到 SIM 卡后如何开始","指南","电话卡 激活 NijiEhon SIM 卡 开卡激活"],
  ["guide-2.html","开通云服务器前的准备","指南","服务器 VPS NijiEhon 云服务器 SSH 计费"],
  ["product-0.html","美国 Ultra Mobile 电话卡","产品","SIM 美国 手机卡 面向需要了解美国手机号和短信接收方式的读者，整理 Ultra Mobile PayGo 的选购与开卡要点。 通信 美国"],
  ["product-1.html","英国 giffgaff 电话卡","产品","SIM 英国 手机卡 适合先了解英国号码、激活步骤及日常漫游条件的读者，购买前可按使用地点核对需求。 通信 英国"],
  ["product-2.html","Apple 账户","产品","苹果 Apple ID 一份 Apple 账户设置资料示例，涵盖账户地区、付款方式和账户恢复准备。 账户 多地区"],
  ["product-3.html","云服务器","产品","VPS 云主机 用两种入门配置展示机房、内存与预算的选择方式，适合准备部署轻量网站的读者。 工具 多地区"],
  // END ADMIN: search
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
  selectMenu(null);
  searchReturnFocus = document.activeElement;
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
