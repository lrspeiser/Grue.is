// game-loader-fast.js - Optimized game generation with status polling
// Uses start-game and game-status endpoints to avoid timeouts

async function generateGameWithRetry(userId, userProfile, maxRetries = 30) {
    console.log('[GameLoader] Starting optimized game generation');
    
    try {
        // Step 1: Start game generation (returns immediately)
        console.log('[GameLoader] Initiating game generation...');
        const startResponse = await fetch('/v2/api/start-game-simple', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, userProfile })
        });
        
        if (!startResponse.ok) {
            const errorText = await startResponse.text();
            throw new Error(`Failed to start game: ${errorText}`);
        }
        
        const startData = await startResponse.json();
        console.log('[GameLoader] Game generation initiated:', startData);
        
        // Step 2: Poll for completion
        let attempts = 0;
        const pollInterval = 2000; // Check every 2 seconds
        
        while (attempts < maxRetries) {
            attempts++;
            console.log(`[GameLoader] Checking status... (attempt ${attempts}/${maxRetries})`);
            
            try {
                const statusResponse = await fetch('/v2/api/game-status-simple', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId })
                });
                
                if (!statusResponse.ok) {
                    console.error('[GameLoader] Status check failed:', statusResponse.status);
                    await new Promise(resolve => setTimeout(resolve, pollInterval));
                    continue;
                }
                
                const statusData = await statusResponse.json();
                console.log('[GameLoader] Status:', statusData.status, statusData.message || '');
                
                if (statusData.status === 'ready' && statusData.success) {
                    console.log('[GameLoader] Game ready!');
                    return {
                        success: true,
                        gameId: statusData.gameId,
                        worldOverview: statusData.worldOverview,
                        initialState: statusData.initialState,
                        currentRoom: statusData.currentRoom
                    };
                }
                
                if (statusData.status === 'error') {
                    throw new Error(statusData.message || 'Game generation failed');
                }
                
                // Still generating, wait and try again
                await new Promise(resolve => setTimeout(resolve, pollInterval));
                
            } catch (error) {
                console.error('[GameLoader] Error checking status:', error);
                await new Promise(resolve => setTimeout(resolve, pollInterval));
            }
        }
        
        throw new Error('Game generation timed out');
        
    } catch (error) {
        console.error('[GameLoader] Fatal error:', error);
        
        // Try the old endpoint as fallback (with shorter timeout)
        console.log('[GameLoader] Attempting fallback to direct generation...');
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
            
            const fallbackResponse = await fetch('/v2/api/new-game', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, userProfile }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (fallbackResponse.ok) {
                const data = await fallbackResponse.json();
                if (data.success) {
                    console.log('[GameLoader] Fallback successful');
                    return data;
                }
            }
        } catch (fallbackError) {
            console.error('[GameLoader] Fallback also failed:', fallbackError);
        }
        
        // If all else fails, return mock data
        console.log('[GameLoader] Using mock data as last resort');
        return {
            success: true,
            gameId: 'mock-game',
            worldOverview: {
                title: "Adventure Quest",
                description: "A thrilling adventure awaits!",
                setting: "A mysterious realm"
            },
            initialState: {
                currentRoom: 'start',
                inventory: [],
                health: 100,
                score: 0,
                questsCompleted: [],
                turnCount: 0
            },
            currentRoom: {
                id: 'start',
                name: 'Starting Area',
                description: 'You find yourself at the beginning of an adventure. The path ahead is unclear, but excitement fills the air.',
                exits: { north: 'path' },
                items: [],
                npcs: []
            }
        };
    }
}

async function checkExistingGame(userId, maxRetries = 3) {
    console.log('[GameLoader] Checking for existing game...');
    
    try {
        const response = await fetch('/v2/api/game-status-simple', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId })
        });
        
        if (!response.ok) {
            console.log('[GameLoader] No existing game found');
            return null;
        }
        
        const data = await response.json();
        
        if (data.status === 'ready' && data.success) {
            console.log('[GameLoader] Found existing game');
            return {
                success: true,
                state: data.initialState,
                currentRoom: data.currentRoom,
                worldOverview: data.worldOverview
            };
        }
        
        return null;
        
    } catch (error) {
        console.error('[GameLoader] Error checking existing game:', error);
        return null;
    }
}

// Export for use in HTML files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generateGameWithRetry, checkExistingGame };
}