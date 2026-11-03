# Tre eksempelspørgsmål

Agent: **Madplan-agent** i n8n Agents builder, model **Claude Haiku 5.5**, instruktioner i [`agent/instructions.md`](../agent/instructions.md), tools i [`agent/tools.md`](../agent/tools.md).
De rå tool-kald (input og output) er kopieret fra chatten til `docs/eksempler/E1–E3_tool_calls.txt`; E1 og E2 har også et screenshot i [`docs/screenshots/`](../docs/screenshots/). De fulde svar og de hentede data er gengivet nedenfor.

> **Om tool-kaldene:** Det første kald i hver session er `Anthropic.tool search` – Agents builder slår først de relevante tools op
> (svaret er en liste af `tool_reference`). Derefter kommer de egentlige kald til vores workflow-tools. Hvert workflow-tool kører som en
> almindelig n8n-execution og kan ses under *Executions*.

---

## E1 · Ren graf-forespørgsel: "Hvilke vegetarretter har jeg?"

**Tool-kald** (rå input/output: [`docs/eksempler/E1_tool_calls.txt`](../docs/eksempler/E1_tool_calls.txt))

| # | Tool | Input | Execution |
|---|---|---|---|
| 1 | Anthropic.tool search | `{"query": "tool-opskrifter-med-tag", "limit": 5}` | – |
| 2 | `tool-opskrifter-med-tag` | `{"tag": "Vegetar"}` | 97 |

**Hentet information** (execution 97, Cypher: `(Recipe)-[:HAS_TAG]->(Tag {name: "Vegetar"})`):
6 opskrifter – Bønnegryde (30 min), Porresuppe (30), Red Thai Curry (20), Rösti med grønt og feta (30), Tex Mex Salat (20), Vodka Pasta (15) – hver med url. Kilde: `Neo4j: (Recipe)-[:HAS_TAG]->(Tag)`.

**Agentens svar:** "Du har 6 vegetarretter:" efterfulgt af de 6 retter med tid og link til valdemarsro.dk, og "Kilde: opskrifterne under tagget 'Vegetar' i din database."

**Vurdering:** ✓ Korrekt og fuldstændigt – alle 6 opskrifter med tagget, ingen opfundne. Agenten valgte selv det rigtige tool og tag. Et rent graf-spørgsmål, som vektorsøgning ikke ville kunne besvare fuldstændigt ("alle" kræver en præcis relation, ikke lighed).
*Screenshot:* [`docs/screenshots/E1_vegetar.png`](../docs/screenshots/E1_vegetar.png) (tool-kald med input og starten af output).

---

## E2 · Vektor + graf: "Find noget cremet med kylling under 30 minutter, og fortæl mig hvilke ingredienser den bedste kræver."

**Tool-kald** (rå input/output: [`docs/eksempler/E2_tool_calls.txt`](../docs/eksempler/E2_tool_calls.txt))

| # | Tool | Input | Execution |
|---|---|---|---|
| 1 | Anthropic.tool search | `{"query": "tool-search-recipes opskrifter"}` | – |
| 2 | `tool-search-recipes` | `{"query": "noget cremet med kylling", "maxMinutes": 30, "k": 5}` | 98 |
| 3 | `tool-get-recipe-details` | `{"recipe": "https://www.valdemarsro.dk/kylling-cremet-sennepssauce/"}` | 99 |

**Hentet information – kald 2 (vektorsøgning + tidsfilter i én Cypher-query):**

| Opskrift | Score | Matchende chunk | Tid |
|---|---|---|---|
| Kylling i cremet sennepssauce | 0,872 | tips | 30 min |
| Kylling med svampesauce | 0,866 | fremgangsmaade | 30 min |
| Gryderet med kylling | 0,864 | fremgangsmaade | 30 min |
| Kyllingefrikadeller | 0,861 | tips | 30 min |
| Asiatisk kyllingebowl | 0,860 | fremgangsmaade-1 | 30 min |

**Hentet information – kald 3 (graf):** kategori Aftensmad, 7 tags, `minutterIAlt` 30, `arbejdstid` **45**, 4 portioner, 22 ingredienslinjer i tre sektioner (stegt kyllingebryst / cremet sennepssauce / til servering), 3 tips og 4 relaterede opskrifter via `SEE_ALSO` (Frikadeller med pandesauce, Millionbøf, Spaghetti Bolognese, Lasagne).

