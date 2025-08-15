// world-generator.js - Takes the AI's game plan and generates all content
// This handles the actual content creation based on the AI's blueprint

const OpenAIApi = require("openai");
const openai = new OpenAIApi(process.env.OPENAI_API_KEY);

/**
 * Generate all room descriptions and narratives in a single AI call
 */
async function generateAllRoomContent(gamePlan) {
  console.log("[WorldGen] Generating content for", gamePlan.world_map.locations.length, "rooms");
  
  const roomGenerationPrompt = `You are creating rich, immersive descriptions for a text adventure game.
  
  GAME CONTEXT:
  Title: ${gamePlan.game_overview.title}
  Setting: ${gamePlan.game_overview.setting}
  Story: ${gamePlan.game_overview.main_story}
  
  Generate detailed, atmospheric descriptions for each location that:
  1. Paint a vivid picture for DALL-E image generation
  2. Include sensory details (sights, sounds, smells)
  3. Hint at available actions and directions
  4. Reflect the historical period accurately
  5. Support the educational goals
  
  Make each location feel unique and important to the story.`;

  const roomTools = [
    {
      type: "function",
      function: {
        name: "generate_all_rooms",
        description: "Generate complete content for all game rooms",
        parameters: {
          type: "object",
          properties: {
            rooms: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", description: "Room ID from game plan" },
                  name: { type: "string", description: "Location name" },
                  description: { type: "string", description: "Rich narrative description (2-3 paragraphs)" },
                  first_visit_text: { type: "string", description: "Special text shown on first visit" },
                  image_prompt: { type: "string", description: "Detailed DALL-E prompt for this location" },
                  ambient_details: { type: "array", items: { type: "string" }, description: "Random atmospheric details" },
                  examine_responses: {
                    type: "object",
                    description: "Responses when player examines things",
                    additionalProperties: { type: "string" }
                  },
                  available_actions: { type: "array", items: { type: "string" }, description: "What player can do here" },
                  exit_descriptions: {
                    type: "object",
                    description: "How each exit is described",
                    additionalProperties: { type: "string" }
                  }
                }
              }
            }
          },
          required: ["rooms"]
        }
      }
    }
  ];

  const messages = [
    { role: "system", content: roomGenerationPrompt },
    { 
      role: "user", 
      content: `Generate complete content for these rooms: ${JSON.stringify(gamePlan.world_map.locations.map(l => ({
        id: l.id,
        name: l.name,
        purpose: l.purpose,
        connections: l.connections
      })))}`
    }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages,
      tools: roomTools,
      tool_choice: { type: "function", function: { name: "generate_all_rooms" } }
    });

    if (response.choices[0].message.tool_calls) {
      const roomContent = JSON.parse(response.choices[0].message.tool_calls[0].function.arguments);
      return roomContent.rooms;
    }
  } catch (error) {
    console.error("[WorldGen] Error generating room content:", error);
    throw error;
  }
}

/**
 * Generate all character dialogues and personalities
 */
async function generateAllCharacters(gamePlan) {
  console.log("[WorldGen] Generating", gamePlan.characters.length, "characters");
  
  const characterPrompt = `Create rich, memorable characters for this historical adventure.
  
  GAME SETTING: ${gamePlan.game_overview.setting}
  
  For each character, create:
  1. Authentic historical dialogue in the user's language
  2. Distinct personality and speech patterns
  3. Knowledge appropriate to their role
  4. Dynamic responses based on quest progress
  5. Educational information woven into conversation`;

  const characterTools = [
    {
      type: "function", 
      function: {
        name: "generate_all_characters",
        description: "Generate complete character content",
        parameters: {
          type: "object",
          properties: {
            characters: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  title: { type: "string", description: "Their role/title" },
                  appearance: { type: "string", description: "Physical description" },
                  personality: { type: "string", description: "Personality traits" },
                  speaking_style: { type: "string", description: "How they talk" },
                  greeting: { type: "string", description: "Initial greeting" },
                  dialogue_trees: {
                    type: "object",
                    properties: {
                      default: { type: "array", items: { type: "string" } },
                      quest_related: { type: "array", items: { type: "string" } },
                      educational: { type: "array", items: { type: "string" } },
                      farewell: { type: "array", items: { type: "string" } }
                    }
                  },
                  knowledge_base: { type: "array", items: { type: "string" } },
                  quest_dialogue: {
                    type: "object",
                    additionalProperties: { type: "string" }
                  }
                }
              }
            }
          }
        }
      }
    }
  ];

  const messages = [
    { role: "system", content: characterPrompt },
    { 
      role: "user", 
      content: `Create these characters: ${JSON.stringify(gamePlan.characters)}`
    }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages,
      tools: characterTools,
      tool_choice: { type: "function", function: { name: "generate_all_characters" } }
    });

    if (response.choices[0].message.tool_calls) {
      const characters = JSON.parse(response.choices[0].message.tool_calls[0].function.arguments);
      return characters.characters;
    }
  } catch (error) {
    console.error("[WorldGen] Error generating characters:", error);
    throw error;
  }
}

/**
 * Generate detailed quest content and branching paths
 */
