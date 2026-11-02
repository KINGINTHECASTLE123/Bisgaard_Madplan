// Henter dagens tilbud fra Prej API (/v1/offers) for vores kæder og cacher hvert svar i data/raw/prej/<dato>/.
// Gratis plan: 25 kald/døgn (nulstilles 00:00 UTC). Scriptet
//   - henter aldrig en side, der allerede ligger i cachen
//   - stopper når X-RateLimit-Remaining-Day < RESERVE (så der er kald tilbage til n8n-workflowet)
//   - --probe: henter kun side 1 for første kæde og viser total + eksempler
//   - --dry-run: viser planen ud fra cachen uden at kalde API'et
// Kør:  node scripts/prej_fetch.mjs --probe     |   node scripts/prej_fetch.mjs     |   node scripts/prej_fetch.mjs --dry-run
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile(path.join(root, '.env'));
const KEY = process.env.PREJ_API_KEY;
const CHAINS = ['rema1000', 'netto', 'superbrugsen'];
const LIMIT = 100;
const RESERVE = 5;
const probe = process.argv.includes('--probe');
const dry = process.argv.includes('--dry-run');
const today = new Date().toISOString().slice(0, 10);
const dir = path.join(root, 'data', 'raw', 'prej', today);
fs.mkdirSync(dir, { recursive: true });

if (!KEY && !dry) { console.error('PREJ_API_KEY mangler i .env'); process.exit(1); }

let calls = 0;
let remaining = null;
async function getPage(chain, page) {
  const file = path.join(dir, `${chain}-p${page}.json`);
  if (fs.existsSync(file)) return { data: JSON.parse(fs.readFileSync(file, 'utf8')), cached: true };
  if (dry) return null;
  if (remaining !== null && remaining < RESERVE) throw new Error(`Stopper: kun ${remaining} kald tilbage i dag (reserve ${RESERVE}).`);
  const url = `https://api.prej.app/v1/offers?chain=${chain}&limit=${LIMIT}&page=${page}&exclude_border_trade=1`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` } });
  calls++;
  remaining = Number(res.headers.get('x-ratelimit-remaining-day') ?? remaining);
  const body = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  fs.writeFileSync(file, JSON.stringify(body, null, 1));
  return { data: body, cached: false };
}

const summary = [];
try {
  for (const chain of probe ? CHAINS.slice(0, 1) : CHAINS) {
    const first = await getPage(chain, 1);
    if (!first) { summary.push(`${chain}: ikke i cache`); continue; }
    const pages = Math.ceil(first.data.total / LIMIT);
    console.log(`${chain}: total ${first.data.total} tilbud → ${pages} sider (as_of ${first.data.as_of})${first.cached ? ' [cache]' : ''}`);
    if (probe) {
      for (const o of first.data.offers.slice(0, 8)) {
        console.log(`   ${(o.price / 100).toFixed(2)} kr (før ${o.normal_price ? (o.normal_price / 100).toFixed(2) : '?'}) · ${o.name} · ${o.brand ?? ''} · ${o.quantity ?? ''}${o.unit ?? ''} · til ${o.offer_ends} · ${o.source}`);
      }
      break;
    }
    let got = first.data.offers.length;
    for (let p = 2; p <= pages; p++) {
      const r = await getPage(chain, p);
      if (!r) { console.log(`   side ${p}: ikke i cache`); continue; }
      got += r.data.offers.length;
    }
    summary.push(`${chain}: ${got}/${first.data.total} tilbud i cache`);
  }
} catch (e) {
  console.error('✗', e.message);
}
console.log('\n' + summary.join('\n'));
console.log(`API-kald i denne kørsel: ${calls}. Tilbage i dag: ${remaining ?? 'ukendt'}. Cache: data/raw/prej/${today}/`);
