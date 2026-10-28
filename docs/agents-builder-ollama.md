# n8n Agents builder + lokal Ollama – hvad der skulle til

Opsætning: n8n self-hosted i Docker, Ollama native på Mac (M4 Pro), model `qwen3:14b`. Testet 27.–28/10 2026.

## Resultat

Agenten "Madplan-agent" i n8n's Agents builder kalder workflow-tool'et `Tool · opskrifter_med_tag` (graf-opslag i Neo4j)
og svarer med 6 vegetarretter + links. Kæden er:

```
n8n Agents (OpenAI-provider, Responses API)
  → scripts/ollama_proxy.mjs  (:11435, fjerner item_reference + logger)
  → Ollama (:11434, /v1/responses)  → qwen3:14b
```

### Uden proxy: model uden "thinking"

`item_reference`-problemet (nr. 5 nedenfor) opstår kun, fordi qwen3 *tænker*: n8n sender tænkningen tilbage som en henvisning,
som Ollama ikke forstår. En model uden thinking virker **direkte** (OpenAI-credential → Ollama :11434, ingen proxy).

| Model | Kræver proxy | Resultat på "Hvilke vegetarretter har jeg?" | Tid |
|---|---|---|---|
| `qwen3:14b` (thinking) | Ja | Korrekt: 6 retter med links, via `tool-opskrifter-med-tag` | ~30 sek. |
| `qwen2.5:7b` (ingen thinking) | Nej | Korrekt: samme 6 retter med links | Markant hurtigere |

Valget af model afgøres i trin 5 med de rigtige test-prompts (fx en hel ugeplan med flere tool-kald), hvor en større model kan være nødvendig.

## Forhindringer og løsninger

| # | Symptom | Årsag | Løsning |
|---|---|---|---|
| 1 | Ingen "Agents"-fane i n8n 2.36.7 | Modulet var ikke slået til som standard før 2.42 | `N8N_ENABLED_MODULES=agents` i n8n's compose |
| 2 | "Error creating agent: Instance AI is disabled" | I 2.36 krævede agenter n8n Assistant (instance-ai + sandbox) | Opgraderet n8n til 2.45.4 (afhængigheden er fjernet) |
| 3 | Ollama findes ikke som provider | Agents builder har ingen Ollama-provider | OpenAI-credential med Base URL til Ollamas OpenAI-kompatible API, API key `ollama` |
| 4 | Agenten "tænker" og svarer så intet | Instruktionerne nævnte tool'et som `opskrifter_med_tag`, men n8n giver det navnet **`tool-opskrifter-med-tag`** (workflow-navnet gjort maskinvenligt). Modellen kaldte et navn, der ikke fandtes, og Ollama smed kaldet væk → tomt svar | Instruktionerne bruger det præcise navn `tool-opskrifter-med-tag` + eksempel på argument |
| 5 | Chat-fejl `input[2]: unknown input item type: "item_reference"` (kun med qwen3) | Efter tool-kaldet sender n8n modellens tidligere tænkning som `item_reference` (OpenAI-funktion). Ollama kender den ikke → HTTP 400 | `scripts/ollama_proxy.mjs` fjerner `item_reference`-elementer – eller brug en model uden thinking (`qwen2.5:7b`), så opstår problemet ikke |

## Sådan blev fejlen fundet

1. Ollamas egen log (`~/.ollama/logs/server.log`) viste, at n8n kalder `POST /v1/responses` – og kun én gang pr. besked (dvs. agenten kom aldrig videre end første tur).
2. `scripts/test_ollama_tools.mjs` viste, at `qwen3:14b` laver korrekte tool calls på både `/v1/chat/completions` og `/v1/responses` (med og uden streaming) → modellen og Ollama var ikke problemet.
3. `scripts/ollama_proxy.mjs` logger hver request/svar mellem n8n og Ollama (`data/proxy-log/`). Her kunne man se tool-navnet (`tool-opskrifter-med-tag`), at modellens tænkning nævnte det forkerte navn, og senere den præcise 400-fejl.

## Observationer til rapporten

- n8n sender ~4.900 tegn indbyggede regler + 6 ekstra tools (`get_environment`, `chat_context`, `chat_action`, `delegate_subagent`, `write_todos`, `mark_session_failed`) med til modellen ved hver tur. Det er meget kontekst for en lokal 14B-model og gør svarene langsommere.
- Workflow-tool'ets parameterskema er tomt (`properties: {}`), fordi agent-dialogen ikke kunne se triggerens input `tag` ("This workflow has no defined inputs"). Modellen fik argumentnavnet fra tool-beskrivelsen og instruktionerne i stedet. *Åben: undersøg om triggerens typeVersion fra `src/build_tools.js` er for gammel.*
- `/no_think` i instruktionerne slår ikke qwen3's tænkning fra via Responses API'et (svaret tager 10–15 sek.).
- Proxyen skal køre, når agenten bruges. *Plan: kør den som Docker-service ved siden af Neo4j.*
