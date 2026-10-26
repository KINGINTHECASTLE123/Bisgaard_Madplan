#!/usr/bin/env bash
# Trin 0 · Statustjek. Ændrer intet i Docker.
# Eneste ændring: opretter .env med en tilfældig Neo4j-adgangskode, hvis filen mangler.
# Kør fra projektmappen:  bash scripts/00_status.sh
cd "$(dirname "$0")/.." || exit 1

echo "== Docker"
if ! docker version --format 'Server {{.Server.Version}}' 2>/dev/null; then
  echo "Docker svarer ikke – start Docker Desktop og kør scriptet igen."; exit 1
fi

echo; echo "== Containere"
docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'

N8N=$(docker ps -a --format '{{.Names}} {{.Image}}' | awk 'tolower($0) ~ /n8n/ {print $1; exit}')
echo; echo "== n8n-container: ${N8N:-IKKE FUNDET}"
if [ -n "$N8N" ]; then
  echo -n "n8n-version: "; docker exec "$N8N" n8n --version 2>&1 || echo "(kører ikke – start containeren for at se version)"
  docker inspect "$N8N" --format 'Image: {{.Config.Image}}
Netværk: {{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}
Mounts: {{range .Mounts}}[{{.Type}} {{.Name}}{{.Source}} -> {{.Destination}}] {{end}}
Restart: {{.HostConfig.RestartPolicy.Name}}
Porte: {{json .HostConfig.PortBindings}}
Compose-mappe: {{index .Config.Labels "com.docker.compose.project.working_dir"}}
Compose-fil: {{index .Config.Labels "com.docker.compose.project.config_files"}}'
  echo "Env-variabler (kun navne + ikke-hemmelige værdier):"
  docker inspect "$N8N" --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | grep -E '^(N8N_|DB_|GENERIC_TIMEZONE|TZ=|WEBHOOK)' \
    | sed -E 's/^([A-Z0-9_]*(KEY|PASS|PASSWORD|SECRET|TOKEN)[A-Z0-9_]*)=.*/\1=<skjult>/'
fi

echo; echo "== Docker-netværk"; docker network ls --format '{{.Name}}' | tr '\n' ' '; echo
echo "== Volumes";        docker volume ls --format '{{.Name}}' | tr '\n' ' '; echo

echo; echo "== Ollama"
if command -v ollama >/dev/null; then ollama list; else echo "ollama-kommandoen ikke fundet"; fi

echo; echo "== .env"
if [ -f .env ]; then
  echo ".env findes. Nøgler:"; grep -oE '^[A-Z_]+=' .env | tr '\n' ' '; echo
else
  PW=$(openssl rand -hex 12)
  printf 'NEO4J_PASSWORD=%s\nPREJ_API_KEY=\n' "$PW" > .env && chmod 600 .env
  echo ".env oprettet med tilfældig NEO4J_PASSWORD. PREJ_API_KEY udfyldes senere."
fi
