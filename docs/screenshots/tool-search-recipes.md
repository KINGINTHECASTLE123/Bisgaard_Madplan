Tool search recipes

Input
{
  "query": "noget cremet med kylling",
  "maxMinutes": 30,
  "k": 5
}

Output
{
  "executionId": "98",
  "status": "success",
  "data": {
    "Formatér svar": [
      {
        "query": "noget cremet med kylling",
        "filtre": [
          "maks. 30 min"
        ],
        "antal": 5,
        "opskrifter": [
          {
            "titel": "Kylling i cremet sennepssauce",
            "url": "https://www.valdemarsro.dk/kylling-cremet-sennepssauce/",
            "score": 0.872,
            "matchendeChunk": "tips",
            "minutter": 30,
            "portioner": 4,
            "tags": [
              "Gryderetter",
              "Festmad",
              "Franske retter",
              "Familiefavoritter",
              "Nem Hverdagsmad",
              "Efterår",
              "Børnenes livretter"
            ],
            "beskrivelse": "Lækker og nem opskrift på kylling i cremet sennepssauce. Serveret med basmatiris og lyndampede grønne bønner, harricots verts. Det er sådan en lækker ret, der ikke tager lang til at lave og som snildt kan tilberedes både"
          },
          {
            "titel": "Kylling med svampesauce",
            "url": "https://www.valdemarsro.dk/kylling-med-svampesauce/",
            "score": 0.866,
            "matchendeChunk": "fremgangsmaade",
            "minutter": 30,
            "portioner": 4,
            "tags": [
              "Efterår",
              "Vinter",
              "Familiefavoritter"
            ],
            "beskrivelse": "Her får du en dejlig opskrift på stegt kylling med svampesauce. En cremet og vidunderlig sauce med masser af god smag fra svampene og kyllingen som den tilberedes sammen med. Jeg serverer gerne ovnstegte kartofler eller "
          },
          {
            "titel": "Gryderet med kylling",
            "url": "https://www.valdemarsro.dk/gryderet-med-kylling/",
            "score": 0.864,
            "matchendeChunk": "fremgangsmaade",
            "minutter": 30,
            "portioner": 6,
            "tags": [
              "Vinter",
              "Børnenes livretter",
              "Efterår",
              "Nem Hverdagsmad",
              "Bålmad"
            ],
            "beskrivelse": "Gryderet med kylling og grøntsager er nemt og lækkert og denne opskrift har jeg kommet ekstra mange grøntsager i, krydret chorizo og skønne krydderier. Det smager så godt og er lækkert med ris, eller med bagt blomkål og "
          },
          {
            "titel": "Kyllingefrikadeller",
            "url": "https://www.valdemarsro.dk/kyllingefrikadeller/",
            "score": 0.861,
            "matchendeChunk": "tips",
            "minutter": 30,
            "portioner": 4,
            "tags": [
              "Hurtig aftensmad",
              "Madpakker",
              "Børnenes livretter",
              "Buffet",
              "Nem Hverdagsmad",
              "Familiefavoritter"
            ],
            "beskrivelse": "Opskrift på klassiske kyllingefrikadeller, som er saftige, milde og med en god smag af kyllingekød. De kan serveres til alt fra kartoffelsalat til kogte kartofler og brun sovs. Disse lækre nemme frikadeller med kylling e"
          },
          {
            "titel": "Asiatisk kyllingebowl",
            "url": "https://www.valdemarsro.dk/asiatisk-kyllingebowl/",
            "score": 0.86,
            "matchendeChunk": "fremgangsmaade-1",
            "minutter": 30,
            "portioner": 4,
            "tags": [
              "Nem Hverdagsmad",
              "Asiatisk"
            ],
            "beskrivelse": "Asiatisk kyllingebowl med ris, spinat, super saftig og sprød kylling, samt den lækreste cremede og krydrede asiatiske mayodressing. Jeg har holdt retten ret enkel i denne omgang – men hvis du har lyst til at lave den mer"
          }
        ],
        "kilde": "Neo4j: vector index chunk_embedding (nomic-embed-text, cosine) + (Recipe)-[:HAS_TAG]->(Tag), Recipe.totalMinutes",
        "note": "Score er semantisk lighed (0–1), ikke en garanti for relevans. Link altid til url."
      }
    ]
  }
}
