// Tester parsing mod gemte sider i data/raw/*.html uden n8n.
// Efterligner HTML-noden "Udtræk felter" med cheerio (samme bibliotek som n8n bruger)
// og kører derefter buildRecipe() fra src/build_recipe.js.
// Kør:  npm test            (alle filer i data/raw)
//       npm test -- porresuppe   (kun filer der matcher)
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { buildRecipe } = require('./build_recipe');
const { EXTRACTION_VALUES } = require('./build_workflow');

const rawDir = path.join(__dirname, '..', 'data', 'raw');
const filter = process.argv[2] || '';

function extract(html) {
  const $ = cheerio.load(html);
  const get = (el, v) =>
    v.returnValue === 'html' ? $(el).html()
      : v.returnValue === 'attribute' ? $(el).attr(v.attribute)
        : $(el).text();
  const out = {};
  for (const v of EXTRACTION_VALUES) {
    const els = $(v.cssSelector);
    const trim = (x) => (typeof x === 'string' ? x.trim() : x);
    out[v.key] = v.returnArray ? els.toArray().map((e) => trim(get(e, v))) : trim(get(els.first(), v));
  }
  return out;
}

const files = fs.readdirSync(rawDir).filter((f) => f.endsWith('.html') && f.includes(filter));
let fail = 0;
for (const f of files) {
  const html = fs.readFileSync(path.join(rawDir, f), 'utf8');
  const url = (/<link rel="canonical" href="([^"]+)"/.exec(html) || [])[1] || f;
  const built = buildRecipe(extract(html), url);
  if (!built) { console.log(`✗ ${f}: ingen opskrift fundet`); fail++; continue; }
  const { recipe: r, chunks } = built;
  const problems = [];
  if (r.description.length > 1500) problems.push(`description er ${r.description.length} tegn`);
  if (/Ingredienser|Fremgangsmåde|Tid i alt|Prøv også/.test(r.description)) problems.push('description indeholder opskriftsboksen');
  if (!r.totalMinutes) problems.push('mangler tid');
  if (!r.servings) problems.push('mangler portioner');
  if (!r.category) problems.push('mangler kategori');
  console.log(`${problems.length ? '✗' : '✓'} ${r.title}  (${url})`);
  console.log(`   kategori=${r.category} tags=[${r.tags.join(', ')}] tid=${r.totalMinutes} arbejde=${r.cookMinutes} pers=${r.servings} holdbar=${r.shelfLife} fryses=${r.freezable}`);
  console.log(`   ingredienser=${r.ingredientLines.length} tips=${r.tips.length} serveWith=${r.serveWith.length} seeAlso=${r.seeAlso.length}`);
  console.log(`   chunks: ${chunks.map((c) => `${c.type}(${c.text.length})`).join(', ')}`);
  if (process.env.VERBOSE) console.log(JSON.stringify(built, null, 2));
  if (problems.length) { console.log('   PROBLEMER: ' + problems.join('; ')); fail++; }
}
console.log(`\n${files.length - fail}/${files.length} ok`);
process.exit(fail ? 1 : 0);
