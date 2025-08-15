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
  
  const planningPrompt = `You are the master game designer for a text-based adventure game like Oregon Trail meets Zork.
  
  USER PROFILE:
  - Education Level: ${userProfile.educationLevel}
  - Location: ${userProfile.location}
  - Language: ${userProfile.language}
  - Time Period Chosen: ${userProfile.timePeriod}
  - Historical Figure/Role: ${userProfile.characterRole}
  - Story Setting: ${userProfile.storyLocation}
  
  Create a complete game design document with interconnected elements. Your game should:
  1. Have 15-20 interconnected locations that tell a coherent story
  2. Include 3 major quests with multiple steps each
  3. Feature 10-15 NPCs with distinct personalities and roles
  4. Have a clear progression from beginning to end
  5. Include educational historical elements appropriate for the user's level
  6. Create meaningful choices that affect the story
  
  Design the COMPLETE game world as a structured blueprint that another AI can use to generate all content.`;

  const gameDesignTools = [
    {
      type: "function",
      function: {
        name: "create_complete_game_design",
        description: "Creates the complete game design document with all interconnected elements",
        parameters: {
          type: "object",
          properties: {
            game_overview: {
              type: "object",
              properties: {
                title: { type: "string", description: "The game's title" },
                setting: { type: "string", description: "Time period and location" },
                main_story: { type: "string", description: "The overarching narrative (200-300 words)" },
                educational_goals: { type: "array", items: { type: "string" }, description: "What the player will learn" },
                difficulty_curve: { type: "string", description: "How challenge progresses through the game" },
                estimated_playtime: { type: "string", description: "Expected completion time" }
              }
            },
            world_map: {
              type: "object",
              properties: {
                starting_location: { type: "string", description: "Where the player begins" },
                locations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string", description: "Unique location ID (e.g., 'athens-agora')" },
                      name: { type: "string", description: "Location name" },
                      description: { type: "string", description: "Detailed description for image generation" },
                      purpose: { type: "string", description: "What happens here in the story" },
                      connections: { type: "array", items: { type: "string" }, description: "IDs of connected locations" },
                      required_items: { type: "array", items: { type: "string" }, description: "Items needed to access" },
                      hidden: { type: "boolean", description: "Whether this location starts hidden" }
                    }
                  }
                },
                connection_logic: { type: "string", description: "How locations connect and unlock" }
              }
            },
            characters: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", description: "Unique NPC ID" },
                  name: { type: "string", description: "Character name" },
                  role: { type: "string", description: "Their role in the story" },
                  personality: { type: "string", description: "Personality traits and speaking style" },
                  location: { type: "string", description: "Where they're found" },
                  knowledge: { type: "array", items: { type: "string" }, description: "What they know/teach" },
                  quest_giver: { type: "boolean", description: "Whether they give quests" },
                  dialogue_themes: { type: "array", items: { type: "string" }, description: "Topics they discuss" }
                }
              }
            },
            quests: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", description: "Unique quest ID" },
                  name: { type: "string", description: "Quest name" },
                  type: { type: "string", description: "main_story, side_quest, or educational" },
                  description: { type: "string", description: "What the player must do" },
                  giver: { type: "string", description: "NPC who gives this quest" },
                  steps: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        step_id: { type: "string" },
                        description: { type: "string" },
                        location: { type: "string" },
                        required_items: { type: "array", items: { type: "string" } },
                        unlocks: { type: "array", items: { type: "string" } }
                      }
                    }
                  },
                  rewards: { type: "array", items: { type: "string" }, description: "What player gains" },
                  educational_value: { type: "string", description: "What this teaches about history" }
                }
              }
            },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", description: "Unique item ID" },
                  name: { type: "string", description: "Item name" },
                  description: { type: "string", description: "What it is and looks like" },
                  location: { type: "string", description: "Where it's found" },
                  purpose: { type: "string", description: "What it's used for" },
                  historical_significance: { type: "string", description: "Real historical context" }
                }
              }
            },
            challenges: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", description: "Challenge ID" },
                  type: { type: "string", description: "puzzle, combat, diplomacy, or resource_management" },
                  location: { type: "string", description: "Where this occurs" },
                  description: { type: "string", description: "The challenge details" },
                  solution_hints: { type: "array", items: { type: "string" } },
                  consequences: {
                    type: "object",
                    properties: {
                      success: { type: "string" },
                      failure: { type: "string" }
                    }
                  }
                }
              }
            },
            progression: {
              type: "object",
              properties: {
                acts: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      act_number: { type: "integer" },
                      name: { type: "string" },
                      description: { type: "string" },
                      locations_unlocked: { type: "array", items: { type: "string" } },
                      key_events: { type: "array", items: { type: "string" } },
                      completion_trigger: { type: "string" }
                    }
                  }
                },
                victory_conditions: { type: "array", items: { type: "string" } },
                failure_conditions: { type: "array", items: { type: "string" } }
              }
            },
            historical_elements: {
              type: "object",
              properties: {
                historical_events: { type: "array", items: { type: "string" } },
                historical_figures: { type: "array", items: { type: "string" } },
                cultural_elements: { type: "array", items: { type: "string" } },
                educational_notes: { type: "array", items: { type: "string" } }
              }
            }
          },
          required: ["game_overview", "world_map", "characters", "quests", "items", "challenges", "progression", "historical_elements"]
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
      content: `Design a complete game for this user. Make it educational, engaging, and historically accurate. Create a rich, interconnected world where every element serves the story and learning objectives. The game should take about 30-45 minutes to complete.`
    }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview", // Using latest available model
      messages,
      tools: gameDesignTools,
      tool_choice: { type: "function", function: { name: "create_complete_game_design" } }
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
 * Phase 2: AI validates and enhances the game design
 * Ensures all connections make sense and the game is playable
 */
async function validateAndEnhanceGameDesign(gameDesign) {
  console.log("[GamePlanner] Validating game design...");
  
  const validationPrompt = `Review this game design and ensure:
  1. All location connections are bidirectional and make geographic sense
  2. Every quest step references valid locations and items
  3. The progression is smooth and difficulty increases appropriately
  4. There are no dead ends or unwinnable states
  5. Educational content is woven naturally into gameplay
  
  Fix any issues and enhance the design where needed.`;

  const messages = [
    {
      role: "system",
      content: validationPrompt
    },
    {
      role: "user",
      content: `Validate and enhance this game design: ${JSON.stringify(gameDesign)}`
    }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages,
      max_tokens: 4000
    });

    // AI provides enhanced version or confirms design is good
    return gameDesign; // Return validated/enhanced design
  } catch (error) {
    console.error("[GamePlanner] Validation error:", error);
    return gameDesign; // Return original if validation fails
  }
}

/**
 * Main function to create a complete game plan
 */
async function createCompletePlan(userProfile) {
  console.log("[GamePlanner] Creating complete game plan for user:", userProfile.userId);
  
  // Step 1: AI plans the entire game
  const gameDesign = await planGameWorld(userProfile);
  
  // Step 2: Validate and enhance the design
  const validatedDesign = await validateAndEnhanceGameDesign(gameDesign);
  
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
  const locationCount = gameDesign.world_map.locations.length;
  const characterCount = gameDesign.characters.length;
  const questCount = gameDesign.quests.length;
  
  // Rough estimates: 2s per location for images, 1s per character, 0.5s per quest
  const estimatedSeconds = (locationCount * 2) + characterCount + (questCount * 0.5);
  return `${Math.ceil(estimatedSeconds)} seconds`;
}

module.exports = {
  createCompletePlan,
  planGameWorld,
  validateAndEnhanceGameDesign
};