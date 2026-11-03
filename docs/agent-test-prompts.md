# Agent-testprompts

Prompts brugt til at teste Madplan-agenten under udviklingen, med resultat og vurdering. **De tre afleverede eksempler (med tool-kald og vurdering) står i [`docs/eksempler.md`](../docs/eksempler.md).**
Model: Claude Haiku 5.5 (Agents builder, Anthropic-credential), medmindre andet står.

## T1 · 27/10 · "Hvilke vegetarretter har jeg?" (spike)

| Model | Tools | Resultat |
|---|---|---|
| qwen3:14b (OpenAI-credential → Ollama) | tool-opskrifter-med-tag | ✗ Tomt svar. Instruktionerne brugte forkert tool-navn; senere `item_reference`-fejl. Løst med korrekt navn + proxy. Se [`docs/agents-builder-ollama.md`](../docs/agents-builder-ollama.md) |
| qwen3:14b via proxy | tool-opskrifter-med-tag | ✓ 6 retter med links (~30 sek.) |
| qwen2.5:7b (direkte, uden proxy) | tool-opskrifter-med-tag | ✓ 6 retter med links, hurtigere |
| Claude Haiku 5.5 | tool-opskrifter-med-tag (2 kald) | ✓ 6 retter med links, meget hurtigt. Kilde: "opskrifterne under tagget Vegetar i din database" |

**Vurdering:** Korrekt og fuldstændigt (alle 6 opskrifter med tagget Vegetar). Ren graf-forespørgsel.

## T2 · 28/10 · "Find noget cremet med kylling under 30 minutter, og fortæl mig hvilke ingredienser den bedste kræver."

Tools: `tool-search-recipes` {query, maxMinutes: 30} → `tool-get-recipe-details` {recipe: url}. ✓ Kylling i cremet sennepssauce (højeste score), ingredienser fra grafen inkl. sektioner, link uden fremgangsmåde, alternativer.
✗ "45 min arbejdstid" mod "30 min i alt" – datafejl på valdemarsro.dk, som agenten gengiver ukritisk. Fuld gennemgang: [`docs/eksempler.md`](../docs/eksempler.md) (E2).

## T3 · 2/11 · "Lav en madplan for 5 hverdage med én vegetardag. Max 45 minutter pr. ret. Hvor skal jeg handle?"

Tools: `tool-search-recipes` ×2 (vegetar + kød, `preferOffers: true`) → `tool-find-offers`. ✓ 5 retter, én vegetardag, Netto anbefalet (14 ingredienser, 68 kr.), ingen ekstra butik.
✗ Lasagne angivet som 40 min (kildedata: 180 min arbejdstid); SuperBrugsen får 0 kr. besparelse pga. manglende normalpriser. Fuld gennemgang: [`docs/eksempler.md`](../docs/eksempler.md) (E3).
