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

  const { userId, worldId, command, gameState, worldData, previousResponseId } = req.body || {};
  
  if (!userId || !command) {
    return res.status(400).json({ error: 'userId and command are required' });
  }

  console.log(`[AI Command] Processing: "${command}" for user: ${userId}, world: ${worldId}`);
  console.log(`[AI Command] Previous response ID: ${previousResponseId || 'none'}`);

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
    
    // Build the context for OpenAI
    const systemPrompt = `You are a game master for a text adventure game. You must interpret player commands and respond appropriately.

WORLD CONTEXT:
${JSON.stringify(worldData, null, 2)}

CURRENT GAME STATE:
- Current Room: ${currentRoomId}
- Inventory: ${JSON.stringify(gameState.inventory || [])}
- Health: ${gameState.health || 100}
- Score: ${gameState.score || 0}

CURRENT ROOM DETAILS:
${JSON.stringify(currentRoom, null, 2)}

INSTRUCTIONS:
1. Interpret the player's command in the context of the game world
2. Generate an appropriate narrative response
3. Update the game state if the action changes anything
4. Return a JSON response with this EXACT structure:

{
  "message": "Your narrative response to the player's action",
  "gameState": {
    "currentRoom": "room_id if player moved, otherwise same as before",
    "inventory": ["array of items player is carrying"],
    "health": 100,
    "score": 0
  },
  "roomUpdates": {
    "room_id": {
      "items": ["updated items in the room if any were taken/dropped"]
    }
  }
}

Be creative and descriptive in your responses. Make the game world feel alive and interactive.
If the player tries something impossible or nonsensical, respond appropriately but stay in character.`;

    const userPrompt = `Player command: "${command}"

Respond with the appropriate narrative and any game state changes in the JSON format specified.`;

    // Create the API request using v1/responses API
    const apiRequest = {
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.8,
      max_tokens: 1000,
      response_format: { type: "json_object" }
    };
    
    // Add previous_response_id if it exists to maintain conversation continuity
    if (previousResponseId) {
      apiRequest.previous_response_id = previousResponseId;
    }
    
    console.log('[AI Command] SENDING TO OPENAI v1/responses:');
    console.log('System prompt length:', systemPrompt.length);
    console.log('User prompt:', userPrompt);
    console.log('Using previous_response_id:', previousResponseId || 'none');
    
    const response = await openai.responses.create(apiRequest);
    
    // Extract text from the new response format
    const responseText = response.output[0].content[0].text;
    const newResponseId = response.id;
    
    console.log('[AI Command] RECEIVED FROM OPENAI:');
    console.log('Response ID:', newResponseId);
    console.log('Response text:', responseText);
    console.log('[AI Command] Token usage:', JSON.stringify(response.usage));
    
    // Parse the AI response
    let aiResponse;
    try {
      aiResponse = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[AI Command] Failed to parse AI response:', parseError);
      return res.json({
        success: false,
        message: "I understood your command but had trouble processing it. Please try again.",
        gameState
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
        await db.saveGameState(userId, worldId, newState, newResponseId);
        console.log(`[AI Command] Game state saved for user ${userId}, world ${worldId} with response ID ${newResponseId}`);
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
      newOpenAIResponseId: newResponseId // Return the new response ID for conversation continuity
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