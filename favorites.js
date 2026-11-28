(() => {
  const key = 'nijiehon.favorites.v1';
  const page = document.querySelector('[data-favorites-list]');
  const buttons = [...document.querySelectorAll('button[data-favorite]')];
  const markers = [...document.querySelectorAll('[data-favorite-marker]')];
  if (!page && !buttons.length && !markers.length) return;
  const cards = [...(page?.querySelectorAll('[data-favorite-item]') || [])];
  const empty = page?.querySelector('[data-favorites-empty]');
  const feedback = document.createElement('p');
  feedback.className = 'favorite-feedback';
  feedback.setAttribute('role', 'status');
  document.body.append(feedback);
  let timer;

  function read() {
    const saved = JSON.parse(localStorage.getItem(key) || '[]');
    return new Set(Array.isArray(saved) ? saved.filter(value => typeof value === 'string') : []);
  }

  function report(message) {
    clearTimeout(timer);
    feedback.textContent = message;
    timer = setTimeout(() => { feedback.textContent = ''; }, 4000);
  }

  function render(saved) {
    for (const button of buttons) {
      const active = saved.has(button.dataset.favorite);
      button.setAttribute('aria-pressed', String(active));
      button.title = (active ? '取消' : '') + button.getAttribute('aria-label');
      button.hidden = button.hasAttribute('data-saved-only') && !active;
      const icon = button.querySelector('[data-favorite-icon]');
      const label = button.querySelector('[data-favorite-text]');
      if (icon) icon.hidden = !active;
      if (label) label.textContent = active ? '已收藏' : '收藏';
    }
    for (const marker of markers) marker.hidden = !saved.has(marker.dataset.favoriteMarker);
    for (const card of cards) card.hidden = !saved.has(card.dataset.favoriteItem);
    if (empty) empty.hidden = cards.some(card => !card.hidden);
  }

  function refresh() {
    try { render(read()); }
    catch {
      render(new Set());
      report('暂时无法读取收藏，请检查浏览器的站点存储设置。');
    }
  }

  for (const button of buttons) button.addEventListener('click', () => {
    try {
      const saved = read();
      const item = button.dataset.favorite;
      if (!saved.delete(item)) saved.add(item);
      localStorage.setItem(key, JSON.stringify([...saved]));
      render(saved);
      if (button.closest('[data-favorite-item][hidden]')) {
        (page.querySelector('[data-favorite-item]:not([hidden]) button') || page.querySelector('h1')).focus();
      }
    } catch { report('收藏未能保存，请检查浏览器的站点存储设置。'); }
  });
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) refresh();
  });
  window.addEventListener('pageshow', refresh);
  refresh();
})();
