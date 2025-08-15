// world-generator-fast.js - Faster world generation without blocking on images
// Images are generated asynchronously after the game starts

const OpenAIApi = require("openai");
const openai = new OpenAIApi(process.env.OPENAI_API_KEY);

// We'll copy the needed functions here to avoid circular dependencies
const generateAllRoomContent = require('./world-generator').generateAllRoomContent;
const generateAllCharacters = require('./world-generator').generateAllCharacters;
const generateQuestContent = require('./world-generator').generateQuestContent;

/**
 * Generate a single room image (for async generation)
 */
async function generateRoomImage(room) {
  try {
    const imageParams = {
      model: "dall-e-3",
      prompt: `${room.image_prompt}. Style: Classic 1980s computer game pixel art like Oregon Trail or King's Quest. 
               No text or UI elements. Historical period accuracy is important.`,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      style: "natural",
      response_format: "url"
    };
    
    const response = await openai.images.generate(imageParams);
    return response.data[0].url;
  } catch (error) {
    console.error(`[WorldGen] Failed to generate image for room ${room.id}:`, error.message);
    return null;
  }
}

/**
 * Generate world quickly without images
 */
async function generateWorldWithoutImages(gamePlan) {
  console.log("[WorldGen-Fast] Starting fast world generation");
  
  const startTime = Date.now();
  
  try {
    // Generate all content in parallel
    const [rooms, characters, quests] = await Promise.all([
      generateAllRoomContent(gamePlan),
      generateAllCharacters(gamePlan),
      generateQuestContent(gamePlan)
    ]);
    
    console.log("[WorldGen-Fast] Content generation complete in", (Date.now() - startTime) / 1000, "seconds");
    
    // Build world without images
    const completeWorld = {
      metadata: {
        ...gamePlan.metadata,
        generatedAt: new Date().toISOString(),
        generationTime: `${(Date.now() - startTime) / 1000} seconds`,
        imagesGenerated: false
      },
      overview: gamePlan.game_overview,
      progression: gamePlan.progression,
      historical: gamePlan.historical_elements,
      world: {
        rooms: rooms.map(room => {
          const planData = gamePlan.world_map.locations.find(loc => loc.id === room.id);
          return {
            ...room,
            ...planData,
            imageUrl: null, // No image yet
            imageStatus: 'pending' // Track image generation status
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
      navigation: buildNavigationMap(gamePlan.world_map.locations)
    };
    
    return completeWorld;
    
  } catch (error) {
    console.error("[WorldGen-Fast] Failed to generate world:", error);
    throw error;
  }
}

/**
 * Generate images for a world asynchronously
 */
async function generateImagesAsync(world, onImageGenerated) {
  console.log("[WorldGen-Fast] Starting async image generation for", world.world.rooms.length, "rooms");
  
  const CONCURRENT_LIMIT = 2; // Only 2 at a time to avoid rate limits
  const DELAY_BETWEEN_BATCHES = 3000; // 3 seconds between batches
  
  const rooms = world.world.rooms;
  let completed = 0;
  
  for (let i = 0; i < rooms.length; i += CONCURRENT_LIMIT) {
    const batch = rooms.slice(i, i + CONCURRENT_LIMIT);
    
    const batchPromises = batch.map(async (room) => {
      if (room.imageUrl) return; // Skip if already has image
      
      const imageUrl = await generateRoomImage(room);
      if (imageUrl) {
        room.imageUrl = imageUrl;
        room.imageStatus = 'completed';
        completed++;
        
        // Callback for each generated image
        if (onImageGenerated) {
          onImageGenerated({
            roomId: room.id,
            imageUrl: imageUrl,
            progress: Math.round((completed / rooms.length) * 100)
          });
        }
      } else {
        room.imageStatus = 'failed';
      }
    });
    
    await Promise.all(batchPromises);
    
    // Delay between batches (except for last batch)
    if (i + CONCURRENT_LIMIT < rooms.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
    }
  }
  
  console.log("[WorldGen-Fast] Image generation complete. Generated:", completed, "of", rooms.length);
  world.metadata.imagesGenerated = true;
  return world;
}

/**
 * Build navigation map
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
  generateWorldWithoutImages,
  generateImagesAsync,
  generateRoomImage
};