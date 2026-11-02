// Genererer n8n/02_normaliser_ingredienser.json ud fra src/normalize.js.
// Kør: node src/build_workflow_02.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const N = require('./normalize');

const root = path.join(__dirname, '..');
const lib = fs.readFileSync(path.join(__dirname, 'normalize.js'), 'utf8').replace(/if \(typeof module[\s\S]*$/, '').trim();
const NEO4J_URL = 'http://neo4j:7474/db/neo4j/tx/commit';
const NEO4J_CREDENTIAL = { id: 'W2oqfWpLx0Y5eXtI', name: 'Neo4j lokal' };
const ANTHROPIC_CREDENTIAL = { id: '2UXZEoN7WAwaV2cD', name: 'Anthropic account' };
const id = () => crypto.randomUUID();
const X = 230;

const neo4jNode = (name, x, y = 0) => ({
  parameters: {
    method: 'POST', url: NEO4J_URL, authentication: 'genericCredentialType', genericAuthType: 'httpBasicAuth',
    sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.body) }}', options: {},
  },
  id: id(), credentials: { httpBasicAuth: NEO4J_CREDENTIAL }, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [x, y],
});
const claudeNode = (name, x, y = 0, batching = false) => ({
  parameters: {
    method: 'POST', url: 'https://api.anthropic.com/v1/messages',
    authentication: 'predefinedCredentialType', nodeCredentialType: 'anthropicApi',
    sendHeaders: true, headerParameters: { parameters: [{ name: 'anthropic-version', value: '2023-06-01' }] },
    sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.body) }}',
    options: { timeout: 120000, ...(batching ? { batching: { batch: { batchSize: 1, batchInterval: 1200 } } } : {}) },
  },
  id: id(), credentials: { anthropicApi: ANTHROPIC_CREDENTIAL }, retryOnFail: true, maxTries: 3, waitBetweenTries: 5000,
  name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [x, y],
});
const codeNode = (name, jsCode, x, y = 0) => ({
  parameters: { jsCode }, id: id(), name, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x, y],
});

const ROWS = `const res = $input.first().json;
if (res.errors?.length) throw new Error('Neo4j: ' + res.errors.map((e) => e.code + ': ' + e.message).join(' | '));`;

const code = {
  query: `// Hvilke opskrifter skal normaliseres? Alle (idempotent – gamle USES erstattes).
return [{ json: { body: { statements: [{ statement: ${JSON.stringify(
    `MATCH (r:Recipe) RETURN r.url AS url, r.title AS title, r.ingredientLines AS ingredientLines, r.ingredientSections AS ingredientSections ORDER BY r.title`,
  )} }] } } }];`,

  requests: `${lib}

${ROWS}
const r0 = res.results[0];
const recipes = r0.data.map((d) => Object.fromEntries(r0.columns.map((c, i) => [c, d.row[i]])));
// Ét Claude-kald pr. opskrift
return recipes.map((recipe) => ({ json: { recipe, body: buildNormalizeRequest(recipe) } }));`,

  validate: `${lib}

// Parrer hvert Claude-svar med sin opskrift (samme rækkefølge) og validerer.
const reqs = $('Byg Claude-requests').all();
const resps = $input.all();
const uses = [];
const problems = [];
let tokensIn = 0, tokensOut = 0;
resps.forEach((item, i) => {
  const recipe = reqs[i].json.recipe;
  tokensIn += item.json.usage?.input_tokens || 0;
  tokensOut += item.json.usage?.output_tokens || 0;
  const p = parseNormalizeResponse(item.json, recipe);
  uses.push(...p.uses);
  for (const pr of p.problems) problems.push(recipe.title + ': ' + pr);
});
const nameCounts = {};
for (const u of uses) nameCounts[u.name] = (nameCounts[u.name] || 0) + 1;
return [{ json: {
  uses, problems, nameCounts, tokensIn, tokensOut,
  urls: reqs.map((r) => r.json.recipe.url),
  body: buildCanonRequest(nameCounts),
} }];`,

  apply: `${lib}

const v = $('Valider og saml navne').first().json;
const resp = $input.first().json;
const canon = parseCanonResponse(resp, v.nameCounts);
const result = applyCanon(v.uses, canon.map);
const tokensIn = v.tokensIn + (resp.usage?.input_tokens || 0);
const tokensOut = v.tokensOut + (resp.usage?.output_tokens || 0);
const params = { urls: v.urls, ingredients: result.ingredients, uses: result.uses, model: MODEL };
return [{ json: {
  summary: {
    opskrifter: v.urls.length, forekomster: result.uses.length,
    navneFoer: Object.keys(v.nameCounts).length, ingredienser: result.ingredients.length,
    basisvarer: result.ingredients.filter((i) => i.pantry).length,
    sammenlaegninger: canon.map, afvist: canon.rejected, problemer: v.problems,
    tokens: { ind: tokensIn, ud: tokensOut, prisUSD: Number(((tokensIn * 0.1 + tokensOut * 0.5) / 1e6).toFixed(4)) },
  },
  body: { statements: WRITE_STATEMENTS.map((statement) => ({ statement, parameters: params })) },
} }];`,

  check: `${ROWS}
const s = $('Anvend synonymer og byg Cypher').first().json.summary;
const slettet = res.results[3]?.data?.[0]?.row?.[0] ?? 0;
return [{ json: { status: 'gemt', ...s, foraeldreloeseIngredienserSlettet: slettet } }];`,
};

