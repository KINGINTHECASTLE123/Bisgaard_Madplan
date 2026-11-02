# Agentens tools (Agents builder → Capabilities → Workflows)

Beskrivelserne nedenfor indsættes i feltet **Description** for hvert workflow-tool. Modellen ser tool'et under
n8n's maskinnavn (workflow-navnet med små bogstaver og bindestreger), fx `tool-search-recipes`.

> Agents builder viser "This workflow has no defined inputs", selvom triggeren har inputs og er udgivet (n8n 2.45.4, Preview).
> Derfor står input-felterne eksplicit i beskrivelsen, så modellen ved hvilke argumenter den skal sende.

## tool-search-recipes · `n8n/11_tool_search_recipes.json` · vektor + graf (hybrid)

```
Søger i mine gemte opskrifter ud fra betydning (vektorsøgning) og kan filtrere på tid og tags i samme forespørgsel.
Brug den, når brugeren beskriver en stemning, smag eller type ret ("noget cremet med kylling", "en varm suppe", "ligner lasagne"), eller når du skal finde kandidater til en madplan.
Argumenter (JSON):
- query (tekst, påkrævet): beskrivelsen på dansk.
- maxMinutes (tal, valgfri): maks. tid i alt, fx 30 for "hurtigt".
- tag (tekst, valgfri): et eller flere tags adskilt af komma; opskriften skal have mindst ét. Fx "Vegetar" eller "Salat, Vegetar, Måltidssalat og bowls" for "sundt".
- excludeTag (tekst, valgfri): tags der skal udelukkes, adskilt af komma.
- preferOffers (true/false, valgfri): true sorterer efter hvor mange af opskriftens ingredienser der er på tilbud lige nu.
- k (tal, valgfri): antal resultater, standard 5, maks. 15.
Returnerer opskrifter med titel, url (kilde), score (semantisk lighed 0–1), tid, portioner, tags, en kort beskrivelse og ingredienserPaaTilbud.
Eksempel: {"query": "god hverdagsmad", "maxMinutes": 30, "preferOffers": true, "k": 8}
```

## tool-get-recipe-details · `n8n/12_tool_get_recipe_details.json` · graf

```
Henter alle fakta om én bestemt opskrift fra grafen: kategori, tags, ingredienser (med sektion, fx "til servering"), tid i alt, arbejdstid, portioner, holdbarhed, om den kan fryses, tips og relaterede opskrifter ("Prøv også").
Brug den, når du har valgt en opskrift og skal kende ingredienser, tid eller tips – eller når brugeren spørger til en bestemt ret.
Argumenter (JSON):
- recipe (tekst, påkrævet): opskriftens url (bedst) eller titel / del af titlen.
Returnerer fakta + url (kilde). Fremgangsmåden returneres ikke – henvis til url'en.
Eksempel: {"recipe": "https://www.valdemarsro.dk/porresuppe/"}
```

## tool-find-offers · `n8n/13_tool_find_offers.json` · graf (tilbud)

```
Finder hvilke ingredienser i én eller flere opskrifter der er på tilbud lige nu i Rema 1000, Netto og SuperBrugsen, beregner besparelsen pr. butik for hele indkøbet og anbefaler én butik (en ekstra butik kun ved mindst 50 kr. ekstra besparelse).
Brug den, når brugeren spørger om tilbud, pris eller hvor der skal handles – og altid efter du har valgt retterne til en madplan.
Argumenter (JSON):
- recipes (tekst, påkrævet): opskrifternes url'er (bedst) eller titler, adskilt af komma.
Returnerer tilbud pr. opskrift (produkt, størrelse, pris, normalpris, gyldig til), en kædeoversigt med samlet besparelse og en anbefaling. Priser er pr. pakke; basisvarer er ikke med.
Eksempel: {"recipes": "https://www.valdemarsro.dk/chili-con-carne/, https://www.valdemarsro.dk/porresuppe/"}
```

## tool-opskrifter-med-tag · `n8n/10_tool_opskrifter_med_tag.json` · graf

```
Finder alle opskrifter med et bestemt tag (fx "Vegetar", "Suppe", "Gryderetter"). Tomt tag giver en liste over alle tags med antal opskrifter.
Brug den, når brugeren spørger "hvilke ... har jeg?", eller når du skal se hvilke tags der findes.
Argumenter (JSON): {"tag": "Vegetar"} eller {"tag": ""}
```
