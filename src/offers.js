// Tilbud fra Prej → (Product)-[:ON_OFFER]->(Chain) og (Product)-[:IS_A]->(Ingredient).
// Matchningen af produkter til ingredienser laves af Claude (tvunget tool use) + deterministisk validering.
// Bruges af n8n-workflow 03 (indsat i Code-noder af src/build_workflow_03.js) og scripts/offers_dev.mjs.

const MATCH_MODEL = 'claude-haiku-5-5';
const CHAINS = ['rema1000', 'netto', 'superbrugsen'];
const MATCH_BATCH = 60;

// Prej-sider (svar fra /v1/offers) → flad, dubletfri liste af tilbud
function flattenOffers(pages) {
  const seen = new Set();
  const out = [];
  for (const page of pages) {
    for (const o of page.offers || []) {
      const key = o.product_id + '|' + o.chain_slug;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        productId: o.product_id,
        name: o.name,
        brand: o.brand || null,
        quantity: o.quantity ?? null,
        unit: o.unit || null,
        quantityLabel: o.quantity_label || null,
        chain: o.chain_slug,
        chainName: o.chain_name,
        price: o.price,
        normalPrice: o.normal_price ?? null,
        discountPct: o.discount_pct ?? null,
        validFrom: o.offer_starts || null,
        validTo: o.offer_ends,
        source: o.source,
        asOf: page.as_of || null,
      });
    }
  }
  return out;
}

const MATCH_SYSTEM = `Du kobler supermarkedsprodukter på tilbud til ingredienser i en samling opskrifter.

For hvert produkt: angiv den ingrediens fra listen, som produktet KAN KØBES SOM til madlavning, eller null.

REGLER
- Kun når produktet ER ingrediensen (råvare/basisvare man laver mad med): "Salling Løg 1 kg" → "løg"; "Mutti Hakkede Tomater 400 g" → "hakkede tomater"; "Lurpak Smør Saltet" → "smør"; "Brunchy Bacon i skiver" → "bacon".
- IKKE færdigretter, pålæg, snacks eller produkter der blot indeholder ingrediensen: "Mou Kartoffel- og Porresuppe" → null (ikke porre); "Aldoni Pizza m. champignon" → null; "Kyllingepølse i skiver" → null (ikke kylling); "Leverpostej Bacon-Peber" → null; "Flødeis" → null (ikke fløde).
- Færdigvarer og erstatninger er ikke råvaren: "Risengrød" → null (ikke ris); "Cremefine Madlavning" → null (ikke cremefraiche); "Margarine" → null (ikke smør); "Yoghurt naturel" → null (ikke græsk yoghurt, medmindre der står græsk).
- Friske og syltede/konserverede varer er forskellige: "Rødbeder Økologisk" (friske) → null for "syltet rødbede"; "Helbladet spinat" → "spinat", ikke "babyspinat".
- Varianten skal passe: "Philadelphia Smøreost naturel" må gerne → "flødeost", men ikke → "flødeost med hvidløg"; "Røget laks" → null hvis kun "laks" findes (og omvendt). Hakket oksekød ≠ hakket svinekød.
- Brug kun navne fra ingredienslisten, stavet nøjagtigt som der. Er du i tvivl, så null.`;

const MATCH_TOOL = {
  name: 'record_matches',
  description: 'Gem koblinger mellem produkter og ingredienser.',
  input_schema: {
    type: 'object',
    properties: {
      matches: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            i: { type: 'integer', description: 'produktets nummer' },
            ingredient: { type: ['string', 'null'] },
          },
          required: ['i', 'ingredient'],
        },
      },
    },
    required: ['matches'],
  },
};

function batchOffers(offers, size = MATCH_BATCH) {
  // Unikke produkter (samme produkt kan være på tilbud i flere kæder)
  const products = [...new Map(offers.map((o) => [o.productId, o])).values()];
  const batches = [];
  for (let i = 0; i < products.length; i += size) batches.push(products.slice(i, i + size));
  return batches;
}

function buildMatchRequest(products, ingredientNames) {
  const plist = products.map((p, i) => `${i}: ${p.name}${p.brand ? ' | ' + p.brand : ''}${p.quantity ? ' | ' + p.quantity + (p.unit || '') : ''}`).join('\n');
  return {
    model: MATCH_MODEL,
    max_tokens: 6000,
    system: MATCH_SYSTEM,
    tools: [MATCH_TOOL],
    tool_choice: { type: 'tool', name: 'record_matches' },
    messages: [{
      role: 'user',
      content: `Ingrediensliste:\n${ingredientNames.join(', ')}\n\nProdukter på tilbud:\n${plist}`,
    }],
  };
}

function parseMatchResponse(resp, products, ingredientNames) {
  const valid = new Set(ingredientNames);
  const block = (resp?.content || []).find((c) => c.type === 'tool_use' && c.name === 'record_matches');
  const matches = [];
  const rejected = [];
  for (const m of block?.input?.matches || []) {
    const p = products[m.i];
    if (!p || !m.ingredient) continue;
    const ing = String(m.ingredient).trim().toLowerCase();
    if (!valid.has(ing)) { rejected.push({ product: p.name, ingredient: m.ingredient, why: 'ikke i ingredienslisten' }); continue; }
    matches.push({ productId: p.productId, ingredient: ing, product: p.name });
  }
  return { matches, rejected, ok: !!block };
}

const WRITE_STATEMENTS = [
  // 1) Kæder
  `UNWIND $chains AS c MERGE (ch:Chain {slug: c.slug}) SET ch.name = c.name`,
  // 2) Produkter + tilbud (en tilbudsrelation pr. produkt, kæde og slutdato – historik bevares)
  `UNWIND $offers AS o
MERGE (p:Product {id: o.productId})
SET p.name = o.name, p.brand = o.brand, p.quantity = o.quantity, p.unit = o.unit, p.quantityLabel = o.quantityLabel
WITH p, o
MATCH (ch:Chain {slug: o.chain})
MERGE (p)-[r:ON_OFFER {validTo: date(o.validTo)}]->(ch)
SET r.price = o.price, r.normalPrice = o.normalPrice, r.discountPct = o.discountPct,
    r.validFrom = CASE WHEN o.validFrom IS NULL THEN null ELSE date(o.validFrom) END,
    r.source = o.source, r.asOf = date(o.asOf), r.fetchedAt = datetime()`,
  // 3) Produkt → ingrediens (erstat tidligere kobling for de produkter, der er matchet nu)
  `MATCH (p:Product)-[old:IS_A]->() WHERE p.id IN $matchedProductIds DELETE old`,
  `UNWIND $matches AS m
MATCH (p:Product {id: m.productId})
MATCH (i:Ingredient {name: m.ingredient})
MERGE (p)-[r:IS_A]->(i) SET r.matchedBy = $model, r.matchedAt = datetime()`,
  // 4) Opsummering
  `MATCH (p:Product)-[o:ON_OFFER]->(ch:Chain) WHERE o.validTo >= date()
OPTIONAL MATCH (p)-[:IS_A]->(i:Ingredient)
RETURN ch.slug AS kaede, count(DISTINCT p) AS aktiveTilbud, count(DISTINCT i) AS ingredienserMedTilbud ORDER BY kaede`,
];

if (typeof module !== 'undefined') {
  module.exports = { MATCH_MODEL, CHAINS, MATCH_BATCH, MATCH_SYSTEM, MATCH_TOOL, WRITE_STATEMENTS,
    flattenOffers, batchOffers, buildMatchRequest, parseMatchResponse };
}
