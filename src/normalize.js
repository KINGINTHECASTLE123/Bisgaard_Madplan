// Normalisering af ingredienslinjer med en LLM (Claude via Anthropic Messages API).
// Bruges både af n8n-workflow 02 (indsat i Code-noder af src/build_workflow_02.js) og af
// scripts/normalize_dev.mjs (test/evaluering uden n8n). Ren logik – ingen netværkskald her.

const MODEL = 'claude-haiku-5-5';

// ---------- Pass 1: én opskrift → strukturerede ingredienser ----------
const NORMALIZE_SYSTEM = `Du normaliserer ingredienslinjer fra danske opskrifter, så de kan gemmes i en grafdatabase og senere matches mod supermarkedstilbud.

For hver linje skal du returnere én eller flere ingredienser via værktøjet record_ingredients.

REGLER FOR "name"
- Dansk, små bogstaver, ental, uden mængde, mærke, fedtprocent eller tilberedning.
- Brug det generiske varenavn, man ville lede efter i et supermarked: "500 g porre, i ringe" → "porre"; "3 fed hvidløg, finthakket" → "hvidløg"; "1 dl cremefraiche 18 %" → "cremefraiche"; "4 gulerødder, groftrevet" → "gulerod"; "1 kg kartofler" → "kartoffel".
- Forarbejdede/konserverede varer beholder varenavnet: "1 dåse hakkede tomater" → "hakkede tomater"; "tomatpuré", "kokosmælk", "grønne linser" (dåse/tørrede linser er stadig "grønne linser").
- Behold ord der ændrer hvilken vare man køber: "hakket oksekød" ≠ "hakket svinekød"; "røde linser" ≠ "grønne linser".
- Krydderier og krydderurter der findes både friske og tørrede/stødte, skal have forskellige navne: "frisk timian" → "timian", men "tørret timian" → "tørret timian"; "stødt koriander" → "stødt koriander", men "1 bundt koriander" → "koriander"; "stødt ingefær" ≠ "ingefær".
- Brug dansk retskrivning og ét ord, hvor det er normalt: "fiskesauce" (ikke fishsauce), "basmatiris", "babyspinat", "kokosmælk".
- Smagsvarianter skrives som "<vare> med <smag>": "hvidløgsflødeost" → "flødeost med hvidløg".
- En linje med flere varer deles op: "salt og friskkværnet peber" → "salt" og "peber"; "25 g smør og 1 spsk olivenolie" → "smør" og "olivenolie". Mængde, enhed og tilberedning hører kun til den vare, de står ved ("friskkværnet" hører til peber, ikke salt).
- Kogevand, lage, saft eller rester fra en anden ingrediens i opskriften er ikke noget man køber: brug "vand" (pantry true), fx "3 dl kogevand fra kartoflerne" → "vand"; "1 spsk lage fra cornichonerne" → "vand".
- Er linjen ikke en ingrediens (fx en henvisning eller overskrift), så returnér intet for den.

ANDRE FELTER
- line: linjens nummer (0-baseret) fra input.
- amount: tal (½ → 0.5, "1-2" → 1.5), null hvis ingen mængde.
- unit: g, kg, ml, dl, l, tsk, spsk, stk, fed, dåse, pakke, bundt, håndfuld, skive, knivspids eller null. Brug "stk" for hele ting som løg og æg, når der ikke står en enhed.
- prep: tilberedning som tekst ("finthakket", "i ringe", "drænet og skyllet"), ellers null.
- optional: true hvis linjen siger "evt." eller "kan udelades".
- pantry: true for basisvarer man næsten altid har derhjemme og sjældent køber til en bestemt ret: salt, peber, vand, olie (olivenolie, rapsolie, neutral olie), sukker, hvedemel, majsstivelse, eddike, bagepulver, tørrede krydderier og tørrede krydderurter. Ellers false (fx smør, mælk, fløde, løg, hvidløg, bouillon, friske krydderurter).`;

const NORMALIZE_TOOL = {
  name: 'record_ingredients',
  description: 'Gem de normaliserede ingredienser for opskriften.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            line: { type: 'integer' },
            name: { type: 'string' },
            amount: { type: ['number', 'null'] },
            unit: { type: ['string', 'null'] },
            prep: { type: ['string', 'null'] },
            optional: { type: 'boolean' },
            pantry: { type: 'boolean' },
          },
          required: ['line', 'name', 'amount', 'unit', 'prep', 'optional', 'pantry'],
        },
      },
    },
    required: ['items'],
  },
};

function buildNormalizeRequest(recipe) {
  const lines = recipe.ingredientLines
    .map((l, i) => `${i}: ${l}${recipe.ingredientSections?.[i] ? `   [sektion: ${recipe.ingredientSections[i]}]` : ''}`)
    .join('\n');
  return {
    model: MODEL,
    max_tokens: 4000,
    system: NORMALIZE_SYSTEM,
    tools: [NORMALIZE_TOOL],
    tool_choice: { type: 'tool', name: 'record_ingredients' },
    messages: [{ role: 'user', content: `Opskrift: ${recipe.title}\nIngredienslinjer:\n${lines}` }],
  };
}

