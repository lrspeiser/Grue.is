// game-loader-render.js - Two-phase game generation with tiered models
// Phase 1: GPT-4o for world generation
// Phase 2: GPT-4o-mini for gameplay

async function generateGameWithRetry(userId, userProfile, maxRetries = 3) {
    console.log('[GameLoader] Starting two-phase game generation');
    console.log('[GameLoader] User ID:', userId);
    console.log('[GameLoader] Profile:', userProfile);
    
    // Determine API base URL
    const apiBase = window.location.hostname === 'localhost' 
        ? '' 
        : 'https://grue-is.onrender.com';
    
    try {
        // Phase 1: Generate world with powerful model (GPT-4o)
        console.log('[GameLoader] Phase 1: Generating world with GPT-5...'); // DO NOT CHANGE MODEL: world gen uses GPT-5 by default
        
        // Extract character name from profile
        const characterName = userProfile.characterRole || 'Adventurer';
        const theme = `${userProfile.timePeriod || 'medieval'} ${userProfile.storyLocation || 'fantasy'}`;
        const difficulty = userProfile.educationLevel === 'elementary' ? 'easy' : 
                          userProfile.educationLevel === 'graduate' ? 'hard' : 'medium';
        
        const worldResponse = await fetch(`${apiBase}/v2/api/generate-world`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId,
                name: characterName,
                theme: theme,
                difficulty: difficulty
            })
        });
        
        console.log('[GameLoader] World generation response status:', worldResponse.status);
        
        if (!worldResponse.ok) {
            const errorText = await worldResponse.text();
            console.error('[GameLoader] World generation failed:', errorText);
            throw new Error('World generation failed: ' + errorText);
        }
        
        const worldData = await worldResponse.json();
        console.log('[GameLoader] World generated successfully');
        console.log(`[GameLoader] World ID: ${worldData.worldId}`);
        console.log(`[GameLoader] Rooms: ${worldData.worldData?.rooms?.length || 0}`);
        console.log(`[GameLoader] NPCs: ${worldData.worldData?.npcs?.length || 0}`);
        console.log(`[GameLoader] Items: ${worldData.worldData?.items?.length || 0}`);
        console.log(`[GameLoader] Missions: ${worldData.worldData?.missions?.length || 0}`);
        console.log(`[GameLoader] Tokens used (GPT-5): ${worldData.tokensUsed || 'unknown'}`);
        
        if (!worldData.success) {
            throw new Error(worldData.error || 'World generation failed');
        }
        
        // Get the starting room details
        const startRoomId = worldData.gameState?.currentRoom || 'start';
        const currentRoom = worldData.worldData?.rooms?.find(r => r.id === startRoomId);
        
        console.log('[GameLoader] Phase 1 complete - World ready for gameplay with GPT-5-nano'); // DO NOT CHANGE MODEL: gameplay uses GPT-5-nano by default
        
        // Return game data in expected format
        return {
            success: true,
            gameId: worldData.worldId,
            worldId: worldData.worldId,
            worldOverview: {
                name: worldData.worldData.name,
                description: worldData.worldData.description,
                theme: worldData.worldData.theme,
                roomCount: worldData.worldData.rooms?.length || 0,
                npcCount: worldData.worldData.npcs?.length || 0,
                itemCount: worldData.worldData.items?.length || 0,
                missionCount: worldData.worldData.missions?.length || 0
            },
            initialState: worldData.gameState,
            currentRoom: currentRoom,
            world: worldData.worldData
        };
        
    } catch (error) {
        console.error('[GameLoader] Error in game generation:', error);
        console.error('[GameLoader] Error stack:', error.stack);
        
        // Fallback to simple world generation if API fails
        if (maxRetries > 0) {
            console.log('[GameLoader] Retrying with simpler parameters...');
            return generateGameWithRetry(userId, {
                ...userProfile,
                characterRole: 'Explorer',
                timePeriod: 'fantasy',
                storyLocation: 'dungeon'
            }, maxRetries - 1);
        }
        
        throw error;
    }
}

async function checkExistingGame(userId, maxRetries = 2) {
    console.log('[GameLoader] Checking for existing games in database...');
    
    const apiBase = window.location.hostname === 'localhost' 
        ? '' 
        : 'https://grue-is.onrender.com';
    
    try {
        const response = await fetch(`${apiBase}/api/game/worlds/${userId}`);
        
        if (response.ok) {
            const result = await response.json();
            if (result.success && result.data && result.data.length > 0) {
                console.log('[GameLoader] Found existing games:', result.data.length);
                // Return the most recent game
                return result.data[0];
            }
        }
        
        console.log('[GameLoader] No existing games found');
        return null;
        
    } catch (error) {
        console.error('[GameLoader] Error checking existing game:', error);
        return null;
    }
}

async function saveGameState(userId, worldId, gameState) {
    console.log('[GameLoader] Saving game state to database...');
    
    const apiBase = window.location.hostname === 'localhost' 
        ? '' 
        : 'https://grue-is.onrender.com';
    
    try {
        const response = await fetch(`${apiBase}/api/game/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, worldId, gameState })
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('[GameLoader] Game state saved successfully');
            return result;
        }
        
        throw new Error('Failed to save game state');
        
    } catch (error) {
        console.error('[GameLoader] Error saving game state:', error);
        throw error;
    }
}

// Export for use in HTML files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generateGameWithRetry, checkExistingGame, saveGameState };
}