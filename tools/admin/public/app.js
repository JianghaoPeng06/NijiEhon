const get = selector => document.querySelector(selector);
const main = get('#main');
const filter = get('#filter');
const records = get('#records');
const notice = get('#status');
const generate = get('#generate');
const deploy = get('#deploy');
const modal = get('#deploy-dialog');
let state;
let tab = 'products';
let selected;
let dirty = false;
let busy = false;
let noticeTimer;

const names = { products: '商品', articles: '文章' };
const labels = {
  products: { draft: '草稿', published: '上架', archived: '下架' },
  articles: { draft: '草稿', published: '发布', archived: '撤下' }
};

function flash(message, error = false) {
  clearTimeout(noticeTimer);
  notice.hidden = !message;
  notice.textContent = message;
  notice.classList.toggle('error', error);
  if (!error) noticeTimer = setTimeout(() => { notice.hidden = true; }, 7500);
}

async function api(path, options) {
  const response = await fetch(`/api/${path}`, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}

function post(path, values) {
  return api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: state.revision, ...values }) });
}

function acceptNavigation() {
  if (busy) return false;
  return !dirty || window.confirm('这次修改还未保存。放弃后继续？');
}

function status(item) {
  if (tab === 'articles' && item.status === 'published' && Date.parse(item.date) > Date.now()) return '计划发布';
  return labels[tab][item.status];
}

function drawList() {
  get('#collection').hidden = !names[tab];
  if (!names[tab]) return;
  const all = state.data[tab];
  get('#list-title').textContent = `${names[tab]} · ${all.length}`;
  const term = filter.value.trim().toLowerCase();
  const list = all.filter(item => item.title.toLowerCase().includes(term)).map(item => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'record';
    button.disabled = busy;
    if (item.slug === selected) button.setAttribute('aria-current', 'true');
    const title = document.createElement('span');
    title.textContent = item.title;
    const subtitle = document.createElement('small');
    subtitle.textContent = [status(item), item.pinned ? '置顶' : '', `权重 ${item.weight}`].filter(Boolean).join(' · ');
    button.append(title, subtitle);
    button.onclick = () => {
      if (item.slug === selected || !acceptNavigation()) return;
      selected = item.slug;
      draw();
    };
    return button;
  });
  records.replaceChildren(...list);
  if (!list.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = term ? '没有匹配的标题。' : '还没有记录。';
    records.append(empty);
  }
}

const common = `
  <label>标题<input name="title" maxlength="100" required></label>
  <div class="pair">
    <label>网址标识<input name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" maxlength="60" placeholder="small-letters" required></label>
    <label>状态<select name="status"><option value="draft">草稿</option><option value="published"></option><option value="archived"></option></select></label>
  </div>
  <label>简介<textarea name="summary" rows="2" maxlength="500"></textarea></label>`;
const body = `
  <label>正文<textarea name="body" rows="9" maxlength="40000"></textarea><span class="hint">用空行分段。行首输入 # 、- 或 &gt; 加空格可创建小标题、列表或引用。</span></label>
  <label>搜索关键词<input name="keywords" maxlength="200" placeholder="多个关键词用空格分隔"></label>`;
const weight = `<label>权重<select name="weight"><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></label>`;
const productFields = `
  <div class="pair"><label>地区<input name="region" maxlength="32" list="regions"></label><label>分类<input name="category" maxlength="32" list="categories"></label></div>
  <datalist id="regions"></datalist><datalist id="categories"></datalist>
  <div class="pair"><label>价格类型<select name="priceMode"><option value="hidden">价格待公布</option><option value="fixed">固定价格</option><option value="from">起始价格</option></select></label>${weight}</div>
  <div id="prices" class="fields" hidden>
    <div class="pair"><label>币种<select name="currency"><option>CNY</option><option>USD</option><option>GBP</option><option>EUR</option><option>HKD</option><option>JPY</option></select></label><label>金额<input name="price" inputmode="decimal" maxlength="13"></label></div>
    <label>计价单位<input name="unit" maxlength="16" placeholder="例如 月、张，选填"></label>
  </div>
  <label>官方网站<input name="url" type="url" placeholder="https://" maxlength="2000"></label>`;
const articleFields = `
  <div class="pair"><label>作者<input name="author" maxlength="80" placeholder="NijiEhon" list="authors"></label>${weight}</div>
  <datalist id="authors"></datalist>
  <div class="pair time-fields"><label>发布时间<input name="date" type="datetime-local"><span class="hint" id="timezone"></span></label><label>阅读时间（分钟）<input name="read" type="number" min="1" max="300" placeholder="自动估算"></label></div>
  <label class="check"><input name="pinned" type="checkbox">置顶</label>
  <fieldset id="related"><legend>相关商品</legend></fieldset>`;
