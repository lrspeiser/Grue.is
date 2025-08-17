// game-loader-render.js - Game generation for Render deployment with 10-minute timeout
// Uses PostgreSQL database and extended timeout capability

async function generateGameWithRetry(userId, userProfile, maxRetries = 10) {
    console.log('[GameLoader] Starting game generation on Render');
    console.log('[GameLoader] User ID:', userId);
    console.log('[GameLoader] Profile:', userProfile);
    
    // Determine API base URL
    const apiBase = window.location.hostname === 'localhost' 
        ? '' 
        : 'https://grue-is.onrender.com';
    
    let currentStep = 'init';
    let stepData = {};
    let retries = 0;
    
    while (currentStep !== 'complete' && retries < maxRetries) {
        try {
            console.log(`[GameLoader] Processing step: ${currentStep}`);
            console.log(`[GameLoader] Attempt ${retries + 1}/${maxRetries}`);
            
            const requestBody = {
                userId,
                step: currentStep,
                userProfile,
                ...stepData
            };
            
            console.log('[GameLoader] Request body:', requestBody);
            
            // Use Render-optimized endpoint with extended timeout
            const response = await fetch(`${apiBase}/v2/api/generate-render`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            
            console.log('[GameLoader] Response status:', response.status);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('[GameLoader] Server error:', errorText);
                
                // Retry on server errors
                retries++;
                await new Promise(resolve => setTimeout(resolve, 3000));
                continue;
            }
            
            let result;
            try {
                const responseText = await response.text();
                console.log('[GameLoader] Raw response:', responseText.substring(0, 500));
                result = JSON.parse(responseText);
            } catch (parseError) {
                console.error('[GameLoader] Failed to parse response:', parseError);
                retries++;
                await new Promise(resolve => setTimeout(resolve, 3000));
                continue;
            }
            
            console.log('[GameLoader] Step result:', result);
            
            if (!result.success) {
                console.error('[GameLoader] Step failed:', result.error);
                
                // Retry failed steps
                if (result.nextStep && result.nextStep.includes('retry')) {
                    console.log('[GameLoader] Retrying step...');
                    retries++;
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    continue;
                }
                
                throw new Error(result.error || 'Step failed');
            }
            
            // Log progress
            console.log(`[GameLoader] Progress: ${result.progress}% - ${result.message}`);
            
            // Store data for next step if needed
            if (result.data) {
                if (result.data.worldId) {
                    stepData.worldId = result.data.worldId;
                    console.log('[GameLoader] World saved to database, ID:', result.data.worldId);
                }
                
                if (result.data.worldOverview) {
                    console.log('[GameLoader] World overview:', result.data.worldOverview);
                    if (result.data.worldOverview.roomCount) {
                        console.log('[GameLoader] Total rooms generated:', result.data.worldOverview.roomCount);
                    }
                }
                
                if (result.data.initialState) {
                    console.log('[GameLoader] Initial state:', result.data.initialState);
                }
                
                if (result.data.currentRoom) {
                    console.log('[GameLoader] Current room:', result.data.currentRoom);
                }
            }
            
            // Check if we're done
            if (result.nextStep === 'complete' || result.progress === 100) {
                console.log('[GameLoader] Generation complete!');
                console.log('[GameLoader] Using GPT-5 with Render extended timeout');
                
                if (result.data) {
                    // Save world data if we're on Render
                    if (result.data.worldId && result.data.world) {
                        console.log(`[GameLoader] World saved to database, ID: ${result.data.worldId}`);
                        console.log(`[GameLoader] Total rooms generated: ${result.data.world.rooms?.length || 0}`);
                    }
                    
                    return {
                        success: true,
                        gameId: `game-${userId}`,
                        worldId: result.data.worldId,
                        worldOverview: result.data.worldOverview,
                        initialState: result.data.initialState,
                        currentRoom: result.data.currentRoom,
                        world: result.data.world
                    };
                }
            }
            
            // Move to next step
            currentStep = result.nextStep;
            retries = 0; // Reset retries for new step
            
            // Small delay between steps
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            console.error('[GameLoader] Error in step processing:', error);
            console.error('[GameLoader] Error stack:', error.stack);
            
            retries++;
            
            if (retries >= maxRetries) {
                throw new Error(`Failed after ${maxRetries} attempts: ${error.message}`);
            }
            
            console.log(`[GameLoader] Retrying in 5 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
    
    throw new Error('Game generation did not complete');
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