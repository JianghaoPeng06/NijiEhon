import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collections, detail, imagePath, normalizePoster, normalizeRecord, recordImages, render, route, snapshot } from './content.mjs';
import { articleSlug, articleSlugs } from './public/slug.js';

const admin = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(admin, '../..');
const publishedPath = 'tools/admin/published.json';
const local = path.join(admin, '.local');
const draftFile = path.join(local, 'draft.json');
const port = Number(process.env.NIJIEHON_ADMIN_PORT || 5621);
const origin = `http://127.0.0.1:${port}`;
const hash = content => createHash('sha256').update(content).digest('hex');
const json = data => `${JSON.stringify(data, null, 2)}\n`;
const readSite = file => readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const adminFiles = new Map([['/', 'index.html'], ['/app.js', 'app.js'], ['/admin.css', 'admin.css'], ['/slug.js', 'slug.js']]);
const publicPath = /^(?:[a-z0-9-]+\.(?:html|css|js)|assets\/(?:[a-z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.(?:js|css|jpg|png|webp|woff2))$/;
const retiredPath = /^(?:product|guide)-[a-z0-9]+(?:-[a-z0-9]+)*\.html$/;

function normalizeData(data) {
  data.poster = normalizePoster(data.poster);
  for (const collection of collections) data[collection] = data[collection].map(item => normalizeRecord(collection, item));
  if (data.retired.some(name => !retiredPath.test(name))) throw new Error('已发布数据中包含无效的历史地址。');
  return data;
}

function published() {
  const text = readSite(publishedPath);
  return { data: normalizeData(JSON.parse(text)), base: hash(text) };
}

function state() {
  const current = published();
  if (!existsSync(draftFile)) return { ...current, revision: current.base };
  const saved = JSON.parse(readFileSync(draftFile, 'utf8'));
  if (saved.base !== current.base) throw new Error('已发布内容已从别的来源更新。本机草稿保存在 tools/admin/.local/draft.json，请先合并或移出草稿文件。');
  return { ...saved, data: normalizeData(saved.data) };
}

function atomicWrite(file, contents) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, contents, { flag: 'wx' });
    renameSync(temp, file);
  } finally {
    rmSync(temp, { force: true });
  }
}

function asset(image) {
  if (!imagePath.test(image)) throw new Error('图片地址无效。');
  const staged = path.join(local, 'uploads', path.basename(image));
  return image.startsWith('assets/content/') && existsSync(staged) ? staged : path.join(root, image);
}

function verifyImage(image) {
  if (image && !existsSync(asset(image))) throw new Error('图片文件不存在，请重新选择。');
}

function buildFiles(saved) {
  const data = snapshot(saved.data, published().data);
  const files = render(data, readSite);
  for (const image of new Set([data.poster.image, ...collections.flatMap(collection => data[collection].flatMap(recordImages))])) {
    verifyImage(image);
    if (image.startsWith('assets/content/')) files.set(image, readFileSync(asset(image)));
  }
  files.set(publishedPath, json(data));
  return files;
}

function generate(saved) {
  const files = buildFiles(saved);
  const changed = [];
  try {
    for (const [name, contents] of files) {
      const file = path.join(root, name);
      const previous = existsSync(file) ? readFileSync(file) : null;
      const bytes = Buffer.from(contents);
      if (previous?.equals(bytes)) continue;
      atomicWrite(file, bytes);
      changed.push({ name, file, previous });
    }
    execFileSync(process.execPath, ['scripts/check.cjs'], { cwd: root, stdio: 'pipe', timeout: 30000 });
    if (existsSync(draftFile)) atomicWrite(draftFile, json({ ...saved, base: hash(files.get(publishedPath)) }));
    return changed.map(item => item.name);
  } catch (error) {
    for (const { file, previous } of changed.reverse()) {
      if (previous) atomicWrite(file, previous);
      else rmSync(file, { force: true });
    }
    throw new Error(`生成未完成。${error.stderr?.toString().trim().split('\n')[0] || error.message}`);
  }
}

