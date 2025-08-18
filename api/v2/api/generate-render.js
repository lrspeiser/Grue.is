// Game generation optimized for Render's 10-minute timeout
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

  const { userId, step = 'init', userProfile, gamePlan } = req.body || {};
  
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  console.log(`[Render] Processing step: ${step} for user: ${userId}`);

  try {
    // Initialize database connection
    await db.initialize();
    
    // Create or update user
    await db.createUser(userId);
    
    switch(step) {
      case 'init':
        // Step 1: Initialize
        await db.logAction(userId, null, 'INIT', { userProfile });
        
        return res.json({
          success: true,
          nextStep: 'generate',
          progress: 10,
          message: 'Starting generation with Render (10-minute timeout available)...',
          data: { userId, userProfile }
        });
        
      case 'generate':
        // Step 2: Generate comprehensive game world using GPT-5
        console.log('[Render] Generating comprehensive game world with GPT-5...');
        await db.logAction(userId, null, 'GENERATE_START', { userProfile });
        
        const timePeriod = userProfile?.timePeriod || 'Fantasy';
        const complexity = userProfile?.complexity || 'medium';
        
        const prompt = `Create a rich, detailed text adventure game world.
Theme: ${timePeriod}
Complexity: ${complexity}

Generate a complete game world with:
- 10-15 interconnected rooms
- Items and objects to interact with
- NPCs with dialogue
- Puzzles or challenges
- A clear objective or quest

Return ONLY valid JSON with this structure:
{
  "title": "Engaging Game Title",
  "description": "Compelling game description",
  "objective": "Clear game objective",
  "rooms": [
    {
      "id": "unique_id",
      "name": "Room Name",
      "description": "Detailed room description",
      "exits": {"direction": "room_id"},
      "items": ["item1", "item2"],
      "npcs": [{"name": "NPC Name", "dialogue": "What they say"}],
      "puzzles": [{"description": "Puzzle description", "solution": "hint"}]
    }
  ],
  "startingInventory": ["item1"],
  "winCondition": "Description of how to win"
}`;

        try {
          const apiRequest = {
            model: process.env.WORLD_MODEL || "gpt-5", // Default to GPT-5 with Render's extended timeout
            input: [
              { 
                role: "system", 
                content: "You are an expert game designer creating immersive text adventure worlds. Generate detailed, engaging content with rich descriptions." 
              },
              { role: "user", content: prompt }
            ],
max_output_tokens: 4000,
response_format: { type: "json_object" }
          };
          
          console.log('[Render] SENDING TO OPENAI (Responses API):', JSON.stringify(apiRequest, null, 2));
          
          const completion = await openai.responses.create(apiRequest);
          
          const responseText = completion.output_text || completion.choices?.[0]?.message?.content || '';
          console.log('[Render] RECEIVED FROM OPENAI:');
          console.log(responseText);
          if (completion.usage) {
            console.log('[Render] Token usage:', JSON.stringify(completion.usage));
          }
          
          // Parse the AI response
          let gameData;
          try {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              gameData = JSON.parse(jsonMatch[0]);
            } else {
              throw new Error('No JSON found in response');
            }
          } catch (parseError) {
            console.error('[Render] JSON Parse error:', parseError);
            console.error('[Render] Failed to parse response:', responseText);
            await db.logAction(userId, null, 'PARSE_ERROR', { error: parseError.message });
            
            return res.status(500).json({
              success: false,
              error: `Failed to parse AI response as JSON: ${parseError.message}`,
              rawResponse: responseText
            });
          }
          
          // Save to database
          const worldRecord = await db.saveGameWorld(userId, {
            worldOverview: {
              title: gameData.title,
              description: gameData.description,
              setting: timePeriod,
              objective: gameData.objective
            },
            world: {
              starting_room: gameData.rooms[0].id,
              rooms: gameData.rooms,
              winCondition: gameData.winCondition
            }
          });
          
          // Create initial game state
          const initialState = {
            currentRoom: gameData.rooms[0].id,
            inventory: gameData.startingInventory || [],
            health: 100,
            score: 0
          };
          
          await db.saveGameState(userId, worldRecord.id, initialState);
          await db.logAction(userId, worldRecord.id, 'WORLD_CREATED', { 
            title: gameData.title,
            roomCount: gameData.rooms.length 
          });
          
          return res.json({
            success: true,
            nextStep: 'complete',
            progress: 100,
            message: 'World generated successfully with GPT-5!',
            data: {
              worldId: worldRecord.id,
              worldOverview: {
                title: gameData.title,
                description: gameData.description,
                setting: timePeriod,
                objective: gameData.objective,
                roomCount: gameData.rooms.length
              },
              initialState: initialState,
              currentRoom: gameData.rooms[0],
              world: {
                rooms: gameData.rooms,
                starting_room: gameData.rooms[0].id,
                winCondition: gameData.winCondition
              }
            }
          });
          
        } catch (aiError) {
          console.error('[Render] AI Error Details:', {
            message: aiError.message,
            status: aiError.status,
            code: aiError.code,
            type: aiError.type
          });
          console.error('[Render] Full AI Error:', aiError);
          await db.logAction(userId, null, 'AI_ERROR', { error: aiError.message });
          
          return res.status(500).json({
            success: false,
            error: `OpenAI API call failed: ${aiError.message}`,
            details: {
              status: aiError.status,
              code: aiError.code,
              type: aiError.type
            }
          });
        }
        
      case 'load':
        // Load existing world from database
        const { worldId } = req.body;
        if (!worldId) {
          return res.status(400).json({ error: 'worldId required for load' });
        }
        
        const world = await db.getGameWorld(worldId);
        const gameState = await db.getGameState(userId, worldId);
        
        if (!world) {
          return res.status(404).json({ error: 'World not found' });
        }
        
        return res.json({
          success: true,
          data: {
            world: world.world_data,
            gameState: gameState?.game_state || {}
          }
        });
        
      default:
        return res.status(400).json({ 
          error: `Unknown step: ${step}` 
        });
    }
    
  } catch (error) {
    console.error('[Render] Error:', error);
    await db.logAction(userId, null, 'ERROR', { error: error.message });
    
    res.status(500).json({
      success: false,
      error: error.message || 'Generation failed'
    });
  }
}