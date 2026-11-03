# Beslutninger

Kort log over valg undervejs, så de kan genfindes i rapporten og i agentens instruktioner.

| Dato | Beslutning | Begrundelse |
|---|---|---|
| 26/10 | Neo4j kører lokalt i Docker, ikke i Aura | 0 kr., ingen grænser, fuld opskriftstekst bliver på egen maskine, n8n når den på Docker-netværket `madplan` |
| 26/10 | Afleveres som privat GitHub-repo med adgang for underviseren | Historik og prompt-log er synlige |
| 26/10 | `description` hentes som HTML og klippes ved `div.post-recipe` | Elementet indeholder ellers hele opskriftsboksen |
| 26/10 | Tips, holdbarhed, "kan fryses" og relaterede opskrifter hentes med | Tips giver en ekstra chunk (erstatninger), relaterede opskrifter giver Recipe→Recipe-relationer |
| 26/10 | Favoritlisten (46 opskrifter) ligger i [`data/favoritter.txt`](../data/favoritter.txt) | Én kilde til både cache-script og n8n-workflow |
| 26/10 | Madplanen har som udgangspunkt **én vegetardag om ugen**, resten er kød/fisk | Husstanden spiser generelt ikke vegetarisk. Kun 4–5 vegetarretter i favoritterne er nok til én dag om ugen, men ikke til en hel vegetaruge. Det er en kendt begrænsning |
| 26/10 | Hele ingestion skrives i **én Neo4j-transaktion** (alle opskrifter + chunks, til sidst koblingen SEE_ALSO/SERVED_WITH) | Første kørsel gav `DeadlockDetected`: n8n's HTTP-node sender requests parallelt (batching forsinker kun starten), og transaktionerne låste de samme Tag/Category-noder. Én transaktion fjerner konflikten og gør importen alt-eller-intet |
| 27/10 | n8n opgraderet fra 2.36.7 til **2.45.4** (`N8N_ENABLED_MODULES=agents`, n8n fast på netværket `madplan`) | Agents builder krævede n8n Assistant i 2.36; afhængigheden er fjernet i 2.45. Backup af workflows og credentials taget før opgradering |
| 27/10 | Agentens model: `qwen3:14b` via **OpenAI-credential → [`scripts/ollama-eksperiment/ollama_proxy.mjs`](../scripts/ollama-eksperiment/ollama_proxy.mjs) → Ollama** | Agents builder har ingen Ollama-provider. Proxyen fjerner `item_reference`, som Ollamas Responses API ikke forstår. Se [`docs/agents-builder-ollama.md`](../docs/agents-builder-ollama.md) |
| 27/10 | Agent-instruktioner refererer til tools med n8n's maskinnavn (fx `tool-opskrifter-med-tag`) | Forkert navn i instruktionerne gav tomme svar uden fejl |
| 28/10 | Agentens chatmodel: **Claude via Anthropic API** (Agents builder har Anthropic som provider). Embeddings forbliver lokale (`nomic-embed-text` i Ollama) | Underviseren (Q&A 28/10): "det er fint at bruge de store modeller. De små lokale er udfordrende." Lokale modeller (qwen2.5/qwen3) virkede til simple tool-kald, men er usikre ved komplekse opgaver. Overslag: Haiku ca. $1–2, Sonnet ca. $10–25 for hele projektet. 0 kr.-rammen ændres til et lille, kendt budget |
| 29/10 | Tilbud hentes fra Prej `/v1/offers` pr. kæde uden kategorifilter (kategori mangler på mange produkter). Svar caches i `data/raw/prej/<dato>/` | Første hentning: Rema 1000 244, Netto 200, SuperBrugsen **2** tilbud = 6 kald. Prej har næsten ingen SuperBrugsen-data (begrænsning). Rema/Netto skifter tilbud om lørdagen → ugentligt workflow kører lørdag morgen |
| 29/10 | **Én butik pr. indkøb.** Agenten anbefaler den kæde, hvor ugens madplan samlet sparer mest, og foreslår kun en ekstra butik, hvis den ekstra besparelse er stor (standard: mindst 50 kr. for ugen) | Jacobs præference: "vi kører ikke i Netto for at spare 3 kr på en pose løg". Besparelse beregnes pr. kæde over hele ugens indkøbsliste, ikke pr. vare |
| 29/10 | Ingen `temperature: 0` ved normalisering | Claude Haiku 5.5 afviser parameteren ("`temperature` is deprecated for this model"). Ensartede svar sikres i stedet af tvunget tool use med fast JSON-skema og præcise regler i prompten |
| 2/11 | Tilbud hentes og matches med scripts ([`scripts/prej_fetch.mjs`](../scripts/prej_fetch.mjs), `scripts/offers_dev.mjs --write`) i stedet for et planlagt n8n-workflow 03 | Tidsprioritering før aflevering; opgaven tillader "scripts or workflows". Et ugentligt workflow (lørdag morgen) er næste skridt |
| 2/11 | `tool-find-offers` + `preferOffers` i `tool-search-recipes`: vektor, tags, tid og tilbud i én Cypher-query | Ekstraopgaven "hybrid search" og casens kerne (madplan ud fra tilbud) |
| 2/11 | Eksempler dokumenteres som tekst (rå tool-kald i [`docs/eksempler/`](../docs/eksempler/)) frem for lange screenshots | Opgaven kræver spørgsmål, tool-kald, hentet info og svar – tekst er mere læsbar end fem screenshots af JSON |
| 3/11 | Oprydning: Ollama-eksperimentet flyttet til [`scripts/ollama-eksperiment/`](../scripts/ollama-eksperiment/), ubrugt `MealPlan`-constraint fjernet, screenshots navngivet efter formål | Afleveringen skal være let at finde rundt i fra README |
