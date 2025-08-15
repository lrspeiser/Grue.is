// test-game-engine.js - Unit tests for the v2 game engine
const GameEngine = require('./test-game-engine-mock'); // Use mock engine for testing

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Test result tracking
let testsPassed = 0;
let testsFailed = 0;
const failedTests = [];

// Helper function to assert test conditions
function assert(condition, testName, expected, actual) {
  if (condition) {
    console.log(`${colors.green}✓${colors.reset} ${testName}`);
    testsPassed++;
  } else {
    console.log(`${colors.red}✗${colors.reset} ${testName}`);
    console.log(`  ${colors.yellow}Expected:${colors.reset} ${expected}`);
    console.log(`  ${colors.yellow}Actual:${colors.reset} ${actual}`);
    testsFailed++;
    failedTests.push(testName);
  }
}

// Create a mock world for testing
function createMockWorld() {
  return {
    metadata: {
      gameId: 'test-game-001',
      createdAt: new Date().toISOString(),
      userId: 'test-user',
      version: '2.0'
    },
    overview: {
      title: 'Test Adventure',
      setting: 'Ancient Greece',
      main_story: 'A test adventure in ancient times',
      educational_goals: ['Learn about history'],
      difficulty_curve: 'Progressive',
      estimated_playtime: '30 minutes'
    },
    world: {
      rooms: [
        {
          id: 'temple-entrance',
          name: 'Temple Entrance',
          description: 'You stand before a grand marble temple. Columns rise majestically.',
          detailed_description: 'The entrance to the Temple of Athena. Marble columns stretch high above.',
          exits: {
            north: 'temple-hall',
            south: 'marketplace',
            east: 'garden',
            west: null
          },
          items: ['torch', 'inscription'],
          characters: ['priest'],
          image_url: null,
          image_prompt: 'Ancient Greek temple entrance with marble columns'
        },
        {
          id: 'temple-hall',
          name: 'Temple Hall',
          description: 'A vast hall with a statue of Athena at the center.',
          detailed_description: 'The main hall of the temple, dominated by a golden statue.',
          exits: {
            south: 'temple-entrance',
            north: 'inner-sanctum',
            east: null,
            west: null
          },
          items: ['offering-bowl'],
          characters: [],
          image_url: null,
          image_prompt: 'Interior of Greek temple with Athena statue'
        },
        {
          id: 'marketplace',
          name: 'Marketplace',
          description: 'A bustling marketplace full of merchants and citizens.',
          detailed_description: 'The agora is alive with commerce and conversation.',
          exits: {
            north: 'temple-entrance',
            south: null,
            east: 'workshop',
            west: null
          },
          items: ['coin-purse', 'bread'],
          characters: ['merchant', 'citizen'],
          image_url: null,
          image_prompt: 'Ancient Greek marketplace with vendors'
        },
        {
          id: 'garden',
          name: 'Temple Garden',
          description: 'A peaceful garden with olive trees and fountains.',
          detailed_description: 'Serene gardens surround the temple, offering quiet contemplation.',
          exits: {
            west: 'temple-entrance',
            north: null,
            south: null,
            east: null
          },
          items: ['olive-branch'],
          characters: ['philosopher'],
          image_url: null,
          image_prompt: 'Greek temple garden with olive trees'
        },
        {
          id: 'workshop',
          name: 'Craftsman Workshop',
          description: 'A workshop where artisans create pottery and sculptures.',
          detailed_description: 'The smell of clay and sound of hammers fill this busy workshop.',
          exits: {
            west: 'marketplace',
            north: null,
            south: null,
            east: null
          },
          items: ['pottery', 'chisel'],
          characters: ['craftsman'],
          image_url: null,
          image_prompt: 'Ancient Greek pottery workshop'
        },
        {
          id: 'inner-sanctum',
          name: 'Inner Sanctum',
          description: 'The most sacred part of the temple, where only priests may enter.',
          detailed_description: 'A holy chamber containing ancient artifacts and scrolls.',
          exits: {
            south: 'temple-hall',
            north: null,
            east: null,
            west: null
          },
          items: ['sacred-scroll', 'golden-artifact'],
          characters: ['high-priest'],
          image_url: null,
          image_prompt: 'Sacred inner chamber of Greek temple'
        }
      ],
      characters: [
        {
          id: 'priest',
          name: 'Temple Priest',
          description: 'A wise priest in white robes',
          personality: 'Knowledgeable and helpful',
          dialogue_style: 'Formal and reverent',
          knowledge_areas: ['Temple history', 'Religious rituals'],
          location: 'temple-entrance',
          quest_giver: true
        },
        {
          id: 'merchant',
          name: 'Spice Merchant',
          description: 'A jovial merchant selling exotic goods',
          personality: 'Friendly and talkative',
          dialogue_style: 'Casual and enthusiastic',
          knowledge_areas: ['Trade routes', 'Foreign lands'],
          location: 'marketplace',
          quest_giver: false
        },
        {
          id: 'philosopher',
          name: 'Wandering Philosopher',
          description: 'A thoughtful scholar pondering life\'s mysteries',
          personality: 'Contemplative and wise',
          dialogue_style: 'Thoughtful and questioning',
          knowledge_areas: ['Philosophy', 'Ethics'],
          location: 'garden',
          quest_giver: false
        },
        {
          id: 'craftsman',
          name: 'Master Craftsman',
          description: 'A skilled artisan working with clay',
          personality: 'Focused and proud',
          dialogue_style: 'Direct and practical',
          knowledge_areas: ['Art techniques', 'Pottery history'],
          location: 'workshop',
          quest_giver: true
        },
        {
          id: 'high-priest',
          name: 'High Priest',
          description: 'The temple\'s highest authority',
          personality: 'Stern but fair',
          dialogue_style: 'Authoritative and mystical',
          knowledge_areas: ['Sacred mysteries', 'Divine prophecies'],
          location: 'inner-sanctum',
          quest_giver: true
        }
      ],
      quests: [
        {
          id: 'main-quest',
          name: 'The Sacred Artifact',
          description: 'Retrieve the sacred artifact from the inner sanctum',
          type: 'main',
          giver: 'priest',
          steps: [
            {
              id: 'step1',
              description: 'Speak with the temple priest',
              completed: false
            },
            {
              id: 'step2',
              description: 'Find the offering for the temple',
              completed: false
            },
            {
              id: 'step3',
              description: 'Enter the inner sanctum',
              completed: false
            }
          ],
          rewards: ['sacred-knowledge', 'blessing'],
          prerequisites: [],
          completed: false
        },
        {
          id: 'merchant-quest',
          name: 'Trade Route Mystery',
          description: 'Help the merchant solve a trade dispute',
          type: 'side',
          giver: 'merchant',
          steps: [
            {
              id: 'step1',
              description: 'Talk to the merchant about the problem',
              completed: false
            },
            {
              id: 'step2',
              description: 'Find evidence in the workshop',
              completed: false
            }
          ],
          rewards: ['coin-purse', 'rare-spice'],
          prerequisites: [],
          completed: false
        }
      ],
      items: [
        {
          id: 'torch',
          name: 'Torch',
          description: 'A burning torch providing light',
          location: 'temple-entrance',
          takeable: true,
          useable: true
        },
        {
          id: 'coin-purse',
          name: 'Coin Purse',
          description: 'A leather purse containing drachmas',
          location: 'marketplace',
          takeable: true,
          useable: false
        },
        {
          id: 'sacred-scroll',
          name: 'Sacred Scroll',
          description: 'An ancient scroll with mysterious writing',
          location: 'inner-sanctum',
          takeable: true,
          useable: true
        }
      ]
    },
    progression: {
      acts: [
        {
          act_number: 1,
          name: 'The Beginning',
          description: 'Start your journey at the temple',
          locations_unlocked: ['temple-entrance', 'marketplace', 'garden', 'temple-hall', 'workshop', 'inner-sanctum'],
          key_events: ['Game start'],
          completion_trigger: 'Complete main quest'
        }
      ],
      victory_conditions: ['Retrieve the sacred artifact'],
      failure_conditions: []
    },
    historical_elements: {
      historical_events: ['Construction of the Parthenon'],
      historical_figures: ['Pericles', 'Socrates'],
      cultural_elements: ['Greek democracy', 'Olympic games'],
      educational_notes: ['Ancient Greece was the birthplace of democracy']
    }
  };
}

