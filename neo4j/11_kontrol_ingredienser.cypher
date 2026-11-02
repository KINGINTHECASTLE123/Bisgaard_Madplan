// Kontrol efter workflow 02 (normalisering).  Kør:  bash scripts/cypher.sh < neo4j/11_kontrol_ingredienser.cypher
MATCH (i:Ingredient) RETURN count(i) AS ingredienser, sum(CASE WHEN i.pantry THEN 1 ELSE 0 END) AS basisvarer;
MATCH ()-[u:USES]->() RETURN count(u) AS uses;
MATCH (r:Recipe) WHERE NOT (r)-[:USES]->() RETURN count(r) AS opskrifterUdenIngredienser;
MATCH (i:Ingredient {pantry: false})<-[:USES]-(r:Recipe)
RETURN i.name AS ingrediens, count(DISTINCT r) AS opskrifter ORDER BY opskrifter DESC, ingrediens LIMIT 20;
MATCH (r:Recipe {title: 'Porresuppe'})-[u:USES]->(i:Ingredient)
RETURN u.raw AS raa, i.name AS navn, u.amount AS maengde, u.unit AS enhed, u.section AS sektion, i.pantry AS basis ORDER BY u.line;