async function generateQuestContent(gamePlan) {
  console.log("[WorldGen] Generating quest content");
  
  const questPrompt = `Create engaging quests that teach history through gameplay.
  
  Each quest should:
  1. Have clear objectives and multiple solution paths
  2. Include historical puzzles and challenges
  3. Teach real historical facts naturally
  4. Provide hints without breaking immersion
  5. Reward exploration and critical thinking`;

  const questTools = [
    {
      type: "function",
      function: {
        name: "generate_quest_content",
        description: "Generate detailed quest content",
        parameters: {
          type: "object",
          properties: {
            quests: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  introduction_text: { type: "string" },
                  objectives: { type: "array", items: { type: "string" } },
                  hints: { type: "array", items: { type: "string" } },
                  completion_text: { type: "string" },
                  failure_text: { type: "string" },
                  educational_content: { type: "string" },
                  item_interactions: {
                    type: "object",
                    additionalProperties: { type: "string" }
                  },
                  branching_choices: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        choice_text: { type: "string" },
                        consequence: { type: "string" },
                        outcome: { type: "string" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  ];

  const messages = [
    { role: "system", content: questPrompt },
    { role: "user", content: `Create content for these quests: ${JSON.stringify(gamePlan.quests)}` }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages,
      tools: questTools,
      tool_choice: { type: "function", function: { name: "generate_quest_content" } }
    });

    if (response.choices[0].message.tool_calls) {
      const quests = JSON.parse(response.choices[0].message.tool_calls[0].function.arguments);
      return quests.quests;
    }
  } catch (error) {
    console.error("[WorldGen] Error generating quests:", error);
    throw error;
  }
}

/**
 * Batch generate all images for the game world
 */
async function generateAllImages(rooms) {
  console.log("[WorldGen] Generating images for", rooms.length, "rooms");
  
  const imagePromises = [];
  const BATCH_SIZE = 3; // Respect rate limits
  
  for (let i = 0; i < rooms.length; i += BATCH_SIZE) {
    const batch = rooms.slice(i, i + BATCH_SIZE);
    
    const batchPromises = batch.map(async (room) => {
      try {
        const imageParams = {
          model: "dall-e-3",
          prompt: `${room.image_prompt}. Style: Classic 1980s computer game pixel art like Oregon Trail or King's Quest. 
                   No text or UI elements. Historical period accuracy is important.`,
          n: 1,
          size: "1024x1024",
          quality: "standard",
          style: "natural",
          response_format: "url" // Get URL directly for faster response
        };
        
        const response = await openai.images.generate(imageParams);
        
        return {
          roomId: room.id,
          imageUrl: response.data[0].url
        };
      } catch (error) {
        console.error(`[WorldGen] Failed to generate image for room ${room.id}:`, error);
        return {
          roomId: room.id,
          imageUrl: null
        };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    imagePromises.push(...batchResults);
    
    // Rate limit compliance
    if (i + BATCH_SIZE < rooms.length) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay between batches
    }
  }
  
  return imagePromises;
}

/**
 * Main function to generate the complete game world
 */
async function generateCompleteWorld(gamePlan) {
  console.log("[WorldGen] Starting world generation from game plan");
  
  const startTime = Date.now();
  
  try {
    // Generate all content in parallel where possible
    const [rooms, characters, quests] = await Promise.all([
      generateAllRoomContent(gamePlan),
      generateAllCharacters(gamePlan),
      generateQuestContent(gamePlan)
    ]);
    
    console.log("[WorldGen] Content generation complete, generating images...");
    
    // Generate images (must be sequential due to rate limits)
    const images = await generateAllImages(rooms);
    
    // Combine everything into a complete world
    const completeWorld = {
      metadata: {
        ...gamePlan.metadata,
        generatedAt: new Date().toISOString(),
        generationTime: `${(Date.now() - startTime) / 1000} seconds`
      },
      overview: gamePlan.game_overview,
      progression: gamePlan.progression,
      historical: gamePlan.historical_elements,
      world: {
        rooms: rooms.map(room => {
          const imageData = images.find(img => img.roomId === room.id);
          const planData = gamePlan.world_map.locations.find(loc => loc.id === room.id);
          
          return {
            ...room,
            ...planData,
            imageUrl: imageData?.imageUrl || null
          };
        }),
        characters: characters.map(char => {
          const planData = gamePlan.characters.find(c => c.id === char.id);
          return {
            ...char,
            ...planData
          };
        }),
        quests: quests.map(quest => {
          const planData = gamePlan.quests.find(q => q.id === quest.id);
          return {
            ...quest,
            ...planData
          };
        }),
        items: gamePlan.items,
        challenges: gamePlan.challenges
      },
      // Pre-computed room connections for fast navigation
      navigation: buildNavigationMap(gamePlan.world_map.locations)
    };
    
    console.log(`[WorldGen] World generation complete in ${(Date.now() - startTime) / 1000} seconds`);
    return completeWorld;
    
  } catch (error) {
    console.error("[WorldGen] Failed to generate world:", error);
    throw error;
  }
}

/**
 * Build a navigation map for quick room transitions
 */
function buildNavigationMap(locations) {
  const navMap = {};
  
  locations.forEach(loc => {
    navMap[loc.id] = {
      north: loc.connections.find(c => c.includes('north'))?.replace('north-', ''),
      south: loc.connections.find(c => c.includes('south'))?.replace('south-', ''),
      east: loc.connections.find(c => c.includes('east'))?.replace('east-', ''),
      west: loc.connections.find(c => c.includes('west'))?.replace('west-', ''),
      up: loc.connections.find(c => c.includes('up'))?.replace('up-', ''),
      down: loc.connections.find(c => c.includes('down'))?.replace('down-', ''),
      special: loc.connections.filter(c => !['north','south','east','west','up','down'].some(dir => c.includes(dir)))
    };
  });
  
  return navMap;
}

module.exports = {
  generateCompleteWorld,
  generateAllRoomContent,
  generateAllCharacters,
  generateQuestContent,
  generateAllImages
};