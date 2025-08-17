// Process player commands for the text adventure game
const db = require('../../../db/database');

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

  const { userId, worldId, command, gameState, worldData } = req.body || {};
  
  if (!userId || !command) {
    return res.status(400).json({ error: 'userId and command are required' });
  }

  console.log(`[Command] Processing: "${command}" for user: ${userId}, world: ${worldId}`);

  try {
    // Initialize database if needed
    await db.initialize();
    
    // Parse the command
    const words = command.toLowerCase().trim().split(/\s+/);
    const action = words[0];
    const target = words.slice(1).join(' ');
    
    console.log(`[Command] Action: ${action}, Target: ${target}`);
    
    // Get current room data
    const currentRoomId = gameState?.currentRoom || 'start';
    const rooms = worldData?.rooms || [];
    const currentRoom = rooms.find(r => r.id === currentRoomId) || rooms[0];
    
    if (!currentRoom) {
      return res.json({
        success: false,
        message: "Error: Cannot find current room. Game state may be corrupted.",
        gameState
      });
    }
    
    let response = "";
    let newState = { ...gameState };
    let actionTaken = false;
    
    // Process different commands
    switch(action) {
      case 'look':
      case 'l':
      case 'examine':
      case 'x':
        if (!target || target === 'around' || target === 'room') {
          // Look at the room
          response = `${currentRoom.name}\n\n${currentRoom.description}\n\n`;
          
          if (currentRoom.items && currentRoom.items.length > 0) {
            response += `You can see: ${currentRoom.items.join(', ')}\n`;
          }
          
          if (currentRoom.npcs && currentRoom.npcs.length > 0) {
            const npcNames = currentRoom.npcs.map(npc => npc.name);
            response += `Present here: ${npcNames.join(', ')}\n`;
          }
          
          const exits = Object.keys(currentRoom.exits || {});
          if (exits.length > 0) {
            response += `\nExits: ${exits.join(', ')}`;
          }
        } else {
          // Look at specific item/npc
          const item = currentRoom.items?.find(i => i.toLowerCase().includes(target));
          const npc = currentRoom.npcs?.find(n => n.name.toLowerCase().includes(target));
          
          if (item) {
            response = `You examine the ${item}. It looks interesting.`;
          } else if (npc) {
            response = `${npc.name} says: "${npc.dialogue || 'Hello there!'}"`;
          } else {
            response = `You don't see any "${target}" here.`;
          }
        }
        actionTaken = true;
        break;
        
      case 'go':
      case 'move':
      case 'walk':
      case 'north':
      case 'n':
      case 'south':
      case 's':
      case 'east':
      case 'e':
      case 'west':
      case 'w':
      case 'up':
      case 'u':
      case 'down':
      case 'd':
        let direction = target;
        
        // Handle single-word direction commands
        if (['north', 'n', 'south', 's', 'east', 'e', 'west', 'w', 'up', 'u', 'down', 'd'].includes(action)) {
          direction = action;
        }
        
        // Normalize direction
        const dirMap = {
          'n': 'north', 'north': 'north',
          's': 'south', 'south': 'south',
          'e': 'east', 'east': 'east',
          'w': 'west', 'west': 'west',
          'u': 'up', 'up': 'up',
          'd': 'down', 'down': 'down'
        };
        
        direction = dirMap[direction] || direction;
        
        if (currentRoom.exits && currentRoom.exits[direction]) {
          const newRoomId = currentRoom.exits[direction];
          const newRoom = rooms.find(r => r.id === newRoomId);
          
          if (newRoom) {
            newState.currentRoom = newRoomId;
            response = `You go ${direction}.\n\n${newRoom.name}\n\n${newRoom.description}`;
            
            const exits = Object.keys(newRoom.exits || {});
            if (exits.length > 0) {
              response += `\n\nExits: ${exits.join(', ')}`;
            }
          } else {
            response = `Error: The room to the ${direction} doesn't exist in the game data.`;
          }
        } else {
          response = `You can't go ${direction} from here.`;
          const exits = Object.keys(currentRoom.exits || {});
          if (exits.length > 0) {
            response += ` Available exits: ${exits.join(', ')}`;
          }
        }
        actionTaken = true;
        break;
        
      case 'take':
      case 'get':
      case 'grab':
      case 'pick':
        if (!target) {
          response = "Take what?";
        } else {
          const itemIndex = currentRoom.items?.findIndex(i => 
            i.toLowerCase().includes(target) || target.includes(i.toLowerCase())
          );
          
          if (itemIndex >= 0) {
            const item = currentRoom.items[itemIndex];
            // Remove from room
            currentRoom.items.splice(itemIndex, 1);
            // Add to inventory
            if (!newState.inventory) newState.inventory = [];
            newState.inventory.push(item);
            
            response = `You take the ${item}.`;
            actionTaken = true;
          } else {
            response = `There's no "${target}" here to take.`;
          }
        }
        break;
        
      case 'drop':
      case 'put':
        if (!target) {
          response = "Drop what?";
        } else {
          const itemIndex = newState.inventory?.findIndex(i => 
            i.toLowerCase().includes(target) || target.includes(i.toLowerCase())
          );
          
          if (itemIndex >= 0) {
            const item = newState.inventory[itemIndex];
            // Remove from inventory
            newState.inventory.splice(itemIndex, 1);
            // Add to room
            if (!currentRoom.items) currentRoom.items = [];
            currentRoom.items.push(item);
            
            response = `You drop the ${item}.`;
            actionTaken = true;
          } else {
            response = `You don't have any "${target}".`;
          }
        }
        break;
        
      case 'inventory':
      case 'inv':
      case 'i':
        if (newState.inventory && newState.inventory.length > 0) {
          response = `You are carrying: ${newState.inventory.join(', ')}`;
        } else {
          response = "You aren't carrying anything.";
        }
        actionTaken = true;
        break;
        
      case 'help':
      case 'h':
      case '?':
        response = `Available commands:
- look/l: Examine your surroundings
- go [direction]: Move in a direction (north/south/east/west/up/down)
- take/get [item]: Pick up an item
- drop [item]: Drop an item
- inventory/i: Check what you're carrying
- talk [npc]: Talk to someone
- use [item]: Use an item
- help: Show this help message`;
        actionTaken = true;
        break;
        
      case 'talk':
      case 'speak':
      case 'say':
        if (!target) {
          response = "Talk to whom?";
        } else {
          const npc = currentRoom.npcs?.find(n => 
            n.name.toLowerCase().includes(target) || target.includes(n.name.toLowerCase())
          );
          
          if (npc) {
            response = `${npc.name} says: "${npc.dialogue || 'I have nothing to say right now.'}"`;
          } else {
            response = `There's no one called "${target}" here.`;
          }
        }
        actionTaken = true;
        break;
        
      case 'use':
        if (!target) {
          response = "Use what?";
        } else {
          const hasItem = newState.inventory?.find(i => 
            i.toLowerCase().includes(target) || target.includes(i.toLowerCase())
          );
          
          if (hasItem) {
            // Check if there's a puzzle that uses this item
            const puzzle = currentRoom.puzzles?.find(p => 
              p.solution?.toLowerCase().includes(target) || 
              p.description?.toLowerCase().includes(target)
            );
            
            if (puzzle) {
              response = `You use the ${hasItem}. ${puzzle.solution || 'It works!'}`;
              newState.score = (newState.score || 0) + 10;
            } else {
              response = `You can't use the ${hasItem} here.`;
            }
          } else {
            response = `You don't have any "${target}".`;
          }
        }
        actionTaken = true;
        break;
        
      default:
        response = `I don't understand "${command}". Type 'help' for a list of commands.`;
        actionTaken = true;
    }
    
    // Save game state if action was taken and worldId exists
    if (actionTaken && worldId) {
      try {
        await db.saveGameState(userId, worldId, newState);
        console.log(`[Command] Game state saved for user ${userId}, world ${worldId}`);
      } catch (saveError) {
        console.error('[Command] Error saving game state:', saveError);
        // Continue anyway - the command was processed
      }
    }
    
    return res.json({
      success: true,
      message: response,
      gameState: newState,
      worldData: worldData // Return potentially modified world data
    });
    
  } catch (error) {
    console.error('[Command] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Command processing failed'
    });
  }
};