const clean = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

// Validerer modellens svar. Returnerer { uses, problems } – uses er klar til Neo4j.
function parseNormalizeResponse(resp, recipe) {
  const block = (resp?.content || []).find((c) => c.type === 'tool_use' && c.name === 'record_ingredients');
  if (!block) return { uses: [], problems: ['intet tool_use i svaret: ' + JSON.stringify(resp).slice(0, 300)] };
  const problems = [];
  const n = recipe.ingredientLines.length;
  const uses = [];
  for (const it of block.input.items || []) {
    const line = Number(it.line);
    const name = clean(it.name);
    if (!Number.isInteger(line) || line < 0 || line >= n) { problems.push(`ugyldig linje ${it.line} (${it.name})`); continue; }
    if (!name || /\d/.test(name)) { problems.push(`mistænkeligt navn "${it.name}" (linje ${line})`); continue; }
    uses.push({
      url: recipe.url,
      line,
      name,
      amount: typeof it.amount === 'number' && isFinite(it.amount) ? it.amount : null,
      unit: it.unit ? clean(it.unit) : null,
      prep: it.prep ? String(it.prep).trim() : null,
      optional: !!it.optional,
      pantry: !!it.pantry,
      section: recipe.ingredientSections?.[line] || null,
      raw: recipe.ingredientLines[line],
    });
  }
  const covered = new Set(uses.map((u) => u.line));
  for (let i = 0; i < n; i++) if (!covered.has(i)) problems.push(`linje ${i} uden ingrediens: "${recipe.ingredientLines[i]}"`);
  return { uses, problems };
}

// ---------- Pass 2: saml synonymer på tværs af opskrifter ----------
const CANON_SYSTEM = `Du får en liste over ingrediensnavne fra en samling danske opskrifter (med antal forekomster).
Find navne der betegner SAMME vare man køber i supermarkedet, men er skrevet forskelligt (synonymer, stavemåder, ental/flertal, overflødige ord), og angiv hvilket navn de skal slås sammen til.

REGLER
- "to" skal være et navn fra listen. Vælg det mest almindelige/generiske navn.
- Slå IKKE forskellige varer sammen. Eksempler på FORKERTE sammenlægninger:
  hakket oksekød ≠ hakket svinekød; piskefløde ≠ madlavningsfløde; røde løg ≠ løg; cherrytomat ≠ tomat;
  stødt koriander ≠ koriander; tørret timian ≠ timian; syltede agurker ≠ agurk; flåede tomater ≠ hakkede tomater;
  penne ≠ spaghetti ≠ pastaskruer ≠ "pasta" (forskellige pastaformer er forskellige varer); grønne linser ≠ røde linser.
- Eksempler på RIGTIGE sammenlægninger: "oksekød, hakket" → "hakket oksekød"; "frosne ærter" → "ærter"; "peberfrugt, rød" → "rød peberfrugt"; "gulerødder" → "gulerod".
- Returnér kun navne der skal ændres. Er du i tvivl, så lad navnet være.`;

const CANON_TOOL = {
  name: 'record_merges',
  description: 'Gem sammenlægninger af ingrediensnavne.',
  input_schema: {
    type: 'object',
    properties: {
      merges: {
        type: 'array',
        items: {
          type: 'object',
          properties: { from: { type: 'string' }, to: { type: 'string' }, reason: { type: 'string' } },
          required: ['from', 'to'],
        },
      },
    },
    required: ['merges'],
  },
};

function buildCanonRequest(nameCounts) {
  const list = Object.entries(nameCounts).sort((a, b) => a[0].localeCompare(b[0], 'da'))
    .map(([name, c]) => `${name} (${c})`).join('\n');
  return {
    model: MODEL,
    max_tokens: 8000,
    system: CANON_SYSTEM,
    tools: [CANON_TOOL],
    tool_choice: { type: 'tool', name: 'record_merges' },
    messages: [{ role: 'user', content: `Ingrediensnavne:\n${list}` }],
  };
}

// Deterministisk kontrol oven på LLM'en: ord der ændrer varen må ikke forsvinde/opstå ved en sammenlægning,
// og forskellige pastaformer må ikke slås sammen (Claude gjorde begge dele i første evaluering, 29/10).
const QUALIFIERS = ['stødt', 'tørret', 'tørrede', 'syltet', 'syltede', 'flåede', 'røget', 'røgede', 'frisk', 'friske',
  'rød', 'røde', 'grøn', 'grønne', 'gul', 'gule', 'hvid', 'hvide', 'sort', 'sorte'];
