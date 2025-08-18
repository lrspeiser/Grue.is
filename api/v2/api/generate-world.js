// Generate a complete game world using a phased pipeline: plan -> rooms -> characters -> quests
const db = require('../../../db/database');
const { createCompletePlan } = require('../../../v2/game-planner');
const {
  generateAllRoomContent,
  generateAllCharacters,
  generateQuestContent
} = require('../../../v2/world-generator');

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

  console.log(`[World Generation] (Phased) Creating world for user: ${userId}, theme: ${theme}`);

  try {
    // Initialize database if needed
    await db.initialize();

    // 1) Build a user profile for the planner from incoming params
    const edu = (difficulty || 'medium').toLowerCase();
    const educationLevel = edu === 'easy' ? 'elementary' : edu === 'hard' ? 'graduate' : 'high';
    const userProfile = {
      userId,
      educationLevel,
      location: 'USA',
      timePeriod: theme,
      characterRole: name,
      storyLocation: theme
    };

    // 2) Phase 1: Planning
    console.log('[World Generation] Phase 1: Planning world structure with', process.env.WORLD_MODEL || 'gpt-5');
    const gamePlan = await createCompletePlan(userProfile);

    // Basic validation
    if (!gamePlan || !gamePlan.world_map || !Array.isArray(gamePlan.world_map.locations)) {
      throw new Error('Invalid game plan structure from planner');
    }

    // Ensure arrays exist to prevent crashes in generation helpers
    gamePlan.characters = Array.isArray(gamePlan.characters) ? gamePlan.characters : [];
    gamePlan.quests = Array.isArray(gamePlan.quests) ? gamePlan.quests : [];

    // 3) Phase 2: Generation calls (rooms, characters, quests)
    console.log('[World Generation] Phase 2a: Generating room content');
    const roomsGenerated = await generateAllRoomContent(gamePlan);

    console.log('[World Generation] Phase 2b: Generating characters');
    const charactersGenerated = await generateAllCharacters(gamePlan);

    console.log('[World Generation] Phase 2c: Generating quests');
    const questsGenerated = await generateQuestContent(gamePlan);

    // 4) Assemble final worldData in the schema expected by the client
    // Map planning connections to exits object
    const exitsFromConnections = (connections = []) => {
      const out = {};
      for (const c of connections) {
        if (typeof c !== 'string') continue;
        const [dir, id] = c.split('-');
        if (dir && id) out[dir] = id;
      }
      return out;
    };

    const roomMap = new Map();
    for (const loc of gamePlan.world_map.locations) {
      roomMap.set(loc.id, loc);
    }

    const rooms = (roomsGenerated || []).map(r => {
      const plan = roomMap.get(r.id) || {};
      return {
        id: r.id,
        name: r.name || plan.name || r.id,
        description: r.description || plan.description || '',
        exits: exitsFromConnections(plan.connections || []),
        items: [],
        npcs: [],
        puzzles: []
      };
    });

    // Attach NPCs into rooms when locations match
    const npcs = (charactersGenerated || []).map((c, idx) => ({
      id: c.id || `npc_${idx}`,
      name: c.name || `NPC ${idx + 1}`,
      description: `${c.appearance || ''} ${c.personality || ''}`.trim(),
      location: c.location || gamePlan.world_map.starting_location || (rooms[0]?.id || 'start'),
      personality: c.personality || '',
      questGiver: false
    }));

    // Place each NPC into its room's list for convenience
    const roomById = Object.fromEntries(rooms.map(r => [r.id, r]));
    for (const n of npcs) {
      const target = roomById[n.location] || rooms[0];
      if (target) {
        target.npcs = target.npcs || [];
        target.npcs.push({ name: n.name, description: n.description });
      }
    }

    const missions = (questsGenerated || []).map((q, idx) => ({
      id: q.id || `mission_${idx}`,
      name: q.name || `Mission ${idx + 1}`,
      description: q.introduction_text || '',
      objectives: Array.isArray(q.objectives) ? q.objectives : [],
      rewards: { score: 100 + idx * 10, items: [] }
    }));

    const items = []; // Placeholder: future step can generate via a dedicated items call

    const worldData = {
      name: gamePlan.game_overview?.title || `${theme} adventure`,
      description: gamePlan.game_overview?.main_story || `An adventure in ${theme}.`,
      theme,
      difficulty: difficulty || 'medium',
      rooms,
      items,
      missions,
      npcs,
      worldMechanics: {
        combatEnabled: true,
        inventoryLimit: 10,
        startingHealth: 100,
        startingRoom: gamePlan.world_map?.starting_location || (rooms[0]?.id || 'start')
      }
    };

    console.log('[World Generation] Phased world assembled successfully');

    // Persist world using existing DB helper (returns numeric world id)
    const worldRecord = await db.saveGameWorld(userId, {
      worldOverview: {
        title: worldData.name,
        description: worldData.description,
        setting: worldData.theme,
        objective: missions[0]?.name || 'Explore and learn'
      },
      world: {
        starting_room: worldData.worldMechanics.startingRoom,
        rooms: worldData.rooms,
        winCondition: missions[0]?.name || ''
      }
    });

    // Create initial game state
    const initialGameState = {
      currentRoom: worldData.worldMechanics.startingRoom,
      inventory: [],
      health: worldData.worldMechanics.startingHealth,
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
      tokensUsed: undefined,
      debug: {
        phased: true,
        planLocations: gamePlan.world_map?.locations?.length,
        generated: {
          rooms: roomsGenerated?.length,
          characters: charactersGenerated?.length,
          quests: questsGenerated?.length
        }
      }
    });

  } catch (error) {
    console.error('[World Generation] Error (phased):', error);
    res.status(500).json({
      success: false,
      error: error.message || 'World generation failed',
      message: 'Failed to generate world. Please try again.'
    });
  }
};
