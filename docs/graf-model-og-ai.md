# Grafmodellen – og hvordan AI blev brugt til at foreslå og normalisere den

Opgaven beder om at "bruge AI til at foreslå node- og relationstyper", at "sikre at de giver mening (normalisere dem)" og at "lade en AI lave Cypher til importen – helst som en del af workflowet". Sådan blev det gjort:

## 1. AI foreslog grundmodellen (planlægning, før 26/10)

I planlægningen med Claude blev casen (madplan ud fra favoritter + tilbud) oversat til en grafmodel. Forslaget står i startprompten ([`prompts/01_startprompt.md`](../prompts/01_startprompt.md), afsnit "Plan"):

- `(Recipe)-[:IN_CATEGORY]->(Category)`, `(Recipe)-[:HAS_TAG]->(Tag)`, `(Chunk)-[:CHUNK_OF]->(Recipe)` – direkte fra kildens schema.org-microdata (`recipeCategory`, `keywords`), og chunks som bro mellem vektor og graf.
- `(Recipe)-[:USES {amount, unit, prep, section, raw}]->(Ingredient {name})` med `pantry` (basisvare) – så tilbud kan matches på ingrediensniveau, mens salt/peber/olie ikke styrer anbefalingerne.
- `(Product)-[:ON_OFFER {price, normalPrice, validFrom, validTo}]->(Chain)` og `(Product)-[:IS_A]->(Ingredient)` – tilbud fra Prej som egne noder, så udløbne tilbud kan filtreres med `validTo` og historik bevares.

## 2. AI foreslog udvidelser efter at have set data (26/10)

Da Claude analyserede den rå HTML fra valdemarsro.dk ([`data/raw/porresuppe.html`](../data/raw/porresuppe.html)), fandt den mere struktur end planlagt og foreslog (se [`docs/beslutninger.md`](../docs/beslutninger.md)):

- `tips` som egen chunk-type (erstatninger: "hvidløgsflødeost kan erstattes af piskefløde") og `shelfLife`/`freezable` som properties.
- `(Recipe)-[:SEE_ALSO]->(Recipe)` ("Prøv også") og `(Recipe)-[:SERVED_WITH]->(Recipe)` ("Forslag til servering") – relationer mellem opskrifter, kun når begge er blandt favoritterne. Resultat: 45 `SEE_ALSO`, 0 `SERVED_WITH` (serveringsforslagene er brød, der ikke er favoritter).
- Fravalgt: næringsdata (findes kun som premium-billede) og `MealPlan`/`Rating`-noder (planlagt til human-in-the-loop, ikke nået).

## 3. AI normaliserer noderne – som en del af workflowet

| Trin | Hvad AI gør | Hvor | Kontrol |
|---|---|---|---|
| Ingredienser | Claude laver 847 rå linjer ("75 g hvidløgsflødeost") om til normaliserede `Ingredient`-noder (`flødeost med hvidløg`) med mængde, enhed, tilberedning og basisvare | n8n-workflow 02, prompt i [`src/normalize.js`](../src/normalize.js) | Tvunget tool use (JSON-skema), validering af linjenumre |
| Synonymer | Claude foreslår sammenlægninger på tværs (fx "oksekød, hakket" → "hakket oksekød") | workflow 02, pass 2 | Deterministisk `mergeAllowed`: afviser fx stødt koriander → koriander, pasta → spaghetti, edamame → haricots verts |
| Produkter | Claude kobler 505 tilbudsprodukter til ingredienser ("Salling Løg 1 kg" → `løg`), men ikke færdigretter/pålæg | [`src/offers.js`](../src/offers.js) (`scripts/offers_dev.mjs --write`) | Navnet skal findes i ingredienslisten |

Evaluering med stikprøver, fejl og rettelser: [`docs/normalisering-evaluering.md`](../docs/normalisering-evaluering.md).

## 4. AI skrev Cypher og workflows

Al Cypher til import og retrieval er skrevet af Claude (Claude Code/Cowork) i kildefilerne [`src/build_workflow.js`](../src/build_workflow.js), [`src/build_workflow_02.js`](../src/build_workflow_02.js), [`src/normalize.js`](../src/normalize.js), [`src/offers.js`](../src/offers.js) og [`src/build_tools.js`](../src/build_tools.js), som genererer n8n-workflowene. Cypher kører altså som en del af workflowene (HTTP-kald til Neo4j's transaktions-API). Logikken testes uden n8n med `npm test`, `npm run test:tools` og [`scripts/normalize_dev.mjs`](../scripts/normalize_dev.mjs).

## Den færdige model

Se README-afsnittet **Datamodel** (noder, relationer, properties, indexes) og [`data/sample/graf_statistik.json`](../data/sample/graf_statistik.json) (antal).
