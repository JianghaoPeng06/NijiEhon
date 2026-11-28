export function articleSlug(title, englishTitle, reserved) {
  const english = englishTitle.trim();
  const label = english || title.trim();
  if (!label) return '';
  const ascii = label.normalize('NFKD').toLowerCase().replace(/\p{Mark}/gu, '').replace(/[^a-z0-9]+/g, '-').slice(0, 52).replace(/^-|-$/g, '');
  let hash = 2166136261;
  for (const char of label) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
  const base = ascii && (english || !/\p{Script=Han}/u.test(label)) ? ascii : `article-${(hash >>> 0).toString(36)}`;
  let result = base;
  for (let suffix = 2; reserved.has(result); suffix++) result = `${base}-${suffix}`;
  return result;
}

export function articleSlugs(data) {
  return new Set([...data.articles.map(item => item.slug), ...data.retired.flatMap(name => name.startsWith('guide-') ? [name.slice(6, -5)] : [])]);
}
