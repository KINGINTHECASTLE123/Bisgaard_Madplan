// Ren logik til n8n-Code-noden "Byg opskrift og chunks".
// Input: felterne fra HTML-noden "Udtræk felter" + opskriftens URL.
// Output: { recipe, chunks } eller null hvis siden ikke er en opskrift.

function decodeEntities(s) {
  const named = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    aelig: 'æ', oslash: 'ø', aring: 'å', AElig: 'Æ', Oslash: 'Ø', Aring: 'Å',
    frac12: '½', frac14: '¼', frac34: '¾', ndash: '–', mdash: '—',
    rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', deg: '°',
  };
  return String(s ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z][a-z0-9]*);/gi, (m, n) => (n in named ? named[n] : m));
}

function htmlToText(html) {
  return decodeEntities(
    String(html ?? '')
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|li|h[1-6]|div)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function clean(s) {
  return decodeEntities(String(s ?? '')).replace(/\s+/g, ' ').trim();
}

// "PT1H15M" -> 75, "30 min" -> 30, "1 time 15 min" -> 75
function toMinutes(...candidates) {
  for (const raw of candidates) {
    const s = clean(raw);
    if (!s) continue;
    const iso = /^P(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?/i.exec(s);
    if (iso && (iso[1] || iso[2])) return Number(iso[1] || 0) * 60 + Number(iso[2] || 0);
    const h = /(\d+)\s*(?:t|time|timer|h)\b/i.exec(s);
    const m = /(\d+)\s*(?:m|min|minutter)\b/i.exec(s);
    if (h || m) return Number(h?.[1] || 0) * 60 + Number(m?.[1] || 0);
  }
  return null;
}

// Gennemgår <li>-elementerne i en eller flere ul.ingredientlist og holder styr på
// sektionsoverskrifter som "Til servering".
function parseIngredients(listHtmls) {
  const lists = Array.isArray(listHtmls) ? listHtmls : listHtmls ? [listHtmls] : [];
  const out = [];
  let section = '';
  for (const html of lists) {
    const re = /<li\b([^>]*)>([\s\S]*?)<\/li>/gi;
    let m;
    while ((m = re.exec(String(html)))) {
      const attrs = m[1];
      const text = clean(m[2].replace(/<[^>]+>/g, ' '));
      if (!text) continue;
      if (/ingredient-header/.test(attrs)) {
        section = text.replace(/:$/, '');
      } else {
        out.push({ text, section });
      }
    }
  }
  return out;
}

// Deler en lang tekst på afsnit, så ingen chunk bliver over maxChars.
function splitParagraphs(text, maxChars = 1200) {
  const parts = [];
  let cur = '';
  for (const p of text.split('\n')) {
    if (cur && (cur + '\n' + p).length > maxChars) {
      parts.push(cur);
      cur = p;
    } else {
      cur = cur ? cur + '\n' + p : p;
    }
  }
  if (cur) parts.push(cur);
  return parts;
}

// Elementet med itemprop="description" indeholder hele opskriftsboksen (tid, ingredienser,
// fremgangsmåde, knapper). Kun intro-teksten før boksen er beskrivelsen; "Prøv også:"-links fjernes.
function cleanDescription(html) {
  const intro = String(html ?? '').split(/<div[^>]*class="(?:clear|post-recipe)"/i)[0];
  return htmlToText(intro)
    .split('\n')
    .filter((l) => !/^(prøv|se) også/i.test(l))
    .join(' ')
    .trim();
}

// ["<span ...>Holdbarhed</span><strong>2-3 dage</strong>", ...] -> { Holdbarhed: '2-3 dage', ... }
function parseStats(statHtmls) {
  const out = {};
  for (const h of [].concat(statHtmls || [])) {
    const m = /recipe-stat-label[^>]*>([\s\S]*?)<\/span>[\s\S]*?<strong[^>]*>([\s\S]*?)<\/strong>/i.exec(String(h));
    if (m) out[clean(m[1].replace(/<[^>]+>/g, ''))] = clean(m[2].replace(/<[^>]+>/g, ''));
  }
  return out;
}

// "<li>tip</li>..." -> ['tip', ...]
function parseListItems(html) {
  return [...String(html ?? '').matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((m) => clean(m[1].replace(/<[^>]+>/g, ' ')))
    .filter(Boolean);
}

// ['<a href="https://www.valdemarsro.dk/x/">Titel</a>', ...] -> [{ url, title }]
function parseLinks(htmls, self) {
  const seen = new Set();
  const out = [];
  for (const h of [].concat(htmls || [])) {
    const m = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(String(h));
    if (!m) continue;
    const url = m[1].replace(/^\/\//, 'https://');
    if (url === self || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, title: clean(m[2].replace(/<[^>]+>/g, '')) });
  }
  return out;
}

function buildRecipe(d, url) {
  const title = clean(d.title);
  const ingredients = parseIngredients(d.ingredientLists);
  const instructions = htmlToText(d.instructionsHtml);
  if (!title || ingredients.length === 0) return null;

  const category = clean(d.category) || null;
  const tags = [...new Set(
    clean(d.keywords).split(',').map((t) => t.trim()).filter(Boolean)
  )];
  const servingsMatch = /\d+/.exec(clean(d.servings));
  const stats = parseStats(d.stats);
  const tips = parseListItems(d.tipsHtml);
  const serveWith = parseLinks(d.serveWithHtml, url);
  const seeAlso = parseLinks(d.seeAlsoHtml, url);
  const freezeRaw = (stats['Kan fryses'] || '').toLowerCase();

  const recipe = {
    title,
    description: cleanDescription(d.description),
    category,
    tags,
    servings: servingsMatch ? Number(servingsMatch[0]) : null,
    totalMinutes: toMinutes(d.totalTimeContent, d.totalTimeText),
    cookMinutes: toMinutes(d.cookTimeContent, d.cookTimeText),
    image: clean(d.image) || null,
    shelfLife: stats['Holdbarhed'] || null,
    freezable: freezeRaw === 'ja' ? true : freezeRaw === 'nej' ? false : null,
    tips,
    serveWith: serveWith.map((l) => l.url),
    serveWithTitles: serveWith.map((l) => l.title),
    seeAlso: seeAlso.map((l) => l.url),
    seeAlsoTitles: seeAlso.map((l) => l.title),
    ingredientLines: ingredients.map((i) => i.text),
    ingredientSections: ingredients.map((i) => i.section),
    instructions,
  };

  // Chunking efter opskriftens egen struktur: profil, ingredienser, fremgangsmåde.
  const meta = [
    recipe.category && `Kategori: ${recipe.category}.`,
    tags.length && `Tags: ${tags.join(', ')}.`,
    recipe.totalMinutes && `Tid i alt: ${recipe.totalMinutes} minutter.`,
    recipe.servings && `Portioner: ${recipe.servings}.`,
    recipe.shelfLife && `Holdbarhed: ${recipe.shelfLife}.`,
    recipe.freezable !== null && `Kan fryses: ${recipe.freezable ? 'ja' : 'nej'}.`,
  ].filter(Boolean).join(' ');

  const ingredientText = ingredients
    .map((i) => (i.section ? `${i.text} (${i.section.toLowerCase()})` : i.text))
    .join('; ');

  const chunks = [
    { type: 'profil', text: `${title}. ${recipe.description} ${meta}`.trim() },
    { type: 'ingredienser', text: `Ingredienser til ${title}: ${ingredientText}.` },
  ];
  if (tips.length) {
    chunks.push({ type: 'tips', text: `Tips til ${title}: ${tips.join(' ')}` });
  }
  splitParagraphs(instructions).forEach((part, i, all) => {
    chunks.push({
      type: all.length > 1 ? `fremgangsmaade-${i + 1}` : 'fremgangsmaade',
      text: `Fremgangsmåde for ${title}: ${part}`,
    });
  });

  return { recipe, chunks };
}

if (typeof module !== 'undefined') {
  module.exports = { buildRecipe, cleanDescription, parseStats, parseListItems, parseLinks, parseIngredients, toMinutes, htmlToText, decodeEntities };
}
