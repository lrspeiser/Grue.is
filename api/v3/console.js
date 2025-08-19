const express = require('express');
const { randomUUID } = require('crypto');
const OpenAI = require('openai');
const db = require('../../../db/database');

// In-memory sessions for v3 console-first prototype
// Each session: { id, seed, state: { room, inventory: [] }, history: [], logs: [] }
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
  const system = `You are generating a text adventure room as strict JSON only. This is a game similar in style to Zork or Oregon Trail. The player begins in a cave with five glowing entrances. Always steer the player toward picking an entrance. Always return valid JSON matching the schema described by the developer message. No prose outside JSON.`;
  const developer = `Schema (return exactly this shape):\n{\n  "room_id": "string",\n  "title": "string",\n  "description": "string",\n  "exits": [ { "exit_id": "string", "label": "string", "keywords": ["string"] } ],\n  "items": [ { "item_id":"string","name":"string","takeable":true,"description":"string" } ],\n  "flags": { },\n  "continuity": { }\n}\n\nBehavioral rules:\n- Start room: five entrances themed: space/sci-fi, historic, scary, travel mystery, fantasy.\n- For each entrance, label should hint its theme.\n- Provide exits only; avoid puzzles in start room.\n- Player may say "Try again" on a portal to re-roll that one exit label while preserving the five categories.\n- When generating a next room for a chosen exit, include a short challenge the user must overcome.\n- Also include exits for that room and pre-bake stubs for its immediately adjoining rooms in labels only (do not fully expand beyond one hop).`;
  const user = JSON.stringify(payload);
  const start = Date.now();
  const resp = await openai.responses.create({ model: process.env.WORLD_MODEL || 'gpt-5', input: [
    { role: 'system', content: system },
    { role: 'developer', content: developer },
    { role: 'user', content: user }
  ]});
  const duration = Date.now() - start;
  const text = resp.output_text || resp.choices?.[0]?.message?.content || '';
  return { text, usage: resp.usage, duration_ms: duration, response: resp };
}

// POST /v3/api/console/start
router.post('/start', async (req, res) =[0m> {
  const corr = correlation();
  console.log(`[v3/start] corr=${corr} incoming`);
  await logEvent(null, corr, 'info', 'v3/start', 'incoming', null);
  try {
    const id = randomUUID();
    const seed = randomUUID();

    const payload = {
      kind: 'start_room',
      seed,
      instruction: 'Create the starting cave room with five glowing entrances (space/sci-fi, historic, scary, travel mystery, fantasy). Provide 3-5 suggested commands in a top-level field suggestions (array of strings).',
    };

    console.log(`[v3/start] corr=${corr} calling model (start room)`);
    await logEvent(null, corr, 'info', 'v3/start', 'calling model (start room)', { payloadKind: 'start_room' });
    const { text, usage, duration_ms } = await callModelForRoom(payload, 'start room');
    console.log(`[v3/start] corr=${corr} model returned in ${duration_ms}ms, usage=${JSON.stringify(usage||{})}`);
    await logEvent(null, corr, 'info', 'v3/start', 'model returned', { duration_ms, usage });
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

    const session = { id, seed, state: { room: json, inventory: [] }, history: [], stats: { first_latency_ms: duration_ms, usage }, logs: [] };
    sessions.set(id, session);
    await logEvent(id, corr, 'success', 'v3/start', 'session created', { session_id: id });

    return res.json({ success: true, correlation_id: corr, session_id: id, message: 'You awaken in a cave of five glowing entrances...', state: session.state });
  } catch (e) {
    await logEvent(null, corr, 'error', 'v3/command', 'unhandled error', { error: e.message });
    return res.status(500).json({ success: false, correlation_id: corr, error: e.message });

    return res.status(500).json({ success: false, correlation_id: corr, error: e.message });
  }
});

// POST /v3/api/console/command
router.post('/command', async (req, res) =[0m> {
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
      const { text } = await callModelForRoom(payload, 'reroll exit');
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

    if (lower.startsWith('go ')) {
      console.log(`[v3/command] corr=${corr} action=go`);
      await logEvent(session_id, corr, 'info', 'v3/command', 'go', null);
      const arg = lower.replace('go ', '').trim();
      const exits = s.state.room.exits || [];
      let target = null;
      // number 1..5 or keyword match
      if (/^\d+$/.test(arg)) {
        const i = parseInt(arg,10)-1; if (exits[i]) target = exits[i];
      }
      if (!target) target = exits.find(e => (e.keywords||[]).some(k => k.toLowerCase() === arg) || e.label.toLowerCase().includes(arg));
      if (!target) return res.json({ success: true, correlation_id: corr, message: 'Which way? Match a number, color, direction, or part of a label.', state: s.state });

      // Request next room from model given chosen exit
      const payload = {
        kind: 'next_room', seed: s.seed,
        previous_room: s.state.room,
        chosen_exit_id: target.exit_id,
        instruction: 'Generate the next room entered via the chosen exit. Include a short challenge the player must overcome. Ensure exits provided, items/NPCs if any. Do not generate rooms beyond one hop.'
      };
      console.log(`[v3/command] corr=${corr} calling model (next room)`);
      await logEvent(session_id, corr, 'info', 'v3/command', 'calling model (next room)', { exit: target.exit_id });
      const { text } = await callModelForRoom(payload, 'next room');
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

    // default: steer to entrances
    return res.json({ success: true, correlation_id: corr, message: 'You can do many things, but the cave seems to insist: choose an entrance (e.g., "go 1" or "go east").', state: s.state });
  } catch (e) {
    return res.status(500).json({ success: false, correlation_id: corr, error: e.message });
  }
});

// GET /v3/api/console/logs?session_id=...&limit=100
router.get('/logs', async (req, res) =[0m 3e {
  const session_id = req.query.session_id;
  const limit = parseInt(req.query.limit || '100', 10);
  if (!session_id) return res.status(400).json({ success: false, error: 'session_id required' });
  const s = sessions.get(session_id);
  if (!s) return res.status(404).json({ success: false, error: 'Session not found' });
  const logs = (s.logs || []).slice(-limit);
  return res.json({ success: true, session_id, count: logs.length, logs });
});

module.exports = router;

