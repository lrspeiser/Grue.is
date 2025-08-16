// Vercel function for /api/v2/api/continue-game
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

async function loadGameFromFirebase(userId) {
  try {
    const database = getFirebaseAdmin();
    if (!database) {
      throw new Error('Firebase not initialized');
    }
    
    const ref = database.ref(`v2/games/${userId}`);
    const snapshot = await ref.once('value');
    const gameData = snapshot.val();
    
    if (!gameData) {
      return null;
    }
    
    console.log(`[V2] Game loaded from Firebase for user ${userId}`);
    return gameData;
  } catch (error) {
    console.error('[V2] Error loading from Firebase:', error);
    return null;
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
  
  // Handle GET request for testing
  if (req.method === 'GET') {
    return res.status(200).json({ 
      message: 'continue-game endpoint is working! Use POST to load a game.',
      expectedBody: {
        userId: 'string (required)'
      }
    });
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed', method: req.method });
  }

  const { userId } = req.body || {};
  
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    console.log('[V2] Checking for existing game for user:', userId);
    
    // Load from Firebase
    const savedGame = await loadGameFromFirebase(userId);
    
    if (savedGame) {
      console.log('[V2] Found saved game for user:', userId);
      
      const currentRoom = savedGame.world?.world?.rooms?.find(
        r => r.id === savedGame.state?.currentRoom
      );
      
      return res.json({
        success: true,
        state: savedGame.state,
        currentRoom: currentRoom || savedGame.world?.world?.rooms?.[0]
      });
    } else {
      console.log('[V2] No saved game found for user:', userId);
      return res.json({
        success: false,
        message: 'No saved game found'
      });
    }
    
  } catch (error) {
    console.error('[V2] Error in continue-game:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to load game'
    });
  }
}