const express = require('express');
const { randomUUID } = require('crypto');
const OpenAI = require('openai');
const db = require('../../db/database');

// In-memory sessions for v3 console-first prototype
// Each session: { id, seed, state: { room, inventory: [] }, convo: [{role,content}], logs: [], stats: {} }
const sessions = new Map();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const router = express.Router();

// Utility: safe JSON schema validation (minimal for now)
function validateRoomJson(obj) {
  try {
    if (!obj) return 'missing object';
    if (typeof obj.room_id !== 'string') return 'room_id must be string';
    if (typeof obj.title !== 'string') return 'title must be string';
    if (typeof obj.description !== 'string') return 'description must be string';
    if (!Array.isArray(obj.exits)) return 'exits must be array';
    for (const ex of obj.exits) {
      if (typeof ex.exit_id !== 'string') return 'exit.exit_id must be string';
      if (typeof ex.label !== 'string') return 'exit.label must be string';
      if (!Array.isArray(ex.keywords)) return 'exit.keywords must be array';
    }
    if (obj.items && !Array.isArray(obj.items)) return 'items must be array if present';
    return null;
  } catch (e) {
    return 'exception during validation: ' + e.message;
  }
}

function correlation() {
  return randomUUID();
}

function nowIso() { return new Date().toISOString(); }

async function logEvent(sessionId, corr, level, route, message, details) {
  try {
    const s = sessions.get(sessionId);
    const entry = { ts: nowIso(), corr, level, route, message, details: details || null };
    if (s) {
      s.logs = s.logs || [];
      s.logs.push(entry);
      // keep last 200 logs per session in memory
      if (s.logs.length > 200) s.logs.splice(0, s.logs.length - 200);
    }
    // Persist to DB logs when available; use user_id='v3', world_id=sessionId
    try {
      await db.logAction('v3', sessionId || 'unknown', `${route}:${level}`, { corr, message, details });
    } catch (e) {
      // swallow DB errors; in-memory logs still exist
    }
  } catch {}
}

async function callModelForRoom(payload, description) {
  // Ask the model for STRICT JSON by providing a schema and enabling json_schema response format.
  const system = `You are generating a text adventure room as strict JSON only. This is a game similar in style to Zork or Oregon Trail. The player begins in a cave with five glowing entrances. Always steer the player toward picking an entrance. Always return valid JSON matching the schema. No prose outside JSON.`;
  const developer = `Return compact JSON ONLY with fields: room_id (string), title (string), description (max 2 sentences), exits (array of 5 objects: {exit_id,label,keywords[]} with short labels and keywords including 1..5 if start), items (array of objects or empty). No extra fields, no markdown, no narration.`;
  const user = JSON.stringify(payload);

  // JSON schema for the room structure
  const roomSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      room_id: { type: 'string' },
      title: { type: 'string' },
      description: { type: 'string' },
      exits: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            exit_id: { type: 'string' },
            label: { type: 'string' },
            keywords: { type: 'array', items: { type: 'string' } },
          },
          required: ['exit_id', 'label', 'keywords']
        }
      },
      items: { type: 'array', items: { type: 'object' } }
    },
    required: ['room_id', 'title', 'description', 'exits']
  };

  const start = Date.now();
  try {
    const resp = await openai.responses.create({
      model: process.env.PROMPT_MODEL || 'gpt-5-nano',
      // Give headroom to avoid truncation
      max_output_tokens: 512,
      input: [
        { role: 'system', content: system },
        { role: 'developer', content: developer },
        { role: 'user', content: user }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'room', schema: roomSchema, strict: true }
      }
    });
    const duration = Date.now() - start;
    const text = resp.output_text || resp.choices?.[0]?.message?.content || '';
    return { text, usage: resp.usage, duration_ms: duration, response: resp };
  } catch (e) {
    const duration = Date.now() - start;
    const err = new Error(`LLM request failed (${description || 'room'}): ${e.message || e}`);
    err.cause = e;
    err.duration_ms = duration;
    throw err;
  }
}

