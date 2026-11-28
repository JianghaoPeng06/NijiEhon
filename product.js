const purchase = document.querySelector('#product-purchase');
const buy = document.querySelector('[data-buy-product]');
const specification = purchase.querySelector('#purchase-spec');
const quantity = purchase.querySelector('#purchase-quantity');
const total = purchase.querySelector('#purchase-total');
const decrease = purchase.querySelector('[data-quantity-step="-1"]');
const increase = purchase.querySelector('[data-quantity-step="1"]');
const number = new Intl.NumberFormat('zh-CN', {
  style: 'currency', currency: purchase.dataset.currency, currencyDisplay: 'code'
});
const scale = 10 ** number.resolvedOptions().maximumFractionDigits;

function boundedQuantity(value) {
  return Math.min(Number(quantity.max), Math.max(Number(quantity.min), Math.trunc(Number(value))));
}

function updatePurchase() {
  const count = boundedQuantity(quantity.value);
  const amount = specification.selectedOptions[0].dataset.price;
  total.value = amount ? number.format(Math.round(Number(amount) * scale) * count / scale) : '价格待公布';
  decrease.disabled = count <= Number(quantity.min);
  increase.disabled = count >= Number(quantity.max);
}

buy.addEventListener('click', () => {
  updatePurchase();
  purchase.showModal();
});
specification.addEventListener('change', updatePurchase);
quantity.addEventListener('input', updatePurchase);
quantity.addEventListener('change', () => {
  quantity.value = boundedQuantity(quantity.value);
  updatePurchase();
});
for (const button of [decrease, increase]) {
  button.addEventListener('click', () => {
    quantity.value = boundedQuantity(boundedQuantity(quantity.value) + Number(button.dataset.quantityStep));
    updatePurchase();
  });
}
purchase.addEventListener('click', event => {
  if (event.target === purchase) purchase.close();
});
purchase.addEventListener('close', () => buy.focus());
