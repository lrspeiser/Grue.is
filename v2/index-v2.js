// index-v2.js - Simplified main server with pre-generated worlds
// Clean architecture with AI-driven game generation

const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const admin = require("firebase-admin");

const { createCompletePlan } = require("./game-planner");
const { generateWorldWithoutImages } = require("./world-generator-fast");
const GameEngine = require("./game-engine");

const router = express.Router();
const PORT = process.env.PORT || 3001; // Use environment port

router.use(express.json());

// Only create server and io if running standalone
let server, io;
if (require.main === module) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "public-v2")));
  server = http.createServer(app);
  io = new Server(server);
  app.use('/', router);
} else {
  // When imported as module, io will be set by the parent app
  io = null;
}

// Store active game engines
const activeGames = new Map();

// Store pre-generated worlds
const worldCache = new Map();

/**
 * Initialize or get existing Firebase Admin instance
 */
function getFirebaseAdmin() {
  const V2_APP_NAME = 'grue-v2-app';
  
  try {
    // Check if v2 app already exists
    const existingApp = admin.apps.find(app => app.name === V2_APP_NAME);
    if (existingApp) {
      return existingApp.database();
    }
    
    // Check if we have service account
    if (!process.env.GOOGLE_SERVICE_ACCOUNT) {
      console.error("[V2] GOOGLE_SERVICE_ACCOUNT not found in environment");
      // Return null to handle gracefully
      return null;
    }
    
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    
    // Initialize with a specific name for v2
    const app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.databaseURL,
      storageBucket: process.env.storageBucket
    }, V2_APP_NAME);
    
    console.log("[V2] Firebase Admin initialized successfully");
    return app.database();
  } catch (error) {
    console.error("[V2] Error initializing Firebase:", error.message);
    // Return null to handle gracefully
    return null;
  }
}

const db = getFirebaseAdmin();

/**
 * API: Start a new game
 * This triggers the AI to plan and generate the entire world
 */
router.post("/new-game", async (req, res) => {
  const { userId, userProfile } = req.body;
  
  console.log(`[Server] Starting new game for user ${userId}`);
  
  // Set timeout for Vercel (10 seconds max for API routes)
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(202).json({
        success: true,
        status: 'generating',
        message: 'Game generation in progress. Please check back.',
        userId
      });
    }
  }, 9000);
  
  try {
    // Check if we have a cached world for this profile
    const profileKey = JSON.stringify(userProfile);
    let world;
    
    if (worldCache.has(profileKey)) {
      console.log("[Server] Using cached world for profile");
      world = worldCache.get(profileKey);
    } else {
      // Step 1: AI plans the game
      console.log("[Server] AI is planning the game...");
      const gamePlan = await createCompletePlan(userProfile);
      
      // Check if gamePlan was successfully created
      if (!gamePlan || !gamePlan.world_map || !gamePlan.characters || !gamePlan.quests) {
        throw new Error("Failed to generate valid game plan from AI");
      }
      
      // Step 2: Generate world content WITHOUT images (fast)
      console.log("[Server] Generating world content (without images)...");
      world = await generateWorldWithoutImages(gamePlan);
      
      // Cache for similar profiles
      worldCache.set(profileKey, world);
      
      // Save to Firebase asynchronously (don't wait)
      saveWorldToFirebase(userId, world).catch(err => 
        console.error("[Server] Firebase save error:", err)
      );
    }
    
    // Step 3: Initialize game engine with Socket.IO for image updates
    const gameEngine = new GameEngine(world, userId, io);
    activeGames.set(userId, gameEngine);
    
    clearTimeout(timeout);
    
    // Return initial game state
    if (!res.headersSent) {
      res.json({
        success: true,
        gameId: world.metadata.gameId || userId,
        initialState: gameEngine.getPublicState(),
        currentRoom: gameEngine.getCurrentRoomData(),
        worldOverview: {
          title: world.overview.title,
          setting: world.overview.setting,
          totalRooms: world.world.rooms.length,
          totalQuests: world.world.quests.length,
          estimatedPlaytime: world.overview.estimated_playtime
        }
      });
    }
    
  } catch (error) {
    clearTimeout(timeout);
    console.error("[Server] Error creating new game:", error);
    console.error("[Server] Error details:", error.message);
    if (error.response) {
      console.error("[Server] API response error:", error.response.data);
    }
    
    // Send proper JSON error response
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error.message || "Failed to create game",
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
});