// Helper to slice last N convo messages
function convoSlice(session, n = 8) {
  const c = session?.convo || [];
  return c.slice(-n);
}

// POST /v3/api/console/start
router.post('/start', async (req, res) => {
  const corr = correlation();
  console.log(`[v3/start] corr=${corr} incoming`);
  await logEvent(null, corr, 'info', 'v3/start', 'incoming', null);
  try {
    const requestedId = req.body?.session_id;
    let id = requestedId || randomUUID();
    // Reuse existing session created by start-stream if present
    let sess = sessions.get(id);
    if (!sess) {
      sess = { id, seed: randomUUID(), state: { room: null, inventory: [] }, convo: [], stats: {}, logs: [] };
      sessions.set(id, sess);
    }
    const seed = sess.seed;

    // If background JSON generation already prepared state, return fast
    if (sess.state.room) {
      await logEvent(id, corr, 'info', 'v3/start', 'using precomputed state', null);
      return res.json({ success: true, correlation_id: corr, session_id: id, message: 'You awaken in a cave of five glowing entrances...', state: sess.state, debug: { model: process.env.PROMPT_MODEL || 'gpt-5-nano', reason: 'precomputed' } });
    }
    // Else, if a background promise is running, await it briefly
    if (sess.pendingStartPromise) {
      try { await sess.pendingStartPromise; } catch {}
      if (sess.state.room) {
        await logEvent(id, corr, 'info', 'v3/start', 'awaited precomputed state', null);
        return res.json({ success: true, correlation_id: corr, session_id: id, message: 'You awaken in a cave of five glowing entrances...', state: sess.state, debug: { model: process.env.PROMPT_MODEL || 'gpt-5-nano', reason: 'awaited-precomputed' } });
      }
      // If background failed to produce JSON, include the reason in debug
      if (sess.bgJsonError) {
        await logEvent(id, corr, 'warn', 'v3/start', 'bg-json missing/failed', { error: sess.bgJsonError });
      }
    }

    const payload = {
      kind: 'start_room',
      seed,
      instruction: 'Create the starting cave room with five glowing entrances (space/sci-fi, historic, scary, travel mystery, fantasy). Provide 3-5 suggested commands in a top-level field suggestions (array of strings).',
    };

    console.log(`[v3/start] corr=${corr} calling model (start room)`);
    await logEvent(null, corr, 'info', 'v3/start', 'calling model (start room)', { payloadKind: 'start_room' });
    await logEvent(id, corr, 'info', 'v3/start', 'llm request', { model: process.env.PROMPT_MODEL || 'gpt-5-nano', payloadPreview: JSON.stringify(payload).slice(0, 500) });
let text, usage, duration_ms;
    try {
      const resp = await callModelForRoom(payload, 'start room');
      text = resp.text; usage = resp.usage; duration_ms = resp.duration_ms;
      console.log(`[v3/start] corr=${corr} model returned in ${duration_ms}ms, usage=${JSON.stringify(usage||{})}`);
      await logEvent(null, corr, 'info', 'v3/start', 'model returned', { duration_ms, usage });
    } catch (e) {
      console.error(`[v3/start] corr=${corr} model error: ${e.message}`);
      await logEvent(null, corr, 'error', 'v3/start', 'model error', { error: e.message, duration_ms: e.duration_ms });
      return res.status(502).json({ success: false, correlation_id: corr, error: 'Model error: ' + e.message });
    }
    // Debug: truncate long text
    console.log(`[v3/start] corr=${corr} raw length=${(text||'').length}`);
    let json;
    try { json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || text); } catch (e) {
      console.error(`[v3/start] corr=${corr} parse error: ${e.message}`);
      await logEvent(null, corr, 'error', 'v3/start', 'parse error', { error: e.message });
      return res.status(502).json({ success: false, correlation_id: corr, error: 'Invalid JSON from model', raw: text });
    }
    const err = validateRoomJson(json);
    if (err) {
      console.error(`[v3/start] corr=${corr} schema error: ${err}`);
      await logEvent(null, corr, 'error', 'v3/start', 'schema error', { error: err });
      return res.status(502).json({ success: false, correlation_id: corr, error: 'Schema validation failed: ' + err, raw: json });
    }

    // Ensure numeric keywords 1..5 for five-entrance start rooms
    if (Array.isArray(json.exits) && json.exits.length === 5) {
      json.exits = json.exits.map((ex, idx) => {
        const k = new Set([...(ex.keywords || [])]);
        k.add(String(idx + 1));
        return { ...ex, keywords: Array.from(k) };
      });
    }

    sess.state.room = json;
    sess.stats.first_latency_ms = duration_ms;
    sess.stats.usage = usage;
    // Start-of-game assistant narrative might already be in convo from start-stream
    await logEvent(id, corr, 'success', 'v3/start', 'session initialized', { session_id: id });

    return res.json({ success: true, correlation_id: corr, session_id: id, message: 'You awaken in a cave of five glowing entrances...', state: sess.state, debug: { model: process.env.PROMPT_MODEL || 'gpt-5-nano' } });
  } catch (e) {
    await logEvent(null, corr, 'error', 'v3/start', 'unhandled error', { error: e.message });
    return res.status(500).json({ success: false, correlation_id: corr, error: e.message });
  }
});

