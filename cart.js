import { catalog } from './catalog.js';
import { money, observeCart, quantityWithinLimits, readCart, updateCart } from './shop.js';

const products = new Map(catalog.map(item => [item.slug, item]));
const cartCount = document.querySelector('[data-cart-count]');
const page = document.querySelector('[data-cart]');

function purchasable(product, option) {
  return !!option && product.status === 'published' && !product.sample && option.stock === 'available' && option.cents !== null;
}

function cartLines() {
  return readCart().map(line => {
    const product = products.get(line.slug);
    const option = product?.options.find(option => option.name === line.variant);
    const available = purchasable(product, option);
    return { line, product, option, available };
  });
}

if (cartCount) {
  observeCart(() => {
    try {
      const count = readCart().reduce((sum, line) => sum + line.quantity, 0);
      cartCount.textContent = count ? `购物车里有 ${count} 件商品` : '购物车是空的';
    } catch {
      cartCount.textContent = '暂时无法读取购物车。';
    }
  });
}

if (page) {
  const list = page.querySelector('.cart-items');
  const template = page.querySelector('[data-cart-item]');
  const empty = page.querySelector('.cart-empty');
  const checkout = page.querySelector('.checkout');
  const status = page.querySelector('[data-cart-status]');
  const dialog = page.querySelector('#cart-edit');
  const editForm = dialog.querySelector('form');
  const editStatus = editForm.querySelector('[role="status"]');
  const variantSelect = editForm.elements.variant;
  const editQuantity = editForm.elements.quantity;
  let editing;

  function renderItem({ line, product, option, available }, index) {
    const item = template.content.firstElementChild.cloneNode(true);
    item.dataset.index = index;
    item.dataset.slug = line.slug;
    item.dataset.variant = line.variant;
    const name = item.querySelector('.cart-item-title');
    name.textContent = product?.title || line.title;
    if (product) name.href = `product-${product.slug}.html`;
    const image = item.querySelector('img');
    if (product?.image) image.src = product.image;
    else image.hidden = true;
    item.querySelector('.cart-variant').textContent = line.variant;
    const stock = item.querySelector('.shop-stock');
    stock.hidden = available;
    stock.textContent = product?.status === 'draft' ? '草稿 · 仅供浏览' : option?.stock === 'restock' ? '等补货' : '此规格暂不可购买';
    item.querySelector('.cart-line-total').textContent = available ? money(option.cents * line.quantity) : '—';
    const checkbox = item.querySelector('[data-control="selected"]');
    checkbox.checked = available && line.selected;
    checkbox.disabled = !available;
    checkbox.setAttribute('aria-label', `结算 ${name.textContent} · ${line.variant}`);
    const quantity = item.querySelector('[data-control="quantity"]');
    quantity.value = line.quantity;
    quantity.disabled = !available;
    quantity.setAttribute('aria-label', `${name.textContent} · ${line.variant}的数量`);
    const editButton = item.querySelector('[data-control="edit"]');
    editButton.disabled = !product?.options.some(option => purchasable(product, option));
    editButton.setAttribute('aria-label', `编辑 ${name.textContent} · ${line.variant}的选项`);
    item.querySelector('[data-control="remove"]').setAttribute('aria-label', `移除 ${name.textContent} · ${line.variant}`);
    return item;
  }

  function render() {
    let lines;
    try { lines = cartLines(); }
    catch {
      list.replaceChildren();
      empty.hidden = checkout.hidden = true;
      status.textContent = '暂时无法读取购物车，请检查浏览器的站点存储设置。';
      return;
    }
    const active = document.activeElement;
    const focusIndex = active.closest('[data-index]')?.dataset.index;
    const focusControl = active.dataset.control;
    list.replaceChildren(...lines.map(renderItem));
    empty.hidden = lines.length > 0;
    checkout.hidden = !lines.length;
    status.textContent = '';
    if (focusIndex !== undefined && focusControl) {
      const row = list.children[Math.min(Number(focusIndex), lines.length - 1)];
      (row?.querySelector(`[data-control="${focusControl}"]`) || empty.querySelector('a')).focus();
    }
    const selected = lines.filter(item => item.available && item.line.selected);
    const physical = selected.some(item => item.option.fulfillment === 'physical');
    const total = selected.reduce((sum, { line, option }) => sum + line.quantity * option.cents, 0);
    checkout.querySelector('.address-card').hidden = !physical;
    checkout.querySelector('.checkout-delivery').hidden = physical || !selected.length;
    checkout.querySelector('[data-checkout-shipping]').textContent = !selected.length ? '—' : physical ? '待确认' : '无需配送';
    checkout.querySelector('[data-checkout-tax]').textContent = selected.length ? '待确认' : '—';
    checkout.querySelectorAll('[data-checkout-subtotal]').forEach(output => { output.textContent = money(total); });
    checkout.querySelector('[data-checkout-note]').textContent = selected.length
      ? '合计仅包含商品金额。订单和付款暂未开放。'
      : '请选择要结算的商品。';
  }

  function edit(control) {
    const { slug, variant } = control.closest('[data-index]').dataset;
    updateCart(items => {
      const match = items.findIndex(item => item.slug === slug && item.variant === variant);
      if (match < 0) return;
      switch (control.dataset.control) {
        case 'remove': items.splice(match, 1); break;
        case 'quantity': items[match].quantity = quantityWithinLimits(control.value); break;
        case 'selected': items[match].selected = control.checked; break;
      }
    });
  }

  function currentEditOption() {
    return editing?.product.options.find(option => option.name === variantSelect.value);
  }

  function updateEditTotal() {
    const option = currentEditOption();
    editForm.querySelector('output').value = option ? money(option.cents * quantityWithinLimits(editQuantity.value)) : '—';
    editStatus.textContent = '';
  }

  function openEditor(control) {
    const { slug, variant } = control.closest('[data-index]').dataset;
    const entry = cartLines().find(({ line }) => line.slug === slug && line.variant === variant);
    if (!entry?.product) return;
    const { line, product } = entry;
    const options = product.options.filter(option => purchasable(product, option));
    if (!options.length) return;
    editing = { slug, variant, product };
    editForm.querySelector('[data-edit-product]').textContent = product.title;
    variantSelect.replaceChildren(...options.map(option => new Option(`${option.name} · ${money(option.cents)}`, option.name)));
    variantSelect.value = options.some(option => option.name === variant) ? variant : options[0].name;
    editQuantity.value = line.quantity;
    updateEditTotal();
    dialog.showModal();
  }

  editForm.addEventListener('input', updateEditTotal);
  editForm.addEventListener('submit', event => {
    event.preventDefault();
    const option = currentEditOption();
    if (!option || !purchasable(editing.product, option)) return;
    const count = editQuantity.valueAsNumber;
    let issue = '';
    try {
      updateCart(items => {
        const index = items.findIndex(item => item.slug === editing.slug && item.variant === editing.variant);
        if (index < 0) {
          issue = '这件商品已从购物车移除。';
          return false;
        }
        const line = items[index];
        const duplicate = items.find(item => item !== line && item.slug === editing.slug && item.variant === option.name);
        if (duplicate && duplicate.quantity + count > 99) {
          issue = '合并后此规格会超过 99 件，请减少数量。';
          return false;
        }
        if (duplicate) {
          duplicate.quantity += count;
          duplicate.selected ||= line.selected;
          items.splice(index, 1);
        } else {
          line.variant = option.name;
          line.quantity = count;
        }
      });
      if (issue) { editStatus.textContent = issue; return; }
      editing.variant = option.name;
      dialog.close();
      status.textContent = '商品选项已更新。';
    } catch { editStatus.textContent = '购物车未能保存，请稍后再试。'; }
  });
  dialog.querySelector('[data-close-cart-edit]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (!editing) return;
    const row = [...list.children].find(item => item.dataset.slug === editing.slug && item.dataset.variant === editing.variant);
    (row?.querySelector('[data-control="edit"]') || list.querySelector('[data-control="edit"]:not(:disabled)') || empty.querySelector('a')).focus();
    editing = null;
  });

  function handle(event, selector) {
    const control = event.target.closest(selector);
    if (!control) return;
    try {
      if (control.dataset.control === 'edit') openEditor(control);
      else edit(control);
    }
    catch {
      render();
      status.textContent = '购物车未能保存，请稍后再试。';
    }
  }

  list.addEventListener('change', event => handle(event, 'input[data-control]'));
  list.addEventListener('click', event => handle(event, 'button[data-control]'));
  observeCart(render);
}
