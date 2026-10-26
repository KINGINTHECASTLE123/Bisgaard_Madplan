#!/usr/bin/env bash
# Trin 0b · Starter Neo4j, forbinder n8n til netværket "madplan" og kører schemaet.
# Idempotent – kan køres igen uden skade. Sletter ingen data.
# Kør fra projektmappen:  bash scripts/01_neo4j_op.sh
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
N8N=${N8N_CONTAINER:-n8n}

echo "== Starter Neo4j"
docker compose up -d

echo "== Venter på Neo4j (første gang hentes APOC, det kan tage et minut)"
for i in $(seq 1 90); do
  if docker exec neo4j cypher-shell -u neo4j -p "$NEO4J_PASSWORD" "RETURN 1" >/dev/null 2>&1; then
    echo "Neo4j er klar"; break
  fi
  if [ "$i" = 90 ]; then echo "Neo4j kom ikke op – se: docker logs neo4j"; exit 1; fi
  sleep 2
done

echo "== Forbinder $N8N til netværket madplan"
if docker inspect "$N8N" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' | grep -qw madplan; then
  echo "Allerede forbundet"
else
  docker network connect madplan "$N8N" && echo "Forbundet"
fi

echo "== Kører neo4j/01_schema.cypher"
docker exec -i neo4j cypher-shell -u neo4j -p "$NEO4J_PASSWORD" < neo4j/01_schema.cypher

echo "== APOC"
docker exec neo4j cypher-shell -u neo4j -p "$NEO4J_PASSWORD" "RETURN apoc.version() AS apoc"

echo "== Kan n8n nå Neo4j og Ollama?"
docker exec "$N8N" node -e "
const t = async (n, u) => { try { const r = await fetch(u); console.log(n, 'OK', r.status); } catch (e) { console.log(n, 'FEJL', e.cause?.code || e.message); } };
(async () => { await t('Neo4j  http://neo4j:7474', 'http://neo4j:7474'); await t('Ollama http://host.docker.internal:11434', 'http://host.docker.internal:11434/api/tags'); })();"