const posterFields = `
  <label>图片描述<input name="alt" maxlength="180" required></label>
  <label>垂直裁切位置<select name="position"><option value="top">靠上</option><option value="center">居中</option><option value="bottom">靠下</option></select></label>
  <p class="hint">首页统一以 16:9 显示。用裁切位置保留照片的主体。</p>`;

function inputOptions(id, values) {
  get(id).replaceChildren(...[...new Set(values.filter(Boolean))].map(value => {
    const option = document.createElement('option');
    option.value = value;
    return option;
  }));
}

function localDate(date) {
  const instant = new Date(date);
  return new Date(instant.getTime() - instant.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function useImage(form, poster) {
  const field = get('#image-field').content.cloneNode(true);
  field.querySelector('legend').textContent = poster ? '海报图片' : tab === 'articles' ? '文章封面' : '商品图片';
  form.querySelector('#image').append(field);
  const input = form.querySelector('.upload input');
  const image = form.querySelector('.image-shot img');
  const placeholder = image.nextElementSibling;
  const remove = form.querySelector('.remove-image');
  const info = form.querySelector('.upload-status');
  remove.hidden = poster;
  function redrawImage() {
    const source = form.elements.image.value;
    image.hidden = !source;
    placeholder.hidden = Boolean(source);
    if (source) image.src = `/preview/${source}`;
    else image.removeAttribute('src');
    if (poster) image.style.objectPosition = `center ${form.elements.position.value}`;
    remove.disabled = !source;
  }
  input.onchange = async () => {
    const [file] = input.files;
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('图片须小于或等于 10 MB。');
      const bitmap = await createImageBitmap(file);
      info.textContent = `${bitmap.width} × ${bitmap.height} 像素`;
      bitmap.close();
      const { image } = await api('upload', { method: 'POST', body: file });
      form.elements.image.value = image;
      dirty = true;
      redrawImage();
    } catch (error) {
      flash(error.message, true);
    } finally {
      input.value = '';
      setBusy(false);
    }
  };
  remove.onclick = () => {
    form.elements.image.value = '';
    dirty = true;
    redrawImage();
  };
  if (poster) form.elements.position.onchange = redrawImage;
  return redrawImage;
}

function draw() {
  dirty = false;
  document.querySelectorAll('[data-tab]').forEach(button => {
    if (button.dataset.tab === tab) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  drawList();
  if (tab === 'accounts') {
    main.innerHTML = '<section class="panel"><h1>用户与订单</h1><p class="placeholder">购买系统正式上线后，这里会接入用户账号与订单管理。</p></section>';
    return;
  }
  const poster = tab === 'poster';
  const article = tab === 'articles';
  const record = poster ? state.data.poster : state.data[tab].find(item => item.slug === selected);
  const title = poster ? '首页海报' : `${record ? '编辑' : '新建'}${names[tab]}`;
  const description = poster ? '更换首页展示的 16:9 图片。' : record ? '保存后即可查看网页预览。' : '保存后会创建一个本地记录。';
  const preview = poster ? '/preview/index.html' : record ? `/preview/${article ? 'guide' : 'product'}-${record.slug}.html?draft` : '';
  main.innerHTML = `
    <div class="editor-layout">
      <form id="editor" class="panel">
        <div class="editor-header"><div><h1>${title}</h1><p>${description}</p></div><button class="primary" type="submit">保存</button></div>
        <div class="fields">
          ${poster ? '' : common}
          <div id="image"></div>
          ${poster ? posterFields : `<label>图片描述<input name="imageAlt" maxlength="180" placeholder="简要描述图片，供读屏使用"></label>${article ? articleFields : productFields}${body}`}
        </div>
      </form>
      <section class="panel preview" aria-label="网页预览">
        <header><h2>网页预览</h2>${preview ? `<a href="${preview}" target="_blank" rel="noopener">新窗口打开</a>` : ''}</header>
        ${preview ? `<iframe title="${title}预览" src="${preview}"></iframe>` : '<p class="preview-note">保存后显示网页预览。</p>'}
      </section>
    </div>`;
  const form = get('#editor');
  const redrawImage = useImage(form, poster);
  if (record) {
    for (const [key, value] of Object.entries(record)) {
      const target = form.elements.namedItem(key);
      if (!target) continue;
      if (key === 'pinned') target.checked = value;
      else target.value = key === 'date' && value ? localDate(value) : value ?? '';
    }
  }
  redrawImage();
  if (!poster) {
    if (record) form.elements.slug.readOnly = true;
    else form.elements.weight.value = '3';
    for (const option of form.elements.status.options) option.textContent = labels[tab][option.value];
    if (article) {
      get('#timezone').textContent = `本机时区 ${Intl.DateTimeFormat().resolvedOptions().timeZone}。到点后可部署。`;
      inputOptions('#authors', state.data.articles.map(item => item.author));
      for (const product of state.data.products) {
        const label = document.createElement('label');
        label.className = 'check';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.name = 'related';
        input.value = product.slug;
        input.checked = record?.related.includes(product.slug) ?? false;
        label.append(input, product.title);
        get('#related').append(label);
      }
    } else {
      inputOptions('#regions', state.data.products.map(item => item.region));
      inputOptions('#categories', state.data.products.map(item => item.category));
    }
    function refreshStatus() {
      const published = form.elements.status.value === 'published';
      for (const field of article ? ['date', 'body'] : ['region', 'category', 'summary']) form.elements[field].required = published;
      if (article && published && !form.elements.date.value) form.elements.date.value = localDate(new Date());
      if (!article) {
        get('#prices').hidden = form.elements.priceMode.value === 'hidden';
        form.elements.price.required = !get('#prices').hidden;
      }
    }
    form.elements.status.onchange = refreshStatus;
    if (!article) form.elements.priceMode.onchange = refreshStatus;
    refreshStatus();
  }
  form.oninput = () => { dirty = true; };
  form.onsubmit = async event => {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(form);
    const values = Object.fromEntries(fields);
    if (article) {
      values.pinned = fields.has('pinned');
      values.related = fields.getAll('related');
      if (values.date && (!record?.date || values.date !== localDate(record.date))) values.date = new Date(values.date).toISOString();
      else if (values.date) values.date = record.date;
    }
    setBusy(true);
    try {
      state = await post('save', { collection: tab, values, original: selected ?? null });
      if (!poster) selected = values.slug.trim();
      draw();
      flash('已保存到本机。');
    } catch (error) {
      flash(error.message, true);
    } finally {
      setBusy(false);
    }
  };
}

function setBusy(active) {
  busy = active;
  generate.disabled = deploy.disabled = active || !state;
  document.querySelectorAll('[data-tab], #new, #editor button[type=submit]').forEach(button => { button.disabled = active; });
  if (state) drawList();
}

function ready() {
  if (busy) return false;
  if (!dirty) return true;
  flash('请先保存当前修改。', true);
  return false;
}

async function publish(action) {
  if (!ready()) return;
  setBusy(true);
  flash(action === 'generate' ? '正在生成并检查页面…' : '正在同步 GitHub 并发布…');
  clearTimeout(noticeTimer);
  try {
    const result = await post(action);
    state = await api('state');
    const message = action === 'generate' ? (result.files.length ? `已生成并检查 ${result.files.length} 个文件。` : '检查通过，生成文件已是最新。') :
      result.pushed ? `已推送 ${result.commit.slice(0, 7)}。Cloudflare Pages 将开始部署。` : 'GitHub 已包含当前内容，无需推送。';
    flash(message);
  } catch (error) {
    flash(error.message, true);
  } finally {
    setBusy(false);
  }
}

document.querySelectorAll('[data-tab]').forEach(button => {
  button.onclick = () => {
    if (!state || tab === button.dataset.tab || !acceptNavigation()) return;
    tab = button.dataset.tab;
    selected = state.data[tab]?.[0]?.slug;
    filter.value = '';
    draw();
  };
});
get('#new').onclick = () => {
  if (!acceptNavigation()) return;
  selected = undefined;
  draw();
  get('[name=title]').focus();
};
filter.oninput = drawList;
generate.onclick = () => publish('generate');
deploy.onclick = () => {
  if (ready()) {
    modal.returnValue = '';
    modal.showModal();
  }
};
modal.onclose = () => { if (modal.returnValue === 'deploy') publish('deploy'); };
window.addEventListener('beforeunload', event => { if (dirty) event.preventDefault(); });
window.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && get('#editor') && !busy && !modal.open) {
    event.preventDefault();
    get('#editor').requestSubmit();
  }
});

try {
  state = await api('state');
  selected = state.data.products[0]?.slug;
  draw();
  setBusy(false);
} catch (error) {
  main.querySelector('.placeholder').textContent = error.message;
  flash(error.message, true);
}
