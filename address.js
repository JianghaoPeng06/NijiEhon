const editor = document.querySelector('[data-address-editor]');
const prefix = 'nijiehon.shipping-address.v1.';
editor.innerHTML = `
<p data-address-guest class="shop-hint">登录后即可保存收货地址。<a class="shop-link" href="index.html#login">前往登录</a></p>
<div data-address-member hidden>
<p class="shop-hint">地址仅保存在当前浏览器。</p>
<div data-address-saved hidden>
<address></address>
<div class="shop-actions">
<button type="button" data-edit-address>编辑地址</button>
<button type="button" data-remove-address>移除地址</button>
</div>
</div>
<form class="address-form" method="post" hidden>
<label>收件人<input name="recipient" autocomplete="shipping name" maxlength="100" required></label>
<label>联系电话<input name="phone" type="tel" autocomplete="shipping tel" maxlength="40" required></label>
<label>国家或地区<input name="country" autocomplete="shipping country-name" maxlength="80" required></label>
<label>省、州或地区（选填）<input name="region" autocomplete="shipping address-level1" maxlength="80"></label>
<label>城市<input name="city" autocomplete="shipping address-level2" maxlength="80" required></label>
<label>邮政编码（选填）<input name="postal" autocomplete="shipping postal-code" maxlength="24"></label>
<label class="address-street">详细地址<input name="street" autocomplete="shipping address-line1" maxlength="200" required></label>
<div class="shop-actions"><button class="dark" type="submit">保存地址</button><button type="button" data-cancel-address hidden>取消</button></div>
</form>
<p class="shop-status" role="status"></p>
</div>`;

const member = editor.querySelector('[data-address-member]');
const guest = editor.querySelector('[data-address-guest]');
const form = editor.querySelector('form');
const saved = editor.querySelector('[data-address-saved]');
const summary = editor.querySelector('address');
const cancel = editor.querySelector('[data-cancel-address]');
const edit = editor.querySelector('[data-edit-address]');
const remove = editor.querySelector('[data-remove-address]');
const status = editor.querySelector('[role="status"]');
const fields = [...form.querySelectorAll('input')];
let account;
let address;

function showForm(editing) {
  saved.hidden = editing;
  form.hidden = !editing;
  cancel.hidden = !address;
  if (editing) fields.forEach(field => { field.value = address?.[field.name] || ''; });
}

function renderSaved() {
  summary.textContent = address ? [
    address.recipient,
    [address.country, address.region, address.city, address.postal].filter(Boolean).join(' '),
    address.street,
    address.phone
  ].join('\n') : '';
  showForm(!address);
}

function loadAddress() {
  address = null;
  status.textContent = '';
  if (account) {
    try {
      const stored = JSON.parse(localStorage.getItem(prefix + account) || 'null');
      if (stored && fields.every(field => typeof stored[field.name] === 'string')) address = stored;
    } catch { status.textContent = '暂时无法读取收货地址。'; }
  }
  renderSaved();
}

form.addEventListener('submit', event => {
  event.preventDefault();
  if (!account) return;
  const values = Object.fromEntries(fields.map(field => [field.name, field.value.trim()]));
  const missing = fields.find(field => field.required && !values[field.name]);
  if (missing) {
    status.textContent = '请填写必填项。';
    missing.focus();
    return;
  }
  try {
    localStorage.setItem(prefix + account, JSON.stringify(values));
    address = values;
    renderSaved();
    status.textContent = '收货地址已保存。';
    edit.focus();
  } catch { status.textContent = '收货地址未能保存，请检查浏览器的站点存储设置。'; }
});
edit.addEventListener('click', () => {
  status.textContent = '';
  showForm(true);
  fields[0].focus();
});
cancel.addEventListener('click', () => {
  loadAddress();
  (address ? edit : fields[0]).focus();
});
remove.addEventListener('click', () => {
  if (!account) return;
  try {
    localStorage.removeItem(prefix + account);
    address = null;
    renderSaved();
    status.textContent = '收货地址已移除。';
    fields[0].focus();
  } catch { status.textContent = '收货地址未能移除，请稍后再试。'; }
});

document.addEventListener('nijiehon:address-session', event => {
  if (account === event.detail) return;
  account = event.detail;
  member.hidden = !account;
  guest.hidden = !!account;
  loadAddress();
});
window.addEventListener('storage', event => {
  if (account && (event.key === prefix + account || event.key === null) && !form.contains(document.activeElement)) loadAddress();
});
document.dispatchEvent(new Event('nijiehon:request-address-session'));
