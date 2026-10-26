# Beslutninger

Kort log over valg undervejs, så de kan genfindes i rapporten og i agentens instruktioner.

| Dato | Beslutning | Begrundelse |
|---|---|---|
| 26/10 | Neo4j kører lokalt i Docker, ikke i Aura | 0 kr., ingen grænser, fuld opskriftstekst bliver på egen maskine, n8n når den på Docker-netværket `madplan` |
| 26/10 | Afleveres som privat GitHub-repo med adgang for underviseren | Historik og prompt-log er synlige |
| 26/10 | `description` hentes som HTML og klippes ved `div.post-recipe` | Elementet indeholder ellers hele opskriftsboksen |
| 26/10 | Tips, holdbarhed, "kan fryses" og relaterede opskrifter hentes med | Tips giver en ekstra chunk (erstatninger), relaterede opskrifter giver Recipe→Recipe-relationer |
| 26/10 | Favoritlisten (46 opskrifter) ligger i `data/favoritter.txt` | Én kilde til både cache-script og n8n-workflow |
| 26/10 | Madplanen har som udgangspunkt **én vegetardag om ugen**, resten er kød/fisk | Husstanden spiser generelt ikke vegetarisk. Kun 4–5 vegetarretter i favoritterne er nok til én dag om ugen, men ikke til en hel vegetaruge. Det er en kendt begrænsning |
| 26/10 | Hele ingestion skrives i **én Neo4j-transaktion** (alle opskrifter + chunks, til sidst koblingen SEE_ALSO/SERVED_WITH) | Første kørsel gav `DeadlockDetected`: n8n's HTTP-node sender requests parallelt (batching forsinker kun starten), og transaktionerne låste de samme Tag/Category-noder. Én transaktion fjerner konflikten og gør importen alt-eller-intet |
