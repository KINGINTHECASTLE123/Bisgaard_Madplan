// Kompatibilitets-proxy + log mellem n8n's Agents og Ollama.
// Lytter på :11435 og sender alt videre til Ollama (standard 127.0.0.1:11434).
//
// Hvorfor: n8n's Agents bruger OpenAI's Responses API (/v1/responses). Efter et tool-kald sender n8n
// modellens tidligere tænkning tilbage som {"type":"item_reference","id":"rs_…"} – en OpenAI-funktion,
// som Ollama afviser med 400 "unknown input item type". Proxyen fjerner de henvisninger, før requesten
// sendes videre. Alt andet sendes uændret. Hver request + svar gemmes i data/proxy-log/ (ikke i git).
//
// Kør:  node scripts/ollama_proxy.mjs      (stop med Ctrl+C)
// n8n-credential (OpenAI): Base URL = http://host.docker.internal:11435/v1, API key = ollama
import http from 'node:http';
const UPSTREAM_HOST = process.env.OLLAMA_UPSTREAM_HOST || '127.0.0.1';
const UPSTREAM_PORT = Number(process.env.OLLAMA_UPSTREAM_PORT || 11434);
const LOG = process.env.PROXY_LOG !== '0';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const logDir = path.join(root, 'data', 'proxy-log');
fs.mkdirSync(logDir, { recursive: true });
let n = 0;

http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const id = `${new Date().toISOString().replace(/[:.]/g, '-')}_${String(++n).padStart(3, '0')}`;
    let parsed = null;
    try { parsed = JSON.parse(body.toString() || 'null'); } catch {}
    let fixed = '';
    if (parsed && Array.isArray(parsed.input)) {
      const before = parsed.input.length;
      parsed.input = parsed.input.filter((it) => it?.type !== 'item_reference');
      const removed = before - parsed.input.length;
      if (removed) fixed = ` (fjernede ${removed} item_reference)`;
    }
    const outBody = parsed && fixed ? Buffer.from(JSON.stringify(parsed)) : body;
    const tools = (parsed?.tools || []).map((t) => t.name || t.function?.name);
    console.log(`→ ${id} ${req.method} ${req.url} model=${parsed?.model ?? '-'} stream=${parsed?.stream ?? '-'} tools=[${tools.join(', ')}]${fixed}`);

    const headers = { ...req.headers, host: `${UPSTREAM_HOST}:${UPSTREAM_PORT}` };
    headers['content-length'] = String(outBody.length);
    delete headers['transfer-encoding'];
    const up = http.request({ host: UPSTREAM_HOST, port: UPSTREAM_PORT, path: req.url, method: req.method, headers }, (upRes) => {
      res.writeHead(upRes.statusCode, upRes.headers);
      const out = [];
      upRes.on('data', (c) => { out.push(c); res.write(c); });
      upRes.on('end', () => {
        res.end();
        const text = Buffer.concat(out).toString();
        if (LOG) fs.writeFileSync(path.join(logDir, id + '.json'), JSON.stringify({
          method: req.method, url: req.url, status: upRes.statusCode, request: parsed ?? body.toString(),
          response: text.length > 200000 ? text.slice(0, 200000) + '…' : text,
        }, null, 2));
        const calls = [...text.matchAll(/"name":"([^"]+)","status":"[^"]*","type":"function_call"|"type":"function_call"[^}]*"name":"([^"]+)"/g)].map((m) => m[1] || m[2]);
        console.log(`← ${id} ${upRes.statusCode} ${text.length} bytes${calls.length ? ' function_call=' + [...new Set(calls)].join(',') : ''}`);
      });
    });
    up.on('error', (e) => { console.log('✗', e.message); res.writeHead(502); res.end(e.message); });
    up.end(outBody);
  });
}).listen(11435, '0.0.0.0', () =>
  console.log(`Ollama-proxy kører på :11435 → ${UPSTREAM_HOST}:${UPSTREAM_PORT}.${LOG ? ' Logs i data/proxy-log/' : ''}`));
