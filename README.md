# Bisgaard_Madplan · madplan-agent med RAG i Neo4j (vektor + graf)

> RAG-projekt i **AI-agenter og automatisering**, EK – IT-arkitektur, 5. semester, efterår 2026. Jacob Bisgaard.

## Case og agentens rolle

**Case:** En agent, der laver madplaner ud fra mine egne 46 favoritopskrifter fra valdemarsro.dk og prioriterer retter, hvis ingredienser er på tilbud i Rema 1000, Netto og SuperBrugsen (via Prej API).

**Rolle:** *Personlig madplanlægger og indkøbsrådgiver.* Agenten finder retter ud fra stemning og krav, laver ugeplaner (som udgangspunkt én vegetardag), viser hvilke ingredienser der er på tilbud og anbefaler **én** butik – en ekstra butik kun ved mindst 50 kr. ekstra besparelse. Den linker altid til originalopskriften i stedet for at gengive fremgangsmåden.

| | Bruges til | Eksempel |
|---|---|---|
| **Vektor** (chunks + `nomic-embed-text`) | Betydning/stemning, som ikke står som data | "noget cremet med kylling", "en varm suppe" |
| **Graf** (opskrift → tags, ingredienser → produkter på tilbud → kæder) | Præcise fakta og relationer | "alle vegetarretter", "hvad er på tilbud i mine retter", "hvor skal jeg handle" |
| **Hybrid** (én Cypher-query) | Vektorscore + filtre på tid/tags + antal ingredienser på tilbud | madplanen i eksempel E3 |

Hvorfor begge dele: "noget sundt og hurtigt" gav flade vektorscorer (Millionbøf øverst), mens tidsfilter + tags fra grafen gav Tex Mex Salat og Bønnegryde ([`docs/retrieval-tests.md`](docs/retrieval-tests.md)).

## Arkitektur

```mermaid
flowchart LR
  subgraph Kilder
    V[valdemarsro.dk<br/>46 favoritter]
    P[Prej API<br/>tilbud]
  end
  subgraph n8n
    W1[01 Ingestion<br/>HTML → chunks → embeddings]
    W2[02 Normalisering<br/>Claude → USES/Ingredient]
    T[Tool-workflows 10–13<br/>search_recipes · get_recipe_details<br/>find_offers · opskrifter_med_tag]
    A[Madplan-agent<br/>Agents builder · Claude Haiku 5.5]
  end
  S[scripts/prej_fetch.mjs<br/>scripts/offers_dev.mjs --write<br/>Prej → Claude-matching]
  O[Ollama<br/>nomic-embed-text]
  N[(Neo4j 5.26<br/>vektor + graf)]
  V --> W1 --> N
  W1 <--> O
  N --> W2 --> N
  P --> S --> N
  A -- workflow tools --> T --> N
  T <--> O
```

| Komponent | Kører | Rolle |
|---|---|---|
| **Neo4j 5.26** (community, APOC) | Docker ([`docker-compose.yml`](docker-compose.yml)), netværk `madplan` | Én database til både vektor-index og graf |
| **n8n 2.45.4** | Docker | Ingestion-workflows, tool-workflows og agenten (Agents builder) |
| **Ollama** | Native på Mac | `nomic-embed-text` (768 dim) til embeddings af chunks og spørgsmål |
| **Claude Haiku 5.5** | Anthropic API | Agentens model + LLM-trin i normalisering og tilbudsmatchning (hele projektet < 1 kr. i API) |
| **Prej API** (gratis plan, 25 kald/døgn) | – | Ugens tilbud for Rema 1000, Netto, SuperBrugsen |

Lokale modeller (qwen via Ollama) kunne kalde tools i Agents builder, men krævede workarounds og var usikre ved komplekse opgaver; underviseren godkendte store modeller. Forsøget er dokumenteret i [`docs/agents-builder-ollama.md`](docs/agents-builder-ollama.md).

## Hvor finder jeg hvad (afleveringskrav)

