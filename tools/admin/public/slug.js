function uniqueSlug(label, readable, prefix, reserved) {
  if (!label) return '';
  const ascii = label.normalize('NFKD').toLowerCase().replace(/\p{Mark}/gu, '').replace(/[^a-z0-9]+/g, '-').slice(0, 52).replace(/^-|-$/g, '');
  let hash = 2166136261;
  for (const char of label) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
  const base = ascii && readable ? ascii : `${prefix}-${(hash >>> 0).toString(36)}`;
  let result = base;
  for (let suffix = 2; reserved.has(result); suffix++) result = `${base}-${suffix}`;
  return result;
}

export function articleSlug(title, englishTitle, reserved) {
  const english = englishTitle.trim();
  const label = english || title.trim();
  return uniqueSlug(label, Boolean(english) || !/\p{Script=Han}/u.test(label), 'article', reserved);
}

export function productSlug(title, reserved) {
  return uniqueSlug(title.trim(), true, 'item', reserved);
}

export function contentSlugs(data, collection) {
  const prefix = collection === 'articles' ? 'guide-' : 'product-';
  return new Set([...data[collection].map(item => item.slug), ...data.retired.flatMap(name => name.startsWith(prefix) ? [name.slice(prefix.length, -5)] : [])]);
}
