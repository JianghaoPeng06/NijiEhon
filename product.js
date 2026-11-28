import { money, quantityWithinLimits, updateCart } from './shop.js';

const form = document.querySelector('[data-purchase]');
const quantity = form.elements.quantity;
const total = form.querySelector('output');
const button = form.querySelector('button[type="submit"]');
const [decrease, increase] = form.querySelectorAll('[data-quantity-step]');
const status = form.querySelector('[role="status"]');
const slug = form.dataset.purchase;
const title = document.querySelector('.product-information h1').textContent;
const groups = [...form.querySelectorAll('[data-option-group]')];

function selectMethod() {
  const method = form.elements.fulfillment?.value || groups[0].dataset.optionGroup;
  for (const group of groups) {
    const active = group.dataset.optionGroup === method;
    group.hidden = group.disabled = !active;
    if (active && !group.querySelector('input:checked')) {
      const option = group.querySelector('[data-stock="available"]') || group.querySelector('input');
      option.checked = true;
    }
  }
}

function renderSelection() {
  const option = form.querySelector('[data-option-group]:not([disabled]) input:checked');
  const count = quantityWithinLimits(quantity.value);
  total.value = option.dataset.cents === '' ? '价格待公布' : money(Number(option.dataset.cents) * count);
  decrease.disabled = count <= Number(quantity.min);
  increase.disabled = count >= Number(quantity.max);
  status.textContent = '';
  if (form.hasAttribute('data-draft-preview')) status.textContent = '这是后台预览。';
  else if (form.hasAttribute('data-view-only')) status.textContent = '草稿商品可查看规格与价格。';
  else if (form.hasAttribute('data-sample')) status.textContent = '此商品为展示样例。';
  else if (option.dataset.stock === 'restock') status.textContent = '此规格正在等补货。';
  else if (option.dataset.cents === '') status.textContent = '价格待公布。';
  button.disabled = !!status.textContent || !quantity.validity.valid;
  return option;
}

form.addEventListener('change', event => {
  if (event.target.name === 'fulfillment') selectMethod();
  renderSelection();
});
quantity.addEventListener('input', renderSelection);
for (const step of [decrease, increase]) {
  step.addEventListener('click', () => {
    quantity.value = quantityWithinLimits(quantityWithinLimits(quantity.value) + Number(step.dataset.quantityStep));
    renderSelection();
  });
}
form.addEventListener('submit', event => {
  event.preventDefault();
  const option = renderSelection();
  if (button.disabled) return;
  const count = quantity.valueAsNumber;
  const variant = option.value;
  try {
    let limitReached = false;
    updateCart(items => {
      const line = items.find(item => item.slug === slug && item.variant === variant);
      if (!line) items.push({ slug, title, variant, quantity: count, selected: true });
      else if (line.quantity + count > 99) {
        limitReached = true;
        return false;
      }
      else {
        line.quantity += count;
        line.selected = true;
      }
    });
    status.textContent = limitReached ? '此规格在购物车中最多可放 99 件。' : `已将 ${count} 件「${variant}」加入购物车。`;
  } catch {
    status.textContent = '购物车暂时无法保存，请检查浏览器的站点存储设置。';
  }
});
window.addEventListener('pageshow', () => {
  selectMethod();
  renderSelection();
});
selectMethod();
renderSelection();
