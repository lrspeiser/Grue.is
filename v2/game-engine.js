// game-engine.js - Simplified runtime engine for pre-generated worlds
// This handles actual gameplay with the AI as dungeon master

const OpenAIApi = require("openai");
const openai = new OpenAIApi(process.env.OPENAI_API_KEY);
const imageService = require('./image-service');

// Log API configuration on startup
if (!process.env.OPENAI_API_KEY) {
  console.error("[GameEngine] WARNING: OPENAI_API_KEY not found in environment variables");
} else {
  console.log("[GameEngine] OpenAI API key loaded (last 4 chars):", process.env.OPENAI_API_KEY.slice(-4));
  console.log("[GameEngine] Using model: gpt-4-turbo-preview (GPT-5 does not exist)");
}

class GameEngine {
  constructor(world, userId, io = null) {
    // Validate world structure
    if (!world || !world.world || !world.world.rooms || !Array.isArray(world.world.rooms)) {
      console.error("[GameEngine] Invalid world structure:", JSON.stringify(world, null, 2).substring(0, 500));
      throw new Error("Invalid world structure - missing world.world.rooms array");
    }
    
    this.world = world;
    this.userId = userId;
    this.io = io; // Socket.IO instance for emitting events
    this.state = this.initializeState();
    this.conversationBuffer = []; // Keep last 10 turns
    this.maxBufferSize = 10;
    
    // Load existing images into cache
    imageService.loadExistingImages(world);
    
    // Generate images for starting room and adjacent
    this.generateImagesForCurrentRoom();
  }

  initializeState() {
    const startingRoom = this.world.world.rooms.find(r => 
      r.id === this.world.progression.acts[0].locations_unlocked[0]
    ) || this.world.world.rooms[0];

    return {
      currentRoomId: startingRoom.id,
      visitedRooms: [startingRoom.id],
      inventory: [],
      activeQuests: [],
      completedQuests: [],
      gameFlags: {},
      npcStates: {},
      turnCount: 0,
      score: 0,
      health: 100,
      resources: {
        gold: 100,
        supplies: 10
      }
    };
  }

