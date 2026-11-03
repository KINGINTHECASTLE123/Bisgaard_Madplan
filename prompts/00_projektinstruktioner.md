> **Note (2/11):** Dette er de oprindelige projektinstruktioner fra projektstart (26/10). Enkelte rammer blev ændret undervejs – fx blev agentens model Claude Haiku i stedet for qwen3 (0 kr.-rammen blev et lille budget efter aftale med underviseren), og tilbud hentes med et script i stedet for et planlagt workflow. Se [`docs/beslutninger.md`](../docs/beslutninger.md).

# Projektinstruktioner – Bisgaard_Madplan

*(Indsættes som "Instructions" i Claude-projektet. Stabil kontekst, der gælder for alle chats i projektet.)*

## Hvem og hvad

Jeg er Jacob, 5. semester på IT-arkitektur (EK/KEA). Projektet er den obligatoriske RAG-opgave i faget **AI-agenter og automatisering**. Deadline er **tirsdag 3. november 2026 kl. 23:59** (aflevering på ItsLearning). I denne opgave må AI bruges frit.

**Case:** En madplansagent, der laver en ugeplan med 7 aftensmåltider ud fra mine favoritopskrifter fra valdemarsro.dk. Den prioriterer retter med ingredienser på tilbud i mine butikker (via Prej API) og bliver klogere af mine ratings.
- **Vektor (semantisk):** find opskrifter på stemning/beskrivelse ("noget sundt og hurtigt", "ligner lasagnen jeg gav 5 stjerner").
- **Graf (relationer):** opskrift → kategori/tags → ingredienser → produkter på tilbud i kæder, plus hvad jeg har spist, og hvordan jeg har ratet det.

**Agentens rolle:** personlig madplanlægger og indkøbsrådgiver.

*Kendt begrænsning:* Valdemarsro har ingen næringsdata, så "sundt" kan kun vurderes ud fra beskrivelser og tags (fx "Vegetar", "Salat"), ikke ud fra kalorier. Agenten skal være ærlig om det.

## Mit setup

- MacBook Pro, Apple M4 Pro, 24 GB RAM, macOS 26.6
- Projektmappe: `/Users/jacobbisgaard/ITA-5/AI_agenter_automatisering/Bisgaard_Madplan`
- Docker Desktop 28.4. Den skal være startet, før `docker`-kommandoer virker.
- **n8n** kører i Docker. Versionen skal være **2.32.3 eller nyere** (krav for Agents builder). Containernavnet tjekkes med `docker ps`.
- **Neo4j 5.26 community** i Docker via projektets `docker-compose.yml`, på netværket `madplan`. n8n når den på `http://neo4j:7474` og `bolt://neo4j:7687`.
- **Ollama** kører native på Mac'en. n8n når den på `http://host.docker.internal:11434`.
  Installerede modeller: `nomic-embed-text` (embeddings, 768 dim), `qwen3:14b`, `qwen3:8b`, `qwen2.5:7b`, `llama3.2:3b`.
- Værktøjer: Claude Code (`claude`), git, gh, Node 24.

## Faste rammer

1. **0 kr.** Kun lokale modeller via Ollama, ingen betalte API'er. `qwen3:14b` er hentet og er førstevalg til agenten; `qwen3:8b` bruges til sammenligning. qwen3 kører med thinking slået fra (`think: false`), medmindre vi har en god grund.
2. **Prej API, gratis plan: 25 kald pr. døgn** (nulstilles kl. 00:00 UTC). Agenten må aldrig kalde Prej direkte. Tilbud hentes af et planlagt workflow og gemmes i Neo4j. Læg en plan for kaldene, før der kaldes, og cache svar lokalt under udvikling. API-specifikationen kan læses uden nøgle: `https://api.prej.app/openapi.json` og `https://api.prej.app/llms.txt`. Nøglen ligger kun i `.env` / n8n-credentials, aldrig i git.
3. **Butikker:** Rema 1000, Netto og SuperBrugsen. Kæde-slugs slås op i OpenAPI-spec'en eller via `/v1/chains`.
4. **valdemarsro.dk** har intet API. Vi henter kun en håndplukket liste af mine favoritter, med 3 sek. pause og en ærlig User-Agent (robots.txt tillader det; GPTBot er blokeret, så vi er diskrete). Fuld opskriftstekst ligger kun i den lokale database. Repoet og afleveringen indeholder kun et lille udsnit (titel, URL, tags, ingredienser), og agenten linker altid til originalen i stedet for at gengive fremgangsmåden.
5. Siderne har schema.org-microdata: `h1[itemprop=headline]`, `[itemprop=description|recipeCategory|keywords|totalTime|cookTime|recipeYield|recipeIngredient|recipeInstructions]`, `ul.ingredientlist` med `li.ingredient-header` som sektionsoverskrift (fx "Til servering").

## Arbejdsform

- Svar på dansk. Kort og konkret. Når jeg skal klikke i en UI, så giv korte, præcise trin.
- Arbejd i små, verificerbare skridt. Test mod de rigtige tjenester (Neo4j, Ollama, n8n), før noget erklæres færdigt.
- Når du laver n8n-workflows, så generér JSON ud fra kildefiler i `src/` (som `src/build_workflow.js`), så logikken kan testes uden for n8n.
- Hold `README.md` opdateret, efterhånden som ting bliver færdige.
- **Prompt-log:** Mine vigtigste prompts til dig gemmes i `prompts/` (nummereret), og prompts brugt til at teste agenten gemmes i `docs/agent-test-prompts.md` med resultat og vurdering. Mind mig om det, hvis jeg glemmer det.
- Spørg før destruktive handlinger (slette data i Neo4j, overskrive workflows i n8n).
- Commit aldrig `.env`, API-nøgler eller fuld opskriftstekst.

## Afleveringskrav (tjekliste)

- [ ] README: case, agentens rolle, hvordan komponenterne hænger sammen, hvor filerne ligger (arkitekturdiagram valgfrit)
- [ ] Screenshots af hvert workflow, mærket efter formål (ingestion, vektor-retrieval, graf-retrieval …)
- [ ] Eksporteret workflow-JSON for alle workflows
- [ ] Agentkonfiguration som tekstfiler: modelnavn, instruktioner, tool-beskrivelser, evt. skills
- [ ] Screenshots af agentens tool-forbindelser + eksempler på prompts brugt under udvikling
- [ ] 3 eksempelspørgsmål: spørgsmål, hentet information/tool-kald, agentens svar, kort vurdering. Mindst én begrænsning eller fejl
- [ ] Data og setup: datakilder, lille sample, nodetyper, relationstyper, properties, scripts/workflows og instruktioner til at genskabe Neo4j-data og indexes

Ekstra, hvis der er tid: automatisk tilføjelse af nye opskrifter, human-in-the-loop (ratings), referencer i svar, n8n-chatinterface, hybrid search i én query, evaluator-agent.
