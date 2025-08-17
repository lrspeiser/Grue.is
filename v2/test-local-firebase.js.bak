// test-local.js - Test the AI game generation locally
require('dotenv').config({ path: '../.env' }); // Load environment variables from parent directory

const { createCompletePlan } = require('./game-planner');
const { generateCompleteWorld } = require('./world-generator');
const GameEngine = require('./game-engine');

async function testGameGeneration() {
  console.log("=== Testing AI Game Generation System ===\n");
  
  // Test user profile
  const testProfile = {
    userId: "test-user-001",
    educationLevel: "7th grade",
    location: "California, USA",
    language: "English",
    timePeriod: "Ancient Greece - 480 BC",
    characterRole: "Advisor to Leonidas during the Battle of Thermopylae",
    storyLocation: "Greece"
  };
  
  try {
    // Step 1: Test game planning
    console.log("Step 1: Testing AI Game Planning...");
    console.log("Profile:", testProfile);
    console.log("\nAsking AI to plan the game...\n");
    
    const gamePlan = await createCompletePlan(testProfile);
    
    console.log("✅ Game Plan Created!");
    console.log("Title:", gamePlan.game_overview.title);
    console.log("Setting:", gamePlan.game_overview.setting);
    console.log("Main Story:", gamePlan.game_overview.main_story.substring(0, 200) + "...");
    console.log("\nWorld Statistics:");
    console.log("- Locations:", gamePlan.world_map.locations.length);
    console.log("- Characters:", gamePlan.characters.length);
    console.log("- Quests:", gamePlan.quests.length);
    console.log("- Items:", gamePlan.items.length);
    console.log("- Challenges:", gamePlan.challenges.length);
    
    // Save plan to file for inspection
    const fs = require('fs').promises;
    await fs.writeFile('test-game-plan.json', JSON.stringify(gamePlan, null, 2));
    console.log("\n📝 Full game plan saved to test-game-plan.json");
    
    // Step 2: Test world generation (optional - this will take longer and cost more)
    console.log("\n" + "=".repeat(50));
    console.log("Step 2: Testing World Generation");
    console.log("WARNING: This will generate all content and images (costs money!)");
    console.log("Skip this step if you just want to test the planning phase.");
    console.log("Press Ctrl+C to stop, or wait 5 seconds to continue...");
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log("\nGenerating complete world content...");
    const world = await generateCompleteWorld(gamePlan);
    
    console.log("✅ World Generated!");
    console.log("- Rooms with content:", world.world.rooms.length);
    console.log("- Characters with dialogue:", world.world.characters.length);
    console.log("- Quests with objectives:", world.world.quests.length);
    console.log("- Images generated:", world.world.rooms.filter(r => r.imageUrl).length);
    
    await fs.writeFile('test-game-world.json', JSON.stringify(world, null, 2));
    console.log("\n📝 Full world saved to test-game-world.json");
    
    // Step 3: Test game engine
    console.log("\n" + "=".repeat(50));
    console.log("Step 3: Testing Game Engine");
    
    const engine = new GameEngine(world, testProfile.userId);
    console.log("\n✅ Game Engine initialized!");
    console.log("Starting room:", engine.getCurrentRoomData().name);
    console.log("Initial state:", engine.getPublicState());
    
    // Test a simple command
    console.log("\n" + "=".repeat(50));
    console.log("Step 4: Testing gameplay with a simple command");
    console.log("User input: 'look around'");
    
    const result = await engine.processUserInput("look around");
    console.log("\nAI Response:");
    console.log(result.narrative);
    
    if (result.educationalNote) {
      console.log("\nEducational Note:");
      console.log(result.educationalNote);
    }
    
    console.log("\n" + "=".repeat(50));
    console.log("✅ All tests completed successfully!");
    console.log("\nThe AI game generation system is working correctly.");
    console.log("You can now run 'npm start' to start the server on port 3001.");
    
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    console.error("\nMake sure you have:");
    console.error("1. Set OPENAI_API_KEY in your .env file");
    console.error("2. Set Firebase credentials (GOOGLE_SERVICE_ACCOUNT, etc.)");
    console.error("3. Installed dependencies with 'npm install'");
  }
}

// Run the test
testGameGeneration().catch(console.error);