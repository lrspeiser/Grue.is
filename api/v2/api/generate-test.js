// Simplified test endpoint to verify the step-by-step approach works
// No Firebase, just in-memory storage for testing

const gameStates = {}; // In-memory storage for testing

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

  const { userId, step = 'init', userProfile } = req.body || {};
  
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  console.log(`[TEST] Processing step: ${step} for user: ${userId}`);

  try {
    switch(step) {
      case 'init':
        // Initialize
        gameStates[userId] = {
          status: 'initialized',
          startedAt: Date.now(),
          userProfile: userProfile || {}
        };
        
        return res.json({
          success: true,
          nextStep: 'plan',
          progress: 10,
          message: 'Game generation initialized - TEST MODE',
          data: { userId, userProfile }
        });
        
      case 'plan':
        // Simulate planning (instant for testing)
        const testPlan = {
          title: "Test Adventure",
          description: "A test game for debugging",
          setting: "Debug Land",
          world_map: {
            rooms: [
              { id: 'start', name: 'Starting Room' },
              { id: 'room2', name: 'Second Room' }
            ]
          },
          characters: [
            { name: 'Test NPC' }
          ],
          quests: [
            { name: 'Test Quest' }
          ]
        };
        
        gameStates[userId] = {
          ...gameStates[userId],
          gamePlan: testPlan,
          status: 'planned'
        };
        
        return res.json({
          success: true,
          nextStep: 'generate',
          progress: 50,
          message: 'Game plan created - TEST MODE',
          data: {
            planSummary: {
              title: testPlan.title,
              roomCount: 2,
              characterCount: 1,
              questCount: 1
            },
            gamePlan: testPlan
          }
        });
        
      case 'generate':
        // Simulate world generation (instant for testing)
        const testWorld = {
          world: {
            starting_room: 'start',
            rooms: [
              {
                id: 'start',
                name: 'Starting Room',
                description: 'A simple test room',
                exits: { north: 'room2' }
              },
              {
                id: 'room2',
                name: 'Second Room',
                description: 'Another test room',
                exits: { south: 'start' }
              }
            ]
          }
        };
        
        const gameState = {
          currentRoom: 'start',
          inventory: [],
          health: 100,
          score: 0
        };
        
        gameStates[userId] = {
          ...gameStates[userId],
          world: testWorld,
          state: gameState,
          status: 'ready'
        };
        
        return res.json({
          success: true,
          nextStep: 'complete',
          progress: 100,
          message: 'World generated - TEST MODE',
          data: {
            worldOverview: {
              title: "Test Adventure",
              description: "A test game",
              setting: "Debug Land"
            },
            initialState: gameState,
            currentRoom: testWorld.world.rooms[0]
          }
        });
        
      default:
        return res.status(400).json({ 
          error: `Unknown step: ${step}` 
        });
    }
    
  } catch (error) {
    console.error('[TEST] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Test failed'
    });
  }
}