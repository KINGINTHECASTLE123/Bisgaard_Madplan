# Evaluering af ingrediens-normaliseringen (trin 2)

Model: Claude Haiku 5.5 via Anthropic Messages API, tvunget tool use (fast JSON-skema). Logik: `src/normalize.js`.
Test uden n8n: `node scripts/normalize_dev.mjs` (resultater i `data/normalize/`, ikke i git).

## Kørsel 1 · 3 opskrifter (prompt v1)

61 linjer → 65 forekomster. Stikprøve 25 linjer: 22 rigtige. Fejl og rettelser i prompten (v2):

| Fejl | Rettelse |
|---|---|
| "salt og friskkværnet peber" → `salt` fik prep "friskkværnet" | Mængde/enhed/tilberedning hører kun til den vare, de står ved |
| `koriander` (stødt) markeret som basisvare – kolliderer med frisk koriander | Krydderier der findes både friske og tørrede/stødte, får forskellige navne |
| `fishsauce`, `basmati ris`, `baby spinat` | Dansk retskrivning og ét ord: fiskesauce, basmatiris, babyspinat |

Også: `temperature: 0` afvises af Haiku 5.5 – ensartethed sikres af tool-skemaet.

## Kørsel 2 · alle 46 opskrifter (prompt v2)

- Pass 1: **847 linjer → 919 forekomster**, 44 sek., 0 linjer uden ingrediens. Stikprøve 25: 23 acceptable
  (tvivlsomme: "kogevand fra kartofler og gulerødder" → `kartoffelvand`, "lage fra syltede cornichoner" → `cornichoner`).
- 191 unikke navne → pass 2 (synonym-sammenlægning) foreslog 17 sammenlægninger:

| ✓ Rigtige (11) | ✗ Forkerte (6) |
|---|---|
| oksekød, hakket → hakket oksekød | pasta penne → spaghetti |
| frossen ærter / frosne ærter → ærter | pastaskruer → spaghetti |
| peberfrugt, rød → rød peberfrugt | pasta → spaghetti |
| kyllingebryst med skind → kyllingebryst | stødt koriander → koriander |
| cremefraiche → creme fraiche | syltede agurker → agurk |
| soltørrede tomater → soltørrede tomater i olie | flåede tomater → hakkede tomater |
| syltet rødbede → rødbede, syltet | |
| pandesmuldr → rasp, lage fra syltede cornichoner → cornichoner, kogevand … → kartoffelvand | |

**Præcision 11/17 ≈ 65 %.** Modellen brød prompten ("slå ikke forskellige varer sammen") – fx stødt koriander → koriander, som prompten nævnte eksplicit.

**Rettelse (v3):** (1) prompten fik eksempler på netop disse fejl, (2) en **deterministisk kontrol** (`mergeAllowed` i `src/normalize.js`) afviser sammenlægninger, hvor ord som *stødt, tørret, syltede, flåede, røget, frisk* kun står på den ene side, og hvor forskellige pastaformer slås sammen. Kontrollen afviser alle 6 forkerte og godkender alle 11 rigtige.

**Læring:** LLM'en er god til at strukturere enkelte linjer, men upålidelig til regler på tværs af en lang liste. Regler, der kan udtrykkes som kode, skal håndhæves i kode.

Basisvarer (pantry) i kørsel 2: 45 af 174 – fx salt, peber, olivenolie, hvedemel, sukker, tørrede/stødte krydderier. Tvivlsomt markeret: `nudler`, `honning`, `dijon sennep`, `sesamfrø` (har ingen betydning ud over, at de ikke bruges i tilbudsmatchet).

## Kørsel 3 · alle 46 opskrifter (prompt v3 + kontrol)

- Pass 1: 847 linjer → 917 forekomster, 199 unikke navne (variation fra kørsel 2 – modellen er ikke deterministisk uden temperature).
- Pass 2: 12 sammenlægninger godkendt, 3 afvist af kontrollen (syltet agurk → agurk, stødt koriander → koriander, pasta penne → penne).
- Nye fejl blandt de godkendte: **edamamebønner → haricots verts** (forskellige bønner) og **kartoffelvand → kartoffel** (kogevand er ikke en vare).

