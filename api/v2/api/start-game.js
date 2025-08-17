// Vercel function for /api/v2/api/start-game
// This endpoint starts game generation and returns immediately
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

  const { userId, userProfile } = req.body || {};
  
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    console.log('[V2] Starting game generation for user:', userId);
    
    const database = getFirebaseAdmin();
    if (!database) {
      throw new Error('Firebase not initialized');
    }
    
    // Create initial game status
    const gameRef = database.ref(`v2/games/${userId}`);
    await gameRef.set({
      status: 'generating',
      startedAt: Date.now(),
      userProfile: userProfile || {},
      progress: 0,
      message: 'Initializing game generation...'
    });
    
    // Return immediately with status
    res.json({
      success: true,
      status: 'generating',
      message: 'Game generation started',
      userId: userId
    });
    
    // Note: In a real implementation, you would trigger a background job here
    // For now, the actual generation will happen in a separate call
    
  } catch (error) {
    console.error('[V2] Error starting game:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to start game generation'
    });
  }
}