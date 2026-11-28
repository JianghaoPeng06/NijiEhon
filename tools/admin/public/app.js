import { fulfillmentLabels } from './purchase-options.js';

const get = selector => document.querySelector(selector);
const main = get('#main');
const filter = get('#filter');
const records = get('#records');
const notice = get('#status');
const generate = get('#generate');
const save = get('#save');
const previewPanel = get('#preview');
const previewFrame = previewPanel.querySelector('iframe');
const previewStage = get('.preview-stage');
const previewViewport = get('.preview-viewport');
const previewModes = [...previewPanel.querySelectorAll('[data-preview-width]')];
let previewWidth = Number(previewModes[0].dataset.previewWidth);
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
  get('#new').textContent = tab === 'articles' ? '＋ 写新文章' : '＋ 新建商品';
  const term = filter.value.trim().toLowerCase();
  const list = all.filter(item => [item.title, item.author, item.keywords, item.category, ...(item.tags || [])].filter(Boolean).some(value => value.toLowerCase().includes(term))).map(item => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'record';
    button.disabled = busy;
    if (item.slug === selected) button.setAttribute('aria-current', 'true');
    const title = document.createElement('span');
    title.className = 'record-title';
    title.textContent = item.title;
    const subtitle = document.createElement('small');
    subtitle.textContent = [status(item), item.pinned ? '置顶' : '', item.date ? new Date(item.date).toLocaleDateString('zh-CN') : ''].filter(Boolean).join(' · ');
    const thumb = document.createElement('span');
    thumb.className = 'record-thumb';
    thumb.setAttribute('aria-hidden', 'true');
    if (item.image) {
      const image = document.createElement('img');
      image.src = `/preview/${item.image}`;
      image.alt = '';
      image.loading = 'lazy';
      thumb.append(image);
    }
    const label = document.createElement('span');
    label.className = 'record-label';
    label.append(title, subtitle);
    button.append(thumb, label);
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

const statusField = '<label>状态<select name="status"><option value="draft">草稿</option><option value="published"></option><option value="archived"></option></select></label>';
const productInfo = `
  <label>商品名称<input name="title" maxlength="100" required></label>
  ${statusField}<p class="hint">草稿仅供浏览，上架可购买，下架后隐藏。</p>
  <label>简介<textarea name="summary" rows="2" maxlength="500"></textarea></label>`;
const keywords = '<label>搜索关键词<input name="keywords" maxlength="200" placeholder="多个关键词用空格分隔"></label>';
const weight = `<label>推荐权重<select name="weight"><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select><span class="hint">仅用于商品推荐，5 优先于 1。</span></label>`;
const productMetadata = `
  <div class="pair"><label>地区<input name="region" maxlength="32" list="regions"></label><label>分类<input name="category" maxlength="32" list="categories"></label></div>
  <datalist id="regions"></datalist><datalist id="categories"></datalist>`;
const productPurchase = `
  <div class="pair"><label>价格类型<select name="priceMode"><option value="hidden">价格待公布</option><option value="fixed">固定价格</option><option value="from">起始价格</option></select></label>${weight}</div>
  <div id="prices" class="fields" hidden>
    <div class="pair"><label>基准金额（USD）<input name="price" inputmode="decimal" maxlength="13"></label><label>计价单位<input name="unit" maxlength="16" placeholder="例如 月、张，选填"></label></div>
  </div>
  <div id="variants"></div>
  <label class="check"><input name="sample" type="checkbox">标记为样例商品</label>`;
const productDescription = `
  <label>商品说明<textarea name="body" rows="6" maxlength="40000"></textarea><span class="hint">用空行分开段落，可以用 #、- 或 &gt; 开头写小标题、列表和引用。</span></label>
  <label>交付方式<input name="delivery" maxlength="150"></label>
  <label>购买须知<textarea name="notice" rows="3" maxlength="2000"></textarea></label>
  <label>官方网站<input name="url" type="url" placeholder="https://" maxlength="2000"></label>`;
const articleInfo = `
  <div class="pair article-pair">${statusField}<label>作者<input name="author" type="text" maxlength="80" placeholder="NijiEhon"></label></div>
  <div class="pair article-pair"><label>发布时间<input name="date" type="datetime-local" aria-describedby="timezone"></label><label>阅读时间（分钟）<input name="read" type="number" min="1" max="300" placeholder="自动估算"></label>
  <p class="hint" id="timezone"></p></div>
  <label class="check"><input name="pinned" type="checkbox">置顶</label>`;
const articleTitle = `
  <label>标题<input name="title" maxlength="100" required></label>
  <label>英文标题<input name="englishTitle" maxlength="100" placeholder="选填" aria-describedby="english-title-hint"><span class="hint" id="english-title-hint">首次保存时用于生成网址。</span></label>
  <label>导语<textarea name="summary" rows="2" maxlength="500"></textarea></label>`;
const articleDetails = `
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

function editProductImages(container, record, markDirty) {
  const photos = record?.image
    ? [{ image: record.image, alt: record.imageAlt }, ...(record.gallery || []).map(photo => ({ ...photo }))]
    : [{ image: '', alt: '' }];
  const list = document.createElement('div');
  list.className = 'fields';
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'secondary';
  add.textContent = '添加商品图';
  const refreshAdd = () => { add.disabled = photos.length >= 30 || photos.some(photo => !photo.image); };
  add.onclick = () => {
    if (busy) return;
    photos.push({ image: '', alt: '' });
    draw();
    list.lastElementChild.querySelector('input[type=file]').focus();
  };
  function draw() {
    list.replaceChildren(...photos.map((photo, index) => {
      const row = document.createElement('div');
      row.className = 'card-image-field fields';
      const redraw = mountImage(row, index ? `第 ${index + 1} 张商品图` : '第 1 张商品图 · 商品卡片封面',
        () => photo.image, source => {
          if (!source && photos.length > 1) {
            photos.splice(index, 1);
            draw();
          } else photo.image = source;
          refreshAdd();
          markDirty();
        });
      redraw();
      row.insertAdjacentHTML('beforeend', '<label>图片描述<input maxlength="180" placeholder="简要描述图片，供读屏使用"></label><div class="image-reorder"><button type="button" class="secondary">上移</button><button type="button" class="secondary">下移</button></div>');
      const description = row.querySelector('input[maxlength]');
      description.value = photo.alt || '';
      description.oninput = () => { photo.alt = description.value; };
      const buttons = [...row.querySelectorAll('.image-reorder button')];
      buttons.forEach((button, direction) => {
        const target = index + (direction ? 1 : -1);
        button.disabled = target < 0 || target >= photos.length;
        button.onclick = () => {
          if (busy) return;
          [photos[index], photos[target]] = [photos[target], photos[index]];
          draw();
          markDirty();
          const reordered = [...list.children[target].querySelectorAll('.image-reorder button')];
          (reordered[direction].disabled ? reordered[1 - direction] : reordered[direction]).focus();
        };
      });
      return row;
    }));
    refreshAdd();
  }
  container.append(list, add);
  draw();
  return photos;
}

function editVariants(container, existing, existingNotes, priceMode, markDirty) {
  const variants = (existing || []).map(option => ({ ...option }));
  const methodNotes = { ...existingNotes };
  const methodOf = option => option?.fulfillment || 'digital';
  let method = methodOf(variants.find(option => option.stock !== 'restock') || variants[0]);
  const methods = document.createElement('fieldset');
  methods.innerHTML = '<legend>选择连接方式</legend><div class="variant-methods"></div><label class="method-note">连接方式备注<textarea rows="2" maxlength="160" placeholder="选填，例如寄送或交付说明"></textarea></label>';
  const note = methods.querySelector('textarea');
  note.oninput = () => { methodNotes[method] = note.value; };
  const methodButtons = Object.entries(fulfillmentLabels).map(([value, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.method = value;
    button.textContent = label;
    button.onclick = () => {
      if (busy) return;
      method = value;
      drawVariants();
    };
    return button;
  });
  methods.querySelector('div').append(...methodButtons);
  const list = document.createElement('div');
  list.className = 'fields variant-list';
  list.addEventListener('input', event => {
    const row = event.target.closest('[data-variant]');
    const key = event.target.dataset.key;
    if (!row || !key) return;
    variants[Number(row.dataset.variant)][key] = event.target.value;
    if (key === 'fulfillment') {
      method = event.target.value;
      drawVariants();
      list.querySelector(`[data-variant="${row.dataset.variant}"] [data-key="fulfillment"]`).focus();
    }
  });
  const add = document.createElement('button');
  add.className = 'secondary';
  add.type = 'button';
  add.textContent = '新增规格';
  add.onclick = () => {
    if (busy || variants.length >= 20) return;
    variants.push({ name: '', price: '', fulfillment: method });
    markDirty();
    drawVariants();
    list.lastElementChild.querySelector('input').focus();
  };
  const section = document.createElement('fieldset');
  section.innerHTML = '<legend>选择规格</legend><p class="hint">添加到所选连接方式下。起始价格模式下，规格价格留空会沿用基准金额。</p><p class="hint variant-empty"></p>';
  const empty = section.querySelector('.variant-empty');
  section.append(list, add);
  container.append(methods, section);
  const methodOptions = Object.entries(fulfillmentLabels).map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
  function drawVariants() {
    methodButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.method === method)));
    note.value = methodNotes[method] || '';
    list.replaceChildren(...variants.flatMap((option, index) => {
      if (methodOf(option) !== method) return [];
      const row = document.createElement('div');
      row.className = 'variant-row';
      row.dataset.variant = index;
      row.innerHTML = `<label>规格名称<input data-key="name" maxlength="80" required></label>
<label>规格价格（USD）<input data-key="price" maxlength="13" inputmode="decimal" placeholder="基准金额"></label>
<label>移至连接方式<select data-key="fulfillment">${methodOptions}</select></label>
<label>库存<select data-key="stock"><option value="available">可加入购物车</option><option value="restock">等补货</option></select></label>
<label class="variant-note">规格备注<textarea data-key="note" rows="2" maxlength="160" placeholder="选填"></textarea></label>
<button type="button" class="secondary" aria-label="移除规格">移除</button>`;
      row.querySelector('[data-key=name]').value = option.name;
      row.querySelector('[data-key=fulfillment]').value = method;
      row.querySelector('[data-key=stock]').value = option.stock || 'available';
      row.querySelector('[data-key=note]').value = option.note || '';
      const price = row.querySelector('[data-key=price]');
      price.value = option.price;
      price.parentElement.hidden = priceMode() !== 'from';
      row.querySelector('button').onclick = () => {
        if (busy) return;
        variants.splice(index, 1);
        markDirty();
        drawVariants();
      };
      return [row];
    }));
    empty.hidden = list.childElementCount > 0;
    empty.textContent = `${fulfillmentLabels[method]}下暂无规格。`;
    add.disabled = variants.length >= 20;
  }
  function validate() {
    const index = variants.findIndex(option => !option.name.trim());
    if (index < 0) return true;
    method = methodOf(variants[index]);
    drawVariants();
    list.querySelector(`[data-variant="${index}"] [data-key="name"]`).focus();
    flash('请填写规格名称。', true);
    return false;
  }
  drawVariants();
  return { variants, methodNotes, drawVariants, validate };
}

const blockTypes = {
  text: '段落', heading: '小标题', subheading: '次级小标题', quote: '引用',
  list: '项目列表', ordered: '编号列表', image: '图片', cover: '用卡片封面', divider: '分隔线', html: 'HTML'
};
const blockTypeOptions = Object.entries(blockTypes).map(([type, label]) => `<option value="${type}">${label}</option>`).join('');

function editBlocks(container, existing, markDirty) {
  const blocks = existing?.length ? existing.map(block => ({ ...block })) : [{ type: 'text' }];
  const list = document.createElement('div');
  list.className = 'block-list';
  const add = document.createElement('div');
  add.className = 'block-add';
  container.className = 'body-editor';
  container.innerHTML = '<p class="hint">拖动模块左侧的手柄或用箭头排序。粘贴带空行的文字会自动拆成段落。</p>';
  container.append(list, add);
  let dragged = null;

  function focusBlock(index) {
    const row = list.children[index];
    const field = row.querySelector('.block-content input, .block-content textarea') || row.querySelector('select');
    field.focus();
  }

  function insert(index, type) {
    if (busy) return;
    if (blocks.length >= 100) return flash('正文最多可包含 100 个内容块。', true);
    blocks.splice(index, 0, { type });
    markDirty();
    drawBlocks();
    focusBlock(index);
  }

  function move(index, target) {
    if (busy || target === index) return;
    blocks.splice(target, 0, blocks.splice(index, 1)[0]);
    markDirty();
    drawBlocks();
    list.children[target].querySelector('select').focus();
  }

  function drawBlocks() {
    list.replaceChildren(...blocks.map((block, index) => {
      const row = document.createElement('fieldset');
      row.className = 'body-block fields';
      row.dataset.index = index;
      row.innerHTML = `<div class="block-tools"><div class="block-kind"><span class="block-grip" draggable="true" aria-hidden="true" title="拖动排序">⠿</span><select aria-label="第 ${index + 1} 个正文模块的类型">${blockTypeOptions}</select></div><div>
        <button type="button" data-block="up" aria-label="上移" title="上移">↑</button><button type="button" data-block="down" aria-label="下移" title="下移">↓</button><button type="button" data-block="insert" aria-label="在下方插入段落" title="在下方插入段落">＋</button><button type="button" data-block="remove" aria-label="移除内容块" title="移除内容块">×</button></div></div><div class="block-content fields"></div>`;
      const select = row.querySelector('select');
      select.value = block.type;
      select.onchange = () => {
        if (busy) return;
        block.type = select.value;
        markDirty();
        drawBlocks();
        list.children[index].querySelector('select').focus();
      };
      const up = row.querySelector('[data-block=up]');
      const down = row.querySelector('[data-block=down]');
      up.disabled = index === 0;
      down.disabled = index === blocks.length - 1;
      up.onclick = () => move(index, index - 1);
      down.onclick = () => move(index, index + 1);
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
      } else if (block.type === 'divider') {
        content.innerHTML = '<hr>';
      } else {
        const isHeading = block.type === 'heading' || block.type === 'subheading';
        content.innerHTML = `<label>${blockTypes[block.type]}${isHeading ? '<input data-key="text" maxlength="160">' : '<textarea data-key="text" rows="4" maxlength="40000"></textarea>'}</label>`;
        if (block.type === 'html') content.insertAdjacentHTML('beforeend', '<p class="hint">可写 HTML 和 CSS。脚本和表单在预览与网站上均不可用。</p>');
        if (block.type === 'list' || block.type === 'ordered') content.querySelector('textarea').placeholder = '每行一项';
      }
      for (const input of content.querySelectorAll('[data-key]')) {
        const key = input.dataset.key;
        input.value = block[key] || '';
        input.oninput = () => { block[key] = input.value; };
      }
      return row;
    }));
  }

  list.addEventListener('paste', event => {
    const input = event.target.closest('textarea[data-key=text]');
    if (!input || busy) return;
    const index = Number(input.closest('.body-block').dataset.index);
    if (blocks[index].type !== 'text') return;
    const paragraphs = (event.clipboardData?.getData('text/plain') || '').replace(/\r\n?/g, '\n').split(/\n[^\S\n]*\n+/).map(part => part.trim()).filter(Boolean);
    if (paragraphs.length < 2 || blocks.length + paragraphs.length - 1 > 100) return;
    event.preventDefault();
    blocks[index].text = input.value.slice(0, input.selectionStart) + paragraphs.shift();
    const additions = paragraphs.map(text => ({ type: 'text', text }));
    additions.at(-1).text += input.value.slice(input.selectionEnd);
    blocks.splice(index + 1, 0, ...additions);
    markDirty();
    drawBlocks();
    const last = list.children[index + additions.length].querySelector('textarea');
    last.focus();
    last.setSelectionRange(paragraphs.at(-1).length, paragraphs.at(-1).length);
  });

  function clearDropMarker() {
    list.querySelector('[data-drop-side]')?.removeAttribute('data-drop-side');
  }

  list.addEventListener('dragstart', event => {
    if (!event.target.matches('.block-grip')) return;
    if (busy) return event.preventDefault();
    dragged = Number(event.target.closest('.body-block').dataset.index);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', '');
  });
  list.addEventListener('dragover', event => {
    if (dragged === null || busy) return;
    clearDropMarker();
    const row = event.target.closest('.body-block');
    if (!row) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const box = row.getBoundingClientRect();
    row.dataset.dropSide = event.clientY < box.top + box.height / 2 ? 'before' : 'after';
  });
  list.addEventListener('dragleave', event => {
    if (!list.contains(event.relatedTarget)) clearDropMarker();
  });
  list.addEventListener('drop', event => {
    const row = event.target.closest('[data-drop-side]');
    if (dragged === null || !row || busy) return;
    event.preventDefault();
    const insertion = Number(row.dataset.index) + (row.dataset.dropSide === 'after' ? 1 : 0);
    const from = dragged;
    dragged = null;
    clearDropMarker();
    move(from, insertion > from ? insertion - 1 : insertion);
  });
  list.addEventListener('dragend', () => {
    dragged = null;
    clearDropMarker();
  });

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

function resizePreview() {
  if (!previewStage.clientWidth || !previewStage.clientHeight) return;
  const scale = Math.min(1, previewStage.clientWidth / previewWidth);
  previewViewport.style.width = `${previewWidth * scale}px`;
  previewFrame.style.width = `${previewWidth}px`;
  previewFrame.style.height = `${previewStage.clientHeight / scale}px`;
  previewFrame.style.transform = `scale(${scale})`;
}

new ResizeObserver(resizePreview).observe(previewStage);
for (const button of previewModes) {
  button.onclick = () => {
    previewWidth = Number(button.dataset.previewWidth);
    previewModes.forEach(mode => mode.setAttribute('aria-pressed', String(mode === button)));
    resizePreview();
  };
}

function showPreview(title, url, live) {
  previewPanel.hidden = false;
  previewStage.hidden = !url && !live;
  get('.preview-note').hidden = !previewStage.hidden;
  get('.preview-modes').hidden = previewStage.hidden;
  const link = get('#preview-link');
  link.hidden = !url;
  if (url) link.href = url;
  else link.removeAttribute('href');
  previewFrame.title = `${title}预览`;
  previewFrame.src = url || 'about:blank';
  previewFrame.removeAttribute('srcdoc');
}

function editorCard(title, contents) {
  return `<section class="panel editor-card fields">${title ? `<h2 class="editor-section-title">${title}</h2>` : ''}${contents}</section>`;
}

function draw() {
  dirty = false;
  get('.workspace').dataset.module = tab;
  document.querySelectorAll('[data-tab]').forEach(button => {
    if (button.dataset.tab === tab) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  drawList();
  if (tab === 'accounts') {
    previewPanel.hidden = true;
    previewFrame.src = 'about:blank';
    previewFrame.removeAttribute('srcdoc');
    save.disabled = true;
    main.innerHTML = '<section class="panel"><h1>用户与订单</h1><p class="placeholder">购买系统正式上线后，这里会接入用户账号与订单管理。</p></section>';
    return;
  }
  const poster = tab === 'poster';
  const article = tab === 'articles';
  const record = poster ? state.data.poster : state.data[tab].find(item => item.slug === selected);
  const title = poster ? '首页海报' : `${record ? '编辑' : '新建'}${names[tab]}`;
  const description = poster ? '更换首页展示的 16:9 图片。' : article ? '编辑文章，右侧同步预览。' : '保存后即可查看商品与购买选项。';
  const preview = poster ? '/preview/index.html' : record ? `/preview/${article ? 'guide' : 'product'}-${record.slug}.html?draft` : '';
  const imageField = `<div id="image"${article ? ' class="card-image-field"' : ''}><input type="hidden" name="image"></div>`;
  main.innerHTML = `
    <form id="editor" class="editor">
      <div class="editor-header"><div><h1>${title}</h1><p>${description}</p></div><div class="editor-tools"><span id="editor-state" class="editor-state" hidden>未保存</span>${record && !poster ? `<button id="delete-record" class="secondary danger" type="button">删除${names[tab]}</button>` : ''}</div></div>
      ${poster ? editorCard('海报与裁切', imageField + posterFields) : `
        ${article
          ? editorCard('标题和导语', articleTitle) + editorCard('基本信息', articleInfo)
            + editorCard('文章封面', imageField + '<label>图片描述<input name="imageAlt" maxlength="180" placeholder="简要描述图片，供读屏使用"></label><p class="hint">封面用于文章卡片。正文需要图片时，添加「图片」或「用卡片封面」模块。放在第一块会作为正文首图。</p>')
            + editorCard('正文', '<div id="article-blocks"></div>') + editorCard('标签与相关商品', articleDetails)
          : editorCard('基本信息', productInfo + productMetadata) + editorCard('商品图片', '<div id="product-images" class="fields"></div>') + editorCard('价格与规格', productPurchase) + editorCard('说明与交付', productDescription)}
        ${editorCard('搜索', keywords)}
      `}
    </form>`;
  main.scrollTop = 0;
  showPreview(title, preview, article);
  save.disabled = busy;
  const form = get('#editor');
  let blocks;
  let productPhotos;
  let variantEditor;
  let timer;
  let previewVersion = 0;
  const markDirty = () => {
    dirty = true;
    get('#editor-state').hidden = false;
    if (article) schedulePreview();
  };
  const redrawImage = (poster || article) ? mountImage(get('#image'), poster ? '海报图片' : '卡片封面（发布必填）',
    () => form.elements.image.value, image => { form.elements.image.value = image; markDirty(); },
    poster ? () => form.elements.position.value : undefined) : null;
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
  redrawImage?.();
  if (!poster) {
    for (const option of form.elements.status.options) option.textContent = labels[tab][option.value];
    if (article) {
      blocks = editBlocks(get('#article-blocks'), record?.blocks, markDirty);
      get('#timezone').textContent = `发布时间按本机时区填写（${Intl.DateTimeFormat().resolvedOptions().timeZone}）。`;
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
      productPhotos = editProductImages(get('#product-images'), record, markDirty);
      if (!record) form.elements.weight.value = '3';
      variantEditor = editVariants(get('#variants'), record?.variants, record?.methodNotes, () => form.elements.priceMode.value, markDirty);
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
      values.images = productPhotos;
      values.sample = fields.has('sample');
      values.variants = variantEditor.variants;
      values.methodNotes = variantEditor.methodNotes;
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
        const frame = previewFrame;
        const scroll = frame.contentWindow?.scrollY || 0;
        frame.addEventListener('load', () => {
          if (form.isConnected && frame.srcdoc === html) frame.contentWindow.scrollTo(0, scroll);
        }, { once: true });
        frame.srcdoc = html;
      } catch {
        // Keep the last rendered version while an input is incomplete.
      }
    }, 400);
  }

  if (article && !record) schedulePreview();
  form.oninput = markDirty;
  form.onsubmit = async event => {
    event.preventDefault();
    if (busy) return;
    if (variantEditor && !variantEditor.validate()) return;
    if (article && form.elements.status.value === 'published' && !form.elements.image.value) {
      flash('请为文章添加卡片封面后再发布。', true);
      get('#image input[type=file]').focus();
      return;
    }
    setBusy(true);
    try {
      state = await post('save', { collection: tab, values: valuesFromForm(), original: selected ?? null });
      if (!poster) selected = state.selected;
      const scroll = main.scrollTop;
      draw();
      main.scrollTop = scroll;
      flash('已保存到本机。');
    } catch (error) {
      flash(error.message, true);
    } finally {
      setBusy(false);
    }
  };
  const remove = get('#delete-record');
  if (remove) remove.onclick = async () => {
    const message = article ? '文章会从本机内容移除，已有网址将显示已撤下。' : '商品及其文章关联会从本机内容移除，已有网址将显示已下架。';
    if (busy || !window.confirm(`删除「${record.title}」？${message}${dirty ? '\n当前未保存的修改也会丢弃。' : ''}`)) return;
    setBusy(true);
    try {
      state = await post(article ? 'delete-article' : 'delete-product', { slug: record.slug });
      selected = state.selected;
      draw();
      flash(`${article ? '文章' : '商品'}已从本机移除。生成网站后更新网页。`);
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
  save.disabled = active || !get('#editor');
  document.querySelectorAll('[data-tab], #new, #delete-record').forEach(button => { button.disabled = active; });
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
