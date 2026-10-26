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

  const recipe = {
    title,
    description: clean(d.description),
    category,
    tags,
    servings: servingsMatch ? Number(servingsMatch[0]) : null,
    totalMinutes: toMinutes(d.totalTimeContent, d.totalTimeText),
    cookMinutes: toMinutes(d.cookTimeContent, d.cookTimeText),
    image: clean(d.image) || null,
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
  ].filter(Boolean).join(' ');

  const ingredientText = ingredients
    .map((i) => (i.section ? `${i.text} (${i.section.toLowerCase()})` : i.text))
    .join('; ');

  const chunks = [
    { type: 'profil', text: `${title}. ${recipe.description} ${meta}`.trim() },
    { type: 'ingredienser', text: `Ingredienser til ${title}: ${ingredientText}.` },
  ];
  splitParagraphs(instructions).forEach((part, i, all) => {
    chunks.push({
      type: all.length > 1 ? `fremgangsmaade-${i + 1}` : 'fremgangsmaade',
      text: `Fremgangsmåde for ${title}: ${part}`,
    });
  });

  return { recipe, chunks };
}

if (typeof module !== 'undefined') {
  module.exports = { buildRecipe, parseIngredients, toMinutes, htmlToText, decodeEntities };
}
