# Retrieval-tests (før agenten)

Rå vektorsøgning med `node scripts/vektorsoeg.mjs "<spørgsmål>"` – top 5 chunks fra indexet `chunk_embedding`
(nomic-embed-text, `search_query:`-præfiks, cosine). Ingen graf-filtre. Datasæt: 46 opskrifter, 188 chunks.

## 26/10 · "noget cremet med kylling" – godt

| # | Opskrift | Chunk | Score |
|---|---|---|---|
| 1 | Kylling i cremet sennepssauce | tips | 0.872 |
| 2 | Kylling i cremet sennepssauce | fremgangsmaade-2 | 0.870 |
| 3 | Kylling med svampesauce | fremgangsmaade | 0.866 |
| 4 | Gryderet med kylling | fremgangsmaade | 0.864 |
| 5 | Gryderet med kylling | profil | 0.861 |

**Vurdering:** Alle hits er relevante. Stemningsord ("cremet") står i teksten, så semantisk søgning virker.
Samme opskrift fylder flere pladser → `search_recipes` skal gruppere pr. opskrift (max-score pr. Recipe).

## 26/10 · "noget sundt og hurtigt" – svagt (begrænsning)

| # | Opskrift | Chunk | Score |
|---|---|---|---|
| 1 | Orientalsk risret med oksekød | tips | 0.812 |
| 2 | Indisk Curry med kylling | profil | 0.812 |
| 3 | Millionbøf | tips | 0.811 |
| 4 | Asiatisk kyllingebowl | fremgangsmaade-1 | 0.811 |
| 5 | Asiatisk kyllingebowl | fremgangsmaade-2 | 0.809 |

**Vurdering:** Scorerne er flade (0.809–0.812), dvs. modellen kan ikke skelne. "Sundt" står sjældent i teksten,
og valdemarsro har ingen næringsdata. Millionbøf er næppe det, man mener med sundt.
**Konsekvens:** "sundt" og "hurtigt" skal løses med grafen – `totalMinutes` (hurtigt) og tags som
Vegetar/Salat/Måltidssalat og bowls (sundt) – kombineret med vektorscoren i én hybrid query (trin 4).
Agenten skal sige ærligt, at "sundt" er et skøn ud fra tags og beskrivelser.
