const express = require('express');
const { randomUUID } = require('crypto');
const OpenAI = require('openai');

// In-memory sessions for v3 console-first prototype
// Each session: { id, seed, state: { room, inventory: [] }, history: [] }
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
  try {
    const id = randomUUID();
    const seed = randomUUID();

    const payload = {
      kind: 'start_room',
      seed,
      instruction: 'Create the starting cave room with five glowing entrances (space/sci-fi, historic, scary, travel mystery, fantasy). Provide 3-5 suggested commands in a top-level field suggestions (array of strings).',
    };

    console.log(`[v3/start] corr=${corr} calling model (start room)`);
    const { text, usage, duration_ms } = await callModelForRoom(payload, 'start room');
    console.log(`[v3/start] corr=${corr} model returned in ${duration_ms}ms, usage=${JSON.stringify(usage||{})}`);
    // Debug: truncate long text
    console.log(`[v3/start] corr=${corr} raw length=${(text||'').length}`);
    let json;
    try { json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || text); } catch (e) {
      console.error(`[v3/start] corr=${corr} parse error: ${e.message}`);
      return res.status(502).json({ success: false, correlation_id: corr, error: 'Invalid JSON from model', raw: text });
    }
    const err = validateRoomJson(json);
    if (err) {
      console.error(`[v3/start] corr=${corr} schema error: ${err}`);
      return res.status(502).json({ success: false, correlation_id: corr, error: 'Schema validation failed: ' + err, raw: json });
    }

    const session = { id, seed, state: { room: json, inventory: [] }, history: [], stats: { first_latency_ms: duration_ms, usage } };
    sessions.set(id, session);

    return res.json({ success: true, correlation_id: corr, session_id: id, message: 'You awaken in a cave of five glowing entrances...', state: session.state });
  } catch (e) {
    return res.status(500).json({ success: false, correlation_id: corr, error: e.message });
  }
});

// POST /v3/api/console/command
router.post('/command', async (req, res) =[0m> {
  const corr = correlation();
  console.log(`[v3/command] corr=${corr} incoming`);
  try {
    const { session_id, command } = req.body || {};
    console.log(`[v3/command] corr=${corr} payload session_id=${session_id} command=${JSON.stringify(command)}`);
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
      const { text } = await callModelForRoom(payload, 'reroll exit');
      console.log(`[v3/command] corr=${corr} model returned (reroll), raw length=${(text||'').length}`);
      let json; try { json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || text); } catch { json = null; }
      if (!json || !json.exits || !json.exits[idx]) {
        console.error(`[v3/command] corr=${corr} reroll parse/shape error`);
        return res.status(502).json({ success: false, correlation_id: corr, message: 'Model failed to reroll exit label. Please retry.' });
      }
      // Only replace the chosen exit label and keywords if provided
      s.state.room.exits[idx].label = json.exits[idx].label || s.state.room.exits[idx].label;
      if (Array.isArray(json.exits[idx].keywords)) s.state.room.exits[idx].keywords = json.exits[idx].keywords;
      return res.json({ success: true, correlation_id: corr, message: `The portal shimmers and now reads: ${s.state.room.exits[idx].label}`, state: s.state });
    }

    if (lower.startsWith('go ')) {
      console.log(`[v3/command] corr=${corr} action=go`);
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
      const { text } = await callModelForRoom(payload, 'next room');
      console.log(`[v3/command] corr=${corr} model returned (next), raw length=${(text||'').length}`);
      let json; try { json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || text); } catch (e) {
        console.error(`[v3/command] corr=${corr} next-room parse error: ${e.message}`);
        return res.status(502).json({ success: false, correlation_id: corr, message: 'Invalid JSON from model. Try the command again.' });
      }
      const err = validateRoomJson(json);
      if (err) {
        console.error(`[v3/command] corr=${corr} schema error: ${err}`);
        return res.status(502).json({ success: false, correlation_id: corr, message: 'Schema validation failed: ' + err });
      }

      s.history.push({ from: s.state.room.room_id, to: json.room_id, command });
      s.state.room = json;
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

module.exports = router;

