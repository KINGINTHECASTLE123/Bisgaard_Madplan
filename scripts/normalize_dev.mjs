// Tester/evaluerer ingrediens-normaliseringen (src/normalize.js) uden n8n:
// henter opskrifter fra den lokale Neo4j, kalder Claude (ANTHROPIC_API_KEY i .env), kører synonym-sammenlægning
// og gemmer resultatet i data/normalize/. SKRIVER IKKE til Neo4j – det gør n8n-workflow 02.
// Kør:  node scripts/normalize_dev.mjs --limit 3        (3 opskrifter, til hurtig prompt-test)
//       node scripts/normalize_dev.mjs                  (alle opskrifter + synonym-pass + evaluering)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile(path.join(root, '.env'));
const require = createRequire(import.meta.url);
const N = require(path.join(root, 'src', 'normalize.js'));

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const limit = Number(arg('--limit')) || null;
const only = arg('--recipe');

async function neo4j(statement, parameters = {}) {
  const auth = 'Basic ' + Buffer.from('neo4j:' + process.env.NEO4J_PASSWORD).toString('base64');
  const res = await fetch('http://localhost:7474/db/neo4j/tx/commit', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({ statements: [{ statement, parameters }] }),
  }).then((r) => r.json());
  if (res.errors?.length) throw new Error(res.errors[0].message);
  const r0 = res.results[0];
  return r0.data.map((d) => Object.fromEntries(r0.columns.map((c, i) => [c, d.row[i]])));
}

async function claude(body) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
    const j = await res.json();
    if (res.ok) return j;
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 2000 * attempt)); continue; }
    throw new Error(`Anthropic ${res.status}: ${JSON.stringify(j).slice(0, 300)}`);
  }
  throw new Error('Anthropic: for mange forsøg');
}

let recipes = await neo4j(`MATCH (r:Recipe) RETURN r.url AS url, r.title AS title, r.ingredientLines AS ingredientLines,
  r.ingredientSections AS ingredientSections ORDER BY r.title`);
if (only) recipes = recipes.filter((r) => r.title.toLowerCase().includes(only.toLowerCase()));
if (limit) recipes = recipes.slice(0, limit);
console.log(`Normaliserer ${recipes.length} opskrifter med ${N.MODEL} …`);

const t0 = Date.now();
let uses = [];
const problems = [];
let tokensIn = 0, tokensOut = 0;
const queue = [...recipes];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) {
    const r = queue.shift();
    const resp = await claude(N.buildNormalizeRequest(r));
    tokensIn += resp.usage?.input_tokens || 0; tokensOut += resp.usage?.output_tokens || 0;
    const p = N.parseNormalizeResponse(resp, r);
    uses.push(...p.uses);
    for (const pr of p.problems) problems.push(`${r.title}: ${pr}`);
    process.stdout.write('.');
  }
}));
console.log(`\nPass 1: ${uses.length} USES fra ${recipes.reduce((a, r) => a + r.ingredientLines.length, 0)} linjer på ${((Date.now() - t0) / 1000).toFixed(1)} sek.`);

const counts = {};
for (const u of uses) counts[u.name] = (counts[u.name] || 0) + 1;
console.log(`Unikke navne før sammenlægning: ${Object.keys(counts).length}`);

let canon = { map: {}, rejected: [] };
if (recipes.length > 3) {
  const resp = await claude(N.buildCanonRequest(counts));
  tokensIn += resp.usage?.input_tokens || 0; tokensOut += resp.usage?.output_tokens || 0;
  canon = N.parseCanonResponse(resp, counts);
  console.log(`Pass 2: ${Object.keys(canon.map).length} sammenlægninger (${canon.rejected.length} afvist):`);
  for (const [f, t] of Object.entries(canon.map)) console.log(`   ${f} → ${t}`);
  for (const r of canon.rejected) console.log(`   ✗ afvist: ${r.from} → ${r.to} (${r.why})`);
}
const result = N.applyCanon(uses, canon.map);
console.log(`Ingredienser efter sammenlægning: ${result.ingredients.length} (heraf basisvarer: ${result.ingredients.filter((i) => i.pantry).length})`);
console.log('Basisvarer:', result.ingredients.filter((i) => i.pantry).map((i) => i.name).sort().join(', '));
console.log('Top 25:', result.ingredients.sort((a, b) => b.uses - a.uses).slice(0, 25).map((i) => `${i.name}(${i.uses})`).join(', '));

if (problems.length) { console.log(`\nProblemer (${problems.length}):`); for (const p of problems) console.log('   ' + p); }

// Stikprøve til manuel evaluering
const sample = [...result.uses].sort(() => Math.random() - 0.5).slice(0, 25);
console.log('\nStikprøve (rå linje → navn | mængde enhed | prep | basisvare):');
for (const u of sample) console.log(`   ${u.raw.padEnd(55).slice(0, 55)} → ${u.name} | ${u.amount ?? ''} ${u.unit ?? ''} | ${u.prep ?? ''}${u.pantry ? ' | BASIS' : ''}`);

const outDir = path.join(root, 'data', 'normalize');
fs.mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, `run-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(file, JSON.stringify({ model: N.MODEL, recipes: recipes.length, merges: canon.map, rejected: canon.rejected, problems, ...result }, null, 1));
// Pris (Haiku 5.5: $0,10 / $0,50 pr. mio. tokens)
console.log(`\nTokens: ${tokensIn} ind / ${tokensOut} ud ≈ $${((tokensIn * 0.1 + tokensOut * 0.5) / 1e6).toFixed(4)}. Gemt: ${path.relative(root, file)}`);