  /**
   * Process user input with AI as the dungeon master
   * Single AI call that handles everything
   */
  async processUserInput(userInput) {
    console.log(`[GameEngine] Processing input for user ${this.userId}: "${userInput}"`);
    
    const currentRoom = this.world.world.rooms.find(r => r.id === this.state.currentRoomId);
    const availableActions = this.getAvailableActions();
    
    const dmPrompt = `You are the Dungeon Master for "${this.world.overview.title}".
    
    CURRENT GAME STATE:
    - Location: ${currentRoom.name} (${currentRoom.id})
    - Description: ${currentRoom.description}
    - Available Exits: ${Object.entries(this.world.navigation[currentRoom.id])
        .filter(([dir, room]) => room)
        .map(([dir, room]) => `${dir}: ${room}`)
        .join(', ')}
    - Inventory: ${this.state.inventory.join(', ') || 'empty'}
    - Active Quests: ${this.state.activeQuests.map(q => q.name).join(', ') || 'none'}
    - Health: ${this.state.health}/100
    - Resources: Gold: ${this.state.resources.gold}, Supplies: ${this.state.resources.supplies}
    
    AVAILABLE ELEMENTS IN THIS ROOM:
    - NPCs: ${this.getNPCsInRoom(currentRoom.id).map(npc => npc.name).join(', ') || 'none'}
    - Items: ${this.getItemsInRoom(currentRoom.id).map(item => item.name).join(', ') || 'none'}
    - Actions: ${currentRoom.available_actions?.join(', ') || 'look around'}
    
    CONVERSATION HISTORY (last 3 turns):
    ${this.getRecentHistory()}
    
    USER INPUT: "${userInput}"
    
    Respond as the dungeon master:
    1. Interpret the user's intent
    2. Determine the outcome based on game rules
    3. Update the game state appropriately
    4. Provide an engaging narrative response
    5. Include educational historical context when relevant
    6. Keep responses concise but atmospheric (2-3 paragraphs max)
    
    Be consistent with the historical setting: ${this.world.overview.setting}`;

    const gameUpdateTools = [
      {
        type: "function",
        function: {
          name: "update_game_state",
          description: "Update the game state based on user action",
          parameters: {
            type: "object",
            properties: {
              narrative_response: {
                type: "string",
                description: "The narrative text to show the player (2-3 paragraphs)"
              },
              state_changes: {
                type: "object",
                properties: {
                  new_room_id: { type: "string", description: "If player moved to a new room" },
                  inventory_add: { type: "array", items: { type: "string" } },
                  inventory_remove: { type: "array", items: { type: "string" } },
                  quest_updates: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        quest_id: { type: "string" },
                        action: { type: "string", enum: ["start", "progress", "complete"] },
                        progress_note: { type: "string" }
                      }
                    }
                  },
                  npc_interactions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        npc_id: { type: "string" },
                        relationship_change: { type: "integer" },
                        unlocked_dialogue: { type: "string" }
                      }
                    }
                  },
                  resource_changes: {
                    type: "object",
                    properties: {
                      gold: { type: "integer" },
                      supplies: { type: "integer" },
                      health: { type: "integer" }
                    }
                  },
                  game_flags: {
                    type: "object",
                    additionalProperties: { type: "boolean" }
                  }
                }
              },
              action_type: {
                type: "string",
                enum: ["movement", "interaction", "combat", "dialogue", "examine", "use_item", "quest", "system"],
                description: "Type of action performed"
              },
              educational_note: {
                type: "string",
                description: "Optional historical fact or context related to the action"
              }
            },
            required: ["narrative_response", "state_changes", "action_type"]
          }
        }
      }
    ];

    try {
      console.log("[GameEngine] Sending to OpenAI API...");
      console.log("[GameEngine] Model: gpt-4-turbo-preview");
      console.log("[GameEngine] Tool: update_game_state");
      console.log("[GameEngine] Prompt length:", dmPrompt.length);
      
      const startTime = Date.now();
      const response = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          { role: "system", content: dmPrompt },
          { role: "user", content: userInput }
        ],
        tools: gameUpdateTools,
        tool_choice: { type: "function", function: { name: "update_game_state" } }
      });
      
      const duration = Date.now() - startTime;
      console.log(`[GameEngine] OpenAI response received in ${duration}ms`);

      if (response.choices[0].message.tool_calls) {
        console.log("[GameEngine] Tool call received from OpenAI");
        const gameUpdate = JSON.parse(response.choices[0].message.tool_calls[0].function.arguments);
        console.log("[GameEngine] Game update:", JSON.stringify(gameUpdate, null, 2));
        
        // Apply state changes
        console.log("[GameEngine] Applying state changes...");
        this.applyStateChanges(gameUpdate.state_changes);
        
        // Add to conversation history
        this.addToHistory(userInput, gameUpdate.narrative_response);
        
        // Increment turn counter
        this.state.turnCount++;
        
        const result = {
          narrative: gameUpdate.narrative_response,
          educationalNote: gameUpdate.educational_note,
          actionType: gameUpdate.action_type,
          currentRoom: this.getCurrentRoomData(),
          gameState: this.getPublicState()
        };
        
        console.log("[GameEngine] Response prepared successfully");
        console.log("[GameEngine] Action type:", gameUpdate.action_type);
        console.log("[GameEngine] ========================================");
        return result;
      } else {
        console.log("[GameEngine] No tool call in response");
        console.log("[GameEngine] ========================================");
      }
    } catch (error) {
      console.error("[GameEngine] Error processing input:", error);
      return {
        narrative: "The ancient spirits seem confused by your words. Try rephrasing your action.",
        actionType: "error",
        currentRoom: this.getCurrentRoomData(),
        gameState: this.getPublicState()
      };
    }
  }

  /**
   * Apply state changes from AI response
   */
  applyStateChanges(changes) {
    if (changes.new_room_id && this.world.world.rooms.find(r => r.id === changes.new_room_id)) {
      const previousRoomId = this.state.currentRoomId;
      this.state.currentRoomId = changes.new_room_id;
      if (!this.state.visitedRooms.includes(changes.new_room_id)) {
        this.state.visitedRooms.push(changes.new_room_id);
      }
      
      // Generate images for new room and adjacent rooms
      if (previousRoomId !== changes.new_room_id) {
        this.generateImagesForCurrentRoom();
      }
    }

    if (changes.inventory_add) {
      this.state.inventory.push(...changes.inventory_add);
    }

    if (changes.inventory_remove) {
      changes.inventory_remove.forEach(item => {
        const index = this.state.inventory.indexOf(item);
        if (index > -1) {
          this.state.inventory.splice(index, 1);
        }
      });
    }

    if (changes.quest_updates) {
      changes.quest_updates.forEach(update => {
        this.updateQuest(update.quest_id, update.action, update.progress_note);
      });
    }

    if (changes.resource_changes) {
      Object.entries(changes.resource_changes).forEach(([resource, change]) => {
        if (resource === 'health') {
          this.state.health = Math.max(0, Math.min(100, this.state.health + change));
        } else if (this.state.resources[resource] !== undefined) {
          this.state.resources[resource] += change;
        }
      });
    }

    if (changes.game_flags) {
      Object.assign(this.state.gameFlags, changes.game_flags);
    }

    if (changes.npc_interactions) {
      changes.npc_interactions.forEach(interaction => {
        if (!this.state.npcStates[interaction.npc_id]) {
          this.state.npcStates[interaction.npc_id] = { relationship: 0, unlockedDialogue: [] };
        }
        this.state.npcStates[interaction.npc_id].relationship += interaction.relationship_change;
        if (interaction.unlocked_dialogue) {
          this.state.npcStates[interaction.npc_id].unlockedDialogue.push(interaction.unlocked_dialogue);
        }
      });
    }
  }

  /**
   * Update quest status
   */
  updateQuest(questId, action, progressNote) {
    const quest = this.world.world.quests.find(q => q.id === questId);
    if (!quest) return;

    if (action === 'start') {
      if (!this.state.activeQuests.find(q => q.id === questId)) {
        this.state.activeQuests.push({
          id: questId,
          name: quest.name,
          progress: 0,
          notes: [progressNote]
        });
      }
    } else if (action === 'progress') {
      const activeQuest = this.state.activeQuests.find(q => q.id === questId);
      if (activeQuest) {
        activeQuest.progress += 25; // Simple progress tracking
        activeQuest.notes.push(progressNote);
      }
    } else if (action === 'complete') {
      const index = this.state.activeQuests.findIndex(q => q.id === questId);
      if (index > -1) {
        const completed = this.state.activeQuests.splice(index, 1)[0];
        completed.completedAt = this.state.turnCount;
        this.state.completedQuests.push(completed);
        this.state.score += 100; // Reward for quest completion
      }
    }
  }

  /**
   * Get current room data with image
   */
  getCurrentRoomData() {
    const room = this.world.world.rooms.find(r => r.id === this.state.currentRoomId);
    return {
      id: room.id,
      name: room.name,
      description: room.description,
      imageUrl: room.imageUrl,
      firstVisit: !this.state.visitedRooms.includes(room.id),
      exits: this.world.navigation[room.id]
    };
  }

  /**
   * Get NPCs in current room
   */
  getNPCsInRoom(roomId) {
    return this.world.world.characters.filter(npc => npc.location === roomId);
  }

  /**
   * Get items in current room
   */
  getItemsInRoom(roomId) {
    return this.world.world.items.filter(item => 
      item.location === roomId && !this.state.inventory.includes(item.id)
    );
  }

  /**
   * Get available actions based on current state
   */
  getAvailableActions() {
    const room = this.world.world.rooms.find(r => r.id === this.state.currentRoomId);
    const actions = [...(room.available_actions || ['look', 'inventory'])];
    
    // Add movement directions
    Object.keys(this.world.navigation[room.id]).forEach(dir => {
      if (this.world.navigation[room.id][dir]) {
        actions.push(`go ${dir}`);
      }
    });

    return actions;
  }

  /**
   * Add to conversation history
   */
  addToHistory(userInput, aiResponse) {
    this.conversationBuffer.push({
      turn: this.state.turnCount,
      user: userInput,
      response: aiResponse
    });

    if (this.conversationBuffer.length > this.maxBufferSize) {
      this.conversationBuffer.shift();
    }
  }

  /**
   * Get recent conversation history
   */
  getRecentHistory() {
    return this.conversationBuffer.slice(-3)
      .map(turn => `Turn ${turn.turn}:\nUser: ${turn.user}\nDM: ${turn.response}`)
      .join('\n\n');
  }

  /**
   * Get public game state (safe to send to client)
   */
  getPublicState() {
    return {
      currentRoomId: this.state.currentRoomId,
      visitedRooms: this.state.visitedRooms,
      inventory: this.state.inventory,
      activeQuests: this.state.activeQuests.map(q => ({
        name: q.name,
        progress: q.progress,
        notes: q.notes
      })),
      completedQuests: this.state.completedQuests.length,
      turnCount: this.state.turnCount,
      score: this.state.score,
      health: this.state.health,
      resources: this.state.resources
    };
  }

  /**
   * Check if game is complete
   */
  isGameComplete() {
    const victoryConditions = this.world.progression.victory_conditions;
    // Simple check - can be made more sophisticated
    return this.state.completedQuests.length >= this.world.world.quests.filter(q => q.type === 'main_story').length;
  }

  /**
   * Get game completion summary
   */
  getGameSummary() {
    return {
      completed: this.isGameComplete(),
      turnCount: this.state.turnCount,
      score: this.state.score,
      roomsExplored: this.state.visitedRooms.length,
      totalRooms: this.world.world.rooms.length,
      questsCompleted: this.state.completedQuests.length,
      totalQuests: this.world.world.quests.length,
      survivalRate: this.state.health
    };
  }

  /**
   * Generate images for current room and adjacent rooms
   */
  async generateImagesForCurrentRoom() {
    const currentRoom = this.world.world.rooms.find(r => r.id === this.state.currentRoomId);
    if (!currentRoom) return;
    
    // Get adjacent rooms
    const adjacentRooms = this.getAdjacentRooms(currentRoom);
    
    console.log(`[GameEngine] Generating images for room ${currentRoom.id} and ${adjacentRooms.length} adjacent rooms`);
    
    // Generate images
    await imageService.generateRoomAndAdjacent(
      currentRoom,
      adjacentRooms,
      (imageUpdate) => {
        // Update the room in world data
        const room = this.world.world.rooms.find(r => r.id === imageUpdate.roomId);
        if (room) {
          room.imageUrl = imageUpdate.imageUrl;
        }
        
        // Emit to client if Socket.IO is available
        if (this.io) {
          this.io.to(this.userId).emit('imageGenerated', {
            roomId: imageUpdate.roomId,
            imageUrl: imageUpdate.imageUrl,
            isCurrent: imageUpdate.roomId === this.state.currentRoomId,
            queueSize: imageUpdate.queueSize
          });
        }
      }
    );
  }

  /**
   * Get adjacent rooms based on navigation
   */
  getAdjacentRooms(currentRoom) {
    const adjacentRoomIds = [];
    const navigation = this.world.navigation[currentRoom.id];
    
    if (!navigation) return [];
    
    // Collect all connected room IDs
    ['north', 'south', 'east', 'west', 'up', 'down'].forEach(direction => {
      if (navigation[direction]) {
        adjacentRoomIds.push(navigation[direction]);
      }
    });
    
    // Add special connections
    if (navigation.special && Array.isArray(navigation.special)) {
      adjacentRoomIds.push(...navigation.special);
    }
    
    // Get room objects
    const adjacentRooms = adjacentRoomIds
      .map(roomId => this.world.world.rooms.find(r => r.id === roomId))
      .filter(room => room !== undefined);
    
    return adjacentRooms;
  }

  /**
   * Get current room data with cached image
   */
  getCurrentRoomData() {
    const room = this.world.world.rooms.find(r => r.id === this.state.currentRoomId);
    
    // Try to get cached image
    const cachedImage = imageService.getCachedImage(room.id);
    
    return {
      id: room.id,
      name: room.name,
      description: room.description,
      imageUrl: cachedImage || room.imageUrl || null,
      imageStatus: cachedImage ? 'ready' : (imageService.isGenerating(room.id) ? 'generating' : 'pending'),
      firstVisit: this.state.visitedRooms.filter(id => id === room.id).length === 1,
      exits: this.world.navigation[room.id]
    };
  }
  
  /**
   * Update the Socket.IO instance (useful when loaded before io is available)
   */
  setIo(ioInstance) {
    this.io = ioInstance;
    console.log(`[GameEngine] Socket.IO instance updated for user ${this.userId}`);
  }
}

module.exports = GameEngine;