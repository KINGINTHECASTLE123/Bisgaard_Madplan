# Agent-testprompts

Prompts brugt til at teste Madplan-agenten under udviklingen, med resultat og vurdering.
Model: Claude Haiku 5.5 (Agents builder, Anthropic-credential), medmindre andet står.

## T1 · 27/10 · "Hvilke vegetarretter har jeg?" (spike)

| Model | Tools | Resultat |
|---|---|---|
| qwen3:14b (OpenAI-credential → Ollama) | tool-opskrifter-med-tag | ✗ Tomt svar. Instruktionerne brugte forkert tool-navn; senere `item_reference`-fejl. Løst med korrekt navn + proxy. Se `docs/agents-builder-ollama.md` |
| qwen3:14b via proxy | tool-opskrifter-med-tag | ✓ 6 retter med links (~30 sek.) |
| qwen2.5:7b (direkte, uden proxy) | tool-opskrifter-med-tag | ✓ 6 retter med links, hurtigere |
| Claude Haiku 5.5 | tool-opskrifter-med-tag (2 kald) | ✓ 6 retter med links, meget hurtigt. Kilde: "opskrifterne under tagget Vegetar i din database" |

**Vurdering:** Korrekt og fuldstændigt (alle 6 opskrifter med tagget Vegetar). Ren graf-forespørgsel.

## T2 · 28/10 · "Find noget cremet med kylling under 30 minutter, og fortæl mig hvilke ingredienser den bedste kræver."

**Tools (forventet):** `tool-search-recipes` {query: "cremet kylling", maxMinutes: 30} → `tool-get-recipe-details` {recipe: url}

**Svar (uddrag):**
> Den bedste match er Kylling i cremet sennepssauce (30 min i alt, 4 portioner, ca. 45 min arbejdstid ifølge opskriften).
> Ingredienser: Kyllingebryst 600 g … Piskefløde 2½ dl … Tør hvidvin 1 dl (kan erstattes med bouillon og 1–2 tsk æblecidereddike, hvidvinseddike eller citronsaft) … Tilbehør: 3 dl basmatiris, 400 g frosne haricots verts …
> Opskriften og fremgangsmåden findes her: https://www.valdemarsro.dk/kylling-cremet-sennepssauce/
> Alternativer: "Kylling med svampesauce" (30 min, også cremet) og "Asiatisk kyllingebowl" (30 min).

**Vurdering:** ✓ Vektor + graf i samme svar. Rigtig ret (højeste score i søgningen), ingredienser fra grafen inkl. sektion (tilbehør), bruger et tip om erstatning, linker til originalen uden at gengive fremgangsmåden, foreslår alternativer.
**Begrænsning:** "45 min arbejdstid" mod "30 min i alt" er en datafejl på valdemarsro.dk (arbejdstid > tid i alt) – agenten gengiver kilden ukritisk. Samme fejl ses på Lasagne (40 min i alt, 180 min arbejdstid).