// POST /v3/api/console/command
router.post('/command', async (req, res) => {
  const corr = correlation();
  console.log(`[v3/command] corr=${corr} incoming`);
  await logEvent(null, corr, 'info', 'v3/command', 'incoming', null);
  try {
    const { session_id, command } = req.body || {};
    console.log(`[v3/command] corr=${corr} payload session_id=${session_id} command=${JSON.stringify(command)}`);
    await logEvent(session_id, corr, 'info', 'v3/command', 'payload', { command });
    if (!session_id || !command) return res.status(400).json({ success: false, correlation_id: corr, error: 'session_id and command are required' });
    const s = sessions.get(session_id);
    if (!s) return res.status(404).json({ success: false, correlation_id: corr, error: 'Session not found' });

    // Minimal logic: let the model interpret commands. Only special-case simple utilities.
    const lower = String(command).trim().toLowerCase();
    if (['help', '?'].includes(lower)) {
      return res.json({ success: true, correlation_id: corr, message: 'Commands: look, examine X, inventory, go N|east|color|label|1..5, try again N|label, back (not yet), quit', state: s.state });
    }
    if (lower === 'look') {
      return res.json({ success: true, correlation_id: corr, message: s.state.room.description, state: s.state });
    }
    if (lower.startsWith('inventory')) {
      const inv = s.state.inventory || [];
      return res.json({ success: true, correlation_id: corr, message: inv.length ? inv.map(i => i.name || i).join(', ') : 'Inventory is empty.', state: s.state });
    }
    if (lower.startsWith('try again')) {
      console.log(`[v3/command] corr=${corr} action=try-again`);
      await logEvent(session_id, corr, 'info', 'v3/command', 'try-again', null);
      // allow reroll of a specific exit label by index or keyword
      const arg = lower.replace('try again', '').trim();
      const exits = s.state.room.exits || [];
      let idx = -1;
      if (/^\d$/.test(arg)) idx = parseInt(arg,10)-1;
      if (idx < 0) idx = exits.findIndex(e => e.label.toLowerCase().includes(arg));
      if (idx < 0 || !exits[idx]) {
        return res.json({ success: true, correlation_id: corr, message: 'Specify which portal to reroll (e.g., "Try again 3" or part of its label).', state: s.state });
      }
      // Ask model to re-suggest just that exit label
      const payload = { kind: 'reroll_exit_label', seed: s.seed, current_room: s.state.room, exit_index: idx };
      console.log(`[v3/command] corr=${corr} calling model (reroll exit) idx=${idx}`);
      await logEvent(session_id, corr, 'info', 'v3/command', 'calling model (reroll exit)', { idx });
let text;
      try {
        const resp = await callModelForRoom(payload, 'reroll exit');
        text = resp.text;
      } catch (e) {
        await logEvent(session_id, corr, 'error', 'v3/command', 'model error (reroll)', { error: e.message });
        return res.status(502).json({ success: false, correlation_id: corr, message: 'Model error during reroll: ' + e.message });
      }
      console.log(`[v3/command] corr=${corr} model returned (reroll), raw length=${(text||'').length}`);
      let json; try { json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || text); } catch { json = null; }
      if (!json || !json.exits || !json.exits[idx]) {
        console.error(`[v3/command] corr=${corr} reroll parse/shape error`);
        await logEvent(session_id, corr, 'error', 'v3/command', 'reroll parse/shape error', null);
        return res.status(502).json({ success: false, correlation_id: corr, message: 'Model failed to reroll exit label. Please retry.' });
      }
      // Only replace the chosen exit label and keywords if provided
      s.state.room.exits[idx].label = json.exits[idx].label || s.state.room.exits[idx].label;
      if (Array.isArray(json.exits[idx].keywords)) s.state.room.exits[idx].keywords = json.exits[idx].keywords;
      return res.json({ success: true, correlation_id: corr, message: `The portal shimmers and now reads: ${s.state.room.exits[idx].label}`, state: s.state });
    }

    if (false) { // no manual parsing; model decides movement
      console.log(`[v3/command] corr=${corr} action=go`);
      await logEvent(session_id, corr, 'info', 'v3/command', 'go', null);
      let arg = lower.replace(/^go\s+/, '').trim();
      const exits = s.state.room.exits || [];
      let target = null;
      // Extract number from phrases like "door number 3" or "3"
      const numMatch = arg.match(/\b([1-9])\b/);
      if (numMatch) {
        const i = parseInt(numMatch[1], 10) - 1;
        if (exits[i]) target = exits[i];
      }
      // Fallback: keyword includes
      if (!target) target = exits.find(e => (e.keywords||[]).some(k => arg.includes(k.toLowerCase())) || e.label.toLowerCase().includes(arg));
      if (!target) return res.json({ success: true, correlation_id: corr, message: 'Which way? Match a number 1-5, a theme keyword, direction, or part of a portal label.', state: s.state });

      // Request next room from model given chosen exit
      const payload = {
        kind: 'next_room', seed: s.seed,
        previous_room: s.state.room,
        chosen_exit_id: target.exit_id,
        instruction: 'Generate the next room entered via the chosen exit. Include a short challenge the player must overcome. Ensure exits provided, items/NPCs if any. Do not generate rooms beyond one hop.'
      };
      console.log(`[v3/command] corr=${corr} calling model (next room)`);
      await logEvent(session_id, corr, 'info', 'v3/command', 'calling model (next room)', { exit: target.exit_id });
let text;
      try {
        const resp = await callModelForRoom(payload, 'next room');
        text = resp.text;
      } catch (e) {
        await logEvent(session_id, corr, 'error', 'v3/command', 'model error (next room)', { error: e.message });
        return res.status(502).json({ success: false, correlation_id: corr, message: 'Model error while generating next room: ' + e.message });
      }
      console.log(`[v3/command] corr=${corr} model returned (next), raw length=${(text||'').length}`);
      let json; try { json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || text); } catch (e) {
        console.error(`[v3/command] corr=${corr} next-room parse error: ${e.message}`);
        await logEvent(session_id, corr, 'error', 'v3/command', 'next-room parse error', { error: e.message });
        return res.status(502).json({ success: false, correlation_id: corr, message: 'Invalid JSON from model. Try the command again.' });
      }
      const err = validateRoomJson(json);
      if (err) {
        console.error(`[v3/command] corr=${corr} schema error: ${err}`);
        await logEvent(session_id, corr, 'error', 'v3/command', 'schema error', { error: err });
        return res.status(502).json({ success: false, correlation_id: corr, message: 'Schema validation failed: ' + err });
      }

      s.history.push({ from: s.state.room.room_id, to: json.room_id, command });
      s.state.room = json;
      await logEvent(session_id, corr, 'success', 'v3/command', 'moved', { to: json.room_id });
      return res.json({ success: true, correlation_id: corr, message: json.description, state: s.state });
    }

    if (lower === 'quit') {
      sessions.delete(session_id);
      return res.json({ success: true, correlation_id: corr, message: 'Session ended.' });
    }

    // Let the model respond and update JSON based on conversation and current state
    const payload = {
      kind: 'update_from_conversation',
      seed: s.seed,
      current_room: s.state.room,
      recent_messages: convoSlice(s, 8),
      instruction: 'Using the recent conversation and current room, update the world: you may move rooms, add/remove items, or modify exits/NPCs. Return strictly valid JSON for the new current room. Include a short challenge if entering a new room.'
    };
    console.log(`[v3/command] corr=${corr} calling model (update_from_conversation)`);
    await logEvent(session_id, corr, 'info', 'v3/command', 'calling model (update_from_conversation)', null);
    await logEvent(session_id, corr, 'info', 'v3/command', 'llm request', { model: process.env.PROMPT_MODEL || 'gpt-5-nano', payloadPreview: JSON.stringify(payload).slice(0, 500) });
let text;
    try {
      const resp = await callModelForRoom(payload, 'update_from_conversation');
      text = resp.text;
    } catch (e) {
      await logEvent(session_id, corr, 'error', 'v3/command', 'model error (update_from_conversation)', { error: e.message });
      return res.status(502).json({ success: false, correlation_id: corr, message: 'Model error: ' + e.message });
    }
    let json; try { json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || text); } catch (e) {
      console.error(`[v3/command] corr=${corr} update parse error: ${e.message}`);
      await logEvent(session_id, corr, 'error', 'v3/command', 'update parse error', { error: e.message });
      return res.status(502).json({ success: false, correlation_id: corr, message: 'Invalid JSON from model. Try again.' });
    }
    const err2 = validateRoomJson(json);
    if (err2) {
      console.error(`[v3/command] corr=${corr} update schema error: ${err2}`);
      await logEvent(session_id, corr, 'error', 'v3/command', 'update schema error', { error: err2 });
      return res.status(502).json({ success: false, correlation_id: corr, message: 'Schema validation failed: ' + err2 });
    }

    s.state.room = json;
    // Persist game state
    try { await db.saveGameState('v3', session_id, { currentRoom: json.room_id, inventory: s.state.inventory || [], health: 100, score: 0, state: s.state }); } catch {}
    await logEvent(session_id, corr, 'success', 'v3/command', 'state updated', { room_id: json.room_id });
    return res.json({ success: true, correlation_id: corr, message: json.description, state: s.state });
  } catch (e) {
    return res.status(500).json({ success: false, correlation_id: corr, error: e.message });
  }
});

