// Eksporterer et lille datasample fra Neo4j til data/sample/ (til afleveringen).
// Kun titel, url, kategori, tags, tid og normaliserede ingredienser – ingen fuld opskriftstekst/fremgangsmåde.
// Kør:  node scripts/export_sample.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile(path.join(root, '.env'));
const auth = 'Basic ' + Buffer.from('neo4j:' + process.env.NEO4J_PASSWORD).toString('base64');
async function q(statement) {
  const res = await fetch('http://localhost:7474/db/neo4j/tx/commit', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({ statements: [{ statement }] }) }).then((r) => r.json());
  if (res.errors?.length) throw new Error(res.errors[0].message);
  const r0 = res.results[0];
  return r0.data.map((d) => Object.fromEntries(r0.columns.map((c, i) => [c, d.row[i]])));
}
const recipes = await q(`MATCH (r:Recipe) WHERE r.title IN ['Porresuppe', 'Chili con carne', 'Kylling i cremet sennepssauce', 'Bønnegryde', 'Lasagne']
RETURN r.title AS titel, r.url AS url,
  COLLECT { MATCH (r)-[:IN_CATEGORY]->(c) RETURN c.name }[0] AS kategori,
  COLLECT { MATCH (r)-[:HAS_TAG]->(t) RETURN t.name } AS tags,
  r.totalMinutes AS minutterIAlt, r.servings AS portioner,
  COLLECT { MATCH (r)-[u:USES]->(i:Ingredient) RETURN {ingrediens: i.name, maengde: u.amount, enhed: u.unit, sektion: u.section, basisvare: i.pantry} ORDER BY u.line } AS ingredienser,
  COLLECT { MATCH (r)-[:SEE_ALSO]-(s) RETURN DISTINCT s.title } AS proevOgsaa,
  COLLECT { MATCH (c:Chunk)-[:CHUNK_OF]->(r) RETURN c.type } AS chunks
ORDER BY titel`);
const offers = await q(`MATCH (p:Product)-[o:ON_OFFER]->(ch:Chain), (p)-[:IS_A]->(i:Ingredient)
WHERE i.name IN ['hakket oksekød', 'løg', 'bacon', 'hakkede tomater']
RETURN i.name AS ingrediens, p.name AS produkt, p.quantityLabel AS stoerrelse, ch.name AS kaede,
  o.price / 100.0 AS pris, o.normalPrice / 100.0 AS normalpris, toString(o.validTo) AS gyldigTil ORDER BY ingrediens, pris`);
const counts = await q(`CALL { MATCH (n) RETURN labels(n)[0] AS type, count(*) AS antal }
RETURN type, antal ORDER BY antal DESC`);
const rels = await q(`MATCH ()-[r]->() RETURN type(r) AS relation, count(*) AS antal ORDER BY antal DESC`);
const dir = path.join(root, 'data', 'sample');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'opskrifter_sample.json'), JSON.stringify(recipes, null, 2));
fs.writeFileSync(path.join(dir, 'tilbud_sample.json'), JSON.stringify(offers, null, 2));
fs.writeFileSync(path.join(dir, 'graf_statistik.json'), JSON.stringify({ eksporteret: new Date().toISOString(), noder: counts, relationer: rels }, null, 2));
console.log('Noder:', counts.map((c) => `${c.type} ${c.antal}`).join(', '));
console.log('Relationer:', rels.map((c) => `${c.relation} ${c.antal}`).join(', '));
console.log(`Gemt i data/sample/: ${recipes.length} opskrifter, ${offers.length} tilbud, statistik`);
