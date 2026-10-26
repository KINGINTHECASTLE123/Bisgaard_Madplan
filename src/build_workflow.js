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
// n8n-credential (Basic Auth) til Neo4j. Id'et er ikke hemmeligt – det peger bare på credentialen
// i din egen n8n. Genskaber man projektet, oprettes en Basic Auth-credential med samme navn og id'et rettes her.
const NEO4J_CREDENTIAL = { id: 'W2oqfWpLx0Y5eXtI', name: 'Neo4j lokal' };
const USER_AGENT = 'KEA-studieprojekt madplan-agent (kontakt: jacbisgaard@hotmail.com)';

const RECIPE_CYPHER = `MERGE (r:Recipe {url: $url})
SET r.title = $recipe.title,
    r.description = $recipe.description,
    r.servings = $recipe.servings,
    r.totalMinutes = $recipe.totalMinutes,
    r.cookMinutes = $recipe.cookMinutes,
    r.image = $recipe.image,
    r.shelfLife = $recipe.shelfLife,
    r.freezable = $recipe.freezable,
    r.tips = $recipe.tips,
    r.serveWith = $recipe.serveWith,
    r.serveWithTitles = $recipe.serveWithTitles,
    r.seeAlso = $recipe.seeAlso,
    r.seeAlsoTitles = $recipe.seeAlsoTitles,
    r.ingredientLines = $recipe.ingredientLines,
    r.ingredientSections = $recipe.ingredientSections,
    r.source = 'valdemarsro.dk',
    r.ingestedAt = datetime()
WITH r
CALL {
  WITH r
  MATCH (r)-[old:IN_CATEGORY|HAS_TAG|SERVED_WITH|SEE_ALSO]->()
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

// Kobler opskrifter, der henviser til hinanden ("Forslag til servering" / "Prøv også"),
// men kun hvis begge ligger i databasen. Kører over alle opskrifter, så rækkefølgen af
// ingestion er ligegyldig. Idempotent (MERGE).
const LINK_SERVED_CYPHER = `MATCH (a:Recipe), (b:Recipe)
WHERE a <> b AND b.url IN coalesce(a.serveWith, [])
MERGE (a)-[:SERVED_WITH]->(b)
RETURN count(*) AS servedWith`;

const LINK_SEE_ALSO_CYPHER = `MATCH (a:Recipe), (b:Recipe)
WHERE a <> b AND b.url IN coalesce(a.seeAlso, [])
MERGE (a)-[:SEE_ALSO]->(b)
RETURN count(*) AS seeAlso`;

// Felter som HTML-noden "Udtræk felter" henter (CSS-selectors på schema.org-microdata m.m.).
// Bruges også af src/test_parse.js, som efterligner noden med cheerio mod gemte sider.
const EXTRACTION_VALUES = [
  { key: 'title', cssSelector: 'h1[itemprop="headline"]' },
  // HTML, fordi elementet også rummer hele opskriftsboksen – cleanDescription() klipper intro-teksten ud.
  { key: 'description', cssSelector: '[itemprop="description"]', returnValue: 'html' },
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
  { key: 'stats', cssSelector: '.recipe-stats .recipe-stat', returnValue: 'html', returnArray: true },
  { key: 'tipsHtml', cssSelector: 'h3:contains("Tip til opskriften") + ul', returnValue: 'html' },
  { key: 'serveWithHtml', cssSelector: '#tab1_content .post-list-item-title', returnValue: 'html', returnArray: true },
  { key: 'seeAlsoHtml', cssSelector: '#tab2_content .post-list-item-title', returnValue: 'html', returnArray: true },
];

// Favoritlisten vedligeholdes i data/favoritter.txt og bages ind i noden "Opskrift-links".
const FAVORITES = fs.readFileSync(path.join(root, 'data', 'favoritter.txt'), 'utf8')
  .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

const code = {
  links: `// Genereret fra data/favoritter.txt (${FAVORITES.length} opskrifter) – ret listen dér og kør npm run build.
// Du kan også tilføje URL'er direkte her. Dubletter fjernes, og allerede indlæste opskrifter overskrives (idempotent).
const urls = [
${FAVORITES.map((u) => `  '${u}',`).join('\n')}
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

  cypher: `// Kobler embeddings sammen med chunks og bygger de to Cypher-statements for én opskrift.
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
    statements: [
      { statement: RECIPE_CYPHER, parameters: { url: base.url, recipe: base.recipe } },
      { statement: CHUNK_CYPHER, parameters: { url: base.url, chunks, model: ${JSON.stringify(EMBED_MODEL)} } },
    ],
  },
};`,

};

