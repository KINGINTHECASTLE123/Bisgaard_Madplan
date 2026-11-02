// Tester tool-workflows uden n8n: bygger parametre som Code-noden "Byg Cypher", embedder query med Ollama
// (som noden "Embed spørgsmål"), kører Cypher mod den lokale Neo4j og kører "Formatér svar".
// Kør:  node scripts/test_tools.mjs            (alle tools)
//       node scripts/test_tools.mjs search     (kun tools hvis filnavn indeholder "search")
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile(path.join(root, '.env'));
const require = createRequire(import.meta.url);
const { tools } = require(path.join(root, 'src', 'build_tools.js'));

const CASES = {
  '10_tool_opskrifter_med_tag': [{ tag: 'vegetar' }, { tag: 'Findes ikke' }],
  '11_tool_search_recipes': [
    { query: 'noget cremet med kylling', k: 5 },
    { query: 'noget sundt og hurtigt', maxMinutes: 25, k: 5 },
    { query: 'noget sundt og hurtigt', maxMinutes: 30, tag: 'Salat, Vegetar, Måltidssalat og bowls', k: 5 },
    { query: 'varm suppe til en kold aften', tag: 'Vegetar', k: 3 },
    { query: 'mexicansk', excludeTag: 'Vegetar', maxMinutes: 30, k: 5 },
    { query: 'sushi', maxMinutes: 5 },
    { query: 'en god hverdagsret', preferOffers: true, k: 5 },
  ],
  '13_tool_find_offers': [
    { recipes: 'https://www.valdemarsro.dk/chili-con-carne/, Porresuppe, Lasagne' },
    { recipes: 'pizza' },
  ],
  '12_tool_get_recipe_details': [{ recipe: 'Porresuppe' }, { recipe: 'https://www.valdemarsro.dk/lasagne/' }, { recipe: 'karry' }, { recipe: 'pizza' }],
};

const auth = 'Basic ' + Buffer.from('neo4j:' + process.env.NEO4J_PASSWORD).toString('base64');
const filter = process.argv[2] || '';
const short = (o) => JSON.stringify(o, (k, v) => (Array.isArray(v) && v.length > 8 && typeof v[0] === 'string' ? [...v.slice(0, 8), `… (+${v.length - 8})`] : v), 2);

for (const [file, wf] of Object.entries(tools)) {
  if (!file.includes(filter)) continue;
  const def = wf._def;
  for (const input of CASES[file] || [{}]) {
    try {
      let embedding;
      if (def.embedField) {
        const e = await fetch('http://localhost:11434/api/embed', {
          method: 'POST', body: JSON.stringify({ model: 'nomic-embed-text', input: 'search_query: ' + (input[def.embedField] || '') }),
        }).then((r) => r.json());
        embedding = e.embeddings[0];
      }
      const parameters = new Function('input', 'embedding', `return (${def.params});`)(input, embedding);
      const res = await fetch('http://localhost:7474/db/neo4j/tx/commit', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ statements: [{ statement: def.cypher, parameters }] }),
      }).then((r) => r.json());
      if (res.errors?.length) throw new Error(res.errors.map((e) => e.code + ': ' + e.message).join(' | '));
      const r0 = res.results[0];
      const rows = r0.data.map((d) => Object.fromEntries(r0.columns.map((c, i) => [c, d.row[i]])));
      const out = new Function('rows', 'input', def.format)(rows, input);
      console.log(`\n▶ ${def.name}  input=${JSON.stringify(input)}`);
      console.log(short(out[0].json).slice(0, 2500));
    } catch (e) {
      console.log(`\n✗ ${def.name}  input=${JSON.stringify(input)}\n  ${e.message}`);
    }
  }
}
