// Henter opskriftssiderne i data/favoritter.txt til data/raw/<slug>.html (lokal cache, ikke i git).
// Høfligt: 3 sek. pause mellem kald, ærlig User-Agent, og sider der allerede er hentet springes over.
// Kør:  node scripts/hent_sider.mjs          (--force henter alle igen)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = path.join(root, 'data', 'raw');
const UA = 'KEA-studieprojekt madplan-agent (kontakt: jacbisgaard@hotmail.com)';
const force = process.argv.includes('--force');

const urls = fs.readFileSync(path.join(root, 'data', 'favoritter.txt'), 'utf8')
  .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
fs.mkdirSync(rawDir, { recursive: true });

const slug = (u) => new URL(u).pathname.replace(/^\/|\/$/g, '').replace(/[^a-z0-9_-]/gi, '_');
let fetched = 0;
for (const url of [...new Set(urls)]) {
  const file = path.join(rawDir, slug(url) + '.html');
  if (!force && fs.existsSync(file)) { console.log('·', slug(url), '(findes)'); continue; }
  if (fetched++) await new Promise((r) => setTimeout(r, 3000));
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    const html = await res.text();
    const moved = res.url !== url ? `  → omdirigeret til ${res.url}` : '';
    if (!res.ok) { console.log('✗', slug(url), 'HTTP', res.status); continue; }
    fs.writeFileSync(file, html);
    console.log('✓', slug(url), `${Math.round(html.length / 1024)} kB${moved}`);
  } catch (e) {
    console.log('✗', slug(url), e.message);
  }
}
console.log(`\nFærdig. ${fetched} kald til valdemarsro.dk.`);