// Samler ALLE opskrifter i én transaktion. n8n's HTTP-node sender ellers requests parallelt
// (batching forsinker kun starten), og parallelle transaktioner på de samme Tag/Category-noder
// gav DeadlockDetected. Én transaktion = ingen låsekonflikter, og importen er alt-eller-intet.
// Koblingen SEE_ALSO/SERVED_WITH kører til sidst i samme transaktion, når alle opskrifter findes.
code.transaction = `const items = $input.all();
const statements = items.flatMap((i) => i.json.statements);
statements.push(
  { statement: ${JSON.stringify(LINK_SERVED_CYPHER)} },
  { statement: ${JSON.stringify(LINK_SEE_ALSO_CYPHER)} },
);
const recipes = items.map((i) => ({ url: i.json.url, title: i.json.title, chunks: i.json.chunkCount }));
return [{ json: { recipes, body: { statements } } }];`;

// Neo4j's HTTP API svarer 200 selv når Cypher fejler – fejlene ligger i "errors".
// Ved fejl rulles hele transaktionen tilbage; results indeholder de statements, der nåede at køre,
// så næste statement er den der fejlede (2 statements pr. opskrift).
code.check = `const res = $input.first().json;
const { recipes } = $('Saml transaktion').first().json;
if (res.errors?.length) {
  const failed = res.results?.length ?? 0;
  const r = recipes[Math.floor(failed / 2)];
  const where = r ? \`opskrift "\${r.title}" (\${r.url})\` : 'koblingen af relaterede opskrifter';
  throw new Error(\`Neo4j afviste \${where} – intet er gemt. \` + res.errors.map((e) => e.code + ': ' + e.message).join(' | '));
}
const n = res.results.length;
const servedWith = res.results[n - 2].data[0]?.row[0] ?? 0;
const seeAlso = res.results[n - 1].data[0]?.row[0] ?? 0;
return [{ json: {
  status: 'gemt',
  opskrifter: recipes.length,
  chunks: recipes.reduce((a, r) => a + r.chunks, 0),
  SERVED_WITH: servedWith,
  SEE_ALSO: seeAlso,
  titler: recipes.map((r) => r.title),
} }];`;

const id = () => crypto.randomUUID();
const X = 220;

const nodes = [
  {
    parameters: {
      content:
        '## 01 · Ingestion: opskrifter → Neo4j\n' +
        'Henter opskrifter fra valdemarsro.dk (høfligt: 1 side pr. 3 sek.), udtrækker schema.org-microdata, ' +
        'deler hver opskrift i chunks (profil / ingredienser / tips / fremgangsmåde), embedder med **' + EMBED_MODEL + '** via Ollama ' +
        'og skriver graf (Recipe, Category, Tag) og vektor-chunks til Neo4j i **én samlet transaktion** (alt-eller-intet, ingen låsekonflikter).\n\n' +
        'Til sidst i samme transaktion kobles opskrifterne, der henviser til hinanden: **SEE_ALSO** ("Prøv også") og **SERVED_WITH** ("Forslag til servering").\n\n' +
        'Kør igen for at opdatere – alt er idempotent (MERGE på URL, gamle chunks og relationer slettes).',
      height: 220,
      width: 2120,
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
        values: EXTRACTION_VALUES,
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
    parameters: { jsCode: code.transaction },
    id: id(),
    name: 'Saml transaktion',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [X * 7, 0],
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
    credentials: { httpBasicAuth: NEO4J_CREDENTIAL },
    name: 'Skriv til Neo4j',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [X * 8, 0],
  },
  {
    parameters: { jsCode: code.check },
    id: id(),
    name: 'Tjek svar',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [X * 9, 0],
  },
];

const chain = [
  'Start manuelt', 'Opskrift-links', 'Hent opskriftsside', 'Udtræk felter',
  'Byg opskrift og chunks', 'Embed chunks (Ollama)', 'Byg Cypher', 'Saml transaktion', 'Skriv til Neo4j', 'Tjek svar',
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

module.exports = { RECIPE_CYPHER, CHUNK_CYPHER, LINK_SERVED_CYPHER, LINK_SEE_ALSO_CYPHER, EXTRACTION_VALUES, code };

if (require.main === module) {
  const out = path.join(root, 'n8n', '01_ingest_opskrifter.json');
  fs.writeFileSync(out, JSON.stringify(workflow, null, 2));
  console.log('Skrev', out);
}