| Krav | Placering |
|---|---|
| Workflow-screenshots, mærket efter formål | [`docs/screenshots/`](docs/screenshots/) – samme nummer som JSON-filen; formål i tabellen nedenfor. Oversigt: [`00_oversigt.png`](docs/screenshots/00_oversigt.png) |
| Workflow-JSON | [`n8n/`](n8n/) – 6 workflows |
| Agentkonfiguration (model, instruktioner, tool-beskrivelser; ingen skills) | [`agent/instructions.md`](agent/instructions.md), [`agent/tools.md`](agent/tools.md) |
| Screenshots af agent og tool-forbindelser | [`agent_model.png`](docs/screenshots/agent_model.png), [`agent_tools.png`](docs/screenshots/agent_tools.png) |
| Prompts brugt under udviklingen | [`prompts/`](prompts/) (projektinstruktioner, startprompt, prompts i pipelinen), [`docs/agent-test-prompts.md`](docs/agent-test-prompts.md) |
| 3 eksempelspørgsmål (tool-kald, hentet info, svar, vurdering, fejl) | [`docs/eksempler.md`](docs/eksempler.md) + rå tool-kald i [`docs/eksempler/`](docs/eksempler/) |
| Data og setup (kilder, sample, noder, relationer, properties, genskabelse) | afsnittene [Datamodel](#datamodel), [Data](#data) og [Genskab setup og data](#genskab-setup-og-data) + [`data/sample/`](data/sample/) |
| Brug af AI til grafmodel, normalisering og Cypher | [`docs/graf-model-og-ai.md`](docs/graf-model-og-ai.md) |
| Evalueringer og beslutninger undervejs | [`docs/normalisering-evaluering.md`](docs/normalisering-evaluering.md), [`docs/retrieval-tests.md`](docs/retrieval-tests.md), [`docs/beslutninger.md`](docs/beslutninger.md) |

Ekstra-opgaver, der er løst: **hybrid search** i én Cypher-query (`tool-search-recipes`), **referencer** (alle svar indeholder opskriftens url og tilbudsperiode) og **chat-interface** (n8n Chat).

## Workflows og tools

| Workflow ([`n8n/`](n8n/)) | Formål | Screenshot |
|---|---|---|
| [`01_ingest_opskrifter.json`](n8n/01_ingest_opskrifter.json) | **Data-ingestion (vektor + graf):** henter favoritterne (3 sek. pause, ærlig User-Agent), udtrækker schema.org-microdata, deler hver opskrift i chunks (profil, ingredienser, tips, fremgangsmåde), embedder med Ollama og skriver graf + vektor til Neo4j i én transaktion | [`01_ingestion.png`](docs/screenshots/01_ingestion.png) |
| [`02_normaliser_ingredienser.json`](n8n/02_normaliser_ingredienser.json) | **Graf-normalisering med AI:** Claude laver 847 rå ingredienslinjer om til `(Recipe)-[:USES]->(Ingredient)`, finder synonymer, og en deterministisk kontrol afviser forkerte sammenlægninger | [`02_normalisering.png`](docs/screenshots/02_normalisering.png) |
| [`10_tool_opskrifter_med_tag.json`](n8n/10_tool_opskrifter_med_tag.json) | **Graf-retrieval:** alle opskrifter med et tag / liste over tags | [`10_tool_opskrifter_med_tag.png`](docs/screenshots/10_tool_opskrifter_med_tag.png) |
| [`11_tool_search_recipes.json`](n8n/11_tool_search_recipes.json) | **Vektor-retrieval (hybrid):** embedder spørgsmålet, vektorsøgning på chunks samlet pr. opskrift + filtre på tid/tags + tilbud i samme Cypher-query | [`11_tool_search_recipes.png`](docs/screenshots/11_tool_search_recipes.png) |
| [`12_tool_get_recipe_details.json`](n8n/12_tool_get_recipe_details.json) | **Graf-retrieval:** kategori, tags, ingredienser, tid, holdbarhed, tips, relaterede opskrifter | [`12_tool_get_recipe_details.png`](docs/screenshots/12_tool_get_recipe_details.png) |
| [`13_tool_find_offers.json`](n8n/13_tool_find_offers.json) | **Graf-retrieval (tilbud):** ingredienser på tilbud pr. kæde, samlet besparelse og anbefaling af én butik | [`13_tool_find_offers.png`](docs/screenshots/13_tool_find_offers.png) |

Hvert tool-workflow starter med *When Executed by Another Workflow* (input beskrevet i [`agent/tools.md`](agent/tools.md)) og returnerer data **med kilde** (opskrifts-url, tilbudsperiode). Alle workflows genereres fra kildekode i [`src/`](src/) (`npm run build`), så Cypher og logik kan testes uden n8n (`npm test`, `npm run test:tools`).

## Datamodel

```
(Chunk)-[:CHUNK_OF]->(Recipe)-[:IN_CATEGORY]->(Category)
                     (Recipe)-[:HAS_TAG]->(Tag)
                     (Recipe)-[:SEE_ALSO]->(Recipe)            "Prøv også" (kun mellem favoritter)
                     (Recipe)-[:SERVED_WITH]->(Recipe)         "Forslag til servering"
                     (Recipe)-[:USES {amount, unit, …}]->(Ingredient)<-[:IS_A]-(Product)-[:ON_OFFER {price, …}]->(Chain)
```

**Noder**

| Label | Nøgle | Egenskaber | Kilde |
|---|---|---|---|
| `Recipe` | `url` | title, description (kun intro), servings, totalMinutes, cookMinutes, shelfLife, freezable, tips[], image, ingredientLines[], ingredientSections[], serveWith[], seeAlso[], source, ingestedAt | valdemarsro.dk (workflow 01) |
| `Chunk` | `id` (`url#type`) | type (profil / ingredienser / tips / fremgangsmaade[-n]), text, source, recipeTitle, embeddingModel, **embedding** (768 floats) | workflow 01 |
| `Category` | `name` | fx "Aftensmad" | schema.org `recipeCategory` |
| `Tag` | `name` | fx "Vegetar", "Nem Hverdagsmad" | schema.org `keywords` |
| `Ingredient` | `name` | name (dansk, ental, normaliseret), pantry (basisvare), normalizedBy, normalizedAt | workflow 02 (Claude) |
| `Product` | `id` (Prej product_id) | name, brand, quantity, unit, quantityLabel | Prej API |
| `Chain` | `slug` | name | Prej API |

**Relationer**

| Type | Egenskaber | Betydning |
|---|---|---|
| `CHUNK_OF` | – | tekststykke tilhører opskrift (vektor ↔ graf) |
| `IN_CATEGORY`, `HAS_TAG` | – | kategori og tags fra kilden |
| `SEE_ALSO`, `SERVED_WITH` | – | opskrifter der henviser til hinanden |
| `USES` | line, amount, unit, prep, optional, section, raw | opskrift bruger ingrediens (den rå linje bevares) |
| `IS_A` | matchedBy, matchedAt | produkt kan købes som ingrediensen (Claude-match) |
| `ON_OFFER` | price, normalPrice (øre), discountPct, validFrom, validTo, source, asOf, fetchedAt | produkt på tilbud i kæde; udløbne ignoreres (`validTo >= date()`) |

**Indexes** ([`neo4j/01_schema.cypher`](neo4j/01_schema.cypher)): unikke constraints på Recipe.url, Category.name, Tag.name, Ingredient.name, Chunk.id, Chain.slug, Product.id · vector index `chunk_embedding` (768 dim, cosine) · fulltext index `recipe_text`.

**Omfang (2/11):** 46 Recipe, 188 Chunk, 183 Ingredient (47 basisvarer), 37 Tag, 2 Category, 505 Product, 3 Chain · 918 USES, 509 ON_OFFER, 208 HAS_TAG, 188 CHUNK_OF, 46 IN_CATEGORY, 45 SEE_ALSO, 41 IS_A, 0 SERVED_WITH (serveringsforslagene er brød, der ikke er blandt favoritterne). Kilde: [`data/sample/graf_statistik.json`](data/sample/graf_statistik.json).

## Data

- **Opskrifter:** 46 håndplukkede favoritter fra valdemarsro.dk ([`data/favoritter.txt`](data/favoritter.txt)). Intet API – siderne har schema.org-microdata. Hentet høfligt (3 sek. pause, ærlig User-Agent; robots.txt tillader det). **Fuld opskriftstekst ligger kun i den lokale database** – repoet indeholder kun titel, url, tags og ingredienser, og agenten linker altid til originalen.
- **Tilbud:** Prej API `/v1/offers` (gratis plan, ikke-kommerciel brug). Priser i øre, `offer_ends` inklusiv.
- **Sample:** [`opskrifter_sample.json`](data/sample/opskrifter_sample.json) (5 opskrifter med normaliserede ingredienser), [`tilbud_sample.json`](data/sample/tilbud_sample.json) (tilbud på udvalgte ingredienser), [`graf_statistik.json`](data/sample/graf_statistik.json).

## Genskab setup og data

Krav: Docker Desktop, Node 24, Ollama (`ollama pull nomic-embed-text`), n8n ≥ 2.32.3 (testet på 2.45.4; i n8n's compose: `N8N_ENABLED_MODULES=agents` og netværket `madplan`), Anthropic API-nøgle, gratis Prej-nøgle.

```bash
cp .env.example .env              # NEO4J_PASSWORD, PREJ_API_KEY, ANTHROPIC_API_KEY
npm install
bash scripts/01_neo4j_op.sh       # starter Neo4j, forbinder n8n til netværket madplan, kører schema + indexes
```

1. **n8n credentials:** Basic Auth `Neo4j lokal` (neo4j / din adgangskode) og Anthropic. Ret credential-id'erne øverst i `src/build_*.js` og kør `npm run build` – eller vælg credentials i noderne efter import.
2. **Opskrifter:** importér [`n8n/01_ingest_opskrifter.json`](n8n/01_ingest_opskrifter.json) → Execute. Tjek: `bash scripts/cypher.sh < neo4j/10_kontrol.cypher`.
3. **Ingredienser:** importér [`n8n/02_normaliser_ingredienser.json`](n8n/02_normaliser_ingredienser.json) → Execute. Tjek: `bash scripts/cypher.sh < neo4j/11_kontrol_ingredienser.cypher`.
4. **Tilbud:** `node scripts/prej_fetch.mjs` (≈ 7 Prej-kald, caches i `data/raw/prej/`) og `node scripts/offers_dev.mjs --write` (Claude kobler produkter til ingredienser og skriver `Product`, `ON_OFFER`, `IS_A`).
5. **Tools:** importér og **udgiv** `n8n/10–13_tool_*.json`.
6. **Agent:** n8n → Personal → Agents → Create Agent. Model: Anthropic → Claude Haiku 5.5. Instructions fra [`agent/instructions.md`](agent/instructions.md). Capabilities → Workflows: de fire tools med beskrivelserne fra [`agent/tools.md`](agent/tools.md).

Nulstil data: `bash scripts/cypher.sh < neo4j/99_reset.cypher` (beholder constraints og indexes). Øvrige scripts i [`scripts/`](scripts/) er udviklingsværktøj: test af parsing, Cypher og vektorsøgning uden n8n, evaluering af prompts, eksport af sample, samt forsøget med lokale modeller ([`ollama-eksperiment/`](scripts/ollama-eksperiment/)).

## Kendte begrænsninger

- **Tidsdata fra kilden er inkonsistente** (fx Lasagne: 40 min i alt, men 180 min arbejdstid) – agenten stoler på dem (eksempel E3).
- **Ingen næringsdata:** "sundt" er et skøn ud fra tags og beskrivelser.
- **Besparelser er pr. pakke** og mangler normalpriser for SuperBrugsen → anbefalingen kan være skæv (eksempel E3).
- **LLM-matchning er ikke perfekt:** ingredienser ≈ 92–96 %, produkt → ingrediens ≈ 89 % i stikprøver ([`docs/normalisering-evaluering.md`](docs/normalisering-evaluering.md)).
- Tilbudshentningen er et script, ikke et planlagt n8n-workflow – et ugentligt workflow er næste skridt.
