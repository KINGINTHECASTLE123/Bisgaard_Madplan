# Bisgaard_Madplan · madplan-agent med RAG i Neo4j (vektor + graf)

> Mandatory-projekt i AI-agenter og automatisering, efterår 2026.
> *(README'en udbygges løbende – case, agentrolle, eksempelspørgsmål og screenshots kommer til.)*

## Case i én sætning

En agent, der laver en ugentlig madplan ud fra mine yndlingsopskrifter fra valdemarsro.dk,
prioriterer retter med ingredienser på tilbud (Prej API) og lærer af mine ratings.

- **Vektor** finder opskrifter på stemning og beskrivelse ("noget sundt og hurtigt", "ligner lasagnen jeg gav 5 stjerner").
- **Graf** kender sammenhængene: opskrift → kategori/tags → ingredienser → produkter på tilbud i kæder, og hvad jeg har spist og ratet.

## Mappestruktur

| Sti | Indhold |
|---|---|
| `docker-compose.yml` | Neo4j 5.26 (community) på Docker-netværket `madplan` |
| `neo4j/01_schema.cypher` | Constraints, vector index (768 dim, cosine), fulltext index |
| `neo4j/99_reset.cypher` | Sletter alle data (beholder indexes) |
| `n8n/01_ingest_opskrifter.json` | Workflow: URL'er → hent → parse → chunk → embed → Neo4j |
| `src/build_recipe.js` | Parsing- og chunking-logikken (samme kode som i n8n's Code-node) |
| `src/build_workflow.js` | Genererer workflow-JSON'en ud fra `src/` (`npm run build`) |
| `src/test_parse.js` | Tester parsingen mod gemte sider i `data/raw/` uden n8n (`npm test`) |
| `scripts/` | Statustjek, opstart af Neo4j, `cypher.sh` (kør Cypher), `vektorsoeg.mjs` (test vektorsøgning) |
| `neo4j/10_kontrol.cypher` | Kontrolqueries efter ingestion |
| `prompts/` | Prompts brugt under udviklingen (projektinstruktioner, startprompt …) |
| `docs/` | Opgavebeskrivelse, agent-testprompts, screenshots |

## Opsætning

### 1. Neo4j
```bash
cp .env.example .env            # skift adgangskoden
docker compose up -d
docker network connect madplan <navn-på-din-n8n-container>   # find navnet med: docker ps
docker exec -i neo4j cypher-shell -u neo4j -p "<adgangskode>" < neo4j/01_schema.cypher
```
Neo4j Browser: http://localhost:7474

### 2. Embedding-model
```bash
ollama pull nomic-embed-text
```
n8n når Ollama på Mac'en via `http://host.docker.internal:11434`.

### 3. n8n
1. Importér `n8n/01_ingest_opskrifter.json`.
2. Opret credential af typen **Basic Auth** (navn: `Neo4j lokal`, bruger `neo4j`, din adgangskode). Workflowet peger på credentialens id (`NEO4J_CREDENTIAL` i `src/build_workflow.js`) – ret id'et dér og kør `npm run build`, eller vælg credentialen i noden **Skriv til Neo4j** efter import.
3. Skriv dine opskrifts-URL'er i noden **Opskrift-links**.
4. Kør workflowet.

Tjek resultatet i Neo4j Browser:
```cypher
MATCH (r:Recipe)-[rel]-(n) RETURN r, rel, n LIMIT 50;
```

## Datamodel (indtil videre)

**Noder**

| Label | Nøgle | Egenskaber |
|---|---|---|
| `Recipe` | `url` | title, description (kun intro-teksten), servings, totalMinutes, cookMinutes, shelfLife, freezable, tips[], image, ingredientLines[], ingredientSections[], serveWith[]/serveWithTitles[], seeAlso[]/seeAlsoTitles[], source, ingestedAt |
| `Category` | `name` | fx "Aftensmad" (schema.org `recipeCategory`) |
| `Tag` | `name` | fx "Vegetar", "Mad på budget" (schema.org `keywords`) |
| `Chunk` | `id` (`url#type`) | type, text, source, recipeTitle, embeddingModel, embedding (768 floats) |

**Relationer**: `(Recipe)-[:IN_CATEGORY]->(Category)`, `(Recipe)-[:HAS_TAG]->(Tag)`, `(Chunk)-[:CHUNK_OF]->(Recipe)`,
`(Recipe)-[:SERVED_WITH]->(Recipe)` ("Forslag til servering") og `(Recipe)-[:SEE_ALSO]->(Recipe)` ("Prøv også") – kun mellem opskrifter, der begge ligger i databasen.

Kommer: `Ingredient` (LLM-normaliseret) med `(Recipe)-[:USES {amount, unit, prep, section}]->(Ingredient)`,
`Product`/`Chain` fra Prej, samt `MealPlan` og ratings.

## Designvalg

- **Datakilde**: valdemarsro.dk har intet API, men opskrifterne er opmærket med schema.org-microdata (`itemprop="recipeIngredient"` m.fl.), så udtrækket bruger stabile selectors frem for layoutklasser. Kun en håndplukket liste af mine egne favoritter hentes, med 3 sekunders pause mellem kald og en ærlig User-Agent. robots.txt tillader almindelige crawlere på opskriftssiderne. Den fulde opskriftstekst ligger kun i den lokale database og ikke i repoet; agenten linker altid til originalen.
- **Chunking efter struktur**: hver opskrift deles i `profil` (titel, intro, kategori, tags, tid, holdbarhed), `ingredienser`, `tips` (fx erstatninger: "hvidløgsflødeost kan erstattes af piskefløde") og `fremgangsmaade` (splittes ved afsnit over 1.200 tegn). Opskrifterne er korte, så struktur giver mere meningsfulde chunks end faste tegn-vinduer, og hver chunk kan matche en bestemt slags spørgsmål.
- **Faldgrube fundet under test**: elementet med `itemprop="description"` indeholder hele opskriftsboksen. Derfor hentes det som HTML, og kun intro-teksten før `div.post-recipe` bruges. Parsingen testes mod gemte sider med `npm test` (cheerio efterligner n8n's HTML-node).
- **Næringsindhold** findes på siden, men kun som premium-billede – der er ingen kalorier at hente. "Sundt" vurderes ud fra tags og beskrivelser.
- **Embeddings**: `nomic-embed-text` via Ollama (lokal, 768 dim). Modellen forventer præfikserne `search_document:` ved indeksering og `search_query:` ved søgning.
- **Idempotent ingestion**: `MERGE` på URL; gamle tags og chunks slettes og genskabes, så workflowet kan køres igen uden dubletter. Begge Cypher-statements kører i én transaktion via Neo4j's HTTP API.
