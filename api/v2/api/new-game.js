// Vercel function for /api/v2/api/new-game
const { createCompletePlan } = require('../../../v2/game-planner.js');
const { generateWorldWithoutImages } = require('../../../v2/world-generator-fast.js');
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

async function saveGameToFirebase(userId, gameData) {
  try {
    const database = getFirebaseAdmin();
    if (!database) {
      throw new Error('Firebase not initialized');
    }
    
    const ref = database.ref(`v2/games/${userId}`);
    await ref.set({
      ...gameData,
      lastSaved: Date.now()
    });
    
    console.log(`[V2] Game saved to Firebase for user ${userId}`);
    return true;
  } catch (error) {
    console.error('[V2] Error saving to Firebase:', error);
    return false;
  }
}

module.exports = async function handler(req, res) {
  // Set CORS headers for all requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed', method: req.method });
  }

  const { userId, ...userProfile } = req.body;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    console.log('[V2] Starting game generation for user:', userId);
    
    // Phase 1: Create game plan
    const gamePlan = await createCompletePlan(userProfile);
    
    if (!gamePlan || !gamePlan.world_map || !gamePlan.characters || !gamePlan.quests) {
      throw new Error('Invalid game plan structure received from AI');
    }
    
    // Phase 2: Generate detailed world content
    const world = await generateWorldWithoutImages(gamePlan);
    
    if (!world || !world.world || !world.world.rooms || !Array.isArray(world.world.rooms)) {
      throw new Error('Invalid world structure received from generator');
    }
    
    // Create game state
    const gameState = {
      world,
      state: {
        currentRoom: world.world.starting_room || 'town_square',
        inventory: [],
        health: 100,
        score: 0,
        questsCompleted: [],
        gameStartTime: Date.now(),
        turnCount: 0
      }
    };
    
    // Save to Firebase
    await saveGameToFirebase(userId, gameState);
    
    // Return game data
    const currentRoom = world.world.rooms.find(r => r.id === gameState.state.currentRoom);
    
    res.json({
      success: true,
      worldOverview: {
        title: gamePlan.title,
        description: gamePlan.description,
        setting: gamePlan.setting
      },
      initialState: gameState.state,
      currentRoom: currentRoom || world.world.rooms[0]
    });
    
  } catch (error) {
    console.error('[V2] Error in new-game:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate game'
    });
  }
}