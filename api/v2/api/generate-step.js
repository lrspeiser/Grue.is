// Vercel function for /api/v2/api/generate-step
// Processes game generation in small steps to avoid timeout
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

  console.log(`[V2] Processing step: ${step} for user: ${userId}`);

  try {
    const database = getFirebaseAdmin();
    const gameRef = database ? database.ref(`v2/games/${userId}`) : null;
    
    switch(step) {
      case 'init':
        // Step 1: Initialize game generation
        console.log('[V2] Step 1: Initializing game generation');
        
        if (gameRef) {
          await gameRef.set({
            status: 'planning',
            step: 'init',
            startedAt: Date.now(),
            userProfile: userProfile || {},
            progress: 10,
            message: 'Starting game generation...'
          });
        }
        
        return res.json({
          success: true,
          nextStep: 'plan',
          progress: 10,
          message: 'Game generation initialized',
          data: { userId, userProfile }
        });
        
      case 'plan':
        // Step 2: Create game plan (this is the heavy AI call)
        console.log('[V2] Step 2: Creating game plan');
        console.log('[V2] User profile:', userProfile);
        
        if (gameRef) {
          await gameRef.update({
            status: 'planning',
            step: 'plan',
            progress: 20,
            message: 'AI is creating your game plan...'
          });
        }
        
        try {
          // Set a shorter timeout for the planning phase
          const planPromise = createCompletePlan(userProfile);
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Planning timeout')), 25000)
          );
          
          const plan = await Promise.race([planPromise, timeoutPromise]);
          
          console.log('[V2] Game plan created successfully');
          console.log('[V2] Plan structure:', Object.keys(plan || {}));
          
          if (!plan || !plan.world_map || !plan.characters || !plan.quests) {
            throw new Error('Invalid game plan structure');
          }
          
          // Save plan for next step
          if (gameRef) {
            await gameRef.update({
              gamePlan: plan,
              status: 'planning',
              step: 'plan_complete',
              progress: 50,
              message: 'Game plan created!'
            });
          }
          
          return res.json({
            success: true,
            nextStep: 'generate',
            progress: 50,
            message: 'Game plan created successfully',
            data: {
              planSummary: {
                title: plan.title,
                description: plan.description,
                setting: plan.setting,
                roomCount: plan.world_map?.rooms?.length || 0,
                characterCount: plan.characters?.length || 0,
                questCount: plan.quests?.length || 0
              },
              gamePlan: plan
            }
          });
          
        } catch (planError) {
          console.error('[V2] Planning error:', planError);
          return res.json({
            success: false,
            error: planError.message,
            nextStep: 'retry_plan',
            progress: 20,
            message: 'Planning failed, will retry...'
          });
        }
        
      case 'generate':
        // Step 3: Generate world from plan
        console.log('[V2] Step 3: Generating world from plan');
        
        if (!gamePlan) {
          return res.status(400).json({ 
            error: 'gamePlan is required for generate step' 
          });
        }
        
        if (gameRef) {
          await gameRef.update({
            status: 'generating',
            step: 'generate',
            progress: 60,
            message: 'Generating detailed world...'
          });
        }
        
        try {
          // Set a shorter timeout for world generation
          const worldPromise = generateWorldWithoutImages(gamePlan);
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Generation timeout')), 25000)
          );
          
          const world = await Promise.race([worldPromise, timeoutPromise]);
          
          console.log('[V2] World generated successfully');
          console.log('[V2] World structure:', Object.keys(world || {}));
          
          if (!world || !world.world || !world.world.rooms) {
            throw new Error('Invalid world structure');
          }
          
          // Create final game state
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
          
          // Save complete game
          if (gameRef) {
            await gameRef.set({
              ...gameState,
              status: 'ready',
              step: 'complete',
              progress: 100,
              message: 'Game ready!',
              lastSaved: Date.now()
            });
          }
          
          const currentRoom = world.world.rooms.find(r => r.id === gameState.state.currentRoom);
          
          return res.json({
            success: true,
            nextStep: 'complete',
            progress: 100,
            message: 'World generated successfully!',
            data: {
              worldOverview: {
                title: gamePlan.title,
                description: gamePlan.description,
                setting: gamePlan.setting
              },
              initialState: gameState.state,
              currentRoom: currentRoom || world.world.rooms[0]
            }
          });
          
        } catch (genError) {
          console.error('[V2] Generation error:', genError);
          return res.json({
            success: false,
            error: genError.message,
            nextStep: 'retry_generate',
            progress: 60,
            message: 'Generation failed, will retry...'
          });
        }
        
      default:
        return res.status(400).json({ 
          error: `Unknown step: ${step}` 
        });
    }
    
  } catch (error) {
    console.error('[V2] Error in generate-step:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process step',
      step: step
    });
  }
}