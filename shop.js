const cartKey = 'nijiehon.cart.v1';
const cartEvent = 'nijiehon:cart-change';
const usd = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'USD', currencyDisplay: 'code' });

export const money = cents => usd.format(cents / 100);
export const quantityWithinLimits = value => Math.min(99, Math.max(1, Math.trunc(Number(value) || 1)));

export function readCart() {
  const items = JSON.parse(localStorage.getItem(cartKey) || '[]');
  if (!Array.isArray(items)) throw new Error('Invalid cart');
  return items.filter(item => item && typeof item.slug === 'string' && typeof item.variant === 'string' && typeof item.title === 'string')
    .map(item => ({ ...item, quantity: quantityWithinLimits(item.quantity), selected: item.selected !== false }));
}

export function updateCart(update) {
  const items = readCart();
  if (update(items) === false) return;
  localStorage.setItem(cartKey, JSON.stringify(items));
  document.dispatchEvent(new Event(cartEvent));
}

export function observeCart(render) {
  document.addEventListener(cartEvent, render);
  window.addEventListener('storage', event => {
    if (event.key === cartKey || event.key === null) render();
  });
  window.addEventListener('pageshow', render);
  render();
}