// GET /v3/api/console/logs?session_id=...&limit=100
router.get('/logs', async (req, res) => {
  const session_id = req.query.session_id;
  const limit = parseInt(req.query.limit || '100', 10);
  if (!session_id) return res.status(400).json({ success: false, error: 'session_id required' });
  const s = sessions.get(session_id);
  if (!s) return res.status(404).json({ success: false, error: 'Session not found' });
  const logs = (s.logs || []).slice(-limit);
  return res.json({ success: true, session_id, count: logs.length, logs });
});

// POST /v3/api/console/start-stream (SSE-like via chunked fetch)
router.post('/start-stream', async (req, res) => {
  const corr = correlation();
  console.log(`[v3/start-stream] corr=${corr} incoming`);
  await logEvent(null, corr, 'info', 'v3/start-stream', 'incoming', null);

  // Create session ID immediately so client can attach it to the JSON call after streaming
  const id = randomUUID();
  const seed = randomUUID();
  let sess = { id, seed, state: { room: null, inventory: [] }, convo: [], stats: {}, logs: [] };
  sessions.set(id, sess);

  // Wire response headers for streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') try { res.flushHeaders(); } catch {}

  function sse(obj) {
    try {
      const payload = { correlation_id: corr, ts: nowIso(), ...obj };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch {}
  }

  // Emit session event first
  sse({ type: 'session', session_id: id });

  try {
    const system = `You are a vivid narrator for a text adventure. The user awakens in a cave with five glowing entrances. Keep it concise (2 short paragraphs max). Encourage the player to choose an entrance.`;
    const user = `Describe the starting cave and the five glowing entrances with these themes: space/sci-fi, historic, scary, travel mystery, fantasy. Each entrance should hint its theme. End with a short prompt (e.g., 'Choose an entrance (1-5) or say a theme').`;

    const model = process.env.PROMPT_MODEL || 'gpt-5-nano';
    sse({ type: 'debug', stage: 'command-stream', model, system, user });
    // Emit debug of what we send to LLM (sanitized)
    sse({ type: 'debug', stage: 'start-stream', model, system, user });
    const start = Date.now();
    // Kick off background JSON world computation immediately to avoid client waiting later
    (async () => {
      try {
        const payload = {
          kind: 'start_room',
          seed,
          instruction: 'Create the starting cave room with five glowing entrances (space/sci-fi, historic, scary, travel mystery, fantasy). Provide 3-5 suggested commands in a top-level field suggestions (array of strings).',
        };
        await logEvent(id, corr, 'info', 'v3/start-stream', 'bg llm request (start JSON)', { model: process.env.PROMPT_MODEL || 'gpt-5-nano' });
        const bgT0 = Date.now();
        sse({ type: 'debug', stage: 'bg-json', event: 'started' });
        sess.bgJsonError = null;
        sess.pendingStartPromise = callModelForRoom(payload, 'start room').then(({ text, duration_ms }) => {
          let json;
          let parseError = null;
          try {
            json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || text);
          } catch (e) {
            parseError = e;
          }
          const bgElapsed = Date.now() - bgT0;
          if (json && !sess.state.room) {
            // Ensure numeric keywords 1..5 for five-entrance start rooms
            if (Array.isArray(json.exits) && json.exits.length === 5) {
              json.exits = json.exits.map((ex, idx) => ({
                ...ex,
                keywords: Array.from(new Set([...(ex.keywords || []), String(idx+1)]))
              }));
            }
            sess.state.room = json;
            try { sse({ type: 'debug', stage: 'bg-json', event: 'completed', duration_ms: bgElapsed, model_duration_ms: duration_ms }); } catch {}
            logEvent(id, corr, 'info', 'v3/start-stream', 'bg json completed', { duration_ms: bgElapsed });
          } else {
            const errMsg = parseError ? `parse error: ${parseError.message}` : 'no JSON returned';
            sess.bgJsonError = errMsg;
            try { sse({ type: 'debug', stage: 'bg-json', event: 'failed', error: errMsg, duration_ms: bgElapsed }); } catch {}
            logEvent(id, corr, 'error', 'v3/start-stream', 'bg json failed', { error: errMsg, duration_ms: bgElapsed });
          }
          sess.pendingStartPromise = null;
        }).catch((e) => { const bgElapsed = Date.now() - bgT0; try { sse({ type: 'debug', stage: 'bg-json', event: 'failed', error: e.message || String(e), duration_ms: bgElapsed }); } catch {}; sess.bgJsonError = e.message || String(e); sess.pendingStartPromise = null; logEvent(id, corr, 'error', 'v3/start-stream', 'bg json exception', { error: e.message || String(e), duration_ms: bgElapsed }); });
      } catch {}
    })();

    const stream = await (async () => {
      try {
        const resp = await openai.responses.create({
          model,
          input: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ],
          stream: true,
        });
        return resp;
      } catch (e) {
        throw e;
      }
    })();

    let text = '';
    for await (const part of stream) {
      const chunk = part?.choices?.[0]?.delta?.content || '';
      if (chunk) {
        text += chunk;
        sse({ type: 'message', content: chunk });
      }
    }

    const latency = Date.now() - start;
    // Append streamed assistant narrative to convo
    try { sess.convo.push({ role: 'assistant', content: text }); } catch {}
    await logEvent(id, corr, 'success', 'v3/start-stream', 'stream completed', { latency_ms: latency, length: text.length });
  } catch (e) {
    await logEvent(null, corr, 'error', 'v3/start-stream', 'stream error', { error: e.message });
    sse({ type: 'error', message: e.message });
  } finally {
    sse({ type: 'done', correlation_id: corr });
    try { res.end(); } catch {}
  }
});

