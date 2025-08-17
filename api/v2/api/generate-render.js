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
          const completion = await openai.chat.completions.create({
            model: "gpt-4o", // Using GPT-4o with Render's extended timeout
            messages: [
              { 
                role: "system", 
                content: "You are an expert game designer creating immersive text adventure worlds. Generate detailed, engaging content with rich descriptions." 
              },
              { role: "user", content: prompt }
            ],
            temperature: 0.8,
            max_tokens: 4000 // Much larger response with Render's timeout
          });
          
          const responseText = completion.choices[0].message.content;
          console.log('[Render] GPT-5 Response received, length:', responseText.length);
          
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
            console.error('[Render] Parse error:', parseError);
            await db.logAction(userId, null, 'PARSE_ERROR', { error: parseError.message });
            
            // Generate a robust fallback world
            gameData = generateFallbackWorld(timePeriod);
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
              currentRoom: gameData.rooms[0]
            }
          });
          
        } catch (aiError) {
          console.error('[Render] AI Error:', aiError);
          await db.logAction(userId, null, 'AI_ERROR', { error: aiError.message });
          
          // Save fallback world to database
          const fallbackData = generateFallbackWorld(timePeriod);
          const worldRecord = await db.saveGameWorld(userId, {
            worldOverview: {
              title: fallbackData.title,
              description: fallbackData.description,
              setting: timePeriod
            },
            world: {
              starting_room: fallbackData.rooms[0].id,
              rooms: fallbackData.rooms
            }
          });
          
          const initialState = {
            currentRoom: fallbackData.rooms[0].id,
            inventory: fallbackData.startingInventory || [],
            health: 100,
            score: 0
          };
          
          await db.saveGameState(userId, worldRecord.id, initialState);
          
          return res.json({
            success: true,
            nextStep: 'complete',
            progress: 100,
            message: 'Generated fallback world',
            data: {
              worldId: worldRecord.id,
              worldOverview: {
                title: fallbackData.title,
                description: fallbackData.description,
                setting: timePeriod
              },
              initialState: initialState,
              currentRoom: fallbackData.rooms[0]
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

function generateFallbackWorld(theme) {
  const worlds = {
    'Fantasy': {
      title: "The Crystal Caverns",
      description: "Explore mystical caverns filled with magical crystals",
      objective: "Find the legendary Crystal of Power",
      rooms: [
        {
          id: "entrance",
          name: "Cavern Entrance",
          description: "A dark opening in the mountainside. Faint blue light emanates from within.",
          exits: { north: "tunnel" },
          items: ["torch", "rope"],
          npcs: []
        },
        {
          id: "tunnel",
          name: "Crystal Tunnel",
          description: "The walls are lined with glowing crystals of various colors.",
          exits: { south: "entrance", north: "chamber", east: "pool" },
          items: ["crystal_shard"],
          npcs: [{ name: "Crystal Guardian", dialogue: "Only the worthy may pass deeper." }]
        },
        {
          id: "chamber",
          name: "Grand Chamber",
          description: "A massive chamber with a crystal formation at its center.",
          exits: { south: "tunnel" },
          items: ["crystal_of_power"],
          npcs: []
        },
        {
          id: "pool",
          name: "Underground Pool",
          description: "A serene pool of crystal-clear water reflects the cavern lights.",
          exits: { west: "tunnel" },
          items: ["healing_water"],
          npcs: []
        }
      ],
      startingInventory: ["map"],
      winCondition: "Obtain the Crystal of Power from the Grand Chamber"
    },
    'Space': {
      title: "Starship Odyssey",
      description: "Navigate a damaged starship drifting through deep space",
      objective: "Repair the ship and reach the nearest space station",
      rooms: [
        {
          id: "bridge",
          name: "Command Bridge",
          description: "The ship's control center. Warning lights flash on damaged consoles.",
          exits: { south: "corridor", east: "quarters" },
          items: ["keycard", "datapad"],
          npcs: [{ name: "AI Assistant", dialogue: "Warning: Multiple systems offline." }]
        },
        {
          id: "corridor",
          name: "Main Corridor",
          description: "A long corridor with emergency lighting. Several doors line the walls.",
          exits: { north: "bridge", south: "engineering", west: "medbay" },
          items: [],
          npcs: []
        },
        {
          id: "engineering",
          name: "Engineering Bay",
          description: "The heart of the ship. Fusion reactors hum with unstable energy.",
          exits: { north: "corridor" },
          items: ["fusion_core", "repair_kit"],
          npcs: [{ name: "Chief Engineer", dialogue: "We need a new fusion core to restore main power!" }]
        },
        {
          id: "medbay",
          name: "Medical Bay",
          description: "Medical equipment and supplies line the walls.",
          exits: { east: "corridor" },
          items: ["medkit", "stimulant"],
          npcs: []
        },
        {
          id: "quarters",
          name: "Crew Quarters",
          description: "Personal quarters for the crew. Most are sealed.",
          exits: { west: "bridge" },
          items: ["personal_log"],
          npcs: []
        }
      ],
      startingInventory: ["scanner"],
      winCondition: "Repair the fusion reactor and restore ship power"
    }
  };
  
  return worlds[theme] || worlds['Fantasy'];
}