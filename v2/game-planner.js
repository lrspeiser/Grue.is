// game-planner.js - AI-driven game world planning system
// The AI plans the entire game structure, story, and progression

const OpenAIApi = require("openai");
const openai = new OpenAIApi(process.env.OPENAI_API_KEY);

/**
 * Phase 1: AI Plans the entire game structure
 * This is where GPT-5 creates the complete game blueprint
 */
async function planGameWorld(userProfile) {
  console.log("[GamePlanner] Starting AI game planning for user:", userProfile.userId);
  
  const planningPrompt = `Design a text adventure game set in ${userProfile.timePeriod} at ${userProfile.storyLocation}.
  Player role: ${userProfile.characterRole}
  
  Create 10-12 locations, 5-8 characters, and 3 main quests. Make it educational and engaging.`;

  const gameDesignTools = [
    {
      type: "function",
      function: {
        name: "create_game_design",
        description: "Creates game design with locations, characters, and quests",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string" },
            setting: { type: "string" },
            main_story: { type: "string" },
            starting_location: { type: "string" },
            locations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  description: { type: "string" },
                  connections: { type: "array", items: { type: "string" } }
                }
              }
            },
            characters: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  location: { type: "string" },
                  role: { type: "string" }
                }
              }
            },
            quests: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  description: { type: "string" },
                  steps: { type: "array", items: { type: "string" } }
                }
              }
            }
          },
          required: ["title", "setting", "main_story", "starting_location", "locations", "characters", "quests"]
        }
      }
    }
  ];

  const messages = [
    {
      role: "system",
      content: planningPrompt
    },
    {
      role: "user",
      content: `Create the game now.`
    }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview", // Using latest available model
      messages,
      tools: gameDesignTools,
      tool_choice: { type: "function", function: { name: "create_game_design" } },
      max_tokens: 4000
    });

    if (!response || !response.choices || !response.choices[0]) {
      console.error("[GamePlanner] Invalid response structure from OpenAI");
      throw new Error("Invalid response from AI service");
    }

    if (response.choices[0].message.tool_calls && response.choices[0].message.tool_calls.length > 0) {
      try {
        const gameDesign = JSON.parse(response.choices[0].message.tool_calls[0].function.arguments);
        console.log("[GamePlanner] AI created game design:", gameDesign.game_overview.title);
        return gameDesign;
      } catch (parseError) {
        console.error("[GamePlanner] Failed to parse game design JSON:", parseError);
        console.error("[GamePlanner] Raw response:", response.choices[0].message.tool_calls[0].function.arguments?.substring(0, 500));
        throw new Error("Failed to parse game design from AI response");
      }
    } else {
      console.error("[GamePlanner] No tool calls in response");
      console.error("[GamePlanner] Response content:", response.choices[0].message.content);
      throw new Error("AI did not generate a proper game design");
    }
  } catch (error) {
    console.error("[GamePlanner] Error planning game:", error.message);
    if (error.response) {
      console.error("[GamePlanner] API error response:", error.response.data);
    }
    throw error;
  }
}

/**
 * Phase 2: Enhance the game design with additional structure
 */
function enhanceGameDesign(gameDesign, userProfile) {
  console.log("[GamePlanner] Enhancing game design...");
  
  // Add structure needed for the game engine
  return {
    game_overview: {
      title: gameDesign.title,
      setting: gameDesign.setting,
      main_story: gameDesign.main_story,
      educational_goals: [`Learn about ${userProfile.timePeriod}`, `Understand ${userProfile.characterRole}`],
      difficulty_curve: "Progressive",
      estimated_playtime: "30-45 minutes"
    },
    world_map: {
      starting_location: gameDesign.starting_location,
      locations: gameDesign.locations.map(loc => ({
        ...loc,
        purpose: "Exploration and story progression",
        required_items: [],
        hidden: false
      })),
      connection_logic: "Direct connections between locations"
    },
    characters: gameDesign.characters.map(char => ({
      ...char,
      personality: "Friendly and helpful",
      knowledge: [`History of ${gameDesign.setting}`],
      quest_giver: false,
      dialogue_themes: ["history", "quests", "items"]
    })),
    quests: gameDesign.quests.map(quest => ({
      ...quest,
      type: "main_story",
      giver: gameDesign.characters[0]?.id || "narrator",
      steps: quest.steps.map((step, idx) => ({
        step_id: `step_${idx}`,
        description: step,
        location: gameDesign.locations[0]?.id || "start",
        required_items: [],
        unlocks: []
      })),
      rewards: ["Experience", "Knowledge"],
      educational_value: `Learn about ${gameDesign.setting}`
    })),
    items: [],
    challenges: [],
    progression: {
      acts: [{
        act_number: 1,
        name: "Beginning",
        description: "Start of the adventure",
        locations_unlocked: gameDesign.locations.map(l => l.id),
        key_events: ["Game start"],
        completion_trigger: "Complete main quest"
      }],
      victory_conditions: ["Complete all quests"],
      failure_conditions: ["None"]
    },
    historical_elements: {
      historical_events: [`Events of ${userProfile.timePeriod}`],
      historical_figures: [userProfile.characterRole],
      cultural_elements: [`Culture of ${userProfile.storyLocation}`],
      educational_notes: ["Historical accuracy maintained throughout"]
    }
  };
}

/**
 * Main function to create a complete game plan
 */
async function createCompletePlan(userProfile) {
  console.log("[GamePlanner] Creating complete game plan for user:", userProfile.userId);
  
  // Step 1: AI plans the entire game
  const gameDesign = await planGameWorld(userProfile);
  
  // Step 2: Enhance the design with additional structure
  const validatedDesign = enhanceGameDesign(gameDesign, userProfile);
  
  // Step 3: Add metadata
  const completePlan = {
    ...validatedDesign,
    metadata: {
      createdAt: new Date().toISOString(),
      userId: userProfile.userId,
      version: "2.0",
      planningModel: "gpt-4-turbo-preview",
      estimatedGenerationTime: calculateGenerationTime(validatedDesign)
    }
  };
  
  console.log("[GamePlanner] Complete game plan created successfully");
  return completePlan;
}

function calculateGenerationTime(gameDesign) {
  // Estimate time based on content volume
  const locationCount = gameDesign.world_map?.locations?.length || 10;
  const characterCount = gameDesign.characters?.length || 5;
  const questCount = gameDesign.quests?.length || 3;
  
  // Rough estimates: 2s per location for images, 1s per character, 0.5s per quest
  const estimatedSeconds = (locationCount * 2) + characterCount + (questCount * 0.5);
  return `${Math.ceil(estimatedSeconds)} seconds`;
}

module.exports = {
  createCompletePlan,
  planGameWorld,
  enhanceGameDesign
};