/**
 * API: Continue existing game
 */
router.post("/continue-game", async (req, res) => {
  const { userId } = req.body;
  
  // Set timeout for Vercel
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(202).json({
        success: true,
        status: 'loading',
        message: 'Game loading in progress. Please retry.',
        userId
      });
    }
  }, 9000);
  
  try {
    // Check if game engine exists in memory
    if (activeGames.has(userId)) {
      const gameEngine = activeGames.get(userId);
      clearTimeout(timeout);
      
      if (!res.headersSent) {
        res.json({
          success: true,
          state: gameEngine.getPublicState(),
          currentRoom: gameEngine.getCurrentRoomData()
        });
      }
    } else {
      // Load from Firebase
      const savedGame = await loadGameFromFirebase(userId);
      if (savedGame) {
        const gameEngine = new GameEngine(savedGame.world, userId, io);
        gameEngine.state = savedGame.state;
        activeGames.set(userId, gameEngine);
        
        clearTimeout(timeout);
        
        if (!res.headersSent) {
          res.json({
            success: true,
            state: gameEngine.getPublicState(),
            currentRoom: gameEngine.getCurrentRoomData()
          });
        }
      } else {
        clearTimeout(timeout);
        
        if (!res.headersSent) {
          res.json({
            success: false,
            error: "No saved game found"
          });
        }
      }
    }
  } catch (error) {
    clearTimeout(timeout);
    console.error("[Server] Error loading game:", error);
    
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: "Failed to load game"
      });
    }
  }
});

/**
 * Socket.IO: Handle real-time gameplay
 */
if (io) {
  io.on("connection", (socket) => {
    console.log("New client connected:", socket.id);
    
    const userId = socket.handshake.query.userId;
    if (!userId) {
      socket.disconnect(true);
      return;
    }
    
    socket.join(userId);
  
  // Handle game commands
  socket.on("gameCommand", async (data) => {
    const { command } = data;
    
    const gameEngine = activeGames.get(userId);
    if (!gameEngine) {
      socket.emit("error", { message: "No active game found" });
      return;
    }
    
    try {
      // Process command with AI
      const result = await gameEngine.processUserInput(command);
      
      // Send response to client
      socket.emit("gameResponse", {
        narrative: result.narrative,
        educationalNote: result.educationalNote,
        actionType: result.actionType,
        currentRoom: result.currentRoom,
        gameState: result.gameState
      });
      
      // Check for game completion
      if (gameEngine.isGameComplete()) {
        socket.emit("gameComplete", gameEngine.getGameSummary());
      }
      
      // Auto-save every 5 turns
      if (gameEngine.state.turnCount % 5 === 0) {
        await saveGameToFirebase(userId, gameEngine);
      }
      
    } catch (error) {
      console.error("[Server] Error processing command:", error);
      socket.emit("error", { message: "Failed to process command" });
    }
  });
  
  // Handle quick navigation (since rooms are pre-generated)
  socket.on("quickNav", async (data) => {
    const { targetRoomId } = data;
    
    const gameEngine = activeGames.get(userId);
    if (!gameEngine) {
      socket.emit("error", { message: "No active game found" });
      return;
    }
    
    // Check if room is accessible
    if (gameEngine.state.visitedRooms.includes(targetRoomId)) {
      gameEngine.state.currentRoomId = targetRoomId;
      socket.emit("roomChanged", {
        currentRoom: gameEngine.getCurrentRoomData(),
        gameState: gameEngine.getPublicState()
      });
    } else {
      socket.emit("error", { message: "You haven't visited that location yet" });
    }
  });
  
    // Handle disconnect
    socket.on("disconnect", () => {
      console.log(`Client disconnected: ${socket.id}`);
      // Keep game in memory for reconnection
    });
  });
}

/**
 * API: Check game generation status
 */
