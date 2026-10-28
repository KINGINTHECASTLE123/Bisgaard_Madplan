# Startprompt – første chat i projektet

*(Første besked i den nye chat. Projektinstruktionerne ligger allerede i projektet.)*

---

Vi starter udviklingen af Bisgaard_Madplan. Læs projektinstruktionerne, og kig derefter i projektmappen
`/Users/jacobbisgaard/ITA-5/AI_agenter_automatisering/Bisgaard_Madplan`.

## Det er allerede lavet (endnu ikke kørt på min Mac)

- `docker-compose.yml`: Neo4j 5.26 med APOC på netværket `madplan`
- `neo4j/01_schema.cypher`: constraints (Recipe.url, Category.name, Tag.name, Ingredient.name, Chunk.id, Chain.slug, Product.id, MealPlan.id), vector index `chunk_embedding` (768 dim, cosine) og fulltext index `recipe_text`
- `n8n/01_ingest_opskrifter.json`: Manual trigger → URL-liste → hent side (3 sek. pause) → HTML-udtræk af microdata → Code: opskrift + chunks (profil / ingredienser / fremgangsmåde) → Ollama `nomic-embed-text` (`search_document:`-præfiks) → én Neo4j-transaktion via HTTP API → tjek `errors`
- `src/build_recipe.js` og `src/build_workflow.js`: logikken bag workflowet. Workflow-JSON genereres med `node src/build_workflow.js`
- Parsing er testet mod rigtige data fra valdemarsro.dk/porresuppe. Cypher er syntakstjekket med Neo4j's linter.

**Nuværende graf:** `(Recipe)-[:IN_CATEGORY]->(Category)`, `(Recipe)-[:HAS_TAG]->(Tag)`, `(Chunk)-[:CHUNK_OF]->(Recipe)`.
Recipe gemmer de rå ingredienslinjer i `ingredientLines[]` med tilhørende `ingredientSections[]`.

## Plan

Tag ét trin ad gangen, vis mig resultatet og vent på mit go, før du går videre.

**0. Få det kørende**
Docker Desktop startet → find n8n-containeren og versionen (opgradér til ≥ 2.32.3 hvis nødvendigt, uden at miste mine eksisterende workflows og credentials) → `.env` → `docker compose up -d` → forbind n8n til netværket `madplan` → kør schema → importér workflow 01 → kør det med porresuppen → verificér i Neo4j.

**1. Opskriftsdata**
Jeg giver dig 30–50 URL'er med favoritter. Kør ingestion og lav et par kontrolqueries (antal opskrifter, chunks, tags, opskrifter uden ingredienser).

**2. Normalisering af ingredienser** (workflow 02)
En lokal LLM (temperature 0, JSON-output) laver `ingredientLines` om til
`(Recipe)-[:USES {amount, unit, prep, section, raw}]->(Ingredient {name})`.
Navne skal være danske, i ental og uden mængder og tilberedning, så "hvidløgsflødeost" og "flødeost med hvidløg" ender samme sted. Basisvarer som salt, peber og vand markeres (`Ingredient.pantry = true`), så de ikke styrer tilbudsmatchet. Lav en lille evaluering: tjek en stikprøve og ret prompten.

**3. Tilbud fra Prej** (workflow 03, planlagt ugentligt)
Læs først OpenAPI-spec'en (kræver ingen nøgle) og lav en kaldsplan inden for 25 kald/døgn for Rema 1000, Netto og SuperBrugsen. Gem `(Product)-[:ON_OFFER {price, normalPrice, validFrom, validTo}]->(Chain)`, og lad LLM'en koble produkter til ingredienser: `(Product)-[:IS_A]->(Ingredient)`. Udløbne tilbud ignoreres ved forespørgsler.

**4. Retrieval-tools** (sub-workflows med Execute Workflow Trigger)
Forslag, som du gerne må forbedre:
- `search_recipes(query, k)`: vektorsøgning på chunks (`search_query:`-præfiks), returnerer opskrifter med score og URL
- `get_recipe_details(url)`: graf: kategori, tags, normaliserede ingredienser, tid, portioner
- `find_offers(urls[])`: graf: hvilke ingredienser i opskrifterne er på tilbud hvor og til hvilken pris
- `get_history()`: graf: seneste madplaner og ratings, så retter ikke gentages og gode retter kommer igen
- `save_meal_plan(plan)` og `save_rating(url, stars, comment)`: skrivende tools (human in the loop)

Alle tools returnerer kilder (opskrifts-URL, tilbudsperiode). Overvej om `search_recipes` kan være hybrid, så vektor-score, tilbud og rating kombineres i én Cypher-query.

**5. Agenten** i n8n's Agents builder
Test `qwen3:8b` mod `qwen3:14b` på tool-calling og vælg. Skriv instruktioner, tool-beskrivelser og guardrails som tekstfiler i `agent/`:
- kun opskrifter fra databasen, ingen opfundne retter eller priser
- link altid til originalen, gengiv ikke fremgangsmåden
- respektér ønsker som vegetar, budget og tid
- sig det ærligt, når der mangler data

**6. Ekstra (hvis tid):** evaluator-agent, n8n-chatinterface, automatisk tilføjelse af nye opskrifter via formular.

**7. Dokumentation:** README, screenshots, eksporterede workflows, 3 eksempelspørgsmål (inkl. én fejl), datasample og setup-guide.

## Før du starter

Den fulde opgavebeskrivelse ligger i `docs/opgavebeskrivelse.md`. Læs den, og sig til, hvis planen har huller i forhold til kravene. Spørg mig også, om projektet skal på GitHub (privat repo med adgang for underviseren) eller uploades som filer på ItsLearning.

Start derefter med trin 0.

---

## Resultat (session 26/10, trin 0–1)

**Hvad prompten gav:** Claude læste instruktioner, opgavebeskrivelse og kode og påpegede huller i planen (Agents builder + Ollama er en risiko og bør testes tidligt; "AI foreslår node-/relationstyper" skal dokumenteres; ratings mangler i skemaet). Derefter blev trin 0 og 1 gennemført i små, verificerede skridt: statusscript, Neo4j op med schema, GitHub-repo, ingestion af 46 favoritter.

**Hvad gik godt:** At teste mod rigtige tjenester afslørede fejl tidligt. Kontrolqueries viste, at `description` indeholdt hele opskriftsboksen (2.904 tegn i stedet for ~500), og en lokal cache af siderne (`data/raw/`) gjorde det muligt at teste parsingen uden n8n (`npm test`).

**Hvad gik galt:** Første skrivning af 46 opskrifter gav `DeadlockDetected` i Neo4j, fordi n8n sendte transaktionerne parallelt. Claudes første rettelse (batching) virkede ikke – batching forsinker kun starten af hver request. Løsningen blev én samlet transaktion. "Credentials not found" skyldtes sandsynligvis, at workflowet ikke var gemt (⌘S) før kørsel; credential-id'et er nu bygget ind i JSON'en.

**Vurdering:** Prompten var stærk, fordi den gav kontekst, færdige filer, en trinvis plan og et krav om at vente på "go" mellem trin. Den manglede et krav om at teste med mere end én opskrift før skalering – det ville have fanget deadlocken tidligere.