const nodes = [
  {
    parameters: {
      content:
        '## 02 · Normalisering af ingredienser (LLM → graf)\n' +
        'Laver opskrifternes rå ingredienslinjer om til `(Recipe)-[:USES {amount, unit, prep, section, raw}]->(Ingredient {name, pantry})`.\n\n' +
        '1. **Pass 1** – Claude (' + N.MODEL + ') normaliserer hver opskrift (navn i ental uden mængde/tilberedning, mængde, enhed, basisvare) via tvunget tool use (fast JSON-skema). Ét kald pr. opskrift.\n' +
        '2. **Pass 2** – Claude foreslår synonymer på tværs af alle navne; en deterministisk kontrol (`mergeAllowed`) afviser sammenlægninger, der skifter vare (stødt/tørret/syltet, pastaformer, navne der ikke ligner hinanden).\n' +
        '3. Alt skrives i **én Neo4j-transaktion** (gamle USES erstattes – idempotent).\n\n' +
        'Logik og prompts: `src/normalize.js`. Evaluering: `docs/normalisering-evaluering.md`.',
      height: 300, width: 2280, color: 4,
    },
    id: id(), name: 'Beskrivelse', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [-40, -360],
  },
  { parameters: {}, id: id(), name: 'Start manuelt', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0] },
  codeNode('Byg opskrift-query', code.query, X),
  neo4jNode('Hent opskrifter', X * 2),
  codeNode('Byg Claude-requests', code.requests, X * 3),
  claudeNode('Claude: normalisér opskrift', X * 4, 0, true),
  codeNode('Valider og saml navne', code.validate, X * 5),
  claudeNode('Claude: find synonymer', X * 6),
  codeNode('Anvend synonymer og byg Cypher', code.apply, X * 7),
  neo4jNode('Skriv til Neo4j', X * 8),
  codeNode('Tjek svar', code.check, X * 9),
];
const chain = nodes.filter((n) => n.type !== 'n8n-nodes-base.stickyNote').map((n) => n.name);
const connections = {};
for (let i = 0; i < chain.length - 1; i++) connections[chain[i]] = { main: [[{ node: chain[i + 1], type: 'main', index: 0 }]] };

const workflow = { name: '02 · Normalisering – ingredienser til graf (LLM)', nodes, connections, settings: { executionOrder: 'v1' }, pinData: {} };
module.exports = { workflow, code };
if (require.main === module) {
  const out = path.join(root, 'n8n', '02_normaliser_ingredienser.json');
  fs.writeFileSync(out, JSON.stringify(workflow, null, 2));
  console.log('Skrev', out);
}