**Rettelse (v4):** kontrollen kræver nu også, at navnene *ligner* hinanden (fælles ord, fælles begyndelse ≥ 5 tegn eller Levenshtein-afstand ≤ 3), og prompten oversætter kogevand/lage til `vand` (basisvare). Testet mod alle 15 kendte tilfælde: alle 11 rigtige godkendt, alle forkerte afvist (`majskolbe → majs` afvises også – kontrollen er hellere for forsigtig end for ivrig).

## Kørsel 4 · n8n-workflow 02 (prompt v4 + kontrol) – skrevet til Neo4j 29/10

Resultat: **46 opskrifter → 918 USES → 183 ingredienser (47 basisvarer)**, 0 problemer, 0 opskrifter uden ingredienser. Pris: 116.956 + 47.045 tokens ≈ **$0,035**.
Stikprøve Porresuppe: alle 12 linjer korrekt (fx "75 g hvidløgsflødeost" → `flødeost med hvidløg`, 75 g; sektion "Til servering" bevaret).

Synonymer: 8 godkendt, 8 afvist af kontrollen (alle afvisninger korrekte – fx syltet agurk → agurk, stødt koriander → koriander, pasta → spaghetti, tomat → hakkede tomater, kalveschnitzel → kotelet).
Tvivlsomme blandt de godkendte (2/8): **flødeost med pikant → flødeost med hvidløg** (forskellig smag) og **peberfrugt → rød peberfrugt** (farve tilføjet).
**Rettelse (v5, til næste kørsel):** farver (rød/grøn/gul/hvid/sort) tilføjet til de beskyttede ord, og smagen efter "med" skal være ens. Data i Neo4j er fra v4 – de to fejl er dokumenteret som kendt begrænsning.

### Samlet vurdering
- LLM-normalisering af enkeltlinjer: høj kvalitet (~92–96 % i stikprøver), billig og hurtig.
- LLM-synonymsammenlægning alene: ca. 65 % præcision. Med deterministisk kontrol: ingen kendte fejl slap igennem i v5-testene, men kontrollen er bevidst konservativ (fx afvises majskolbe → majs).

# Evaluering af tilbud → ingrediens-matchningen (trin 3)

Model: Claude Haiku 5.5, tvunget tool use, batches á 60 produkter; navne valideres mod ingredienslisten (kun ikke-basisvarer). Logik: `src/offers.js`. Test uden n8n og uden Prej-kald: `node scripts/offers_dev.mjs` (cache).

## Kørsel 1 · cache 29/10 (Rema 1000 244, Netto 200, SuperBrugsen 2 tilbud)

446 tilbud → 441 unikke produkter → **56 koblet** til 136 ingredienser, 0 afvist af valideringen, 8 Claude-kald, ≈ $0,006.
Færdigretter og pålæg blev korrekt holdt ude (fx "Mou Kartoffel- og Porresuppe", "Aldoni Pizza m. champignon", spegepølser, leverpostej).

Fejl/tvivlstilfælde (≈ 6 af 56 → præcision ≈ 89 %):

| Produkt | Koblet til | Vurdering |
|---|---|---|
| Næmt Risengrød | ris | ✗ færdigret |
| Rama Cremefine Madlavning 15% | cremefraiche | ✗ madlavningsfløde |
| AMA Stege & Bage Margarine | smør | ✗ erstatning |
| Cleasy Yoghurt naturel 0,1% | græsk yoghurt | ✗ forkert variant |
| Salling Rødbeder Økologisk | syltet rødbede | ? sandsynligvis friske |
| Harvest Best Helbladet Spinat | babyspinat | ? burde være spinat |

**Rettelse (v2):** prompten fik netop disse eksempler (færdigvarer/erstatninger ≠ råvare; friske ≠ syltede).

## Kørsel 2 · uge 45, hentet 2/11 (prompt v2) – skrevet til Neo4j

Rema 1000 141, Netto 217, SuperBrugsen **151** tilbud (Coop-data er kommet siden 29/10) = 7 Prej-kald.
509 tilbud → 505 produkter → **41 koblet**, 1 afvist (Rødkål – ingrediensen findes ikke i opskrifterne). ≈ $0,007.
Aktive tilbud med kobling: Netto 20 ingredienser, SuperBrugsen 10, Rema 1000 5.
Tvivlstilfælde: "COOP Finthakkede Tomater" → flåede tomater (burde være hakkede tomater), "AMA Let Smørbart" → smør (smørbar blanding), "Hokkaido Græskar" → squash (forkert grøntsag).
