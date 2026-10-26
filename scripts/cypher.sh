#!/usr/bin/env bash
# Kør Cypher mod den lokale Neo4j.  Brug:  bash scripts/cypher.sh "MATCH (n) RETURN count(n)"
#                                    eller: bash scripts/cypher.sh < fil.cypher
cd "$(dirname "$0")/.." || exit 1
set -a; . ./.env; set +a
if [ $# -gt 0 ]; then
  docker exec neo4j cypher-shell -u neo4j -p "$NEO4J_PASSWORD" "$*"
else
  docker exec -i neo4j cypher-shell -u neo4j -p "$NEO4J_PASSWORD"
fi
