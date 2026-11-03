# Prompts brugt i data-pipelinen og under udviklingen

## LLM-prompts i pipelinen (versionsstyret i koden)

| Prompt | Fil | Bruges af | Model |
|---|---|---|---|
| `NORMALIZE_SYSTEM` – normalisér én opskrifts ingredienslinjer | [`src/normalize.js`](../src/normalize.js) | n8n-workflow 02, pass 1 | Claude Haiku 5.5 |
| `CANON_SYSTEM` – find synonymer blandt alle ingrediensnavne | [`src/normalize.js`](../src/normalize.js) | n8n-workflow 02, pass 2 | Claude Haiku 5.5 |
| `MATCH_SYSTEM` – kobl tilbudsprodukter til ingredienser | [`src/offers.js`](../src/offers.js) | `scripts/offers_dev.mjs --write` | Claude Haiku 5.5 |
| Agent-instruktioner (v1–v3) | [`agent/instructions.md`](../agent/instructions.md) | Madplan-agent (Agents builder) | qwen3/qwen2.5 → Claude Haiku 5.5 |

Prompterne blev forbedret iterativt ud fra stikprøver – hver version og hvorfor står i [`docs/normalisering-evaluering.md`](../docs/normalisering-evaluering.md) (fx v1 → v2: "salt og friskkværnet peber" gav prep til den forkerte vare; v2 → v3: eksempler på forkerte sammenlægninger).

## Vigtige udviklingsprompts (til Claude)

1. **Projektinstruktioner** ([`prompts/00_projektinstruktioner.md`](../prompts/00_projektinstruktioner.md)) – stabile rammer: case, setup, regler (0 kr., Prej-kvote, høflig scraping, ingen fuld opskriftstekst i repoet).
2. **Startprompt** ([`prompts/01_startprompt.md`](../prompts/01_startprompt.md)) – trinvis plan (0–7) og krav om at vente på "go" mellem trin; nederst resultat og vurdering.
3. **Præferencer undervejs**, der blev til regler i agenten og koden ([`docs/beslutninger.md`](../docs/beslutninger.md)):
   - *"Tænker at det måske mere skal være en vegetar dag, vi spiser generalt ikke vegetarisk"* → én vegetardag pr. uge.
   - *"Vi kører ikke rundt og handler ind i flere forskellige butikker på 1 dag … Det kan vi, hvis der rent faktisk er en besparelse at hente"* → én butik pr. indkøb; ekstra butik kun ved ≥ 50 kr. (beregnet i `tool-find-offers`).
   - *"Spørgsmålet er om vi overkomplicerer det. Kig på kravene til opgaven …"* → fokus på afleveringskravene, tilbud via script i stedet for et ekstra workflow.

## Agent-testprompts

[`docs/agent-test-prompts.md`](../docs/agent-test-prompts.md) (udvikling) og [`docs/eksempler.md`](../docs/eksempler.md) (de tre afleverede eksempler).
