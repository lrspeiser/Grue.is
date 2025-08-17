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
            
            // Check for timeout or server errors
            if (response.status === 504) {
                console.error('[GameLoader] Request timed out (504 Gateway Timeout)');
                console.log('[GameLoader] Retrying in', retryDelay, 'ms...');
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                retries++;
                continue;
            }
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('[GameLoader] Server error:', response.status, errorText);
                throw new Error(`Server error ${response.status}: ${errorText}`);
            }
            
            // Parse JSON response
            let data;
            try {
                data = await response.json();
            } catch (jsonError) {
                console.error('[GameLoader] Failed to parse JSON response:', jsonError);
                const responseText = await response.text();
                console.error('[GameLoader] Response text:', responseText);
                throw new Error('Invalid JSON response from server');
            }
            
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
            
            // If it's a network or timeout error, retry
            if (error.message.includes('fetch') || error.message.includes('timeout') || error.message.includes('504')) {
                console.log('[GameLoader] Network/timeout error, retrying...');
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                retries++;
                continue;
            }
            
            // For other errors, retry a few times before giving up
            if (retries < 3) {
                console.log('[GameLoader] Error occurred, retrying...');
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

async function checkExistingGame(userId, maxRetries = 2) {
    let retries = 0;
    const retryDelay = 1500; // 1.5 seconds between retries
    
    console.log('[GameLoader] Checking for existing game...');
    
    while (retries < maxRetries) {
        try {
            const response = await fetch('/v2/api/continue-game', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });
            
            // Check for timeout or server errors
            if (response.status === 504) {
                console.error('[GameLoader] Request timed out (504 Gateway Timeout)');
                console.log('[GameLoader] Retrying check for existing game...');
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                retries++;
                continue;
            }
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('[GameLoader] Server error:', response.status, errorText);
                // Don't throw here, just return null (no existing game)
                return null;
            }
            
            // Parse JSON response
            let data;
            try {
                data = await response.json();
            } catch (jsonError) {
                console.error('[GameLoader] Failed to parse JSON response:', jsonError);
                // Don't throw here, just return null (no existing game)
                return null;
            }
            
            console.log('[GameLoader] Continue game response:', data);
            
            // Check if game is ready
            if (data.success && data.state && data.currentRoom) {
                console.log('[GameLoader] Found existing game!');
                return data;
            }
            
            // If still loading, only retry once
            if (data.status === 'loading') {
                if (retries === 0) {
                    console.log('[GameLoader] Game still loading, trying once more...');
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    retries++;
                    continue;
                } else {
                    console.log('[GameLoader] Game still loading after retry, giving up');
                    return null;
                }
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