**Agentens svar (uddrag):**
> Den bedste match er Kylling i cremet sennepssauce (30 min i alt, 4 portioner, ca. 45 min arbejdstid ifølge opskriften).
> Ingredienser: Kyllingebryst 600 g … Piskefløde 2½ dl … Tør hvidvin 1 dl (kan erstattes med bouillon og 1–2 tsk æblecidereddike, hvidvinseddike eller citronsaft) … Tilbehør: 3 dl basmatiris, 400 g frosne haricots verts …
> Opskriften og fremgangsmåden findes her: https://www.valdemarsro.dk/kylling-cremet-sennepssauce/
> Alternativer: "Kylling med svampesauce" (30 min, også cremet) og "Asiatisk kyllingebowl" (30 min).

**Vurdering:**
- ✓ Vektor og graf arbejder sammen: "cremet" findes semantisk (vektor), tidsgrænsen håndhæves af grafen i samme query, og ingredienserne kommer fra grafen.
- ✓ Agenten valgte den højest scorede ret, hentede detaljer med url'en fra søgningen og brugte et tip (erstatning for hvidvin) fra databasen.
- ✓ Guardrail overholdt: linker til originalen og gengiver ikke fremgangsmåden.
- ⚠ Alle 5 resultater ligger meget tæt (0,860–0,872) – vektorscoren skelner dårligt mellem kyllingeretter. "Kyllingefrikadeller" er næppe "cremet".
- ⚠ "30 min i alt" men "45 min arbejdstid" er selvmodsigende. Fejlen ligger i kildedata (se E3).

*Screenshot:* [`docs/screenshots/E2_cremet_kylling.png`](../docs/screenshots/E2_cremet_kylling.png) (spørgsmål og tool-kald med input).

---

## E3 · Madplan med tilbud – og fejl: "Lav en madplan for 5 hverdage med én vegetardag. Max 45 minutter pr. ret. Hvor skal jeg handle?"

**Tool-kald** (rå input/output: [`docs/eksempler/E3_tool_calls.txt`](../docs/eksempler/E3_tool_calls.txt))

| # | Tool | Input | Execution |
|---|---|---|---|
| 1–3 | Anthropic.tool search ×3 | slår `tool-search-recipes`, `tool-find-offers` og `tool-opskrifter-med-tag` op | – |
| 4 | `tool-search-recipes` | `{"query": "vegetar hverdagsmad aftensmad", "maxMinutes": 45, "tag": "Vegetar", "preferOffers": true, "k": 8}` | 101 |
| 5 | `tool-search-recipes` | `{"query": "hverdagsmad med kød eller fisk, gryderet, pasta, suppe, tex-mex", "maxMinutes": 45, "preferOffers": true, "k": 15}` | 102 |
| 6 | `tool-find-offers` | `{"recipes": "…/boennegryde/, …/texmex-risret-med-oksekoed/, …/kylling-cremet-sennepssauce/, …/lasagne/, …/gullash/"}` | 103 |

Agenten fulgte instruktionernes fremgangsmåde: én søgning til vegetardagen (med tag), én til kød-dagene, og derefter ét samlet tilbudskald for de valgte retter.

**Hentet information – kald 4 og 5 (vektor + tags + tid + tilbud i én Cypher-query, sorteret efter tilbud):**
- Kald 4: 6 vegetarretter; øverst *Bønnegryde* (5 ingredienser på tilbud), *Tex Mex Salat* (4), *Red Thai Curry* (4) …
- Kald 5: 15 kødretter; øverst *Lasagne* (9 på tilbud, "40 min"), *Texmex risret med oksekød* (8), *Kylling i fad med pikant* (8), *Millionbøf* (8), *Mexicansk suppe* (7), *Gullash* (7) …

**Hentet information – kald 6 (graf: tilbud for de 5 valgte retter):**

| Kæde | Ingredienser på tilbud | Samlet besparelse |
|---|---|---|
| **Netto** | 14 (avocado, hakkede tomater, løg, gulerod, kartoffel, mælk, smør, tomatpuré, bacon, hvidvin, hakket oksekød, mozzarella, cheddar, sorte bønner) | **68,02 kr.** |
| Rema 1000 | 3 (rød peberfrugt, kartoffel, hakket oksekød) | 11,95 kr. |
| SuperBrugsen | 6 (rød peberfrugt, squash, oksebov, bacon, kyllingebryst, hakket oksekød) | 0 kr. (*ingen normalpriser*) |