async function readBody(request, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error('上传内容超过大小限制。');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function imageExtension(bytes) {
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return 'jpg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  throw new Error('图片须为 JPEG、PNG 或 WebP。');
}

function send(response, status, type, content) {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(content);
}

const sendJson = (response, status, content) => send(response, status, 'application/json; charset=utf-8', JSON.stringify(content));

function staticFile(response, file) {
  if (!existsSync(file)) return send(response, 404, 'text/plain; charset=utf-8', '找不到页面或文件。');
  return send(response, 200, types[path.extname(file)], readFileSync(file));
}

function preview(response, url, file) {
  if (!publicPath.test(file)) return send(response, 404, 'text/plain; charset=utf-8', '找不到页面或文件。');
  if (!file.endsWith('.html') && file !== 'site.js') return staticFile(response, imagePath.test(file) ? asset(file) : path.join(root, file));
  const saved = state();
  const data = snapshot(saved.data, published().data);
  if (url.searchParams.has('draft') && retiredPath.test(file)) {
    const collection = file.startsWith('product-') ? 'products' : 'articles';
    const item = saved.data[collection].find(record => route(collection, record.slug) === file);
    if (item) return send(response, 200, types['.html'], detail(readSite(collection === 'products' ? 'products.html' : 'research.html'), collection, { ...item, preview: true }, data.products));
  }
  const generated = render(data, readSite).get(file);
  if (generated !== undefined) return send(response, 200, types[path.extname(file)], generated);
  if (retiredPath.test(file)) return send(response, 404, 'text/plain; charset=utf-8', '内容未发布。');
  return staticFile(response, path.join(root, file));
}

async function handle(request, response) {
  if (request.headers.host !== `127.0.0.1:${port}`) return sendJson(response, 403, { error: '请使用后台打印的本机地址。' });
  const url = new URL(request.url, origin);
  const endpoint = url.pathname;
  if (request.method === 'GET') {
    if (adminFiles.has(endpoint)) return staticFile(response, path.join(admin, 'public', adminFiles.get(endpoint)));
    if (endpoint === '/api/state') return sendJson(response, 200, state());
    if (endpoint.startsWith('/preview/')) return preview(response, url, endpoint.slice(9) || 'index.html');
  }
  if (request.method !== 'POST' || !['/api/upload', '/api/save', '/api/generate', '/api/preview-article'].includes(endpoint)) return sendJson(response, 404, { error: '找不到此操作。' });
  if (request.headers.origin !== origin) return sendJson(response, 403, { error: '请从后台页面操作。' });
  if (endpoint === '/api/upload') {
    const bytes = await readBody(request, 10 * 1024 * 1024);
    const name = `${hash(bytes)}.${imageExtension(bytes)}`;
    atomicWrite(path.join(local, 'uploads', name), bytes);
    return sendJson(response, 201, { image: `assets/content/${name}` });
  }
  const payload = JSON.parse((await readBody(request, 256 * 1024)).toString());
  const saved = state();
  if (payload.revision !== saved.revision) return sendJson(response, 409, { error: '内容已在其他窗口修改。请复制未保存的文字，刷新后继续。' });
  if (endpoint === '/api/preview-article') {
    const values = payload.values;
    const blocks = (values.blocks || []).filter(block => block.type !== 'cover' || values.image);
    const item = normalizeRecord('articles', { ...values, blocks, slug: 'preview', title: values.title?.trim() || '未命名文章', status: 'draft' });
    const shell = readSite('research.html').replace('<head>', '<head>\n<base href="/preview/">').replace(/^<script defer src="(?:auth(?:-config)?\.js|assets\/vendor\/supabase-[^"]+\.js)"><\/script>\n/gm, '');
    return sendJson(response, 200, { html: detail(shell, 'articles', item, snapshot(saved.data, published().data).products) });
  }
  if (endpoint === '/api/save') {
    let selected;
    if (payload.collection === 'poster') {
      saved.data.poster = normalizePoster(payload.values);
      verifyImage(saved.data.poster.image);
    } else {
      if (!collections.includes(payload.collection)) throw new Error('无法识别内容类型。');
      const values = payload.values;
      if (payload.collection === 'articles' && payload.original === null && !values.slug?.trim()) {
        values.slug = articleSlug(values.title || '', values.englishTitle || '', articleSlugs(saved.data));
      }
      const item = normalizeRecord(payload.collection, values);
      for (const image of recordImages(item)) verifyImage(image);
      const list = saved.data[payload.collection];
      const index = list.findIndex(record => record.slug === item.slug);
      if (payload.original !== null && (payload.original !== item.slug || index < 0)) throw new Error('已保存内容的网址不能更改。');
      if (payload.original === null && (index >= 0 || saved.data.retired.includes(route(payload.collection, item.slug)))) throw new Error('此网址已被使用。');
      if (index < 0) list.push(item);
      else list[index] = item;
      selected = item.slug;
    }
    saved.revision = randomUUID();
    atomicWrite(draftFile, json(saved));
    return sendJson(response, 200, { ...saved, selected });
  }
  return sendJson(response, 200, { files: generate(saved) });
}

if (process.argv.includes('--generate')) {
  console.log(JSON.stringify({ files: generate(state()) }));
} else {
  const server = createServer((request, response) => {
    handle(request, response).catch(error => {
      if (!response.headersSent) sendJson(response, 400, { error: error.message });
      else response.end();
    });
  });
  server.listen(port, '127.0.0.1', () => console.log(`NijiEhon 后台 ${origin}/`));
}
