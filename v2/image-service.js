// image-service.js - Lazy image generation with caching
// Only generates images for current room and adjacent rooms

const OpenAIApi = require("openai");
const openai = new OpenAIApi(process.env.OPENAI_API_KEY);

class ImageGenerationService {
  constructor() {
    // In-memory cache for generated images
    this.imageCache = new Map();
    
    // Track which rooms are currently being generated
    this.generatingRooms = new Set();
    
    // Queue for image generation requests
    this.generationQueue = [];
    this.isProcessingQueue = false;
    
    // Rate limiting
    this.CONCURRENT_LIMIT = 2;
    this.DELAY_BETWEEN_GENERATIONS = 2000; // 2 seconds
  }

  /**
   * Get image for a room (generate if needed)
   */
  async getRoomImage(room, priority = 'normal') {
    const roomId = room.id;
    
    // Check cache first
    if (this.imageCache.has(roomId)) {
      console.log(`[ImageService] Cache hit for room ${roomId}`);
      return this.imageCache.get(roomId);
    }
    
    // Check if already generating
    if (this.generatingRooms.has(roomId)) {
      console.log(`[ImageService] Already generating image for room ${roomId}`);
      return null; // Will be available later
    }
    
    // Add to queue
    this.addToQueue(room, priority);
    
    return null; // Image will be generated asynchronously
  }

  /**
   * Generate images for current room and adjacent rooms
   */
  async generateRoomAndAdjacent(currentRoom, adjacentRooms, onImageGenerated) {
    console.log(`[ImageService] Generating images for room ${currentRoom.id} and ${adjacentRooms.length} adjacent rooms`);
    
    // Priority order: current room first, then adjacent
    const roomsToGenerate = [
      { room: currentRoom, priority: 'high' },
      ...adjacentRooms.map(room => ({ room, priority: 'medium' }))
    ];
    
    // Filter out rooms that already have images or are being generated
    const needsGeneration = roomsToGenerate.filter(({ room }) => 
      !this.imageCache.has(room.id) && 
      !this.generatingRooms.has(room.id)
    );
    
    if (needsGeneration.length === 0) {
      console.log(`[ImageService] All rooms already have images or are being generated`);
      return;
    }
    
    // Add to queue
    needsGeneration.forEach(({ room, priority }) => {
      this.addToQueue(room, priority);
    });
    
    // Start processing if not already running
    if (!this.isProcessingQueue) {
      this.processQueue(onImageGenerated);
    }
  }

  /**
   * Add room to generation queue
   */
  addToQueue(room, priority = 'normal') {
    // Check if already in queue
    const existingIndex = this.generationQueue.findIndex(item => item.room.id === room.id);
    
    if (existingIndex >= 0) {
      // Update priority if higher
      if (priority === 'high' && this.generationQueue[existingIndex].priority !== 'high') {
        this.generationQueue[existingIndex].priority = priority;
        this.sortQueue();
      }
      return;
    }
    
    // Add to queue
    this.generationQueue.push({ room, priority });
    this.sortQueue();
    
    console.log(`[ImageService] Added room ${room.id} to queue with priority ${priority}. Queue size: ${this.generationQueue.length}`);
  }

  /**
   * Sort queue by priority
   */
  sortQueue() {
    const priorityOrder = { 'high': 0, 'medium': 1, 'normal': 2, 'low': 3 };
    this.generationQueue.sort((a, b) => 
      priorityOrder[a.priority] - priorityOrder[b.priority]
    );
  }

