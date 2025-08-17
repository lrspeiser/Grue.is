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

        try {
          const completion = await openai.chat.completions.create({
            model: "gpt-4o", // Using latest available model
            messages: [
              { role: "system", content: "You are a game world generator. Return only valid JSON." },
              { role: "user", content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 500 // Limit response size
          });
          
          const responseText = completion.choices[0].message.content;
          console.log('[Simple] AI Response received');
          
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
            console.error('[Simple] Parse error:', parseError);
            // Fallback game data
            gameData = {
              title: "Space Explorer",
              description: "A journey through the stars",
              rooms: [
                {
                  id: "bridge",
                  name: "Ship Bridge",
                  description: "The command center of your spacecraft. Monitors glow with data from across the galaxy.",
                  exits: { south: "corridor" }
                },
                {
                  id: "corridor",
                  name: "Main Corridor",
                  description: "A long corridor with windows showing the vast expanse of space.",
                  exits: { north: "bridge", south: "engine" }
                },
                {
                  id: "engine",
                  name: "Engine Room",
                  description: "The heart of the ship. Fusion reactors hum with barely contained power.",
                  exits: { north: "corridor" }
                }
              ]
            };
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
          
        } catch (aiError) {
          console.error('[Simple] AI Error:', aiError);
          
          // Return a working fallback game
          return res.json({
            success: true,
            nextStep: 'complete',
            progress: 100,
            message: 'Generated fallback world',
            data: {
              worldOverview: {
                title: "Space Station Alpha",
                description: "Explore a mysterious space station",
                setting: "Space"
              },
              initialState: {
                currentRoom: "bridge",
                inventory: ["scanner", "keycard"],
                health: 100,
                score: 0
              },
              currentRoom: {
                id: "bridge",
                name: "Command Bridge",
                description: "The nerve center of Space Station Alpha. Through the viewport, you see Earth slowly rotating below.",
                exits: { east: "quarters", west: "lab" }
              }
            }
          });
        }
        
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