// GET /v3/api/console/status – quick nano ping for latency measurement and warmup
router.get('/status', async (req, res) => {
  const t0 = Date.now();
  try {
    const model = process.env.PROMPT_MODEL || 'gpt-5-nano';
    // Keep params minimal for compatibility
    await openai.responses.create({ model, max_output_tokens: 16, input: [{ role: 'user', content: 'ok' }] });
    const dt = Date.now() - t0;
    res.json({ ok: true, model, elapsed_ms: dt, at: new Date().toISOString() });
  } catch (e) {
    const dt = Date.now() - t0;
    res.status(500).json({ ok: false, error: e.message, elapsed_ms: dt });
  }
});

// POST /v3/api/console/command-stream
router.post('/command-stream', async (req, res) => {
  const corr = correlation();
  console.log(`[v3/command-stream] corr=${corr} incoming`);
  await logEvent(null, corr, 'info', 'v3/command-stream', 'incoming', null);

  const { session_id, command } = req.body || {};
  if (!session_id || !command) {
    res.status(400).json({ success: false, correlation_id: corr, error: 'session_id and command required' });
    return;
  }
  const sess = sessions.get(session_id);
  if (sess) { try { sess.convo.push({ role: 'user', content: String(command) }); } catch {} }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  function sse(obj) {
    try {
      const payload = { correlation_id: corr, ts: nowIso(), ...obj };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch {}
  }

  sse({ type: 'session', session_id });

  try {
    const s = sessions.get(session_id);
    const current = s?.state?.room;
    const system = `You are the narrator for a text adventure. Stream only narrative text, no JSON. Keep 2 short paragraphs. Maintain continuity with the current room.`;
    const user = `Player command: ${command}. Current room title: ${current?.title || 'Unknown'}. Brief: ${current?.description?.slice(0, 200) || ''}`;
    const model = process.env.PROMPT_MODEL || 'gpt-5-nano';

    const start = Date.now();
    const stream = await openai.responses.create({
      model,
      input: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      stream: true,
    });

    let text = '';
    for await (const part of stream) {
      const chunk = part?.choices?.[0]?.delta?.content || '';
      if (chunk) { text += chunk; sse({ type: 'message', content: chunk }); }
    }
    const latency = Date.now() - start;
    // Append streamed assistant narrative
    if (sess) { try { sess.convo.push({ role: 'assistant', content: text }); } catch {} }
    await logEvent(session_id, corr, 'success', 'v3/command-stream', 'stream completed', { latency_ms: latency, length: text.length });
  } catch (e) {
    await logEvent(session_id, corr, 'error', 'v3/command-stream', 'stream error', { error: e.message });
    sse({ type: 'error', message: e.message });
  } finally {
    sse({ type: 'done', correlation_id: corr });
    try { res.end(); } catch {}
  }
});

module.exports = router;