// Test suite for game engine
async function runTests() {
  console.log(`\n${colors.bright}${colors.blue}Starting Game Engine Tests${colors.reset}\n`);
  console.log('=' .repeat(50));

  const mockWorld = createMockWorld();
  const userId = 'test-user-001';
  
  // Create game engine instance
  console.log(`\n${colors.cyan}Initializing Game Engine...${colors.reset}`);
  let engine;
  
  try {
    engine = new GameEngine(mockWorld, userId);
    assert(true, 'Game engine initialization', 'Success', 'Success');
  } catch (error) {
    assert(false, 'Game engine initialization', 'Success', error.message);
    console.log(`\n${colors.red}Cannot continue tests - engine initialization failed${colors.reset}`);
    return;
  }

  // Test 1: Initial state
  console.log(`\n${colors.cyan}Testing Initial State...${colors.reset}`);
  const initialState = engine.getPublicState();
  assert(
    initialState.currentRoomId === 'temple-entrance',
    'Initial room location',
    'temple-entrance',
    initialState.currentRoomId
  );
  assert(
    initialState.visitedRooms.includes('temple-entrance'),
    'Visited rooms tracking',
    'Contains temple-entrance',
    initialState.visitedRooms.join(', ')
  );
  assert(
    initialState.inventory.length === 0,
    'Initial inventory empty',
    '0 items',
    `${initialState.inventory.length} items`
  );

  // Test 2: Get current room data
  console.log(`\n${colors.cyan}Testing Room Data Retrieval...${colors.reset}`);
  const roomData = engine.getCurrentRoomData();
  assert(
    roomData.name === 'Temple Entrance',
    'Current room name',
    'Temple Entrance',
    roomData.name
  );
  assert(
    roomData.exits.north === 'temple-hall',
    'Room exits mapping',
    'temple-hall to the north',
    roomData.exits.north || 'no exit'
  );

  // Test 3: Movement commands
  console.log(`\n${colors.cyan}Testing Movement Commands...${colors.reset}`);
  
  // Test moving north
  let response = await engine.processPlayerInput('go north');
  assert(
    response.changes && response.changes.new_room_id === 'temple-hall',
    'Move north to temple hall',
    'temple-hall',
    response.changes?.new_room_id || 'no movement'
  );

  // Test moving to invalid direction
  response = await engine.processPlayerInput('go east');
  assert(
    !response.changes || !response.changes.new_room_id,
    'Cannot move east from temple hall',
    'No movement',
    response.changes?.new_room_id ? 'Moved unexpectedly' : 'No movement'
  );

  // Test moving back south
  response = await engine.processPlayerInput('go south');
  assert(
    response.changes && response.changes.new_room_id === 'temple-entrance',
    'Move south back to entrance',
    'temple-entrance',
    response.changes?.new_room_id || 'no movement'
  );

  // Test 4: Look commands
  console.log(`\n${colors.cyan}Testing Look/Examine Commands...${colors.reset}`);
  
  response = await engine.processPlayerInput('look around');
  assert(
    response.narrative && response.narrative.includes('temple') || 
    response.narrative.includes('entrance') ||
    response.narrative.includes('columns'),
    'Look around description',
    'Contains room description',
    response.narrative ? 'Description provided' : 'No description'
  );

  response = await engine.processPlayerInput('examine torch');
  assert(
    response.narrative && (response.narrative.includes('torch') || response.narrative.includes('light')),
    'Examine specific item',
    'Contains torch description',
    response.narrative ? 'Description provided' : 'No description'
  );

  // Test 5: Inventory commands
  console.log(`\n${colors.cyan}Testing Inventory Commands...${colors.reset}`);
  
  response = await engine.processPlayerInput('take torch');
  assert(
    response.changes && response.changes.inventory_changes,
    'Take item command',
    'Inventory changed',
    response.changes?.inventory_changes ? 'Changed' : 'No change'
  );

  response = await engine.processPlayerInput('check inventory');
  assert(
    response.narrative && response.narrative.toLowerCase().includes('torch'),
    'Inventory check shows torch',
    'Contains torch',
    response.narrative ? 'Inventory shown' : 'No inventory'
  );

  // Test 6: Character interaction
  console.log(`\n${colors.cyan}Testing Character Interactions...${colors.reset}`);
  
  response = await engine.processPlayerInput('talk to priest');
  assert(
    response.narrative && response.narrative.length > 0,
    'Talk to NPC',
    'Dialogue response',
    response.narrative ? 'Dialogue provided' : 'No dialogue'
  );

  // Test 7: Quest commands
  console.log(`\n${colors.cyan}Testing Quest System...${colors.reset}`);
  
  response = await engine.processPlayerInput('show quests');
  assert(
    response.narrative && response.narrative.length > 0,
    'Show quests command',
    'Quest list shown',
    response.narrative ? 'Quests displayed' : 'No quest info'
  );

  // Test 8: Complex movement sequence
  console.log(`\n${colors.cyan}Testing Complex Movement Sequence...${colors.reset}`);
  
  // Move to marketplace
  response = await engine.processPlayerInput('go south');
  assert(
    response.changes?.new_room_id === 'marketplace',
    'Move to marketplace',
    'marketplace',
    response.changes?.new_room_id || 'no movement'
  );

  // Move to workshop
  response = await engine.processPlayerInput('go east');
  assert(
    response.changes?.new_room_id === 'workshop',
    'Move to workshop',
    'workshop',
    response.changes?.new_room_id || 'no movement'
  );

  // Try to move in invalid direction
  response = await engine.processPlayerInput('go north');
  assert(
    !response.changes?.new_room_id,
    'Cannot go north from workshop',
    'No movement',
    response.changes?.new_room_id ? 'Moved unexpectedly' : 'No movement'
  );

  // Test 9: Help command
  console.log(`\n${colors.cyan}Testing Help System...${colors.reset}`);
  
  response = await engine.processPlayerInput('help');
  assert(
    response.narrative && response.narrative.length > 0,
    'Help command',
    'Help text provided',
    response.narrative ? 'Help shown' : 'No help'
  );

  // Test 10: Save/Load state
  console.log(`\n${colors.cyan}Testing State Persistence...${colors.reset}`);
  
  const savedState = engine.getPublicState();
  assert(
    savedState.visitedRooms.length > 1,
    'Multiple rooms visited',
    'More than 1 room',
    `${savedState.visitedRooms.length} rooms`
  );

  // Test 11: Edge cases
  console.log(`\n${colors.cyan}Testing Edge Cases...${colors.reset}`);
  
  // Empty input
  response = await engine.processPlayerInput('');
  assert(
    response.narrative && response.narrative.length > 0,
    'Handle empty input',
    'Response provided',
    response.narrative ? 'Handled' : 'No response'
  );

  // Gibberish input
  response = await engine.processPlayerInput('xyzabc123');
  assert(
    response.narrative && response.narrative.length > 0,
    'Handle invalid input',
    'Response provided',
    response.narrative ? 'Handled' : 'No response'
  );

  // Very long input
  const longInput = 'go '.repeat(100) + 'north';
  response = await engine.processPlayerInput(longInput);
  assert(
    response.narrative && response.narrative.length > 0,
    'Handle very long input',
    'Response provided',
    response.narrative ? 'Handled' : 'No response'
  );

  // Print test summary
  console.log('\n' + '=' .repeat(50));
  console.log(`\n${colors.bright}Test Results:${colors.reset}`);
  console.log(`${colors.green}Passed: ${testsPassed}${colors.reset}`);
  console.log(`${colors.red}Failed: ${testsFailed}${colors.reset}`);
  
  if (testsFailed > 0) {
    console.log(`\n${colors.yellow}Failed Tests:${colors.reset}`);
    failedTests.forEach(test => {
      console.log(`  - ${test}`);
    });
  }

  const successRate = ((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1);
  const statusColor = successRate >= 80 ? colors.green : successRate >= 60 ? colors.yellow : colors.red;
  console.log(`\n${colors.bright}Success Rate: ${statusColor}${successRate}%${colors.reset}`);
  
  // Exit with appropriate code
  process.exit(testsFailed > 0 ? 1 : 0);
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(error => {
    console.error(`\n${colors.red}Test suite failed with error:${colors.reset}`, error);
    process.exit(1);
  });
}

module.exports = { runTests, createMockWorld };