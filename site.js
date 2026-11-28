const header = document.querySelector("header");
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
// Shared search dialog keeps visitors on the page until they choose a result.
const searchTrigger = header.querySelector(".search");
const searchItems = [
  ["guide-0.html", "第一次选择海外号码", "指南", "电话卡 SIM 美国 英国"],
  ["guide-1.html", "收到 SIM 卡后如何开始", "指南", "电话卡 激活"],
  ["guide-2.html", "开通云服务器前的准备", "指南", "服务器 VPS"],
  ["product-0.html", "美国 Ultra Mobile 电话卡", "产品", "SIM 美国 手机卡"],
  ["product-1.html", "英国 giffgaff 电话卡", "产品", "SIM 英国 手机卡"],
  ["product-2.html", "Apple 账户", "产品", "苹果 Apple ID"],
  ["product-3.html", "云服务器", "产品", "VPS 云主机"],
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
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>
    <input id="site-search-query" type="search" placeholder="搜索站内内容…" aria-label="搜索站内内容" autocomplete="off" autofocus>
    <button class="search-close" type="button" aria-label="关闭搜索">Esc</button>
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
