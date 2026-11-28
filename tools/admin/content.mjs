import { fulfillmentLabels } from './public/purchase-options.js';

export const collections = ['products', 'articles'];
const currency = 'USD';
export const imagePath = /^assets\/(?:placeholders\/[a-z0-9-]+\.(?:jpg|png|webp)|station\.jpg|content\/[a-f0-9]{64}\.(?:jpg|png|webp))$/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const formatter = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric' });
const blockTypes = ['text', 'heading', 'subheading', 'list', 'ordered', 'quote', 'image', 'cover', 'divider', 'html'];
const usd = new Intl.NumberFormat('zh-CN', { style: 'currency', currency, currencyDisplay: 'code' });

function field(value, label, max, required = false) {
  const text = typeof value === 'string' ? value.trim() : '';
  if ((required && !text) || text.length > max) throw new Error(`${label}需要${required ? ' 1 至' : '不超过'} ${max} 个字符。`);
  return text;
}

function choice(value, options, label) {
  if (!options.includes(value)) throw new Error(`${label}无效。`);
  return value;
}

function slug(value) {
  const name = field(value, '网址标识', 60, true);
  if (!slugPattern.test(name)) throw new Error('网址标识只能用小写字母、数字和单个连字符。');
  return name;
}

function image(value) {
  if (value && !imagePath.test(value)) throw new Error('请选择后台上传的图片。');
  return value || '';
}

export function normalizePoster(values) {
  if (!values.image) throw new Error('请选择首页海报图片。');
  return { image: image(values.image), alt: field(values.alt, '图片描述', 180, true), position: choice(values.position, ['top', 'center', 'bottom'], '裁切位置') };
}

