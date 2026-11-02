// Genererer tool-workflows (sub-workflows) til agenten i n8n/.
// Hvert tool: "When Executed by Another Workflow"-trigger med navngivne inputs
//   → (valgfrit) embed spørgsmålet med Ollama → Neo4j (HTTP API) → formatér svar med kilder.
// Logikken (Cypher, parametre, formatering) ligger her, så den kan testes uden n8n: node scripts/test_tools.mjs
// Kør: node src/build_tools.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const NEO4J_URL = 'http://neo4j:7474/db/neo4j/tx/commit';
const OLLAMA_EMBED_URL = 'http://host.docker.internal:11434/api/embed';
const EMBED_MODEL = 'nomic-embed-text';
const NEO4J_CREDENTIAL = { id: 'W2oqfWpLx0Y5eXtI', name: 'Neo4j lokal' };
const id = () => crypto.randomUUID();

// def: { name, description, inputs:[{name,type}], embedField?, cypher, params, format }
//   params: JS-udtryk (string) der bygger Cypher-parametrene. Har adgang til `input` (trigger-input)
//           og `embedding` (hvis embedField er sat).
//   format: Code-node-kode. Har adgang til `rows` (Neo4j-rækker som objekter) og `input`.
function toolWorkflow(def) {
  const { name, description, inputs, embedField, cypher, params, format } = def;
  const X = 240;
  const nodes = [
    {
      parameters: { content: `## ${name}\n${description}`, height: 240, width: 1000, color: 5 },
      id: id(), name: 'Beskrivelse', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [-40, -300],
    },
    {
      parameters: {
        inputSource: 'workflowInputs',
        workflowInputs: { values: inputs.map((i) => ({ name: i.name, type: i.type || 'string' })) },
      },
      id: id(), name: 'Input', type: 'n8n-nodes-base.executeWorkflowTrigger', typeVersion: 1.1, position: [0, 0],
    },
  ];
  const chain = ['Input'];
  if (embedField) {
    nodes.push({
      parameters: {
        method: 'POST',
        url: OLLAMA_EMBED_URL,
        sendBody: true,
        specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({ model: '${EMBED_MODEL}', input: 'search_query: ' + ($json.${embedField} || '') }) }}`,
        options: {},
      },
      id: id(), name: 'Embed spørgsmål (Ollama)', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
      position: [X * chain.length, 0],
    });
    chain.push('Embed spørgsmål (Ollama)');
  }
  // Parametre bygges i en Code-node (lettere at læse og teste end et langt udtryk i HTTP-noden).
  nodes.push({
    parameters: {
      jsCode: `const input = $('Input').first().json;
${embedField ? "const embedding = $('Embed spørgsmål (Ollama)').first().json.embeddings[0];\n" : ''}const parameters = ${params};
return [{ json: { body: { statements: [{ statement: ${JSON.stringify(cypher)}, parameters }] } } }];`,
    },
    id: id(), name: 'Byg Cypher', type: 'n8n-nodes-base.code', typeVersion: 2, position: [X * chain.length, 0],
  });
  chain.push('Byg Cypher');
  nodes.push({
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
    id: id(), credentials: { httpBasicAuth: NEO4J_CREDENTIAL },
    name: 'Neo4j', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [X * chain.length, 0],
  });
  chain.push('Neo4j');
  nodes.push({
    parameters: {
      jsCode: `const input = $('Input').first().json;
const res = $input.first().json;
if (res.errors?.length) throw new Error(res.errors.map((e) => e.code + ': ' + e.message).join(' | '));
const r0 = res.results[0];
const rows = r0.data.map((d) => Object.fromEntries(r0.columns.map((c, i) => [c, d.row[i]])));
${format}`,
    },
    id: id(), name: 'Formatér svar', type: 'n8n-nodes-base.code', typeVersion: 2, position: [X * chain.length, 0],
  });
  chain.push('Formatér svar');

  const connections = {};
  for (let i = 0; i < chain.length - 1; i++) {
    connections[chain[i]] = { main: [[{ node: chain[i + 1], type: 'main', index: 0 }]] };
  }
  return {
    name,
    nodes,
    connections,
    settings: { executionOrder: 'v1', callerPolicy: 'workflowsFromSameOwner' },
    pinData: {},
    _def: def,
  };
}

const tools = {
  // ---------------------------------------------------------------- graf (spike)
  '10_tool_opskrifter_med_tag': toolWorkflow({
    name: 'Tool · opskrifter_med_tag',
    description:
      'Graf-opslag: opskrifter der har et bestemt tag (fx "Vegetar", "Suppe", "Nem Hverdagsmad").\n' +
      'Tomt tag → liste over alle tags med antal opskrifter.\n\nInput: **tag** (tekst). Output: opskrifter med titel, tid og URL (kilde).',
    inputs: [{ name: 'tag' }],
    cypher: `WITH trim(coalesce($tag, '')) AS tag
CALL (tag) {
  WITH tag WHERE tag <> ''
  MATCH (r:Recipe)-[:HAS_TAG]->(t:Tag) WHERE toLower(t.name) = toLower(tag)
  RETURN 'opskrift' AS kind, r.title AS name, r.totalMinutes AS minutes, r.url AS url
  UNION ALL
  WITH tag WHERE tag = ''
  MATCH (t:Tag)<-[:HAS_TAG]-(r:Recipe)
  RETURN 'tag' AS kind, t.name AS name, count(r) AS minutes, null AS url
}
RETURN kind, name, minutes, url ORDER BY kind, name`,
    params: `{ tag: input.tag ?? '' }`,
    format: `const tag = input.tag ?? '';
if (!tag.trim()) {
  return [{ json: { tags: rows.map((r) => ({ tag: r.name, antalOpskrifter: r.minutes })) } }];
}
return [{ json: {
  tag,
  antal: rows.length,
  opskrifter: rows.map((r) => ({ titel: r.name, minutter: r.minutes, url: r.url })),
  kilde: 'Neo4j: (Recipe)-[:HAS_TAG]->(Tag)',
  note: rows.length ? undefined : 'Ingen opskrifter med det tag. Kald med tomt tag for at se de tags, der findes.',
} }];`,
  }),

  // ---------------------------------------------------------------- vektor + graf-filtre (hybrid)
  '11_tool_search_recipes': toolWorkflow({
    name: 'Tool · search_recipes',
    description:
      'Hybrid søgning: vektorsøgning på opskrifternes chunks (profil, ingredienser, tips, fremgangsmåde) med ' +
      '**nomic-embed-text**, samlet pr. opskrift (bedste chunk-score), kombineret med graf-filtre i samme Cypher-query.\n\n' +
      'Input: **query** (fri tekst, fx "noget cremet med kylling"), **maxMinutes** (valgfri, tal), **tag** (valgfri, et eller flere tags ' +
      'adskilt af komma – opskriften skal have mindst ét, fx "Salat, Vegetar"), **excludeTag** (valgfri, komma-liste), **preferOffers** (valgfri, true = sortér efter antal ingredienser på tilbud), **k** (antal, standard 5).\n' +
      'Output: opskrifter med score, tid, tags, kort beskrivelse, URL (kilde), hvilken chunk der matchede og hvilke ingredienser der er på tilbud.',
    inputs: [
      { name: 'query', type: 'string' },
      { name: 'maxMinutes', type: 'number' },
      { name: 'tag', type: 'string' },
      { name: 'excludeTag', type: 'string' },
      { name: 'preferOffers', type: 'boolean' },
      { name: 'k', type: 'number' },
    ],
    embedField: 'query',
    cypher: `CALL db.index.vector.queryNodes('chunk_embedding', 250, $embedding) YIELD node, score
WITH node, score ORDER BY score DESC
MATCH (node)-[:CHUNK_OF]->(r:Recipe)
WITH r, collect({type: node.type, score: score})[0] AS best
WHERE ($maxMinutes IS NULL OR r.totalMinutes <= $maxMinutes)
  AND (size($tags) = 0 OR EXISTS { (r)-[:HAS_TAG]->(t:Tag) WHERE toLower(t.name) IN $tags })
  AND (size($excludeTags) = 0 OR NOT EXISTS { (r)-[:HAS_TAG]->(t:Tag) WHERE toLower(t.name) IN $excludeTags })
RETURN r.title AS titel, r.url AS url, round(best.score, 3) AS score, best.type AS matchendeChunk,
       r.totalMinutes AS minutter, r.servings AS portioner,
       COLLECT { MATCH (r)-[:HAS_TAG]->(t:Tag) RETURN t.name } AS tags,
       left(r.description, 220) AS beskrivelse,
       COLLECT { MATCH (r)-[:USES]->(i:Ingredient {pantry: false})<-[:IS_A]-(:Product)-[o:ON_OFFER]->(:Chain)
                 WHERE o.validTo >= date() RETURN DISTINCT i.name } AS ingredienserPaaTilbud
ORDER BY CASE WHEN $preferOffers THEN size(ingredienserPaaTilbud) ELSE 0 END DESC, score DESC
LIMIT $k`,
    params: `{
  embedding,
  maxMinutes: Number(input.maxMinutes) > 0 ? Math.round(Number(input.maxMinutes)) : null,
  tags: String(input.tag || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
  excludeTags: String(input.excludeTag || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
  k: Math.min(Math.max(Math.round(Number(input.k) || 5), 1), 15),
  preferOffers: input.preferOffers === true || input.preferOffers === 'true',
}`,
    format: `const filtre = [
  Number(input.maxMinutes) > 0 && 'maks. ' + Number(input.maxMinutes) + ' min',
  String(input.tag || '').trim() && 'mindst ét af tags: ' + input.tag,
  String(input.excludeTag || '').trim() && 'uden tags: ' + input.excludeTag,
  (input.preferOffers === true || input.preferOffers === 'true') && 'sorteret efter ingredienser på tilbud',
].filter(Boolean);
return [{ json: {
  query: input.query,
  filtre: filtre.length ? filtre : 'ingen',
  antal: rows.length,
  opskrifter: rows,
  kilde: 'Neo4j: vector index chunk_embedding (nomic-embed-text, cosine) + (Recipe)-[:HAS_TAG]->(Tag), Recipe.totalMinutes + aktive tilbud (Recipe)-[:USES]->(Ingredient)<-[:IS_A]-(Product)-[:ON_OFFER]->(Chain)',
  note: rows.length
    ? 'Score er semantisk lighed (0–1), ikke en garanti for relevans. Link altid til url.'
    : 'Ingen opskrifter matchede filtrene. Prøv uden maxMinutes/tag.',
} }];`,
  }),

  // ---------------------------------------------------------------- graf: detaljer om én opskrift
  '12_tool_get_recipe_details': toolWorkflow({
    name: 'Tool · get_recipe_details',
    description:
      'Graf-opslag: alle fakta om én opskrift – kategori, tags, ingredienser (med sektion, fx "Til servering"), tid, portioner, ' +
      'holdbarhed, om den kan fryses, tips og relaterede opskrifter ("Prøv også" = SEE_ALSO, begge retninger).\n\n' +
      'Input: **recipe** (URL eller titel – også del af titel). Output: fakta + URL (kilde). Fremgangsmåden returneres ikke – link til originalen.',
    inputs: [{ name: 'recipe', type: 'string' }],
    cypher: `WITH trim(coalesce($recipe, '')) AS q
MATCH (r:Recipe)
WHERE q <> '' AND (r.url = q OR toLower(r.title) CONTAINS toLower(q))
WITH r, q ORDER BY (r.url = q) DESC, (toLower(r.title) = toLower(q)) DESC, size(r.title) ASC
LIMIT 1
RETURN r.title AS titel, r.url AS url,
       COLLECT { MATCH (r)-[:IN_CATEGORY]->(c:Category) RETURN c.name }[0] AS kategori,
       COLLECT { MATCH (r)-[:HAS_TAG]->(t:Tag) RETURN t.name } AS tags,
       r.totalMinutes AS minutterIAlt, r.cookMinutes AS arbejdstid, r.servings AS portioner,
       r.shelfLife AS holdbarhed, r.freezable AS kanFryses,
       [i IN range(0, size(r.ingredientLines) - 1) |
         CASE WHEN r.ingredientSections[i] = '' THEN r.ingredientLines[i]
              ELSE r.ingredientLines[i] + ' (' + toLower(r.ingredientSections[i]) + ')' END] AS ingredienser,
       r.tips AS tips,
       COLLECT { MATCH (r)-[:SEE_ALSO]-(s:Recipe) RETURN DISTINCT s { titel: s.title, url: s.url } } AS relateredeOpskrifter`,
    params: `{ recipe: input.recipe ?? '' }`,
    format: `if (!rows.length) {
  return [{ json: { fundet: false, recipe: input.recipe,
    note: 'Ingen opskrift i databasen matcher. Brug search_recipes til at finde den rigtige titel eller URL.' } }];
}
return [{ json: { fundet: true, ...rows[0],
  kilde: 'Neo4j: Recipe + IN_CATEGORY, HAS_TAG, SEE_ALSO. Originalopskrift: ' + rows[0].url } }];`,
  }),

  // ---------------------------------------------------------------- graf: tilbud på opskrifternes ingredienser
  '13_tool_find_offers': toolWorkflow({
    name: 'Tool · find_offers',
    description:
      'Graf-opslag: hvilke ingredienser i én eller flere opskrifter er på tilbud lige nu (Rema 1000, Netto, SuperBrugsen), ' +
      'via (Recipe)-[:USES]->(Ingredient)<-[:IS_A]-(Product)-[:ON_OFFER]->(Chain). Udløbne tilbud ignoreres.\n' +
      'Beregner besparelsen pr. kæde for HELE indkøbet og anbefaler én butik (Jacobs præference); en ekstra butik foreslås kun ved ≥ 50 kr. ekstra besparelse.\n\n' +
      'Input: **recipes** (URL\'er eller titler adskilt af komma). Output: tilbud pr. opskrift + kædeoversigt + anbefaling, med tilbudsperiode (kilde: Prej).',
    inputs: [{ name: 'recipes', type: 'string' }],
    cypher: `WITH [x IN split(coalesce($recipes, ''), ',') | trim(x)] AS qs
UNWIND qs AS q
MATCH (r:Recipe) WHERE q <> '' AND (r.url = q OR toLower(r.title) CONTAINS toLower(q))
WITH DISTINCT r
MATCH (r)-[u:USES]->(i:Ingredient {pantry: false})
OPTIONAL MATCH (i)<-[:IS_A]-(p:Product)-[o:ON_OFFER]->(ch:Chain) WHERE o.validTo >= date()
WITH r, i, u, collect(CASE WHEN p IS NULL THEN null ELSE {
  kaede: ch.slug, kaedeNavn: ch.name, produkt: p.name, stoerrelse: p.quantityLabel,
  pris: o.price, normalpris: o.normalPrice, gyldigTil: toString(o.validTo)} END) AS tilbud
RETURN r.title AS opskrift, r.url AS url, i.name AS ingrediens, u.raw AS linje, tilbud
ORDER BY opskrift, ingrediens`,
    params: `{ recipes: input.recipes ?? '' }`,
    format: `if (!rows.length) {
  return [{ json: { fundet: false, recipes: input.recipes,
    note: 'Ingen af opskrifterne blev fundet. Brug url eller titel fra search_recipes.' } }];
}
const kr = (oere) => oere == null ? null : Math.round(oere) / 100;
const opskrifter = {};
const perKaede = {}; // kaede -> ingrediens -> billigste tilbud
let gyldigTil = null;
for (const r of rows) {
  opskrifter[r.url] ??= { opskrift: r.opskrift, url: r.url, ingredienser: 0, paaTilbud: [] };
  opskrifter[r.url].ingredienser++;
  if (!r.tilbud.length) continue;
  const best = {};
  for (const t of r.tilbud) {
    if (!best[t.kaede] || t.pris < best[t.kaede].pris) best[t.kaede] = t;
    perKaede[t.kaede] ??= { navn: t.kaedeNavn, ingredienser: {} };
    const cur = perKaede[t.kaede].ingredienser[r.ingrediens];
    if (!cur || t.pris < cur.pris) perKaede[t.kaede].ingredienser[r.ingrediens] = t;
    if (!gyldigTil || t.gyldigTil < gyldigTil) gyldigTil = t.gyldigTil;
  }
  opskrifter[r.url].paaTilbud.push({
    ingrediens: r.ingrediens, linje: r.linje,
    tilbud: Object.values(best).map((t) => ({ kaede: t.kaedeNavn, produkt: t.produkt, stoerrelse: t.stoerrelse,
      pris: kr(t.pris), normalpris: kr(t.normalpris), gyldigTil: t.gyldigTil })),
  });
}
const kaeder = Object.entries(perKaede).map(([slug, k]) => {
  const items = Object.entries(k.ingredienser);
  const besparelse = items.reduce((a, [, t]) => a + (t.normalpris ? t.normalpris - t.pris : 0), 0);
  return { kaede: k.navn, slug, ingredienserPaaTilbud: items.length, ingredienser: items.map(([i]) => i),
    samletBesparelseKr: kr(besparelse) };
}).sort((a, b) => b.samletBesparelseKr - a.samletBesparelseKr || b.ingredienserPaaTilbud - a.ingredienserPaaTilbud);
let anbefaling = 'Ingen ingredienser er på tilbud i Rema 1000, Netto eller SuperBrugsen lige nu.';
let ekstraButik = null;
if (kaeder.length) {
  const b = kaeder[0];
  anbefaling = 'Handl i ' + b.kaede + ': ' + b.ingredienserPaaTilbud + ' ingrediens(er) på tilbud, ca. ' + b.samletBesparelseKr + ' kr sparet.';
  for (const k of kaeder.slice(1)) {
    const ekstra = Object.entries(perKaede[k.slug].ingredienser)
      .filter(([i]) => !perKaede[b.slug].ingredienser[i])
      .reduce((a, [, t]) => a + (t.normalpris ? t.normalpris - t.pris : 0), 0);
    if (ekstra >= 5000) { ekstraButik = 'Det kan betale sig også at handle i ' + k.kaede + ' (ca. ' + kr(ekstra) + ' kr ekstra besparelse).'; break; }
  }
}
return [{ json: {
  fundet: true,
  opskrifter: Object.values(opskrifter),
  kaeder,
  anbefaling,
  ekstraButik: ekstraButik || 'Ikke værd at tage en ekstra butik med (under 50 kr ekstra besparelse).',
  tilbudGyldigTil: gyldigTil,
  kilde: 'Prej API (hentet til Neo4j), (Recipe)-[:USES]->(Ingredient)<-[:IS_A]-(Product)-[:ON_OFFER]->(Chain). Priser er pr. pakke, ikke pr. opskriftsmængde. Basisvarer (salt, olie, krydderier) er ikke med.',
} }];`,
  }),
};

module.exports = { toolWorkflow, tools };

if (require.main === module) {
  for (const [file, wf] of Object.entries(tools)) {
    const { _def, ...json } = wf;
    const out = path.join(root, 'n8n', file + '.json');
    fs.writeFileSync(out, JSON.stringify(json, null, 2));
    console.log('Skrev', out);
  }
}
