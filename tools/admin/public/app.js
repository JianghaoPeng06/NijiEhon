import { articleSlug, articleSlugs } from './slug.js';

const get = selector => document.querySelector(selector);
const main = get('#main');
const filter = get('#filter');
const records = get('#records');
const notice = get('#status');
const generate = get('#generate');
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
  const list = all.filter(item => [item.title, item.author, ...(item.tags || [])].filter(Boolean).some(value => value.toLowerCase().includes(term))).map(item => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'record';
    button.disabled = busy;
    if (item.slug === selected) button.setAttribute('aria-current', 'true');
    const title = document.createElement('span');
    title.textContent = item.title;
    const subtitle = document.createElement('small');
    subtitle.textContent = [status(item), item.pinned ? '置顶' : '', `权重 ${item.weight}`, item.date ? new Date(item.date).toLocaleDateString('zh-CN') : ''].filter(Boolean).join(' · ');
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
    empty.textContent = term ? '没有匹配的内容。' : '还没有记录。';
    records.append(empty);
  }
}

const common = `
  <label>标题<input name="title" maxlength="100" required></label>
  <div class="pair">
    <label>网址标识<input name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" maxlength="60" placeholder="small-letters"><output id="slug-preview" class="hint" hidden></output></label>
    <label>状态<select name="status"><option value="draft">草稿</option><option value="published"></option><option value="archived"></option></select></label>
  </div>
  <label>简介<textarea name="summary" rows="2" maxlength="500"></textarea></label>`;
const keywords = '<label>搜索关键词<input name="keywords" maxlength="200" placeholder="多个关键词用空格分隔"></label>';
const weight = `<label>权重<select name="weight"><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></label>`;
const productFields = `
  <div class="pair"><label>地区<input name="region" maxlength="32" list="regions"></label><label>分类<input name="category" maxlength="32" list="categories"></label></div>
  <datalist id="regions"></datalist><datalist id="categories"></datalist>
  <div class="pair"><label>价格类型<select name="priceMode"><option value="hidden">价格待公布</option><option value="fixed">固定价格</option><option value="from">起始价格</option></select></label>${weight}</div>
  <div id="prices" class="fields" hidden>
    <div class="pair"><label>基准金额（USD）<input name="price" inputmode="decimal" maxlength="13"></label><label>计价单位<input name="unit" maxlength="16" placeholder="例如 月、张，选填"></label></div>
  </div>
  <div id="variants"></div>
  <label class="check"><input name="sample" type="checkbox">标记为样例商品</label>
  <label>商品说明<textarea name="body" rows="6" maxlength="40000"></textarea><span class="hint">用空行分开段落，可以用 #、- 或 &gt; 开头写小标题、列表和引用。</span></label>
  <label>交付方式<input name="delivery" maxlength="150"></label>
  <label>购买须知<textarea name="notice" rows="3" maxlength="2000"></textarea></label>
  <label>官方网站<input name="url" type="url" placeholder="https://" maxlength="2000"></label>`;
