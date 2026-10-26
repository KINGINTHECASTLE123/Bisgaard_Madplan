// Genererer n8n/01_ingest_opskrifter.json ud fra kildefilerne i src/.
// Kør: node src/build_workflow.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const lib = fs
  .readFileSync(path.join(__dirname, 'build_recipe.js'), 'utf8')
  .replace(/if \(typeof module[\s\S]*$/, '')
  .trim();

const EMBED_MODEL = 'nomic-embed-text';
const OLLAMA_URL = 'http://host.docker.internal:11434/api/embed';
const NEO4J_URL = 'http://neo4j:7474/db/neo4j/tx/commit';
const USER_AGENT = 'KEA-studieprojekt madplan-agent (kontakt: jacbisgaard@hotmail.com)';

const RECIPE_CYPHER = `MERGE (r:Recipe {url: $url})
SET r.title = $recipe.title,
    r.description = $recipe.description,
    r.servings = $recipe.servings,
    r.totalMinutes = $recipe.totalMinutes,
    r.cookMinutes = $recipe.cookMinutes,
    r.image = $recipe.image,
    r.ingredientLines = $recipe.ingredientLines,
    r.ingredientSections = $recipe.ingredientSections,
    r.source = 'valdemarsro.dk',
    r.ingestedAt = datetime()
WITH r
CALL {
  WITH r
  MATCH (r)-[old:IN_CATEGORY|HAS_TAG]->()
  DELETE old
}
FOREACH (c IN CASE WHEN $recipe.category IS NULL THEN [] ELSE [$recipe.category] END |
  MERGE (cat:Category {name: c})
  MERGE (r)-[:IN_CATEGORY]->(cat))
FOREACH (t IN $recipe.tags |
  MERGE (tag:Tag {name: t})
  MERGE (r)-[:HAS_TAG]->(tag))`;

const CHUNK_CYPHER = `MATCH (r:Recipe {url: $url})
CALL {
  WITH r
  MATCH (old:Chunk)-[:CHUNK_OF]->(r)
  DETACH DELETE old
}
WITH r
UNWIND $chunks AS ch
CREATE (c:Chunk {
  id: $url + '#' + ch.type,
  type: ch.type,
  text: ch.text,
  source: $url,
  recipeTitle: r.title,
  embeddingModel: $model
})
SET c.embedding = [x IN ch.embedding | toFloat(x)]
CREATE (c)-[:CHUNK_OF]->(r)`;

const code = {
  links: `// Indsæt dine favoritopskrifter fra valdemarsro.dk her – én URL pr. linje.
// Dubletter fjernes automatisk, og allerede indlæste opskrifter overskrives (idempotent).
const urls = [
  'https://www.valdemarsro.dk/porresuppe/',
];

return [...new Set(urls.map((u) => u.trim()).filter(Boolean))]
  .map((url) => ({ json: { url } }));`,

  build: `${lib}

// ---- n8n ----
const items = $input.all();
const out = [];
const skipped = [];
for (let i = 0; i < items.length; i++) {
  const url = $('Opskrift-links').itemMatching(i).json.url;
  const built = buildRecipe(items[i].json, url);
  if (!built) { skipped.push(url); continue; }
  out.push({ json: { url, ...built }, pairedItem: { item: i } });
}
if (skipped.length) console.log('Sprunget over – ingen opskrift fundet på:', skipped);
return out;`,

  cypher: `// Kobler embeddings sammen med chunks og bygger én Neo4j-transaktion pr. opskrift.
const base = $('Byg opskrift og chunks').item.json;
const embeddings = $json.embeddings;

if (!Array.isArray(embeddings) || embeddings.length !== base.chunks.length) {
  throw new Error(\`Fik \${embeddings?.length ?? 0} embeddings for \${base.chunks.length} chunks (\${base.url})\`);
}

const chunks = base.chunks.map((c, i) => ({ ...c, embedding: embeddings[i] }));

const RECIPE_CYPHER = ${JSON.stringify(RECIPE_CYPHER)};
const CHUNK_CYPHER = ${JSON.stringify(CHUNK_CYPHER)};

return {
  json: {
    url: base.url,
    title: base.recipe.title,
    chunkCount: chunks.length,
    body: {
      statements: [
        { statement: RECIPE_CYPHER, parameters: { url: base.url, recipe: base.recipe } },
        { statement: CHUNK_CYPHER, parameters: { url: base.url, chunks, model: ${JSON.stringify(EMBED_MODEL)} } },
      ],
    },
  },
};`,

  check: `// Neo4j's HTTP API svarer 200 selv når Cypher fejler – fejlene ligger i "errors".
const src = $('Byg Cypher').item.json;
const errors = $json.errors || [];
if (errors.length) {
  throw new Error(\`Neo4j afviste \${src.url}: \` + errors.map((e) => \`\${e.code}: \${e.message}\`).join(' | '));
}
return { json: { status: 'gemt', title: src.title, url: src.url, chunks: src.chunkCount } };`,
};

const id = () => crypto.randomUUID();
const X = 220;

const nodes = [
  {
    parameters: {
      content:
        '## 01 · Ingestion: opskrifter → Neo4j\n' +
        'Henter opskrifter fra valdemarsro.dk (høfligt: 1 side pr. 3 sek.), udtrækker schema.org-microdata, ' +
        'deler hver opskrift i chunks (profil / ingredienser / fremgangsmåde), embedder med **' + EMBED_MODEL + '** via Ollama ' +
        'og skriver både graf (Recipe, Category, Tag) og vektor-chunks til Neo4j i én transaktion.\n\n' +
        'Kør igen for at opdatere – alt er idempotent (MERGE på URL, gamle chunks slettes).',
      height: 220,
      width: 1560,
      color: 4,
    },
    id: id(),
    name: 'Beskrivelse',
    type: 'n8n-nodes-base.stickyNote',
    typeVersion: 1,
    position: [-40, -300],
  },
  {
    parameters: {},
    id: id(),
    name: 'Start manuelt',
    type: 'n8n-nodes-base.manualTrigger',
    typeVersion: 1,
    position: [0, 0],
  },
  {
    parameters: { jsCode: code.links },
    id: id(),
    name: 'Opskrift-links',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [X, 0],
  },
  {
    parameters: {
      url: '={{ $json.url }}',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'User-Agent', value: USER_AGENT }] },
      options: {
        batching: { batch: { batchSize: 1, batchInterval: 3000 } },
        response: { response: { responseFormat: 'text', outputPropertyName: 'html' } },
      },
    },
    id: id(),
    name: 'Hent opskriftsside',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [X * 2, 0],
  },
  {
    parameters: {
      operation: 'extractHtmlContent',
      dataPropertyName: 'html',
      extractionValues: {
        values: [
          { key: 'title', cssSelector: 'h1[itemprop="headline"]' },
          { key: 'description', cssSelector: '[itemprop="description"]' },
          { key: 'category', cssSelector: '[itemprop="recipeCategory"]' },
          { key: 'keywords', cssSelector: '[itemprop="keywords"]' },
          { key: 'totalTimeContent', cssSelector: '[itemprop="totalTime"]', returnValue: 'attribute', attribute: 'content' },
          { key: 'totalTimeText', cssSelector: '[itemprop="totalTime"]' },
          { key: 'cookTimeContent', cssSelector: '[itemprop="cookTime"]', returnValue: 'attribute', attribute: 'content' },
          { key: 'cookTimeText', cssSelector: '[itemprop="cookTime"]' },
          { key: 'servings', cssSelector: '[itemprop="recipeYield"]' },
          { key: 'image', cssSelector: 'meta[property="og:image"]', returnValue: 'attribute', attribute: 'content' },
          { key: 'ingredientLists', cssSelector: 'ul.ingredientlist', returnValue: 'html', returnArray: true },
          { key: 'instructionsHtml', cssSelector: '[itemprop="recipeInstructions"]', returnValue: 'html' },
        ],
      },
      options: { trimValues: true },
    },
    id: id(),
    name: 'Udtræk felter',
    type: 'n8n-nodes-base.html',
    typeVersion: 1.2,
    position: [X * 3, 0],
  },
  {
    parameters: { jsCode: code.build },
    id: id(),
    name: 'Byg opskrift og chunks',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [X * 4, 0],
  },
  {
    parameters: {
      method: 'POST',
      url: OLLAMA_URL,
      sendBody: true,
      specifyBody: 'json',
      jsonBody:
        `={{ JSON.stringify({ model: '${EMBED_MODEL}', input: $json.chunks.map(c => 'search_document: ' + c.text) }) }}`,
      options: {},
    },
    id: id(),
    name: 'Embed chunks (Ollama)',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [X * 5, 0],
  },
  {
    parameters: { mode: 'runOnceForEachItem', jsCode: code.cypher },
    id: id(),
    name: 'Byg Cypher',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [X * 6, 0],
  },
  {
    parameters: {
      method: 'POST',
      url: NEO4J_URL,
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBasicAuth',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ JSON.stringify($json.body) }}',
      options: {},
    },
    id: id(),
    name: 'Skriv til Neo4j',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [X * 7, 0],
  },
  {
    parameters: { mode: 'runOnceForEachItem', jsCode: code.check },
    id: id(),
    name: 'Tjek svar',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [X * 8, 0],
  },
];

const chain = [
  'Start manuelt', 'Opskrift-links', 'Hent opskriftsside', 'Udtræk felter',
  'Byg opskrift og chunks', 'Embed chunks (Ollama)', 'Byg Cypher', 'Skriv til Neo4j', 'Tjek svar',
];
const connections = {};
for (let i = 0; i < chain.length - 1; i++) {
  connections[chain[i]] = { main: [[{ node: chain[i + 1], type: 'main', index: 0 }]] };
}

const workflow = {
  name: '01 · Ingestion – opskrifter til Neo4j',
  nodes,
  connections,
  settings: { executionOrder: 'v1' },
  pinData: {},
};

const out = path.join(root, 'n8n', '01_ingest_opskrifter.json');
fs.writeFileSync(out, JSON.stringify(workflow, null, 2));
console.log('Skrev', out);

module.exports = { RECIPE_CYPHER, CHUNK_CYPHER, code };
