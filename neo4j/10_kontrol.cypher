// Kontrolqueries efter ingestion.  Kør:  bash scripts/cypher.sh < neo4j/10_kontrol.cypher
MATCH (r:Recipe) RETURN count(r) AS opskrifter;
MATCH (c:Chunk) RETURN count(c) AS chunks, count(c.embedding) AS medEmbedding,
       min(size(c.embedding)) AS minDim, max(size(c.embedding)) AS maxDim;
MATCH (r:Recipe) OPTIONAL MATCH (r)-[:HAS_TAG]->(t:Tag) OPTIONAL MATCH (r)-[:IN_CATEGORY]->(k:Category)
RETURN r.title AS titel, k.name AS kategori, collect(DISTINCT t.name) AS tags,
       size(r.ingredientLines) AS ingredienser, r.totalMinutes AS minutter, r.servings AS portioner
ORDER BY titel;
MATCH (c:Chunk) RETURN c.recipeTitle AS opskrift, c.type AS chunk, size(c.text) AS tegn ORDER BY opskrift, chunk;
MATCH (r:Recipe) WHERE size(coalesce(r.ingredientLines, [])) = 0 RETURN r.url AS udenIngredienser;
MATCH (a:Recipe)-[rel:SERVED_WITH|SEE_ALSO]->(b:Recipe) RETURN type(rel) AS relation, count(*) AS antal;
MATCH (r:Recipe) RETURN r.title AS titel, r.shelfLife AS holdbarhed, r.freezable AS kanFryses, size(r.tips) AS tips,
       size(r.serveWith) AS serveringsforslag, size(r.seeAlso) AS proevOgsaa, size(r.description) AS beskrivelseTegn ORDER BY titel;