const articleFields = `
  <label>英文标题<input name="englishTitle" maxlength="100" placeholder="选填，用于生成可读的文章网址"></label>
  <div class="pair"><label>作者<input name="author" maxlength="80" placeholder="NijiEhon" list="authors"></label>${weight}</div>
  <datalist id="authors"></datalist>
  <div class="pair time-fields"><label>发布时间<input name="date" type="datetime-local"><span class="hint" id="timezone"></span></label><label>阅读时间（分钟）<input name="read" type="number" min="1" max="300" placeholder="自动估算"></label></div>
  <label class="check"><input name="pinned" type="checkbox">置顶</label>
  <label>标签<input name="tags" placeholder="输入标签，用逗号分隔"><span class="hint">标签显示在文章页，也可在网站搜索中查找。</span></label>
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

function useImage(field, imageSource, setImage, objectPosition) {
  const input = field.querySelector('.upload input');
  const image = field.querySelector('.image-shot img');
  const placeholder = image.nextElementSibling;
  const remove = field.querySelector('.remove-image');
  const info = field.querySelector('.upload-status');
  remove.hidden = Boolean(objectPosition);
  function redrawImage() {
    const source = imageSource();
    image.hidden = !source;
    placeholder.hidden = Boolean(source);
    if (source) image.src = `/preview/${source}`;
    else image.removeAttribute('src');
    if (objectPosition) image.style.objectPosition = `center ${objectPosition()}`;
    remove.disabled = !source;
  }
  input.onchange = async () => {
    const [file] = input.files;
    if (!file || busy) return;
    setBusy(true);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('图片须小于或等于 10 MB。');
      const bitmap = await createImageBitmap(file);
      info.textContent = `${bitmap.width} × ${bitmap.height} 像素`;
      bitmap.close();
      const { image } = await api('upload', { method: 'POST', body: file });
      setImage(image);
      redrawImage();
    } catch (error) {
      flash(error.message, true);
    } finally {
      input.value = '';
      setBusy(false);
    }
  };
  remove.onclick = () => {
    if (busy) return;
    setImage('');
    redrawImage();
  };
  return redrawImage;
}

function mountImage(container, label, getImage, setImage, position) {
  const field = get('#image-field').content.firstElementChild.cloneNode(true);
  field.querySelector('legend').textContent = label;
  field.querySelector('[name=image]').remove();
  container.append(field);
  return useImage(field, getImage, setImage, position);
}

function editVariants(container, existing, priceMode, markDirty) {
  const variants = (existing || []).map(option => ({ ...option }));
  const list = document.createElement('div');
  list.className = 'fields variant-list';
  list.addEventListener('input', event => {
    const row = event.target.closest('[data-variant]');
    variants[Number(row.dataset.variant)][event.target.dataset.key] = event.target.value;
  });
  const add = document.createElement('button');
  add.className = 'secondary';
  add.type = 'button';
  add.textContent = '新增规格';
  add.onclick = () => {
    if (busy || variants.length >= 20) return;
    variants.push({ name: '', price: '' });
    markDirty();
    drawVariants();
    list.lastElementChild.querySelector('input').focus();
  };
  const section = document.createElement('fieldset');
  section.innerHTML = '<legend>购买规格</legend><p class="hint">可留空使用默认规格。起始价格模式下可给不同规格定价，留空沿用基准金额。</p>';
  section.append(list, add);
  container.append(section);
  function drawVariants() {
    list.replaceChildren(...variants.map((option, index) => {
      const row = document.createElement('div');
      row.className = 'variant-row';
      row.dataset.variant = index;
      row.innerHTML = '<label>规格名称<input data-key="name" maxlength="80" required></label><label>规格价格（USD）<input data-key="price" maxlength="13" inputmode="decimal" placeholder="基准金额"></label><button type="button" class="secondary" aria-label="移除规格">移除</button>';
      row.querySelector('[data-key=name]').value = option.name;
      const price = row.querySelector('[data-key=price]');
      price.value = option.price;
      price.parentElement.hidden = priceMode() !== 'from';
      row.querySelector('button').onclick = () => {
        if (busy) return;
        variants.splice(index, 1);
        markDirty();
        drawVariants();
      };
      return row;
    }));
    add.disabled = variants.length >= 20;
  }
  drawVariants();
  return { variants, drawVariants };
}

const blockTypes = { text: '段落', heading: '小标题', list: '列表', quote: '引用', image: '图片', cover: '使用封面', html: 'HTML' };

function editBlocks(container, existing, markDirty) {
  const blocks = existing?.length ? existing.map(block => ({ ...block })) : [{ type: 'text' }];
  const list = document.createElement('div');
  list.className = 'block-list';
  const add = document.createElement('div');
  add.className = 'block-add';
  const section = document.createElement('section');
  section.className = 'body-editor';
  section.innerHTML = '<h2>正文</h2><p class="hint">每个内容块都可以插入、移动或删除。</p>';
  section.append(list, add);
  container.append(section);

  function insert(index, type) {
    if (busy) return;
    if (blocks.length >= 100) return flash('正文最多可包含 100 个内容块。', true);
    blocks.splice(index, 0, { type });
    markDirty();
    drawBlocks();
    list.children[index]?.querySelector('textarea, input:not([type=file]), select')?.focus();
  }

  function drawBlocks() {
    list.replaceChildren(...blocks.map((block, index) => {
      const row = document.createElement('fieldset');
      row.className = 'body-block fields';
      row.innerHTML = `<div class="block-tools"><select aria-label="内容块类型">${Object.entries(blockTypes).map(([type, label]) => `<option value="${type}">${label}</option>`).join('')}</select><div>
        <button type="button" data-block="up" aria-label="上移" title="上移">↑</button><button type="button" data-block="down" aria-label="下移" title="下移">↓</button><button type="button" data-block="insert" aria-label="在下方插入段落" title="在下方插入段落">＋</button><button type="button" data-block="remove" aria-label="移除内容块" title="移除内容块">×</button></div></div><div class="block-content fields"></div>`;
      const select = row.querySelector('select');
      select.value = block.type;
      select.onchange = () => {
        if (busy) return;
        blocks[index] = { type: select.value, text: block.text };
        markDirty();
        drawBlocks();
        list.children[index].querySelector('select').focus();
      };
      const up = row.querySelector('[data-block=up]');
      const down = row.querySelector('[data-block=down]');
      up.disabled = index === 0;
      down.disabled = index === blocks.length - 1;
      function move(target) {
        if (busy) return;
        [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
        markDirty();
        drawBlocks();
        list.children[target].querySelector('select').focus();
      }
      up.onclick = () => move(index - 1);
      down.onclick = () => move(index + 1);
      row.querySelector('[data-block=insert]').onclick = () => insert(index + 1, 'text');
      row.querySelector('[data-block=remove]').onclick = () => {
        if (busy) return;
        blocks.splice(index, 1);
        markDirty();
        drawBlocks();
        (list.children[Math.min(index, blocks.length - 1)]?.querySelector('select') || add.firstElementChild).focus();
      };
      const content = row.querySelector('.block-content');
      if (block.type === 'image' || block.type === 'cover') {
        if (block.type === 'image') {
          const reveal = mountImage(content, '正文图片', () => block.image, image => { block.image = image; markDirty(); });
          reveal();
          content.insertAdjacentHTML('beforeend', '<label>图片描述<input data-key="alt" maxlength="180"></label>');
        }
        content.insertAdjacentHTML('beforeend', '<label>图注<input data-key="caption" maxlength="300"></label>');
      } else {
        const isHeading = block.type === 'heading';
        content.innerHTML = `<label>${blockTypes[block.type]}${isHeading ? '<input data-key="text" maxlength="160">' : '<textarea data-key="text" rows="4" maxlength="40000"></textarea>'}</label>`;
        if (block.type === 'html') content.insertAdjacentHTML('beforeend', '<p class="hint">可写 HTML 和 CSS。脚本和表单在预览与网站上均不可用。</p>');
        if (block.type === 'list') content.insertAdjacentHTML('beforeend', '<p class="hint">每行一项。</p>');
      }
      for (const input of content.querySelectorAll('[data-key]')) {
        const key = input.dataset.key;
        input.value = block[key] || '';
        input.oninput = () => { block[key] = input.value; };
      }
      return row;
    }));
  }

  for (const [type, label] of Object.entries(blockTypes)) {
    const button = document.createElement('button');
    button.className = 'secondary';
    button.type = 'button';
    button.textContent = `＋ ${label}`;
    button.onclick = () => insert(blocks.length, type);
    add.append(button);
  }
  drawBlocks();
  return blocks;
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
  const description = poster ? '更换首页展示的 16:9 图片。' : article ? '编辑文章，右侧同步预览。' : '保存后即可查看商品与购买选项。';
  const preview = poster ? '/preview/index.html' : record ? `/preview/${article ? 'guide' : 'product'}-${record.slug}.html?draft` : '';
  main.innerHTML = `
    <div class="editor-layout">
      <form id="editor" class="panel">
        <div class="editor-header"><div><h1>${title}</h1><p>${description}</p></div><button class="primary" type="submit">保存</button></div>
        <div class="fields">
          ${poster ? '' : article ? `<h2 class="editor-section-title">基本信息</h2>${common}${articleFields}` : common.replace('标题<input', '商品名称<input')}
          <div id="image"><input type="hidden" name="image"></div>
          ${poster ? posterFields : `<label>图片描述<input name="imageAlt" maxlength="180" placeholder="简要描述图片，供读屏使用"></label>${article ? '<p class="hint">封面用于列表。正文用「图片」或「使用封面」块自行排版。</p><div id="article-blocks"></div>' : productFields}${keywords}`}
        </div>
      </form>
      <section class="panel preview" aria-label="网页预览">
        <header><h2>网页预览</h2>${preview ? `<a href="${preview}" target="_blank" rel="noopener">新窗口打开</a>` : ''}</header>
        ${preview || article ? `<iframe title="${title}预览"${preview ? ` src="${preview}"` : ''}></iframe>` : '<p class="preview-note">保存后显示网页预览。</p>'}
      </section>
    </div>`;
  const form = get('#editor');
  let blocks;
  let variantEditor;
  let timer;
  let previewVersion = 0;
  const markDirty = () => {
    dirty = true;
    if (article) schedulePreview();
  };
  const redrawImage = mountImage(get('#image'), poster ? '海报图片' : article ? '列表封面（选填）' : '商品图片',
    () => form.elements.image.value, image => { form.elements.image.value = image; markDirty(); },
    poster ? () => form.elements.position.value : undefined);
  if (poster) form.elements.position.onchange = redrawImage;
  if (record) {
    for (const [key, value] of Object.entries(record)) {
      const target = form.elements.namedItem(key);
      if (!target) continue;
      if (key === 'pinned' || key === 'sample') target.checked = value;
      else if (key === 'tags') target.value = value.join('，');
      else target.value = key === 'date' && value ? localDate(value) : value ?? '';
    }
  }
  redrawImage();
  if (!poster) {
    if (record) form.elements.slug.readOnly = true;
    else form.elements.weight.value = '3';
    form.elements.slug.required = !article;
    for (const option of form.elements.status.options) option.textContent = labels[tab][option.value];
    if (article) {
      blocks = editBlocks(get('#article-blocks'), record?.blocks, markDirty);
      get('#timezone').textContent = `本机时区 ${Intl.DateTimeFormat().resolvedOptions().timeZone}。到点后可生成并发布。`;
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
      variantEditor = editVariants(get('#variants'), record?.variants, () => form.elements.priceMode.value, markDirty);
      inputOptions('#regions', state.data.products.map(item => item.region));
      inputOptions('#categories', state.data.products.map(item => item.category));
    }
    function refreshStatus() {
      const published = form.elements.status.value === 'published';
      for (const field of article ? ['date'] : ['region', 'category', 'summary']) form.elements[field].required = published;
      if (article && published && !form.elements.date.value) form.elements.date.value = localDate(new Date());
      if (!article) {
        get('#prices').hidden = form.elements.priceMode.value === 'hidden';
        form.elements.price.required = !get('#prices').hidden;
        variantEditor.drawVariants();
      }
    }
    form.elements.status.onchange = refreshStatus;
    if (!article) form.elements.priceMode.onchange = refreshStatus;
    refreshStatus();
  }

  function refreshSlug() {
    const field = form.elements.slug;
    const automatic = articleSlug(form.elements.title.value, form.elements.englishTitle.value, articleSlugs(state.data));
    const output = get('#slug-preview');
    const slug = field.value.trim() || automatic;
    field.placeholder = automatic || '随标题自动生成';
    output.hidden = !slug;
    output.value = slug ? `guide-${slug}.html` : '';
  }

  function valuesFromForm() {
    const fields = new FormData(form);
    const values = Object.fromEntries(fields);
    if (article) {
      values.pinned = fields.has('pinned');
      values.related = fields.getAll('related');
      values.blocks = blocks;
      if (values.date && (!record?.date || values.date !== localDate(record.date))) values.date = new Date(values.date).toISOString();
      else if (values.date) values.date = record.date;
    } else if (!poster) {
      values.sample = fields.has('sample');
      values.variants = variantEditor.variants;
    }
    return values;
  }

  function schedulePreview() {
    clearTimeout(timer);
    const version = ++previewVersion;
    timer = setTimeout(async () => {
      if (!form.isConnected) return;
      try {
        const { html } = await post('preview-article', { values: valuesFromForm() });
        if (version !== previewVersion || !form.isConnected) return;
        const frame = get('.preview iframe');
        const scroll = frame.contentWindow?.scrollY || 0;
        frame.addEventListener('load', () => frame.contentWindow.scrollTo(0, scroll), { once: true });
        frame.srcdoc = html;
      } catch {
        // Keep the last rendered version while an input is incomplete.
      }
    }, 400);
  }

  if (article) {
    refreshSlug();
    if (!record) schedulePreview();
  }
  form.oninput = () => {
    if (article) refreshSlug();
    markDirty();
  };
  form.onsubmit = async event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      state = await post('save', { collection: tab, values: valuesFromForm(), original: selected ?? null });
      if (!poster) selected = state.selected;
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
  generate.disabled = active || !state;
  document.querySelectorAll('[data-tab], #new, #editor button[type=submit]').forEach(button => { button.disabled = active; });
  if (state) drawList();
}

async function generateSite() {
  if (busy) return;
  if (dirty) {
    flash('请先保存当前修改。', true);
    return;
  }
  setBusy(true);
  flash('正在生成并检查页面…');
  clearTimeout(noticeTimer);
  try {
    const { files } = await post('generate');
    state = await api('state');
    const summary = files.length ? `已生成并检查 ${files.length} 个文件。` : '检查通过，生成文件已是最新。';
    flash(`${summary}请在 GitHub Desktop 审核改动，提交后推送。`);
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
generate.onclick = generateSite;
window.addEventListener('beforeunload', event => { if (dirty) event.preventDefault(); });
window.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && get('#editor') && !busy) {
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
