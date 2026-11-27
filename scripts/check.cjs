const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
assert(/^\d+\.\d+\.\d+$/.test(version), 'VERSION must be semantic x.y.z');
if (process.env.GITHUB_REF_TYPE === 'tag') assert.equal(process.env.GITHUB_REF_NAME, 'v' + version, 'Tag must match VERSION');
for (const file of ['site.js', 'auth.js', 'auth-config.js', 'clock.js', 'tests/auth-browser.cjs']) {
  execFileSync(process.execPath, ['--check', path.join(root, file)]);
}
const pages = fs.readdirSync(root).filter(file => file.endsWith('.html'));
let fullPages = 0;
function checkReference(file, reference) {
  if (!reference || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(reference)) return;
  const target = reference.split(/[?#]/)[0];
  if (!target) return;
  const resolved = path.resolve(path.dirname(path.join(root, file)), decodeURIComponent(target));
  assert(resolved.startsWith(root + path.sep), `Reference outside site: ${file} → ${target}`);
  assert(fs.existsSync(resolved), `Missing resource: ${file} → ${target}`);
}
for (const file of pages) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  for (const match of html.matchAll(/\b(?:src|href)="([^"]*)"/g)) checkReference(file, match[1]);
  if (!html.includes('src="site.js"')) continue;
  fullPages++;
  for (const script of ['auth-config.js', 'assets/vendor/supabase-2.119.2.js', 'auth.js']) assert(html.includes(`src="${script}"`), `Missing ${script}: ${file}`);
  assert(html.includes(`aria-label="网站版本 v${version}"`), `Wrong footer version: ${file}`);
  assert(!html.includes('前往邮箱登录演示'), `Legacy demo login: ${file}`);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size, `Duplicate IDs: ${file}`);
}
for (const file of ['style.css', 'assets/fonts.css']) {
  const css = fs.readFileSync(path.join(root, file), 'utf8');
  for (const match of css.matchAll(/url\(["']?([^\s"')]+)["']?\)/g)) checkReference(file, match[1]);
}
assert(!fs.readFileSync(path.join(root, 'site.js'), 'utf8').includes('demoEmail'), 'Demo authentication must not return');
console.log(`PASS: v${version}; ${pages.length} HTML pages (${fullPages} shared layouts); JavaScript syntax and local assets.`);
