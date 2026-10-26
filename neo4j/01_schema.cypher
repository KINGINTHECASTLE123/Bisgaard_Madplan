// Madplan-agent – constraints og indexes
// Kør i Neo4j Browser (http://localhost:7474) eller:
//   docker exec -i neo4j cypher-shell -u neo4j -p "$NEO4J_PASSWORD" < neo4j/01_schema.cypher
// Alle statements er idempotente (IF NOT EXISTS).

// ---------- Opskrifter ----------
CREATE CONSTRAINT recipe_url IF NOT EXISTS
FOR (r:Recipe) REQUIRE r.url IS UNIQUE;

CREATE CONSTRAINT category_name IF NOT EXISTS
FOR (c:Category) REQUIRE c.name IS UNIQUE;

CREATE CONSTRAINT tag_name IF NOT EXISTS
FOR (t:Tag) REQUIRE t.name IS UNIQUE;

// Normaliserede ingredienser (fx "porre", "flødeost med hvidløg")
CREATE CONSTRAINT ingredient_name IF NOT EXISTS
FOR (i:Ingredient) REQUIRE i.name IS UNIQUE;

// ---------- Vektor-delen ----------
CREATE CONSTRAINT chunk_id IF NOT EXISTS
FOR (c:Chunk) REQUIRE c.id IS UNIQUE;

// nomic-embed-text giver 768 dimensioner. Skifter du model, skal tallet ændres
// og indexet genopbygges (DROP INDEX chunk_embedding).
CREATE VECTOR INDEX chunk_embedding IF NOT EXISTS
FOR (c:Chunk) ON (c.embedding)
OPTIONS { indexConfig: {
  `vector.dimensions`: 768,
  `vector.similarity_function`: 'cosine'
}};

// Fuldtekst på titel/beskrivelse – bruges til hybrid søgning (nøgleord + vektor)
CREATE FULLTEXT INDEX recipe_text IF NOT EXISTS
FOR (r:Recipe) ON EACH [r.title, r.description];

// ---------- Tilbud fra Prej ----------
CREATE CONSTRAINT chain_slug IF NOT EXISTS
FOR (ch:Chain) REQUIRE ch.slug IS UNIQUE;

CREATE CONSTRAINT product_id IF NOT EXISTS
FOR (p:Product) REQUIRE p.id IS UNIQUE;

// ---------- Brugerdata ----------
CREATE CONSTRAINT mealplan_id IF NOT EXISTS
FOR (m:MealPlan) REQUIRE m.id IS UNIQUE;

SHOW INDEXES;
