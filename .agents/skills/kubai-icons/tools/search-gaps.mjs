#!/usr/bin/env node
// Turns the site's empty searches into a to-do list: words to add to an existing icon's
// search words, and objects no icon draws yet.
//
//   node tools/search-gaps.mjs <export.csv|export.json> [--min 2]
//
// The input lists the `q` values of the `search_empty` event with a count, exported from
// analytics: a CSV with the term in the first column and the count in the second, or JSON
// as [{ "value": term, "total": count }] (the shape of Umami's event data values).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [file] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const minAt = process.argv.indexOf('--min');
const MIN = minAt > 0 ? Number(process.argv[minAt + 1]) : 1;
if (!file) {
  console.error('Usage: node tools/search-gaps.mjs <export.csv|export.json> [--min 2]');
  process.exit(1);
}

/** Search terms with how often each came back empty, most frequent first. */
function readTerms(source) {
  const text = fs.readFileSync(source, 'utf8');
  const rows = source.endsWith('.json')
    ? JSON.parse(text).map((r) => [r.value ?? r.q ?? r.term, r.total ?? r.count ?? r.y ?? 1])
    : text.split(/\r?\n/).slice(1).filter(Boolean).map((line) => line.split(',').map((cell) => cell.replace(/^"|"$/g, '').trim()));
  const counts = new Map();
  for (const [term, count] of rows) {
    const q = String(term ?? '').trim().toLowerCase();
    if (q) counts.set(q, (counts.get(q) ?? 0) + (Number(count) || 1));
  }
  return [...counts].filter(([, n]) => n >= MIN).sort((a, b) => b[1] - a[1]);
}

// Every word the site's search knows for each base icon, in every language.
const words = new Map();
const add = (name, list) => { for (const w of list ?? []) words.get(name)?.add(String(w).toLowerCase()); };
const keywords = JSON.parse(fs.readFileSync(path.join(root, 'icons/keywords.json'), 'utf8'));
for (const [name, groups] of Object.entries(keywords)) {
  words.set(name, new Set([name, name.replace(/-/g, ' ')]));
  for (const list of Object.values(groups)) add(name, list);
}
const i18n = path.join(root, 'site/src/i18n');
for (const dir of fs.readdirSync(i18n, { withFileTypes: true }).filter((e) => e.isDirectory())) {
  const local = JSON.parse(fs.readFileSync(path.join(i18n, dir.name, 'icons.json'), 'utf8'));
  for (const [name, list] of Object.entries(local)) add(name, list);
}

/** Icons whose words share part of the term, closest first. */
function nearest(term) {
  const parts = term.split(/[\s-]+/).filter((p) => p.length > 2);
  return [...words]
    .map(([name, set]) => {
      let score = 0;
      for (const w of set) {
        if (w === term) score += 10;
        else if (w.includes(term) || (term.length > 2 && term.includes(w) && w.length > 2)) score += 3;
        else score += parts.filter((p) => w.includes(p)).length;
      }
      return { name, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.name);
}

const terms = readTerms(file);
const known = [], close = [], missing = [];
for (const [term, count] of terms) {
  const exact = [...words].filter(([, set]) => set.has(term)).map(([name]) => name);
  if (exact.length) known.push({ term, count, icons: exact });
  else {
    const near = nearest(term);
    (near.length ? close : missing).push({ term, count, icons: near });
  }
}

const line = (r) => `- ${r.term} (${r.count})${r.icons.length ? `: ${r.icons.join(', ')}` : ''}`;
console.log(`# Empty searches: ${terms.length} terms\n`);
console.log(`## Already a search word (${known.length})\n\nThe search should have found these; check how the term was typed or matched.\n\n${known.map(line).join('\n') || '- none'}\n`);
console.log(`## Near an existing icon (${close.length})\n\nIf the icon fits, add the term to its words in icons/keywords.json or site/src/i18n/<language>/icons.json.\n\n${close.map(line).join('\n') || '- none'}\n`);
console.log(`## Not drawn yet (${missing.length})\n\nCandidates for new icons.\n\n${missing.map(line).join('\n') || '- none'}`);