function legacyBlocks(text) {
  return (text || '').split(/\r?\n\s*\r?\n/).filter(Boolean).map(value => {
    const lines = value.split(/\r?\n/);
    if (lines.length === 1 && /^#{1,3} /.test(value)) return { type: 'heading', text: value.replace(/^#{1,3} /, '') };
    if (lines.every(line => /^[-*] /.test(line))) return { type: 'list', text: lines.map(line => line.slice(2)).join('\n') };
    if (lines.every(line => line.startsWith('> '))) return { type: 'quote', text: lines.map(line => line.slice(2)).join('\n') };
    return { type: 'text', text: value };
  });
}

function articleBlocks(values) {
  const blocks = values.blocks ?? legacyBlocks(values.body);
  if (!Array.isArray(blocks) || blocks.length > 100) throw new Error('正文最多可包含 100 个内容块。');
  const normalized = blocks.flatMap(block => {
    const type = choice(block.type, blockTypes, '正文块类型');
    if (type === 'image' || type === 'cover') {
      const caption = field(block.caption, '图注', 300);
      if (type === 'cover') {
        if (!values.image) throw new Error('正文使用了封面，请添加封面或移除该正文块。');
        return [{ type, caption }];
      }
      const source = image(block.image);
      if (!source) return [];
      return [{ type, image: source, alt: field(block.alt, '图片描述', 180), caption }];
    }
    if (type === 'divider') return [{ type }];
    const text = field(block.text, '正文块', type === 'heading' || type === 'subheading' ? 160 : 40000);
    return text ? [{ type, text }] : [];
  });
  if (normalized.reduce((length, block) => length + (block.text?.length || 0), 0) > 40000) throw new Error('正文总长度最多 40000 个字符。');
  return normalized;
}

function amount(value, label, required = false) {
  const price = field(value, label, 13, required);
  if (price && !/^\d{1,10}(?:\.\d{1,2})?$/.test(price)) throw new Error(`${label}须为非负美元金额，整数最多 10 位，小数最多两位。`);
  return price;
}

export function normalizeRecord(collection, values) {
  const article = collection === 'articles';
  const status = choice(values.status, ['draft', 'published', 'archived'], '状态');
  const record = {
    slug: slug(values.slug), title: field(values.title, '标题', 100, true),
    summary: field(values.summary, '简介', 500, !article && status === 'published'),
    image: image(values.image), imageAlt: field(values.imageAlt, '图片描述', 180),
    keywords: field(values.keywords, '搜索关键词', 200), status
  };
  if (article) {
    const blocks = articleBlocks(values);
    if (status === 'published' && !blocks.some(block => block.type !== 'divider')) throw new Error('发布文章至少需要一个正文内容块。');
    const rawTags = Array.isArray(values.tags) ? values.tags : (values.tags || '').split(/[,，、\n]/);
    const tags = [...new Set(rawTags.map(tag => field(tag, '标签', 24)).filter(Boolean))];
    if (tags.length > 12) throw new Error('每篇文章最多 12 个标签。');
    const date = values.date ? new Date(values.date) : null;
    if (!Number.isFinite(date?.getTime()) && (values.date || status === 'published')) throw new Error('请输入有效的发布时间。');
    const read = values.read === '' || values.read == null ? null : Number(values.read);
    if (read !== null && (!Number.isInteger(read) || read < 1 || read > 300)) throw new Error('阅读时间须为 1 至 300 分钟，或留空自动估算。');
    return { ...record, englishTitle: field(values.englishTitle, '英文标题', 100), author: field(values.author, '作者', 80) || 'NijiEhon', date: date ? date.toISOString() : '', read, pinned: values.pinned === true, tags, blocks, related: [...new Set((values.related || []).map(slug))] };
  }

  const region = field(values.region, '地区', 32, status === 'published');
  const category = field(values.category, '分类', 32, status === 'published');
  if (region === '全部' || category === '全部') throw new Error('「全部」保留给筛选按钮，请填写具体地区或分类。');
  const url = field(values.url, '官方网站', 2000);
  if (url) {
    const parsed = URL.parse(url);
    if (parsed?.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('官方网站需要使用有效的 HTTPS 链接。');
  }
  const priceMode = choice(values.priceMode || 'hidden', ['hidden', 'fixed', 'from'], '价格类型');
  if (priceMode !== 'hidden' && values.currency && values.currency !== currency) throw new Error('商品统一使用美元，请以 USD 填写价格。');
  const price = priceMode === 'hidden' ? '' : amount(values.price, '价格', true);
  const unit = price ? field(values.unit, '计价单位', 16) : '';
  const options = values.variants ?? [];
  if (!Array.isArray(options) || options.length > 20) throw new Error('一个商品最多可添加 20 个规格。');
  const variants = options.map(option => {
    const fulfillment = choice(option.fulfillment || 'digital', Object.keys(fulfillmentLabels), '规格交付方式');
    const stock = choice(option.stock || 'available', ['available', 'restock'], '规格库存');
    const note = field(option.note, '规格备注', 160);
    return {
      name: field(option.name, '规格名称', 80, true),
      price: priceMode === 'from' ? amount(option.price, '规格价格') : '',
      ...(fulfillment === 'digital' ? {} : { fulfillment }),
      ...(stock === 'available' ? {} : { stock }),
      ...(note ? { note } : {})
    };
  });
  if (new Set(variants.map(option => option.name.toLowerCase())).size !== variants.length) throw new Error('规格名称不能重复。');
  const weight = choice(Number(values.weight ?? 3), [1, 2, 3, 4, 5], '推荐权重');
  const methodNotes = Object.fromEntries(Object.keys(fulfillmentLabels)
    .map(method => [method, field(values.methodNotes?.[method], '连接方式备注', 160)])
    .filter(([, note]) => note));
  const images = values.images ?? [{ image: record.image, alt: record.imageAlt }, ...(values.gallery || [])];
  if (!Array.isArray(images) || images.length > 30) throw new Error('每件商品最多可添加 30 张图片。');
  const [cover, ...gallery] = images.filter(photo => photo.image).map(photo => ({
    image: image(photo.image), alt: field(photo.alt, '商品图片描述', 180)
  }));
  record.image = cover?.image || '';
  record.imageAlt = cover?.alt || '';
  return { ...record, ...(gallery.length ? { gallery } : {}), weight, region, category, url, currency, priceMode, price, unit, variants, ...(Object.keys(methodNotes).length ? { methodNotes } : {}), body: field(values.body, '商品说明', 40000), delivery: field(values.delivery, '交付方式', 150), notice: field(values.notice, '购买须知', 2000), sample: values.sample === true };
}

export function verifyArticleCover(item) {
  if (item.status === 'published' && !item.image) throw new Error(`请为《${item.title}》添加卡片封面后再发布。`);
}

export function recordImages(item) {
  return [item.image, ...(item.gallery || []).map(photo => photo.image), ...(item.blocks || []).filter(block => block.type === 'image').map(block => block.image)].filter(Boolean);
}

export function route(collection, id) {
  return `${collection === 'products' ? 'product' : 'guide'}-${id}.html`;
}

export function compareArticles(a, b) {
  return b.date.localeCompare(a.date);
}

function recommendedProducts(products) {
  return products.filter(item => item.status === 'published').sort((a, b) => b.weight - a.weight).slice(0, 3);
}

export function visible(data, now = Date.now()) {
  return {
    products: data.products.filter(item => item.status !== 'archived'),
    articles: data.articles.filter(item => item.status === 'published' && Date.parse(item.date) <= now)
      .sort(compareArticles)
  };
}

export function snapshot(data, previous, now) {
  const active = visible(data, now);
  const names = collections.flatMap(collection => active[collection].map(item => route(collection, item.slug)));
  const old = collections.flatMap(collection => previous[collection].map(item => route(collection, item.slug)));
  return { poster: data.poster, ...active, retired: [...new Set([...previous.retired, ...data.retired, ...old])].filter(name => !names.includes(name)).sort() };
}

const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escape = value => String(value ?? '').replace(/[&<>"']/g, char => entities[char]);

function articleMeta(item) {
  const parts = item.date ? formatter.formatToParts(new Date(item.date)) : [];
  const date = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const iso = parts.length ? `${date.year}-${date.month.padStart(2, '0')}-${date.day.padStart(2, '0')}` : '';
  const display = parts.length ? `<time datetime="${iso}">${date.year} 年 ${date.month} 月 ${date.day} 日</time> ` : '';
  const text = item.blocks.map(block => block.type === 'html' ? block.text.replace(/<[^>]*>/g, ' ') : block.text || block.caption || '').join(' ');
  const han = text.match(/\p{Script=Han}/gu) || [];
  const words = text.replace(/\p{Script=Han}/gu, ' ').match(/[\p{L}\p{N}]+/gu) || [];
  const minutes = item.read ?? Math.max(1, Math.ceil(han.length / 350 + words.length / 220));
  return `<span class="article-meta">${display}<span class="article-duration">${display ? '· ' : ''}约 ${minutes} 分钟阅读</span></span>`;
}

function imageTag(item, css) {
  if (!item.image) return '';
  return `<img class="${css}" src="${escape(item.image)}" alt="${escape(item.imageAlt)}" loading="lazy" decoding="async">`;
}

function zoomableImage(item, css, attributes = '') {
  return `<a class="image-zoom" href="${escape(item.image)}" data-image-zoom aria-label="${escape(item.imageAlt ? `查看大图：${item.imageAlt}` : '查看大图')}"${attributes}>${imageTag(item, css)}</a>`;
}

function purchaseOptions(item) {
  const variants = item.variants.length ? item.variants : [{ name: '默认规格' }];
  return variants.map(variant => ({
    name: variant.name,
    cents: item.priceMode === 'hidden' ? null : Math.round(Number(variant.price || item.price) * 100),
    fulfillment: variant.fulfillment || 'digital',
    stock: variant.stock || 'available',
    ...(variant.note ? { note: variant.note } : {})
  }));
}

function displayPrice(item) {
  if (item.priceMode === 'hidden') return '价格待公布';
  const prices = item.variants.map(option => Number(option.price || item.price));
  const base = prices.length ? Math.min(...prices) : Number(item.price);
  const amount = usd.format(base);
  return `${amount}${item.priceMode === 'from' ? ' 起' : ''}${item.unit ? ` / ${escape(item.unit)}` : ''}`;
}

const bookmark = '<svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1Z"/></svg>';

function favoriteButton(collection, item, card = false) {
  const label = `收藏${collection === 'products' ? '商品' : '文章'}：${item.title}`;
  return `<button class="${card ? 'icon-button favorite-badge' : 'favorite-button'}" type="button" data-favorite="${route(collection, item.slug)}"${card ? ' data-saved-only' : ''} aria-label="${escape(label)}" title="${escape(label)}" aria-pressed="false" hidden>
${card ? bookmark : `<span data-favorite-text>收藏</span><span data-favorite-icon hidden>${bookmark}</span>`}
</button>`;
}

function favoriteMarker(collection, item) {
  return `<span class="favorite-badge" data-favorite-marker="${route(collection, item.slug)}" aria-hidden="true" hidden>${bookmark}</span>`;
}

function productCard(item, saved = false) {
  const href = route('products', item.slug);
  const price = item.priceMode === 'hidden' ? '' : `${item.sample ? '样例 · ' : ''}${displayPrice(item)}`;
  const metadata = [item.status === 'draft' ? '草稿 · 仅供浏览' : '', price].filter(Boolean).join(' · ');
  return `<div class="tile product-card" data-region="${escape(item.region)}" data-category="${escape(item.category)}"${saved ? ` data-favorite-item="${href}" hidden` : ''}>
<a class="tile-link" href="${href}"><span class="card-visual">${imageTag(item, 'cover') || '<span class="cover content-placeholder" aria-hidden="true"></span>'}${saved ? '' : favoriteMarker('products', item)}</span><span>${escape(item.title)}${metadata ? `<small class="article-meta">${metadata}</small>` : ''}</span></a>
${saved ? favoriteButton('products', item, true) : ''}
</div>`;
}

function articleCard(item, large = false, saved = false) {
  const size = large ? 'cover' : 'mini';
  const pin = item.pinned ? '<span class="article-pin">置顶</span>' : '';
  return `<a${large ? ' class="tile"' : ''} href="${route('articles', item.slug)}">
<span class="card-visual">${imageTag(item, size) || `<span class="${size} content-placeholder" aria-hidden="true"></span>`}${pin}${saved ? '' : favoriteMarker('articles', item)}</span>
<div><span class="article-title">${escape(item.title)}</span>${articleMeta(item)}</div>
</a>`;
}

function bodyBlock(block, item, { headingTag = 'h2', hero = false, sectionId = '' } = {}) {
  switch (block.type) {
    case 'heading':
    case 'subheading': {
      const tag = block.type === 'heading' ? headingTag : 'h3';
      const anchor = sectionId ? ` id="${sectionId}" tabindex="-1"` : '';
      return `<${tag}${anchor}>${escape(block.text)}</${tag}>`;
    }
    case 'list':
    case 'ordered': {
      const tag = block.type === 'ordered' ? 'ol' : 'ul';
      const items = block.text.split(/\r?\n/).filter(line => line.trim()).map(line => `<li>${escape(line)}</li>`).join('');
      return `<${tag}>${items}</${tag}>`;
    }
    case 'divider': return '<hr>';
    case 'quote': return `<blockquote><p>${escape(block.text).replace(/\r?\n/g, '<br>')}</p></blockquote>`;
    case 'image':
    case 'cover': {
      const image = block.type === 'cover' ? item : { image: block.image, imageAlt: block.alt };
      return `<figure class="article-figure${hero ? ' article-hero' : ''}">${zoomableImage(image, 'article-image')}${block.caption ? `<figcaption>${escape(block.caption)}</figcaption>` : ''}</figure>`;
    }
    case 'html': {
      const document = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https: data:; base-uri 'none'; form-action 'none'"><style>body{margin:0;display:flow-root;font:1rem/1.65 system-ui,sans-serif;color:#151516;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style><body>${block.text}</body></html>`;
      return `<iframe class="article-html" data-article-html title="文章 HTML 内容" sandbox="allow-same-origin" loading="lazy" srcdoc="${escape(document)}"></iframe>`;
    }
    default: return `<p>${escape(block.text).replace(/\r?\n/g, '<br>')}</p>`;
  }
}

function optionText(name, restock, note) {
  return `<span class="purchase-option-copy">
<span class="purchase-option-name">${escape(name)}</span>${restock ? '<small class="shop-stock">等补货</small>' : ''}${note ? `<small class="purchase-option-note">${escape(note)}</small>` : ''}
</span>`;
}

function purchaseForm(item) {
  const options = purchaseOptions(item);
  const initial = options.find(option => option.stock === 'available') || options[0];
  const groups = Object.groupBy(options, option => option.fulfillment);
  const methods = Object.keys(fulfillmentLabels).filter(method => groups[method]).map(method => [method, groups[method]]);
  const showMethods = methods.length > 1 || methods.some(([method]) => item.methodNotes?.[method]);
  const methodField = showMethods ? `<fieldset class="purchase-options">
<legend>选择连接方式</legend>
${methods.map(([method, variants]) => `<label class="purchase-option">
<input type="radio" name="fulfillment" value="${method}"${method === initial.fulfillment ? ' checked' : ''}>
${optionText(fulfillmentLabels[method], variants.every(variant => variant.stock === 'restock'), item.methodNotes?.[method])}</label>`).join('\n')}
</fieldset>` : '';
  const viewOnly = item.status === 'draft';
  return `<form class="purchase-form" method="post" data-purchase="${escape(item.slug)}"${item.preview ? ' data-draft-preview' : ''}${viewOnly ? ' data-view-only' : ''}${item.sample ? ' data-sample' : ''}>
${methodField}
${methods.map(([method, variants]) => `<fieldset class="purchase-options" data-option-group="${method}"${method === initial.fulfillment ? '' : ' hidden disabled'}>
<legend>选择规格</legend>
${variants.map(option => `<label class="purchase-option">
<input type="radio" name="variant" value="${escape(option.name)}" data-cents="${option.cents ?? ''}" data-stock="${option.stock}"${option === initial ? ' checked' : ''} required>
${optionText(option.name, option.stock === 'restock', option.note)}
<small class="purchase-option-price">${option.cents === null ? '待公布' : usd.format(option.cents / 100)}</small></label>`).join('\n')}
</fieldset>`).join('\n')}
<div class="shop-quantity">
<label for="purchase-quantity">数量</label>
<div class="quantity-stepper">
<button type="button" data-quantity-step="-1" aria-label="减少数量" disabled>−</button>
<input id="purchase-quantity" name="quantity" type="number" min="1" max="99" step="1" value="1" inputmode="numeric" required>
<button type="button" data-quantity-step="1" aria-label="增加数量">+</button>
</div>
</div>
<div class="purchase-total"><span>${item.sample ? '样例小计' : '商品小计'}</span><output aria-live="polite">${initial.cents === null ? '价格待公布' : usd.format(initial.cents / 100)}</output></div>
<div class="shop-actions"><button type="submit" class="shop-primary" disabled>${viewOnly ? '仅供浏览' : '加入购物车'}</button><a class="pill" href="cart.html">查看购物车</a></div>
<p class="shop-status" role="status"></p>
</form>`;
}

function recommendations(items) {
  const recommended = recommendedProducts(items);
  return recommended.length ? `<section class="shop-recommendations">
<div class="section-heading"><h2>你可能还喜欢</h2><a href="products.html">浏览产品</a></div>
${grid(recommended, productCard, 'grid')}
</section>` : '';
}

function productGallery(item) {
  if (!item.image) return '';
  const photos = [{ image: item.image, alt: item.imageAlt }, ...(item.gallery || [])];
  const multi = photos.length > 1;
  return `<section class="product-visual product-gallery" data-gallery aria-label="商品图片">
<div class="gallery-stage">${photos.map((photo, index) => zoomableImage({
    image: photo.image, imageAlt: photo.alt || `${item.title}${multi ? ` · 第 ${index + 1} 张` : ''}`
  }, 'product-image', ` data-gallery-slide${index ? ' hidden' : ''}`)).join('\n')}</div>
${multi ? `<div class="gallery-controls" hidden>
<button class="icon-button gallery-arrow" type="button" data-gallery-step="-1" aria-label="上一张图片" disabled></button>
<div class="gallery-dots" role="group" aria-label="选择商品图片">${photos.map((_, index) =>
    `<button type="button" data-gallery-index="${index}" aria-label="第 ${index + 1} 张图片" aria-pressed="${index === 0}"></button>`).join('')}</div>
<button class="icon-button gallery-arrow" type="button" data-gallery-step="1" aria-label="下一张图片"></button>
</div>
<span class="gallery-status" role="status"></span>` : ''}
</section>`;
}

function productDetails(item, products) {
  const photo = productGallery(item);
  const info = [item.region, item.category].filter(Boolean).map(escape).join(' · ');
  const official = item.url ? `<a class="pill" href="${escape(item.url)}">前往官方网站 <svg class="external-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg></a>` : '';
  return `<article class="product-detail${photo ? '' : ' product-detail-text'}">
${photo || ''}
<div class="product-information">
${info ? `<p class="product-kicker">${info}</p>` : ''}
<h1>${escape(item.title)}</h1>
<div class="product-offer">
<p class="product-price">${item.sample ? '<span>样例价格</span> ' : ''}${displayPrice(item)}</p>
${item.preview ? '' : favoriteButton('products', item)}
</div>
${item.summary ? `<p class="product-intro">${escape(item.summary)}</p>` : ''}
${purchaseForm(item)}
${item.body ? `<section class="product-description"><h2>商品说明</h2><div class="content-body">${legacyBlocks(item.body).map(block => bodyBlock(block, item, { headingTag: 'h3' })).join('\n')}</div></section>` : ''}
${item.delivery ? `<p class="product-delivery"><strong>交付方式</strong> ${escape(item.delivery)}</p>` : ''}
${item.notice ? `<p class="product-notice"><strong>购买须知</strong> ${escape(item.notice).replace(/\r?\n/g, '<br>')}</p>` : ''}
${official ? `<div class="content-actions">${official}</div>` : ''}
</div>
</article>
${recommendations(products.filter(product => product.slug !== item.slug))}`;
}

function articleDetails(item, products) {
  const year = item.date ? formatter.formatToParts(new Date(item.date)).find(part => part.type === 'year')?.value : '';
  const labels = [
    year ? `<li><time datetime="${year}">${year}</time></li>` : '',
    ...item.tags.filter(tag => tag !== year).map(tag => `<li>${escape(tag)}</li>`)
  ].join('');
  const related = item.related.map(id => products.find(product => product.slug === id)).filter(Boolean);
  const links = related.length ? `<nav class="content-actions" aria-label="相关产品">${related.map(product => `<a class="pill" href="${route('products', product.slug)}">${escape(product.title)}</a>`).join('')}</nav>` : '';
  const first = item.blocks[0];
  const hero = ['image', 'cover'].includes(first?.type) ? bodyBlock(first, item, { hero: true }) : '';
  const sections = [];
  let sectionNumber = 0;
  let parentSection;
  const body = item.blocks.slice(hero ? 1 : 0).map(block => {
    if (block.type !== 'heading' && block.type !== 'subheading') return bodyBlock(block, item);
    const sectionId = `article-section-${++sectionNumber}`;
    const section = { id: sectionId, text: escape(block.text), children: [] };
    if (block.type === 'subheading' && parentSection) parentSection.children.push(section);
    else sections.push(section);
    if (block.type === 'heading') parentSection = section;
    return bodyBlock(block, item, { sectionId });
  }).join('\n');
  const sectionLink = section => `<a href="#${section.id}">${section.text}</a>`;
  const outlineList = sectionNumber > 1 ? `<ul>
${sections.map(section => `<li>${sectionLink(section)}${section.children.length ? `<ul>${section.children.map(child => `<li>${sectionLink(child)}</li>`).join('')}</ul>` : ''}</li>`).join('\n')}
</ul>` : '';
  const outline = outlineList ? `<nav class="article-outline article-outline-desktop" aria-label="本文目录">
${outlineList}
</nav>
<nav class="article-outline article-outline-mobile" aria-label="本文目录" inert>
<div class="article-outline-panel">
<button class="article-outline-toggle" type="button" aria-expanded="false" aria-controls="article-outline-sections"><span>${sections[0].text}</span></button>
<button class="article-outline-close" type="button" aria-label="收起目录" hidden></button>
<div class="article-outline-sections" id="article-outline-sections" hidden>${outlineList}</div>
</div>
</nav>` : '';
  return `<article class="research-article">
<div class="article-toolbar"><a href="research.html">探索研究</a>${item.preview ? '' : favoriteButton('articles', item)}</div>
<div class="article-header">
${articleMeta(item)}
<h1>${escape(item.title)}</h1>
${item.summary ? `<p class="article-intro">${escape(item.summary)}</p>` : ''}
</div>
${hero}
<div${outline ? ' class="article-layout"' : ''}>
${outline}
<div class="article-reading">
<div class="content-body">${body}</div>
${links}
</div>
</div>
<div class="article-end">
<div class="article-end-inner">
${labels ? `<ul class="article-tags" aria-label="发布年份与标签">${labels}</ul>` : ''}
<div class="article-author">
<h2>作者</h2>
<p>${escape(item.author)}</p>
</div>
</div>
</div>
</article>`;
}

function slot(text, name, value, js = false) {
  const open = js ? `  // BEGIN ADMIN: ${name}` : `<!-- BEGIN ADMIN: ${name} -->`;
  const close = js ? `  // END ADMIN: ${name}` : `<!-- END ADMIN: ${name} -->`;
  const start = text.indexOf(open);
  const end = text.indexOf(close);
  if (start < 0 || end <= start) throw new Error(`缺少生成标记 ${name}。`);
  return `${text.slice(0, start + open.length)}\n${value}\n${text.slice(end)}`;
}

function grid(items, render, className, fallback = '') {
  return items.length ? `<div class="${className}">\n${items.map(item => render(item)).join('\n')}\n</div>` : fallback;
}

function filters(items, key, label) {
  const options = ['全部', ...new Set(items.map(item => item[key]).filter(Boolean))];
  return `<fieldset data-filter="${key}">\n<legend>${label}</legend>\n${options.map((option, index) => `<button type="button" aria-pressed="${index === 0}">${escape(option)}</button>`).join('\n')}\n</fieldset>`;
}

function pageShell(shell, title, content, scripts = '', parent = '', archived = false) {
  return shell
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escape(title)} · NijiEhon</title>${archived ? '\n<meta name="robots" content="noindex">' : ''}`)
    .replace('</head>', scripts + '</head>')
    .replace(/<main>[\s\S]*?<\/main>/, () => `<main>\n${content}\n</main>`)
    .replace(/(<nav class="footer-crumb"[^>]*>.*?)<span aria-current="page">[^<]*<\/span>/, (_, opening) => `${opening}${parent}<span aria-current="page">${escape(title)}</span>`);
}

function cartPage(shell, products) {
  return pageShell(shell, '购物车', `<div class="cart-page" data-cart>
<h1>购物车</h1>
<section class="cart-empty" aria-labelledby="cart-empty-title" hidden>
<h2 id="cart-empty-title">你的购物车是空的</h2>
<a class="pill shop-primary" href="products.html">浏览产品</a>
</section>
<ul class="cart-items" aria-label="购物车商品"></ul>
<template data-cart-item>
<li class="cart-item">
<input class="cart-choice" type="checkbox" data-control="selected">
<div class="cart-image"><img alt="" loading="lazy"></div>
<div class="cart-item-detail"><h2><a class="cart-item-title"></a></h2><p class="cart-variant"></p><p class="shop-stock" hidden></p></div>
<div class="cart-item-controls">
<strong class="cart-line-total"></strong>
<label class="shop-quantity">数量 <input type="number" min="1" max="99" step="1" inputmode="numeric" data-control="quantity"></label>
<div class="cart-item-actions"><button type="button" data-control="edit" aria-haspopup="dialog" aria-controls="cart-edit">编辑选项</button><button type="button" data-control="remove">移除</button></div>
</div>
</li>
</template>
<dialog class="cart-dialog" id="cart-edit" aria-labelledby="cart-edit-title">
<div class="account-dialog-heading"><h2 id="cart-edit-title">编辑商品选项</h2><button type="button" class="icon-button" aria-label="关闭编辑窗口" data-close-cart-edit>×</button></div>
<form class="cart-edit-form" method="dialog">
<p class="shop-hint" data-edit-product></p>
<label>规格<select name="variant" required autofocus></select></label>
<label class="shop-quantity">数量 <input name="quantity" type="number" min="1" max="99" step="1" inputmode="numeric" required></label>
<div class="purchase-total"><span>商品小计</span><output aria-live="polite"></output></div>
<button class="shop-primary" type="submit">保存更改</button>
<p class="shop-status" role="status"></p>
</form>
</dialog>
<p class="shop-status" role="status" data-cart-status></p>
<section class="checkout" aria-labelledby="checkout-title" hidden>
<h2 id="checkout-title">结算</h2>
<div class="checkout-grid">
<section class="address-card" aria-labelledby="checkout-address-title">
<div class="section-heading"><h3 id="checkout-address-title">收货地址</h3><a href="account.html#shipping-address">地址管理</a></div>
<div data-address-editor></div>
</section>
<div class="checkout-delivery" hidden><h3>电子交付</h3><p>所选商品无需填写收货地址。</p></div>
<div class="checkout-summary">
<dl>
<div><dt>商品小计</dt><dd data-checkout-subtotal></dd></div>
<div><dt>税费</dt><dd data-checkout-tax></dd></div>
<div><dt>运费</dt><dd data-checkout-shipping></dd></div>
<div class="checkout-total"><dt>参考合计</dt><dd data-checkout-subtotal></dd></div>
</dl>
<p class="shop-hint" data-checkout-note></p>
<button class="shop-primary" type="button" disabled>提交订单</button>
</div>
</div>
<a class="shop-link" href="contact.html">联系客服</a>
</section>
</div>
${recommendations(products)}`,
  '<script type="module" src="cart.js"></script>\n<script type="module" src="address.js"></script>\n',
  '<a href="products.html">产品</a> / ');
}

function favoritesPage(shell, collection, items) {
  const product = collection === 'products';
  const title = product ? '商品收藏' : '收藏夹';
  const browse = product ? 'products.html' : 'research.html';
  const other = product ? 'favorite-articles.html' : 'favorite-products.html';
  const cards = product ? item => productCard(item, true) : item =>
    `<div class="tile favorite-article-card" data-favorite-item="${route('articles', item.slug)}" hidden>
${articleCard(item, true, true)}${favoriteButton('articles', item, true)}</div>`;
  return pageShell(shell, title, `<section class="favorites-page" data-favorites-list aria-labelledby="favorites-title">
<div class="section-heading"><h1 id="favorites-title" tabindex="-1">${title}</h1><a href="${other}">${product ? '收藏文章' : '收藏商品'}</a></div>
<div class="favorites-empty" data-favorites-empty>
<p>还没有收藏的${product ? '商品' : '文章'}。</p>
<a class="pill" href="${browse}">${product ? '浏览产品' : '探索研究'}</a>
</div>
${grid(items, cards, 'grid')}
</section>`, '', `<a href="${browse}">${product ? '产品' : '研究'}</a> / `);
}

export function detail(shell, collection, item, products) {
  const article = collection === 'articles';
  const section = article ? '研究' : '产品';
  const list = article ? 'research.html' : 'products.html';
  const available = item.status !== 'archived' || item.preview;
  const content = !available ? `<article><h1>${escape(item.title)}</h1><p>这项内容目前未公开。</p></article>` : article ? articleDetails(item, products) : productDetails(item, products);
  const extraScript = available && !article ? '<script type="module" src="product.js"></script>\n' : '';
  return pageShell(shell, item.title, content, extraScript, `<a href="${list}">${section}</a> / `, item.status === 'archived');
}

export function render(data, read) {
  const productsShell = read('products.html');
  const researchShell = read('research.html');
  const { products, articles, poster } = data;
  const pages = new Map();
  const banner = `<img class="banner" src="${escape(poster.image)}" alt="${escape(poster.alt)}"${poster.position === 'center' ? '' : ` style="object-position:center ${poster.position}"`}>`;
  let home = slot(read('index.html'), 'poster', banner);
  home = slot(home, 'home-products', grid(recommendedProducts(products), productCard, 'grid', '<p>暂无上架产品。</p>'));
  pages.set('index.html', slot(home, 'home-articles', grid(articles.slice(0, 3), articleCard, 'article-list', '<p>暂无已发布文章。</p>')));
  pages.set('products.html', slot(productsShell, 'catalog', [filters(products, 'region', '使用地区'), filters(products, 'category', '产品分类'), grid(products, productCard, 'grid'), `<p id="empty"${products.length ? ' hidden' : ''}>当前组合暂无产品。</p>`].join('\n')));
  pages.set('cart.html', cartPage(productsShell, products));
  pages.set('favorite-products.html', favoritesPage(productsShell, 'products', products));
  pages.set('favorite-articles.html', favoritesPage(researchShell, 'articles', articles));
  const catalog = products.map(item => ({
    slug: item.slug, title: item.title, image: item.image, status: item.status, sample: item.sample, options: purchaseOptions(item)
  }));
  pages.set('catalog.js', `// Generated by tools/admin/content.mjs.\nexport const catalog = ${JSON.stringify(catalog, null, 2)};\n`);
  const researchCards = [
    grid(articles.slice(0, 3), item => articleCard(item, true), 'grid', '<p>暂无已发布文章。</p>'),
    grid(articles.slice(3), articleCard, 'article-list')
  ].filter(Boolean).join('\n');
  pages.set('research.html', slot(researchShell, 'research', researchCards));
  for (const collection of collections) {
    for (const item of data[collection]) pages.set(route(collection, item.slug), detail(collection === 'products' ? productsShell : researchShell, collection, item, products));
  }
  for (const name of data.retired) {
    const collection = name.startsWith('product-') ? 'products' : 'articles';
    pages.set(name, detail(collection === 'products' ? productsShell : researchShell, collection, { title: collection === 'products' ? '产品已下架' : '文章已撤下', status: 'archived' }, products));
  }
  const search = collections.toReversed().flatMap(collection => data[collection].map(item => `  ${JSON.stringify([route(collection, item.slug), item.title, collection === 'products' ? '产品' : '指南', [item.keywords, item.summary, item.category, item.region, item.author, ...(item.tags || [])].filter(Boolean).join(' ')])},`));
  pages.set('site.js', slot(read('site.js'), 'search', search.join('\n'), true));
  return pages;
}