const PASTA = ['pasta', 'spaghetti', 'penne', 'pastaskruer', 'fusilli', 'tagliatelle', 'lasagneplader', 'makaroni', 'farfalle', 'rigatoni', 'tortellini'];
function levenshtein(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// Synonymer skal ligne hinanden: fælles ord, fælles begyndelse (≥ 5 tegn) eller få bogstavers forskel.
// Afviser fx "edamamebønner → haricots verts" (kørsel 3, 29/10), men tillader "cherrytomater → cherrytomat".
function looksAlike(from, to) {
  const toks = (s) => s.split(/[\s,]+/).filter((t) => t.length > 2);
  const a = toks(from), b = toks(to);
  if (a.some((t) => b.includes(t))) return true;
  const f = from.replace(/[\s,]/g, ''), t = to.replace(/[\s,]/g, '');
  let p = 0; while (p < f.length && f[p] === t[p]) p++;
  if (p >= 5) return true;
  return levenshtein(f, t) <= 3;
}
function mergeAllowed(from, to) {
  const w = (s) => new Set(s.split(/[\s,]+/).filter(Boolean));
  const a = w(from), b = w(to);
  for (const q of QUALIFIERS) if (a.has(q) !== b.has(q)) return `"${q}" kun på den ene side`;
  const pa = PASTA.filter((p) => from.includes(p)), pb = PASTA.filter((p) => to.includes(p));
  if (pa.length && pb.length && pa.join() !== pb.join()) return 'forskellige pastaformer';
  const flavor = (s) => (s.split(' med ')[1] || '').trim();
  if (flavor(from) !== flavor(to) && flavor(from) && flavor(to)) return 'forskellig smag ("med …")';
  if (!looksAlike(from, to)) return 'navnene ligner ikke hinanden';
  return null;
}

// Returnerer et map from→to, kun med gyldige sammenlægninger (to findes, ingen kæder/cykler, mergeAllowed).
function parseCanonResponse(resp, nameCounts) {
  const block = (resp?.content || []).find((c) => c.type === 'tool_use' && c.name === 'record_merges');
  const map = {};
  const rejected = [];
  for (const m of block?.input?.merges || []) {
    const from = clean(m.from), to = clean(m.to);
    if (!(from in nameCounts) || !(to in nameCounts) || from === to) { rejected.push({ ...m, why: 'ukendt navn' }); continue; }
    const why = mergeAllowed(from, to);
    if (why) { rejected.push({ ...m, why }); continue; }
    map[from] = to;
  }
  // Følg kæder a→b→c, drop cykler
  for (const k of Object.keys(map)) {
    const seen = new Set([k]);
    let t = map[k];
    while (map[t] && !seen.has(t)) { seen.add(t); t = map[t]; }
    if (seen.has(t)) delete map[k]; else map[k] = t;
  }
  return { map, rejected };
}

// Anvend sammenlægning + saml Ingredient-noder (pantry = flertal af forekomsterne)
function applyCanon(uses, map) {
  const out = uses.map((u) => ({ ...u, name: map[u.name] || u.name }));
  const stats = {};
  for (const u of out) {
    stats[u.name] ??= { name: u.name, n: 0, pantry: 0 };
    stats[u.name].n++;
    if (u.pantry) stats[u.name].pantry++;
  }
  const ingredients = Object.values(stats).map((s) => ({ name: s.name, pantry: s.pantry * 2 > s.n, uses: s.n }));
  return { uses: out, ingredients };
}

const WRITE_STATEMENTS = [
  // 1) Fjern gamle USES for de opskrifter, der normaliseres nu (idempotent genkørsel)
  `MATCH (r:Recipe)-[u:USES]->() WHERE r.url IN $urls DELETE u`,
  // 2) Ingredient-noder
  `UNWIND $ingredients AS i
MERGE (n:Ingredient {name: i.name})
SET n.pantry = i.pantry, n.normalizedBy = $model, n.normalizedAt = datetime()`,
  // 3) USES-relationer med mængde, enhed, tilberedning, sektion og den rå linje
  `UNWIND $uses AS u
MATCH (r:Recipe {url: u.url})
MATCH (n:Ingredient {name: u.name})
CREATE (r)-[:USES {line: u.line, amount: u.amount, unit: u.unit, prep: u.prep, optional: u.optional,
                   section: u.section, raw: u.raw}]->(n)`,
  // 4) Ryd forældreløse Ingredient-noder (afledte data – ingen USES og ingen produkter koblet på)
  `MATCH (n:Ingredient) WHERE NOT (n)<-[:USES]-() AND NOT (n)<-[:IS_A]-() DETACH DELETE n
RETURN count(*) AS slettet`,
];

if (typeof module !== 'undefined') {
  module.exports = {
    MODEL, NORMALIZE_SYSTEM, NORMALIZE_TOOL, CANON_SYSTEM, CANON_TOOL, WRITE_STATEMENTS,
    buildNormalizeRequest, parseNormalizeResponse, buildCanonRequest, parseCanonResponse, applyCanon, clean, mergeAllowed,
  };
}