router.get("/game-status/:userId", (req, res) => {
  const userId = req.params.userId;
  
  if (activeGames.has(userId)) {
    const gameEngine = activeGames.get(userId);
    res.json({
      success: true,
      status: 'ready',
      hasGame: true,
      currentRoom: gameEngine.getCurrentRoomData(),
      state: gameEngine.getPublicState()
    });
  } else {
    res.json({
      success: true,
      status: 'not_found',
      hasGame: false,
      message: 'No active game found. Start a new game or continue from saved.'
    });
  }
});

/**
 * API: Get world map (for mini-map feature)
 */
router.get("/world-map/:userId", (req, res) => {
  const userId = req.params.userId;
  const gameEngine = activeGames.get(userId);
  
  if (!gameEngine) {
    res.status(404).json({ error: "No active game" });
    return;
  }
  
  // Return only visited rooms for mini-map
  const visitedRooms = gameEngine.world.world.rooms
    .filter(room => gameEngine.state.visitedRooms.includes(room.id))
    .map(room => ({
      id: room.id,
      name: room.name,
      connections: gameEngine.world.navigation[room.id],
      imageUrl: room.imageUrl
    }));
  
  res.json({
    currentRoom: gameEngine.state.currentRoomId,
    visitedRooms,
    totalRooms: gameEngine.world.world.rooms.length
  });
});

/**
 * API: Generate game preview (shows what AI will create)
 */
router.post("/preview-game", async (req, res) => {
  const { userProfile } = req.body;
  
  try {
    // Just get the plan, don't generate content
    const gamePlan = await createCompletePlan(userProfile);
    
    res.json({
      title: gamePlan.game_overview.title,
      setting: gamePlan.game_overview.setting,
      story: gamePlan.game_overview.main_story,
      educationalGoals: gamePlan.game_overview.educational_goals,
      locations: gamePlan.world_map.locations.map(l => l.name),
      mainQuests: gamePlan.quests.filter(q => q.type === 'main_story').map(q => q.name),
      characters: gamePlan.characters.map(c => `${c.name} - ${c.role}`),
      estimatedGenerationTime: gamePlan.metadata.estimatedGenerationTime
    });
    
  } catch (error) {
    console.error("[Server] Error previewing game:", error);
    res.status(500).json({ error: "Failed to preview game" });
  }
});

/**
 * Save game to Firebase
 */
async function saveGameToFirebase(userId, gameEngine) {
  if (!db) {
    console.warn("[Server] Firebase not available, skipping save");
    return;
  }
  
  try {
    const saveData = {
      world: gameEngine.world,
      state: gameEngine.state,
      savedAt: new Date().toISOString()
    };
    
    await db.ref(`games-v2/${userId}`).set(saveData);
    console.log(`[Server] Game saved for user ${userId}`);
  } catch (error) {
    console.error("[Server] Error saving game:", error);
  }
}

/**
 * Load game from Firebase
 */
async function loadGameFromFirebase(userId) {
  if (!db) {
    console.warn("[Server] Firebase not available, cannot load game");
    return null;
  }
  
  try {
    const snapshot = await db.ref(`games-v2/${userId}`).once('value');
    return snapshot.val();
  } catch (error) {
    console.error("[Server] Error loading game:", error);
    return null;
  }
}

/**
 * Save world to Firebase (for persistence)
 */
async function saveWorldToFirebase(userId, world) {
  if (!db) {
    console.warn("[Server] Firebase not available, skipping world save");
    return;
  }
  
  try {
    await db.ref(`worlds-v2/${userId}`).set(world);
    console.log(`[Server] World saved for user ${userId}`);
  } catch (error) {
    console.error("[Server] Error saving world:", error);
  }
}

// Function to set io instance when used as module
router.setIo = function(ioInstance) {
  io = ioInstance;
  console.log("[V2] Socket.IO instance set from parent app");
};

// Export router for use as a module
module.exports = router;

// Only start server if run directly (not imported)
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Game Server v2 running on port ${PORT}`);
    console.log(`Architecture: AI-planned, pre-generated worlds`);
    console.log(`Features: Instant room navigation, rich content, educational focus`);
  });
}