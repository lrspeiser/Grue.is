// Simplified game-status endpoint that returns mock data immediately
// This avoids timeout issues while still providing a working game

module.exports = async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const userId = req.method === 'GET' ? req.query.userId : req.body?.userId;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  // Always return mock game data for now to avoid timeouts
  const mockGameData = {
    success: true,
    status: 'ready',
    gameId: `game-${userId}-${Date.now()}`,
    worldOverview: {
      title: "The Chronicles of Debug Land",
      description: "A mystical adventure through the realm of code and debugging",
      setting: "A digital kingdom where bugs are monsters and features are treasures"
    },
    initialState: {
      currentRoom: 'debug_plaza',
      inventory: ['debugger', 'console_log'],
      health: 100,
      score: 0,
      questsCompleted: [],
      gameStartTime: Date.now(),
      turnCount: 0
    },
    currentRoom: {
      id: 'debug_plaza',
      name: 'Debug Plaza',
      description: 'You stand in the Debug Plaza, the central hub of Code Kingdom. The grand Console Tower looms to the north, while the Variables Market bustles to the east. To the west, you can hear the rhythmic hammering from the Function Forge.',
      exits: {
        north: 'console_tower',
        south: 'syntax_gardens',
        east: 'variables_market',
        west: 'function_forge'
      },
      items: ['debug_map', 'health_potion'],
      npcs: ['wise_debugger', 'helpful_linter']
    }
  };

  // Add slight delay to simulate processing
  await new Promise(resolve => setTimeout(resolve, 100));
  
  res.json(mockGameData);
}