// game-loader-debug.js - Step-by-step game generation with detailed logging
// Shows each phase of generation to help debug issues

async function generateGameWithRetry(userId, userProfile, maxRetries = 10) {
    console.log('[GameLoader] Starting step-by-step game generation');
    console.log('[GameLoader] User ID:', userId);
    console.log('[GameLoader] Profile:', userProfile);
    
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
            
            const response = await fetch('/v2/api/generate-step', {
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
                if (result.data.gamePlan) {
                    stepData.gamePlan = result.data.gamePlan;
                    console.log('[GameLoader] Game plan received:', {
                        title: result.data.gamePlan.title,
                        rooms: result.data.gamePlan.world_map?.rooms?.length,
                        characters: result.data.gamePlan.characters?.length,
                        quests: result.data.gamePlan.quests?.length
                    });
                }
                
                if (result.data.worldOverview) {
                    console.log('[GameLoader] World overview:', result.data.worldOverview);
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
                
                if (result.data) {
                    return {
                        success: true,
                        gameId: `game-${userId}`,
                        worldOverview: result.data.worldOverview,
                        initialState: result.data.initialState,
                        currentRoom: result.data.currentRoom
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
    console.log('[GameLoader] Checking for existing game...');
    
    try {
        // For now, just return null to force new game generation
        // This helps us debug the generation process
        console.log('[GameLoader] Skipping existing game check for debugging');
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