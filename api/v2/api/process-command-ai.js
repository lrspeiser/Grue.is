// Process player commands using OpenAI to interpret and respond
const OpenAI = require('openai');
const db = require('../../../db/database');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

module.exports = async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, worldId, command, gameState, worldData, conversationHistory } = req.body || {};
  
  if (!userId || !command) {
    return res.status(400).json({ error: 'userId and command are required' });
  }

  console.log(`[AI Command] Processing: "${command}" for user: ${userId}, world: ${worldId}`);

  try {
    // Initialize database if needed
    await db.initialize();
    
    // Get current room data
    const currentRoomId = gameState?.currentRoom || 'start';
    const rooms = worldData?.rooms || [];
    const currentRoom = rooms.find(r => r.id === currentRoomId);
    
    if (!currentRoom) {
      return res.json({
        success: false,
        message: "Error: Cannot find current room. Game state may be corrupted.",
        gameState
      });
    }
    
    // Get adjacent rooms for context
    const adjacentRooms = {};
    if (currentRoom.exits) {
      for (const [direction, roomId] of Object.entries(currentRoom.exits)) {
        const room = rooms.find(r => r.id === roomId);
        if (room) {
          adjacentRooms[direction] = {
            id: room.id,
            name: room.name,
            brief: room.description?.substring(0, 50) + '...'
          };
        }
      }
    }
    
    // Build OPTIMIZED context for cheaper model
    // Include only relevant world data instead of entire world
    const relevantWorldData = {
      worldName: worldData.name,
      theme: worldData.theme,
      currentRoom: {
        ...currentRoom,
        adjacentRooms
      },
      // Only include NPCs in current room
      npcsInRoom: worldData.npcs?.filter(npc => npc.location === currentRoomId) || currentRoom.npcs || [],
      // Only include items that might be referenced
      availableItems: [
        ...(currentRoom.items || []),
        ...(gameState.inventory || [])
      ],
      // Include active missions for context
      activeMissions: gameState.activeMissions?.map(mId => 
        worldData.missions?.find(m => m.id === mId)
      ).filter(Boolean) || [],
      worldMechanics: worldData.worldMechanics
    };
    
    let systemPrompt = `You are a game master for a ${worldData.theme || 'fantasy'} text adventure game. Interpret player commands and respond appropriately.

CURRENT CONTEXT:
World: ${worldData.name || 'Unknown World'}
Theme: ${worldData.theme || 'fantasy'}

CURRENT ROOM: ${currentRoom.name}
Description: ${currentRoom.description}
Exits: ${Object.keys(currentRoom.exits || {}).join(', ') || 'none'}
Items here: ${(currentRoom.items || []).join(', ') || 'none'}
NPCs here: ${(relevantWorldData.npcsInRoom.map(n => n.name).join(', ')) || 'none'}

PLAYER STATE:
- Inventory: ${(gameState.inventory || []).join(', ') || 'empty'}
- Health: ${gameState.health || 100}
- Score: ${gameState.score || 0}
${gameState.activeMissions?.length ? `- Active Missions: ${gameState.activeMissions.join(', ')}` : ''}

ADJACENT ROOMS:
${Object.entries(adjacentRooms).map(([dir, room]) => `- ${dir}: ${room.name}`).join('\n') || 'none'}

RESPONSE FORMAT:
Return ONLY a JSON object with this structure:
{
  "message": "Your narrative response",
  "gameState": {
    "currentRoom": "room_id",
    "inventory": [],
    "health": 100,
    "score": 0
  },
  "roomUpdates": {}
}`;
    
    let userPrompt = `Player command: "${command}"`;

    // Prepare messages - limit conversation history for token efficiency
    const messages = [
      { role: "system", content: systemPrompt }
    ];
    
    // Add only recent conversation history (last 4 exchanges)
    if (conversationHistory && Array.isArray(conversationHistory)) {
      const recentHistory = conversationHistory.slice(-8); // Last 4 user/assistant pairs
      messages.push(...recentHistory);
    }
    
    // Add current user command
    messages.push({ role: "user", content: userPrompt });
    
    console.log('[AI Command] Using PROMPT MODEL for gameplay');
    console.log('Optimized context size:', systemPrompt.length);
    console.log('Recent history entries:', conversationHistory?.slice(-8).length || 0);
    
    // Use configurable lightweight model ("nano") for gameplay prompts
const PROMPT_MODEL = process.env.PROMPT_MODEL || "gpt-5-nano"; // DO NOT CHANGE MODEL DEFAULTS: gameplay prompts = gpt-5-nano
    const response = await openai.responses.create({
      model: PROMPT_MODEL, // Default to nano-tier model
      input: messages,
    });
    
    // Extract text from the response
    const responseText = response.output_text || response.choices?.[0]?.message?.content || "";
    const newResponseId = null; // No response ID with chat.completions
    
    console.log('[AI Command] RECEIVED FROM OPENAI:');
    console.log('Response text:', responseText);
    console.log('[AI Command] Token usage:', JSON.stringify(response.usage));
    
    // Parse the AI response
    let aiResponse;
    try {
      aiResponse = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[AI Command] Failed to parse AI response:', parseError);
      // Safe fallback: no-op state change, short narrative
      return res.json({
        success: true,
        message: "You look around, but the scene remains unclear. Try a simpler action (e.g., 'look', 'go north').",
        gameState,
        worldData
      });
    }

    // Validate essential fields
    if (!aiResponse.message || !aiResponse.gameState) {
      console.warn('[AI Command] Missing required fields in AI response. Returning fallback.');
      return res.json({
        success: true,
        message: "You look around, but nothing obvious stands out. Try 'examine items' or 'talk to someone'.",
        gameState,
        worldData
      });
    }
    
    // Apply room updates if any
    if (aiResponse.roomUpdates) {
      for (const [roomId, updates] of Object.entries(aiResponse.roomUpdates)) {
        const room = rooms.find(r => r.id === roomId);
        if (room && updates.items !== undefined) {
          room.items = updates.items;
        }
      }
    }
    
    // Save game state if worldId exists
    const newState = aiResponse.gameState || gameState;
    if (worldId) {
      try {
        await db.saveGameState(userId, worldId, newState, null);
        console.log(`[AI Command] Game state saved for user ${userId}, world ${worldId}`);
      } catch (saveError) {
        console.error('[AI Command] Error saving game state:', saveError);
        // Continue anyway - the command was processed
      }
    }
    
    return res.json({
      success: true,
      message: aiResponse.message,
      gameState: newState,
      worldData: worldData, // Return potentially modified world data
      aiResponse: responseText // Return raw response for history tracking
    });
    
  } catch (error) {
    console.error('[AI Command] Error:', error);
    console.error('[AI Command] Error details:', {
      message: error.message,
      status: error.status,
      code: error.code,
      type: error.type
    });
    
    res.status(500).json({
      success: false,
      error: error.message || 'Command processing failed',
      message: "I'm having trouble understanding that command. Please try again."
    });
  }
};