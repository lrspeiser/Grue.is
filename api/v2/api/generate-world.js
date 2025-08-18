// Generate a complete game world using a powerful AI model
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

  const { userId, name, theme, difficulty } = req.body || {};
  
  if (!userId || !name || !theme) {
    return res.status(400).json({ error: 'userId, name, and theme are required' });
  }

  console.log(`[World Generation] Creating world for user: ${userId}, theme: ${theme}`);

  try {
    // Initialize database if needed
    await db.initialize();
    
    // Create a detailed prompt for world generation
    const systemPrompt = `You are a master world builder for text adventure games. Create a rich, detailed game world.

TASK: Generate a complete text adventure game world with the following requirements:
- Theme: ${theme}
- Player character name: ${name}
- Difficulty: ${difficulty || 'medium'}

Create a JSON response with this EXACT structure:
{
  "name": "Name of the world",
  "description": "Brief description of the world setting",
  "theme": "${theme}",
  "difficulty": "${difficulty || 'medium'}",
  "rooms": [
    {
      "id": "unique_room_id",
      "name": "Room Name",
      "description": "Detailed room description",
      "exits": {
        "north": "connected_room_id",
        "south": "connected_room_id",
        "east": "connected_room_id",
        "west": "connected_room_id"
      },
      "items": ["item1", "item2"],
      "npcs": [
        {
          "name": "NPC Name",
          "description": "NPC description",
          "dialogue": "What they say when encountered"
        }
      ],
      "puzzles": [
        {
          "description": "Puzzle description",
          "solution": "How to solve it",
          "reward": "What you get for solving"
        }
      ]
    }
  ],
  "items": [
    {
      "id": "item_id",
      "name": "Item Name",
      "description": "Item description",
      "usable": true,
      "effect": "What happens when used"
    }
  ],
  "missions": [
    {
      "id": "mission_id",
      "name": "Mission Name",
      "description": "Mission description",
      "objectives": ["objective1", "objective2"],
      "rewards": {
        "score": 100,
        "items": ["reward_item"]
      }
    }
  ],
  "npcs": [
    {
      "id": "npc_id",
      "name": "Character Name",
      "description": "Character description",
      "location": "room_id",
      "personality": "Brief personality traits",
      "questGiver": true
    }
  ],
  "worldMechanics": {
    "combatEnabled": true,
    "inventoryLimit": 10,
    "startingHealth": 100,
    "startingRoom": "start"
  }
}

Requirements:
1. Create at least 10 interconnected rooms
2. Include at least 5 unique items
3. Add at least 3 NPCs with distinct personalities
4. Create 2-3 missions or quests
5. Include puzzles or challenges appropriate to the difficulty
6. Ensure all room exits connect to valid rooms
7. Make the world feel cohesive and thematically consistent
8. Add rich descriptions that create atmosphere
9. Include secrets and hidden elements for exploration`;

    const userPrompt = `Create a ${theme} themed world for a character named ${name}. Make it engaging, detailed, and full of adventure opportunities.`;

    console.log('[World Generation] Calling OpenAI with powerful model...');
    console.log('[World Generation] Using Responses API with text.format=json_object and max_completion_tokens');
    
// Use configurable model for world generation (default gpt-5)
    const WORLD_MODEL = process.env.WORLD_MODEL || "gpt-5";
    const response = await openai.responses.create({
      model: WORLD_MODEL, // Default to GPT-5 (latest) for high-quality planning/worldbuilding
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.9, // Higher creativity for world building
max_output_tokens: 4000,
      text: { format: "json_object" }
    });

    // Extract JSON text depending on Responses API structure
    const textOut = response.output_text || response.choices?.[0]?.message?.content || "{}";
    const worldData = JSON.parse(textOut);
    
    console.log('[World Generation] World created successfully');
    console.log(`[World Generation] Rooms: ${worldData.rooms?.length}, Items: ${worldData.items?.length}, NPCs: ${worldData.npcs?.length}`);
    console.log('[World Generation] Token usage:', JSON.stringify(response.usage));
    
    // Generate a unique world ID
    const worldId = `world_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
// Persist world using existing DB helper (returns numeric world id)
    const worldRecord = await db.saveGameWorld(userId, {
      worldOverview: {
        title: worldData.name,
        description: worldData.description,
        setting: worldData.theme,
        objective: worldData.objective
      },
      world: {
        starting_room: worldData.worldMechanics?.startingRoom || (worldData.rooms?.[0]?.id || 'start'),
        rooms: worldData.rooms,
        winCondition: worldData.winCondition || worldData.objective || ''
      }
    });

    // Create initial game state
    const initialGameState = {
      currentRoom: worldData.worldMechanics?.startingRoom || worldData.rooms?.[0]?.id || 'start',
      inventory: worldData.startingInventory || [],
      health: worldData.worldMechanics?.startingHealth || 100,
      score: 0,
      activeMissions: [],
      completedMissions: [],
      flags: {}
    };

    // Save initial game state using DB world id
    await db.saveGameState(userId, worldRecord.id, initialGameState);

    return res.json({
      success: true,
      worldId: worldRecord.id,
      worldData,
      gameState: initialGameState,
      tokensUsed: response.usage?.total_tokens
    });
    
  } catch (error) {
    console.error('[World Generation] Error:', error);
    console.error('[World Generation] Error details:', {
      message: error.message,
      status: error.status,
      code: error.code,
      type: error.type
    });
    
    res.status(500).json({
      success: false,
      error: error.message || 'World generation failed',
      message: "Failed to generate world. Please try again."
    });
  }
};