// Process player commands with streaming SSE for progressive output
const OpenAI = require('openai');

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, command, gameState, worldData, conversationHistory } = req.body || {};
  if (!userId || !command) {
    return res.status(400).json({ error: 'userId and command are required' });
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const PROMPT_MODEL = process.env.PROMPT_MODEL || 'gpt-5-nano';

  const currentRoomId = gameState?.currentRoom || 'start';
  const rooms = worldData?.rooms || [];
  const currentRoom = rooms.find(r => r.id === currentRoomId) || { id: currentRoomId, name: 'Unknown', description: '', exits: {} };

  // Build a concise context for fast, cheap streaming responses
  const systemPrompt = `You are the game master for a ${worldData?.theme || 'fantasy'} text adventure.
Respond concisely in 1-3 short paragraphs with immersive narration ONLY. Do not include JSON, brackets, or metadata.
Stay consistent with the setting and room details provided.`;

  const recentHistory = Array.isArray(conversationHistory) ? conversationHistory.slice(-8) : [];
  const historyMessages = recentHistory.map(m => ({ role: m.role || 'user', content: String(m.content || m.userPrompt || m.response || '') }));

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Room: ${currentRoom.name}\nDescription: ${currentRoom.description}\nExits: ${Object.keys(currentRoom.exits || {}).join(', ') || 'none'}` },
    ...historyMessages,
    { role: 'user', content: `Player command: "${command}"` }
  ];

  // Helper to send SSE data line
  function sendEvent(obj) {
    try {
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
    } catch (e) {
      // client may have disconnected
    }
  }

  // Heartbeat to keep connection alive (every 15s)
  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n'); } catch {}
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
  });

  try {
    const stream = await openai.chat.completions.create({
      model: PROMPT_MODEL,
      messages,
      stream: true
    });

    for await (const part of stream) {
      const delta = part?.choices?.[0]?.delta?.content || '';
      if (delta) {
        sendEvent({ content: delta });
      }
    }
    sendEvent('[DONE]');
    res.end();
  } catch (error) {
    sendEvent({ error: error.message || 'Streaming failed' });
    try { res.end(); } catch {}
  }
};
