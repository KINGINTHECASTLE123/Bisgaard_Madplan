// Hurtig test af vektorsøgning uden n8n.  Kør:  node scripts/vektorsoeg.mjs "varm suppe til en kold aften"
// Embedder spørgsmålet med nomic-embed-text (search_query:-præfiks) og spørger vector indexet chunk_embedding.
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile(path.join(root, '.env'));

const q = process.argv.slice(2).join(' ') || 'varm suppe til en kold aften';
const k = 5;

const emb = await fetch('http://localhost:11434/api/embed', {
  method: 'POST',
  body: JSON.stringify({ model: 'nomic-embed-text', input: 'search_query: ' + q }),
}).then((r) => r.json());

const cypher = `CALL db.index.vector.queryNodes('chunk_embedding', $k, $v) YIELD node, score
MATCH (node)-[:CHUNK_OF]->(r:Recipe)
RETURN r.title AS opskrift, node.type AS chunk, round(score, 3) AS score, r.url AS url
ORDER BY score DESC`;

const res = await fetch('http://localhost:7474/db/neo4j/tx/commit', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: 'Basic ' + Buffer.from('neo4j:' + process.env.NEO4J_PASSWORD).toString('base64'),
  },
  body: JSON.stringify({ statements: [{ statement: cypher, parameters: { k, v: emb.embeddings[0] } }] }),
}).then((r) => r.json());

if (res.errors?.length) { console.error(res.errors); process.exit(1); }
console.log(`Spørgsmål: "${q}"`);
console.table(res.results[0].data.map((d) => Object.fromEntries(res.results[0].columns.map((c, i) => [c, d.row[i]]))));
