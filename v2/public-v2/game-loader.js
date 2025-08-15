// game-loader.js - Handles game generation with retry logic

async function generateGameWithRetry(userId, userProfile, maxRetries = 10) {
    let retries = 0;
    const retryDelay = 3000; // 3 seconds between retries
    
    console.log('[GameLoader] Starting game generation with retry logic');
    
    while (retries < maxRetries) {
        try {
            console.log(`[GameLoader] Attempt ${retries + 1}/${maxRetries}`);
            
            const response = await fetch('/v2/api/new-game', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, userProfile })
            });
            
            const data = await response.json();
            console.log('[GameLoader] Response:', data);
            
            // Check if game is ready
            if (data.success && data.gameId && data.initialState && data.currentRoom) {
                console.log('[GameLoader] Game generation complete!');
                return data;
            }
            
            // If still generating, wait and retry
            if (data.status === 'generating' || data.status === 'loading') {
                console.log(`[GameLoader] Game still ${data.status}, waiting ${retryDelay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                retries++;
                continue;
            }
            
            // If there's an error, throw it
            if (!data.success) {
                throw new Error(data.error || 'Game generation failed');
            }
            
        } catch (error) {
            console.error('[GameLoader] Error during generation:', error);
            
            // If it's a network error, retry
            if (error.message.includes('fetch')) {
                console.log('[GameLoader] Network error, retrying...');
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                retries++;
                continue;
            }
            
            // Otherwise, throw the error
            throw error;
        }
    }
    
    throw new Error('Game generation timed out after ' + maxRetries + ' attempts');
}

async function checkExistingGame(userId, maxRetries = 3) {
    let retries = 0;
    const retryDelay = 2000; // 2 seconds between retries
    
    console.log('[GameLoader] Checking for existing game...');
    
    while (retries < maxRetries) {
        try {
            const response = await fetch('/v2/api/continue-game', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });
            
            const data = await response.json();
            console.log('[GameLoader] Continue game response:', data);
            
            // Check if game is ready
            if (data.success && data.state && data.currentRoom) {
                console.log('[GameLoader] Found existing game!');
                return data;
            }
            
            // If still loading, wait and retry
            if (data.status === 'loading') {
                console.log('[GameLoader] Game still loading, waiting...');
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                retries++;
                continue;
            }
            
            // No existing game
            console.log('[GameLoader] No existing game found');
            return null;
            
        } catch (error) {
            console.error('[GameLoader] Error checking for existing game:', error);
            retries++;
            
            if (retries >= maxRetries) {
                return null; // No existing game
            }
            
            await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
    }
    
    return null;
}

// Export for use in HTML files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generateGameWithRetry, checkExistingGame };
}