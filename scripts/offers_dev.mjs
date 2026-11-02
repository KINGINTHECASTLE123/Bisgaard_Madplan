// Tester tilbud → ingrediens-matchningen (src/offers.js) uden n8n og uden Prej-kald:
// læser den nyeste cache i data/raw/prej/, henter ingredienser fra Neo4j, kalder Claude og viser resultatet.
// --write: skriver også tilbud + koblinger til Neo4j (bruges kun til udvikling; normalt gør workflow 03 det).
// Kør:  node scripts/offers_dev.mjs   |   node scripts/offers_dev.mjs --write
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile(path.join(root, '.env'));
const require = createRequire(import.meta.url);
const O = require(path.join(root, 'src', 'offers.js'));
const write = process.argv.includes('--write');

async function neo4j(statements) {
  const auth = 'Basic ' + Buffer.from('neo4j:' + process.env.NEO4J_PASSWORD).toString('base64');
  const res = await fetch('http://localhost:7474/db/neo4j/tx/commit', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({ statements }),
  }).then((r) => r.json());
  if (res.errors?.length) throw new Error(res.errors[0].message);
  return res.results.map((r0) => r0.data.map((d) => Object.fromEntries(r0.columns.map((c, i) => [c, d.row[i]]))));
}
async function claude(body) {
  for (let a = 1; a <= 3; a++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
    const j = await res.json();
    if (res.ok) return j;
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 3000 * a)); continue; }
    throw new Error(`Anthropic ${res.status}: ${JSON.stringify(j).slice(0, 300)}`);
  }
}

const cacheRoot = path.join(root, 'data', 'raw', 'prej');
const day = fs.readdirSync(cacheRoot).sort().pop();
const pages = fs.readdirSync(path.join(cacheRoot, day)).map((f) => JSON.parse(fs.readFileSync(path.join(cacheRoot, day, f), 'utf8')));
const offers = O.flattenOffers(pages);
const [[ingRows]] = [await neo4j([{ statement: 'MATCH (i:Ingredient {pantry: false}) RETURN collect(i.name) AS names' }])];
const ingredientNames = ingRows[0].names.sort();
const batches = O.batchOffers(offers);
console.log(`Cache ${day}: ${offers.length} tilbud, ${batches.reduce((a, b) => a + b.length, 0)} unikke produkter, ${ingredientNames.length} ingredienser (uden basisvarer). ${batches.length} Claude-kald.`);

let matches = [], rejected = [], tin = 0, tout = 0;
for (const b of batches) {
  const resp = await claude(O.buildMatchRequest(b, ingredientNames));
  tin += resp.usage?.input_tokens || 0; tout += resp.usage?.output_tokens || 0;
  const r = O.parseMatchResponse(resp, b, ingredientNames);
  matches.push(...r.matches); rejected.push(...r.rejected);
  process.stdout.write('.');
}
console.log(`\n${matches.length} produkter koblet til en ingrediens, ${rejected.length} afvist.`);
const byIng = {};
for (const m of matches) (byIng[m.ingredient] ??= []).push(m.product);
for (const [ing, ps] of Object.entries(byIng).sort()) console.log(`   ${ing.padEnd(22)} ← ${ps.join(' · ')}`);
for (const r of rejected) console.log(`   ✗ ${r.product} → ${r.ingredient} (${r.why})`);
console.log(`Tokens ${tin}/${tout} ≈ $${((tin * 0.1 + tout * 0.5) / 1e6).toFixed(4)}`);

const outDir = path.join(root, 'data', 'normalize');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `offers-match-${day}.json`), JSON.stringify({ day, matches, rejected }, null, 1));

if (write) {
  const chains = [...new Map(offers.map((o) => [o.chain, { slug: o.chain, name: o.chainName }])).values()];
  const params = { chains, offers, matches, matchedProductIds: [...new Set(offers.map((o) => o.productId))], model: O.MATCH_MODEL };
  const res = await neo4j(O.WRITE_STATEMENTS.map((statement) => ({ statement, parameters: params })));
  console.log('Skrevet til Neo4j. Aktive tilbud pr. kæde:', JSON.stringify(res[res.length - 1]));
}
