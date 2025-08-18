// Simplified game generation that works within Vercel's 30-second limit
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

module.exports = async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, step = 'init', userProfile, gamePlan } = req.body || {};
  
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  console.log(`[Simple] Processing step: ${step} for user: ${userId}`);

  try {
    switch(step) {
      case 'init':
        // Step 1: Initialize
        return res.json({
          success: true,
          nextStep: 'generate',
          progress: 10,
          message: 'Starting simplified generation...',
          data: { userId, userProfile }
        });
        
      case 'generate':
        // Step 2: Generate a simple game quickly
        console.log('[Simple] Generating quick game world...');
        
        const prompt = `Create a simple text adventure game world. Theme: ${userProfile?.timePeriod || 'Fantasy'}
Return ONLY valid JSON with this exact structure:
{
  "title": "Game Title",
  "description": "One line description",
  "rooms": [
    {
      "id": "start",
      "name": "Starting Room",
      "description": "Room description",
      "exits": {"north": "room2"}
    },
    {
      "id": "room2", 
      "name": "Second Room",
      "description": "Another room",
      "exits": {"south": "start"}
    }
  ]
}`;

        console.log('[Simple] Calling OpenAI API with model from WORLD_MODEL (default gpt-5)');
        console.log('[Simple] API Key exists:', !!process.env.OPENAI_API_KEY);
        console.log('[Simple] API Key length:', process.env.OPENAI_API_KEY?.length || 0);
        
        const apiRequest = {
          model: process.env.WORLD_MODEL || "gpt-5",
          input: [
            { role: "system", content: "You are a game world generator. Return only valid JSON." },
            { role: "user", content: prompt }
          ],
max_output_tokens: 500,
response_format: { type: "json_object" }
        };
        
        console.log('[Simple] SENDING TO OPENAI (Responses API):', JSON.stringify(apiRequest, null, 2));
        
        const completion = await openai.responses.create(apiRequest);
        
        const responseText = completion.output_text || completion.choices?.[0]?.message?.content || '';
        console.log('[Simple] RECEIVED FROM OPENAI:');
        console.log(responseText);
        if (completion.usage) {
          console.log('[Simple] Token usage:', JSON.stringify(completion.usage));
        }
          
          // Parse the AI response
          let gameData;
          try {
            // Extract JSON from response
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              gameData = JSON.parse(jsonMatch[0]);
            } else {
              throw new Error('No JSON found in response');
            }
          } catch (parseError) {
            console.error('[Simple] JSON Parse error:', parseError);
            console.error('[Simple] Failed to parse response:', responseText);
            return res.status(500).json({
              success: false,
              error: `Failed to parse AI response as JSON: ${parseError.message}`,
              rawResponse: responseText
            });
          }
          
          // Format response
          const world = {
            world: {
              starting_room: gameData.rooms[0].id,
              rooms: gameData.rooms
            }
          };
          
          const gameState = {
            currentRoom: gameData.rooms[0].id,
            inventory: [],
            health: 100,
            score: 0
          };
          
          return res.json({
            success: true,
            nextStep: 'complete',
            progress: 100,
            message: 'World generated successfully!',
            data: {
              worldOverview: {
                title: gameData.title,
                description: gameData.description,
                setting: userProfile?.timePeriod || "Space"
              },
              initialState: gameState,
              currentRoom: gameData.rooms[0]
            }
          });
          
        
      default:
        return res.status(400).json({ 
          error: `Unknown step: ${step}` 
        });
    }
    
  } catch (error) {
    console.error('[Simple] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Generation failed'
    });
  }
}