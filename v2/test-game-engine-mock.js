// test-game-engine-mock.js - Game engine with mocked AI responses for testing

class MockGameEngine {
  constructor(world, userId) {
    // Validate world structure
    if (!world || !world.world || !world.world.rooms || !Array.isArray(world.world.rooms)) {
      throw new Error("Invalid world structure - missing world.world.rooms array");
    }
    
    this.world = world;
    this.userId = userId;
    this.state = this.initializeState();
    this.conversationBuffer = [];
    this.maxBufferSize = 10;
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
      currentAct: 1,
      playerStats: {
        health: 100,
        experience: 0,
        knowledge: []
      }
    };
  }

  getCurrentRoomData() {
    const room = this.world.world.rooms.find(r => r.id === this.state.currentRoomId);
    if (!room) return null;

    return {
      id: room.id,
      name: room.name,
      description: room.description,
      exits: room.exits,
      items: room.items || [],
      characters: this.world.world.characters.filter(c => c.location === room.id),
      image_url: room.image_url
    };
  }

  getPublicState() {
    return {
      currentRoomId: this.state.currentRoomId,
      visitedRooms: this.state.visitedRooms,
      inventory: this.state.inventory,
      activeQuests: this.state.activeQuests.map(q => ({
        id: q.id,
        name: q.name,
        currentStep: q.currentStep
      })),
      completedQuests: this.state.completedQuests,
      currentAct: this.state.currentAct,
      playerStats: this.state.playerStats
    };
  }

  // Mock AI response generation
  async processPlayerInput(input) {
    const lowerInput = input.toLowerCase().trim();
    const response = {
      narrative: '',
      changes: {},
      state_updates: {}
    };

    // Handle movement commands
    if (lowerInput.startsWith('go ') || lowerInput.startsWith('move ')) {
      const direction = lowerInput.replace(/^(go|move)\s+/, '');
      return this.handleMovement(direction);
    }

    // Handle look/examine commands
    if (lowerInput.startsWith('look') || lowerInput.startsWith('examine')) {
      return this.handleLook(lowerInput);
    }

    // Handle inventory commands
    if (lowerInput.includes('inventory') || lowerInput === 'i') {
      return this.handleInventory();
    }

    // Handle take/get commands
    if (lowerInput.startsWith('take ') || lowerInput.startsWith('get ')) {
      const item = lowerInput.replace(/^(take|get)\s+/, '');
      return this.handleTakeItem(item);
    }

    // Handle talk commands
    if (lowerInput.startsWith('talk to ') || lowerInput.startsWith('speak with ')) {
      const target = lowerInput.replace(/^(talk to|speak with)\s+/, '');
      return this.handleTalk(target);
    }

    // Handle quest commands
    if (lowerInput.includes('quest')) {
      return this.handleQuestCommand();
    }

    // Handle help
    if (lowerInput === 'help' || lowerInput === '?') {
      return this.handleHelp();
    }

    // Handle empty or invalid input
    if (!lowerInput) {
      response.narrative = "You need to tell me what you want to do. Try 'help' for available commands.";
      return response;
    }

    // Default response for unrecognized commands
    response.narrative = `I'm not sure how to '${input}'. Try 'help' to see available commands.`;
    return response;
  }

  handleMovement(direction) {
    const room = this.world.world.rooms.find(r => r.id === this.state.currentRoomId);
    const response = {
      narrative: '',
      changes: {}
    };

    if (!room.exits[direction] || room.exits[direction] === null) {
      response.narrative = `You can't go ${direction} from here. Available exits are: ${
        Object.entries(room.exits)
          .filter(([_, value]) => value)
          .map(([key, _]) => key)
          .join(', ')
      }`;
      return response;
    }

    const newRoomId = room.exits[direction];
    const newRoom = this.world.world.rooms.find(r => r.id === newRoomId);

    if (!newRoom) {
      response.narrative = "That way seems to be blocked.";
      return response;
    }

    // Update state
    this.state.currentRoomId = newRoomId;
    if (!this.state.visitedRooms.includes(newRoomId)) {
      this.state.visitedRooms.push(newRoomId);
    }

    response.narrative = `You move ${direction} to ${newRoom.name}. ${newRoom.description}`;
    response.changes = {
      new_room_id: newRoomId,
      room_name: newRoom.name
    };

    return response;
  }

  handleLook(input) {
    const response = {
      narrative: '',
      changes: {}
    };

    const room = this.world.world.rooms.find(r => r.id === this.state.currentRoomId);

    if (input === 'look' || input === 'look around') {
      response.narrative = `${room.detailed_description || room.description}\n\nExits: ${
        Object.entries(room.exits)
          .filter(([_, value]) => value)
          .map(([key, _]) => key)
          .join(', ')
      }`;

      if (room.items && room.items.length > 0) {
        response.narrative += `\n\nYou can see: ${room.items.join(', ')}`;
      }

      const charactersHere = this.world.world.characters.filter(c => c.location === room.id);
      if (charactersHere.length > 0) {
        response.narrative += `\n\nPresent here: ${charactersHere.map(c => c.name).join(', ')}`;
      }
    } else {
      // Looking at specific item
      const target = input.replace(/^(look at|examine)\s+/, '');
      
      if (room.items && room.items.includes(target)) {
        const item = this.world.world.items?.find(i => i.id === target);
        response.narrative = item ? item.description : `The ${target} appears to be ordinary.`;
      } else {
        response.narrative = `You don't see any ${target} here.`;
      }
    }

    return response;
  }

  handleInventory() {
    const response = {
      narrative: '',
      changes: {}
    };

    if (this.state.inventory.length === 0) {
      response.narrative = "Your inventory is empty.";
    } else {
      response.narrative = `You are carrying: ${this.state.inventory.join(', ')}`;
    }

    return response;
  }

  handleTakeItem(itemName) {
    const response = {
      narrative: '',
      changes: {}
    };

    const room = this.world.world.rooms.find(r => r.id === this.state.currentRoomId);
    
    if (!room.items || !room.items.includes(itemName)) {
      response.narrative = `There's no ${itemName} here to take.`;
      return response;
    }

    // Add to inventory
    this.state.inventory.push(itemName);
    
    // Remove from room
    room.items = room.items.filter(i => i !== itemName);

    response.narrative = `You take the ${itemName}.`;
    response.changes = {
      inventory_changes: {
        added: [itemName]
      }
    };

    return response;
  }

  handleTalk(target) {
    const response = {
      narrative: '',
      changes: {}
    };

    const character = this.world.world.characters.find(c => 
      c.name.toLowerCase().includes(target) || c.id === target
    );

    if (!character || character.location !== this.state.currentRoomId) {
      response.narrative = `There's no ${target} here to talk to.`;
      return response;
    }

    // Generate mock dialogue
    response.narrative = `${character.name} says: "Greetings, traveler! I am ${character.description}. ${
      character.quest_giver ? "I have a task that might interest you." : "How may I help you?"
    }"`;

    if (character.quest_giver) {
      const quest = this.world.world.quests.find(q => q.giver === character.id);
      if (quest && !this.state.activeQuests.find(q => q.id === quest.id)) {
        response.narrative += `\n\n[New Quest Available: ${quest.name}]`;
        response.changes.quest_updates = {
          new_quests: [quest.id]
        };
      }
    }

    return response;
  }

  handleQuestCommand() {
    const response = {
      narrative: '',
      changes: {}
    };

    if (this.state.activeQuests.length === 0 && this.state.completedQuests.length === 0) {
      response.narrative = "You have no active or completed quests. Talk to NPCs to find quests.";
    } else {
      let questInfo = "=== QUESTS ===\n\n";
      
      if (this.state.activeQuests.length > 0) {
        questInfo += "Active Quests:\n";
        this.state.activeQuests.forEach(q => {
          questInfo += `- ${q.name}: ${q.description}\n`;
        });
      }

      if (this.state.completedQuests.length > 0) {
        questInfo += "\nCompleted Quests:\n";
        this.state.completedQuests.forEach(qId => {
          const quest = this.world.world.quests.find(q => q.id === qId);
          if (quest) {
            questInfo += `- ${quest.name} ✓\n`;
          }
        });
      }

      response.narrative = questInfo;
    }

    return response;
  }

  handleHelp() {
    const response = {
      narrative: '',
      changes: {}
    };

    response.narrative = `=== AVAILABLE COMMANDS ===

Movement:
  go [direction] - Move in a direction (north, south, east, west, up, down)
  
Exploration:
  look / look around - Examine your surroundings
  examine [item] - Look closely at something
  
Inventory:
  inventory / i - Check what you're carrying
  take [item] - Pick up an item
  drop [item] - Drop an item
  use [item] - Use an item
  
Interaction:
  talk to [character] - Speak with someone
  
Information:
  quests - View your quests
  help - Show this help message
  
Type commands naturally, like "go north" or "talk to priest"`;

    return response;
  }

  // Additional helper methods
  updateConversationBuffer(input, response) {
    this.conversationBuffer.push({
      input,
      response: response.narrative,
      timestamp: new Date().toISOString()
    });

    if (this.conversationBuffer.length > this.maxBufferSize) {
      this.conversationBuffer.shift();
    }
  }
}

module.exports = MockGameEngine;