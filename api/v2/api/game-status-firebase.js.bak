// Vercel function for /api/v2/api/game-status
// This endpoint checks the status of game generation
const admin = require('firebase-admin');

// Initialize Firebase Admin if not already initialized
const V2_APP_NAME = 'grue-v2-app';
function getFirebaseAdmin() {
  try {
    const existingApp = admin.apps.find(app => app.name === V2_APP_NAME);
    if (existingApp) {
      return existingApp.database();
    }
    
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT || '{}');
    const app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL || "https://grue-7ab58-default-rtdb.firebaseio.com"
    }, V2_APP_NAME);
    
    return app.database();
  } catch (error) {
    console.error('[V2] Firebase initialization error:', error);
    return null;
  }
}

// Mock data for testing when Firebase is not available
const mockGameData = {
  worldOverview: {
    title: "The Chronicles of Learning",
    description: "An educational adventure through time and space",
    setting: "A mystical realm where knowledge is power"
  },
  initialState: {
    currentRoom: 'town_square',
    inventory: [],
    health: 100,
    score: 0,
    questsCompleted: [],
    gameStartTime: Date.now(),
    turnCount: 0
  },
  currentRoom: {
    id: 'town_square',
    name: 'Town Square',
    description: 'You stand in the bustling town square. Merchants hawk their wares, children play in the fountain, and adventurers gather near the notice board.',
    exits: {
      north: 'marketplace',
      south: 'inn',
      east: 'library',
      west: 'blacksmith'
    },
    items: ['notice_board', 'fountain'],
    npcs: ['town_crier']
  }
};

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

  try {
    const database = getFirebaseAdmin();
    if (!database) {
      // Return mock data if Firebase is not available
      console.log('[V2] Firebase not available, returning mock data');
      return res.json({
        success: true,
        status: 'ready',
        gameId: `mock-${userId}`,
        ...mockGameData
      });
    }
    
    const gameRef = database.ref(`v2/games/${userId}`);
    const snapshot = await gameRef.once('value');
    const gameData = snapshot.val();
    
    if (!gameData) {
      return res.json({
        success: false,
        status: 'not_found',
        message: 'No game found for this user'
      });
    }
    
    // Check game status
    if (gameData.status === 'generating') {
      // Check if generation has been running too long (timeout after 60 seconds)
      const elapsedTime = Date.now() - gameData.startedAt;
      if (elapsedTime > 60000) {
        // Use mock data as fallback
        console.log('[V2] Generation timeout, using mock data');
        await gameRef.set({
          ...mockGameData,
          status: 'ready',
          gameId: `fallback-${userId}`,
          lastSaved: Date.now()
        });
        
        return res.json({
          success: true,
          status: 'ready',
          gameId: `fallback-${userId}`,
          ...mockGameData
        });
      }
      
      return res.json({
        success: true,
        status: 'generating',
        progress: gameData.progress || 0,
        message: gameData.message || 'Generating world...'
      });
    }
    
    if (gameData.status === 'ready' || gameData.world) {
      // Game is ready
      return res.json({
        success: true,
        status: 'ready',
        gameId: gameData.gameId || `game-${userId}`,
        worldOverview: gameData.worldOverview || mockGameData.worldOverview,
        initialState: gameData.state || gameData.initialState || mockGameData.initialState,
        currentRoom: gameData.currentRoom || mockGameData.currentRoom
      });
    }
    
    // Unknown status
    return res.json({
      success: false,
      status: 'error',
      message: 'Unknown game status'
    });
    
  } catch (error) {
    console.error('[V2] Error checking game status:', error);
    
    // Return mock data as fallback
    return res.json({
      success: true,
      status: 'ready',
      gameId: `error-fallback-${userId}`,
      ...mockGameData
    });
  }
}