  /**
   * Process the generation queue
   */
  async processQueue(onImageGenerated) {
    if (this.isProcessingQueue) return;
    
    this.isProcessingQueue = true;
    console.log(`[ImageService] Starting queue processing. Queue size: ${this.generationQueue.length}`);
    
    while (this.generationQueue.length > 0) {
      // Take up to CONCURRENT_LIMIT items from queue
      const batch = this.generationQueue.splice(0, this.CONCURRENT_LIMIT);
      
      // Generate images in parallel
      const promises = batch.map(async ({ room }) => {
        this.generatingRooms.add(room.id);
        
        try {
          const imageUrl = await this.generateSingleImage(room);
          
          if (imageUrl) {
            // Cache the result
            this.imageCache.set(room.id, imageUrl);
            console.log(`[ImageService] Generated and cached image for room ${room.id}`);
            
            // Callback
            if (onImageGenerated) {
              onImageGenerated({
                roomId: room.id,
                imageUrl: imageUrl,
                queueSize: this.generationQueue.length
              });
            }
          }
        } catch (error) {
          console.error(`[ImageService] Failed to generate image for room ${room.id}:`, error.message);
        } finally {
          this.generatingRooms.delete(room.id);
        }
      });
      
      await Promise.all(promises);
      
      // Delay before next batch (if queue not empty)
      if (this.generationQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, this.DELAY_BETWEEN_GENERATIONS));
      }
    }
    
    this.isProcessingQueue = false;
    console.log(`[ImageService] Queue processing complete`);
  }

  /**
   * Generate a single image
   */
  async generateSingleImage(room) {
    if (!room.image_prompt && !room.description) {
      console.warn(`[ImageService] No prompt available for room ${room.id}`);
      return null;
    }
    
    const prompt = room.image_prompt || room.description;
    
    try {
      console.log(`[ImageService] Generating image for room ${room.id}`);
      
      const imageParams = {
        model: "dall-e-3",
        prompt: `${prompt}. Style: Classic 1980s computer game pixel art like Oregon Trail or King's Quest. 
                 No text or UI elements. Historical period accuracy is important.`,
        n: 1,
        size: "1024x1024",
        quality: "standard",
        style: "natural",
        response_format: "url"
      };
      
      const response = await openai.images.generate(imageParams);
      
      if (response.data && response.data[0] && response.data[0].url) {
        return response.data[0].url;
      }
      
      return null;
    } catch (error) {
      console.error(`[ImageService] Error generating image for room ${room.id}:`, error.message);
      
      // If rate limited, add back to queue with low priority
      if (error.message && error.message.includes('rate')) {
        console.log(`[ImageService] Rate limited, adding room ${room.id} back to queue with low priority`);
        this.addToQueue(room, 'low');
      }
      
      return null;
    }
  }

  /**
   * Get cached image if available
   */
  getCachedImage(roomId) {
    return this.imageCache.get(roomId) || null;
  }

  /**
   * Check if image is available (cached or being generated)
   */
  isImageAvailable(roomId) {
    return this.imageCache.has(roomId);
  }

  /**
   * Check if image is being generated
   */
  isGenerating(roomId) {
    return this.generatingRooms.has(roomId);
  }

  /**
   * Clear cache (for memory management)
   */
  clearCache() {
    this.imageCache.clear();
    console.log(`[ImageService] Cache cleared`);
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      cachedImages: this.imageCache.size,
      generatingImages: this.generatingRooms.size,
      queueSize: this.generationQueue.length
    };
  }

  /**
   * Pre-cache an image URL (for loaded games)
   */
  cacheImage(roomId, imageUrl) {
    if (imageUrl) {
      this.imageCache.set(roomId, imageUrl);
      console.log(`[ImageService] Pre-cached image for room ${roomId}`);
    }
  }

  /**
   * Load existing images into cache (from saved world)
   */
  loadExistingImages(world) {
    if (!world || !world.world || !world.world.rooms) return;
    
    let loaded = 0;
    world.world.rooms.forEach(room => {
      if (room.imageUrl) {
        this.cacheImage(room.id, room.imageUrl);
        loaded++;
      }
    });
    
    console.log(`[ImageService] Loaded ${loaded} existing images into cache`);
  }
}

// Export singleton instance
module.exports = new ImageGenerationService();