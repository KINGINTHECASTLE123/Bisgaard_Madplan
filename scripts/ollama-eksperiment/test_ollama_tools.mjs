// Tester om en Ollama-model kan lave tool calls via Ollamas OpenAI-kompatible API – uden n8n.
// Kør:  node scripts/ollama-eksperiment/test_ollama_tools.mjs [model]      (standard: qwen3:14b)
const model = process.argv[2] || 'qwen3:14b';
const BASE = 'http://localhost:11434/v1';
const tools = [{
  type: 'function',
  function: {
    name: 'opskrifter_med_tag',
    description: 'Finder opskrifter i databasen med et bestemt tag (fx "Vegetar", "Suppe"). Tomt tag giver alle tags.',
    parameters: { type: 'object', properties: { tag: { type: 'string' } }, required: ['tag'] },
  },
}];
const messages = [
  { role: 'system', content: 'Du er en madplanlægger. Brug værktøjet opskrifter_med_tag, når brugeren spørger efter opskrifter med et tag.' },
  { role: 'user', content: 'Hvilke vegetarretter har jeg?' },
];

async function chatCompletions(stream) {
  const t = Date.now();
  const res = await fetch(BASE + '/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ollama' },
    body: JSON.stringify({ model, messages, tools, stream }),
  });
  if (!stream) {
    const j = await res.json();
    const m = j.choices?.[0]?.message;
    console.log(`\n[chat/completions, stream=false] HTTP ${res.status}, ${Date.now() - t} ms`);
    console.log('  tool_calls:', JSON.stringify(m?.tool_calls ?? null));
    console.log('  content:', JSON.stringify((m?.content ?? '').slice(0, 200)));
    return;
  }
  const text = await res.text();
  const tc = text.split('\n').filter((l) => l.includes('tool_calls')).length;
  console.log(`\n[chat/completions, stream=true] HTTP ${res.status}, ${Date.now() - t} ms, ${tc} chunks med tool_calls`);
  console.log('  sidste linjer:', text.trim().split('\n').slice(-3).join(' | ').slice(0, 400));
}

async function responses() {
  const t = Date.now();
  const res = await fetch(BASE + '/responses', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ollama' },
    body: JSON.stringify({
      model,
      input: messages.map((m) => ({ role: m.role, content: m.content })),
      tools: tools.map((x) => ({ type: 'function', ...x.function })),
    }),
  });
  const body = await res.text();
  console.log(`\n[responses] HTTP ${res.status}, ${Date.now() - t} ms`);
  try {
    const j = JSON.parse(body);
    const calls = (j.output || []).filter((o) => o.type === 'function_call');
    console.log('  function_call:', JSON.stringify(calls.map((c) => ({ name: c.name, arguments: c.arguments }))));
    console.log('  output-typer:', (j.output || []).map((o) => o.type).join(', '));
  } catch {
    console.log('  svar:', body.slice(0, 300));
  }
}

async function responsesStream() {
  const t = Date.now();
  const res = await fetch(BASE + '/responses', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ollama' },
    body: JSON.stringify({
      model, stream: true,
      input: messages.map((m) => ({ role: m.role, content: m.content })),
      tools: tools.map((x) => ({ type: 'function', ...x.function })),
    }),
  });
  const text = await res.text();
  const events = text.split('\n').filter((l) => l.startsWith('event:')).map((l) => l.slice(6).trim());
  const counts = {};
  for (const e of events) counts[e] = (counts[e] || 0) + 1;
  console.log(`\n[responses, stream=true] HTTP ${res.status}, ${Date.now() - t} ms`);
  console.log('  events:', JSON.stringify(counts));
  const fc = text.split('\n').filter((l) => l.includes('function_call')).slice(0, 4);
  console.log('  linjer med function_call:', fc.length ? '\n    ' + fc.map((l) => l.slice(0, 300)).join('\n    ') : 'INGEN');
}

console.log('Model:', model);
const only = process.argv[3];
if (only !== 'stream') {
  await chatCompletions(false);
  await chatCompletions(true);
  await responses();
}
await responsesStream();