Anbefaling fra tool'et: "Handl i Netto: 14 ingrediens(er) på tilbud, ca. 68.02 kr sparet." · Ekstra butik: "Ikke værd … (under 50 kr ekstra besparelse)."

**Agentens svar:**

| Dag | Ret | Tid |
|---|---|---|
| Mandag | Bønnegryde (vegetar) | 30 min |
| Tirsdag | Lasagne | 40 min |
| Onsdag | Kylling i cremet sennepssauce | 30 min |
| Torsdag | Texmex risret med oksekød | 35 min |
| Fredag | Gullash | 30 min |

> **Hvor skal du handle? Netto.** Der er 14 ingredienser på tilbud, og den samlede besparelse er ca. 68 kr. på pakkepriser. Tilbuddene i Netto gælder til 6. november 2026. En ekstra butik er ikke værd, da den ekstra besparelse er under 50 kr.
> Oksebov til gullashen og kyllingebrystet til sennepssaucen har ikke tilbud i Netto, så de skal du købe til normalpris. Basisvarer som salt, olie og krydderier er ikke med i prisberegningen. … Jeg har ingen data om kalorier eller næringsindhold.

**Vurdering – det der virker:**
- ✓ Alle 5 retter kommer fra søgeresultaterne, præcis én vegetardag (Bønnegryde, tag Vegetar), variation (gryde, pasta, kylling, tex-mex), links på alle retter.
- ✓ Tallene i svaret (Netto, 14 ingredienser, 68 kr., gyldig til 6/11, ingen ekstra butik) stemmer nøjagtigt med `find_offers`.
- ✓ **Én butik pr. indkøb** (Jacobs præference) bliver overholdt, og agenten nævner selv de varer, der ikke er på tilbud i Netto.
- ✓ Hybrid search: vektor, tags, tid og tilbud kombineres i én Cypher-query (`preferOffers`), og retter med mange ingredienser på tilbud prioriteres.

**Vurdering – fejl og begrænsninger:**
- ✗ **Lasagnen tager ikke 40 minutter.** Valdemarsro angiver "tid i alt 40 min", men "arbejdstid 180 min" (sovsen simrer i timer). Filteret bruger `totalMinutes`, så kravet "max 45 minutter" brydes i praksis – og lasagnen ligger endda øverst, fordi den har flest ingredienser på tilbud. Fejlen stammer fra inkonsistente kildedata, og hverken tool eller agent opdager den. *Rettelse:* filtrér på `max(totalMinutes, cookMinutes)` og lad agenten advare, når tiderne er uenige.
- ✗ **Anbefalingen er skæv mod Netto.** Prej har ingen normalpriser for SuperBrugsen, så dens besparelse bliver 0 kr., selvom fx kyllingebryst (1 kg, 25 kr.) og bacon (10 kr.) er billige. *Rettelse:* sammenlign tilbudspris med de andre kæders pris, når normalprisen mangler.
- ⚠ **Besparelsen tæller hele pakker.** 3 liter hvidvin (16 kr. sparet) tæller med, selvom retten bruger 1 dl; tool'et siger det selv ("priser er pr. pakke"), men tallet 68 kr. er dermed for højt.
- ⚠ **Matchfejl slår igennem:** "Änglamark Økologisk Hokkaido Græskar" vises som tilbud på *squash*, og "AMA Let Smørbart" som *smør* (se [`docs/normalisering-evaluering.md`](../docs/normalisering-evaluering.md)).
- ⚠ Sproglig fejl i svaret ("En ekstra butik er ikke Der er ikke værd").

*Tool-kaldene er dokumenteret i tekstfilen (svaret er for langt til et overskueligt screenshot).*

---

## Øvrige kendte begrænsninger (fra udviklingen)

- **"Sundt"** kan ikke måles – der er ingen næringsdata. Agenten oversætter det til tags (Salat, Vegetar, bowls) og siger, at det er et skøn ([`docs/retrieval-tests.md`](../docs/retrieval-tests.md)).
- **Tilbudsmatchning** er ca. 89 % præcis; enkelte produkter kobles forkert (fx Hokkaido-græskar → squash) ([`docs/normalisering-evaluering.md`](../docs/normalisering-evaluering.md)).
- **Lokale modeller** (qwen2.5/qwen3 via Ollama) kunne lave simple tool-kald i Agents builder, men krævede workarounds og er usikre ved komplekse opgaver. Derfor Claude Haiku ([`docs/agents-builder-ollama.md`](../docs/agents-builder-ollama.md)).
