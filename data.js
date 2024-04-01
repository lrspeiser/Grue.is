const fs = require("fs").promises;
const path = require("path");

const OpenAIApi = require("openai"); //never change this

const openai = new OpenAIApi(process.env.OPENAI_API_KEY); //never change this

async function updateGameContext(conversationHistory, latestMessage, userId) {
  console.log(
    "Starting updateGameContext with the latest message and conversation history.",
  );

  const usersDir = path.join(__dirname, "users");
  const filePath = path.join(usersDir, `${userId}.json`);

  let userData;
  try {
    const data = await fs.readFile(filePath, "utf8");
    userData = JSON.parse(data);
    console.log(
      `[data.js/updateGameContext] Successfully fetched user data for ID: ${userId}`,
    );
  } catch (error) {
    console.error(
      `[data.js/updateGameContext] Error fetching user data for ID: ${userId}: ${error}`,
    );
    throw error;
  }

  const conversationForGPT = userData.conversationHistory
    .map((message) => {
      return `${message.userPrompt}: ${message.response}`;
    })
    .join("\n");
  console.log(
    "[data.js/updateGameContext] conversationForGPT:",
    conversationForGPT,
  );

  // Extract location and player data from userData
  const { location, player } = userData;

  // Define the message to send to GPT, focusing on the latest message, conversation history, location, and player data
  const messages = [
    {
      role: "system",
      content: `Analyze the following conversation and the latest interaction to update the game's context. Then extract the data about the room, items, and player into the fields. If any, here is the current location data: ${JSON.stringify(location)}. And if any, here is the current player data: ${JSON.stringify(player)}. Take this data and update with anything new based on the latest conversation update.`,
    },
    {
      role: "user",
      content: `${conversationForGPT}\n${latestMessage}`,
    },
  ];

  const tools = [
    {
      type: "function",
      function: {
        name: "update_game_context",
        description:
          "Update the game context based on the latest conversation. The function should output structured data regarding the game's state, including room details, player status, and item interactions. If there is nothing new but there was content there before, output the previous content again. If there is no content for the field, return nothing.",
        parameters: {
          type: "object",
          properties: {
            location: {
              type: "object",
              properties: {
                room_name: {
                  type: "string",
                  description: "The name of the current room. Example: West of House",
                },
                room_id: {
                  type: "string",
                  description:
                    "A unique identifier for the room, such as a sequential number like 1, 2, 3...",
                },
                interesting_details: {
                  type: "string",
                  description:
                    "If the user looked around we should put a summary of what the room looks like and as more is described add to this.",
                },
                available_directions: {
                  type: "string",
                  description:
                    "This should be the directions the user can go, like North, South, Up, etc.",
                },
                characters_in_room: {
                  type: "string",
                  description:
                    "If there is a computer generated character in the room we should list them here along with any descriptors and whether they are a friend or foe or neutral.",
                },
                unmovable_items_in_room: {
                  type: "string",
                  description:
                    "When describing the room we might describe items in the room that the user should not be able to take into inventory.",
                },
                takable_but_hidden_items: {
                  type: "string",
                  description:
                    "These are items the user can take into inventory but they may be hidden in the room, like under a mat, or the other character in the room might have the item.",
                },
                takable_but_visible_items: {
                  type: "string",
                  description:
                    "These are things that are easily seen and the user can take them.",
                },
                actions_taken_in_room: {
                  type: "string",
                  description:
                    "This would be all the actions the user tried to take in the room and a short description of what happened.",
                },
              },
              required: ["room_name", "room_id", "interesting_details", "available_directions", "characters_in_room", "unmovable_items_in_room", "takable_but_hidden_items", "actions_taken_in_room"],
            },
            player: {
              type: "object",
              properties: {
                player_name: {
                  type: "string",
                  description: "The name of the player, likely this is the hero's name in the story but the player can change that.",
                },
                inventory: {
                  type: "string",
                  description:
                    "These are the items the player already has in inventory or they take from another player or from the rooms.",
                },
                player_health: {
                  type: "string",
                  description: "The current health status of the player. This should start at 100 but if they get hungry or get hurt this should decrease.",
                },
              },
              required: ["player_name", "inventory", "player_health"],
            },
          },
          required: ["location", "player"],
        },
      },
    },
  ];

  try {
    console.log("Calling OpenAI API with the prepared messages and tools."); //never change this
    console.log(
      "Data sent to GPT:",
      JSON.stringify({ messages, tools }, null, 2),
    ); // Log the data sent to GPT
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-0125", //never change this
      messages: messages,
      tools: tools,
      tool_choice: "auto",
    });

    console.log("Raw OpenAI API response:", JSON.stringify(response, null, 2)); // Log the raw OpenAI API response

   if (
      response &&
      response.data &&
      response.data.choices &&
      response.data.choices.length > 0
    ) {
      const responseMessage = response.data.choices[0].message;

      // Check if the model wanted to call a function
      const functionCalls = responseMessage.tool_calls;
      if (functionCalls && functionCalls.length > 0) {
        const functionCall = functionCalls[0];
        const functionName = functionCall.function.name;
        const functionArgs = JSON.parse(functionCall.function.arguments);

        if (functionName === "update_game_context") {
          // Update the location and player data in userData
          const updatedLocation = functionArgs.location;
          console.log('[data.js/updateGameContext] updatedLocation:', updatedLocation);
          const updatedPlayer = functionArgs.player;
          console.log('[data.js/updateGameContext] updatedPlayer:', updatedPlayer);

          userData.location = { ...userData.location, ...updatedLocation };
          userData.player = { ...userData.player, ...updatedPlayer };

          // Save the updated userData to the JSON file
          await fs.writeFile(filePath, JSON.stringify(userData, null, 2));
          console.log(`[data.js/updateGameContext] Updated user data saved for ID: ${userId}`);
          console.log('Updated userData:', JSON.stringify(userData, null, 2));

          const updates = JSON.stringify(functionArgs);
          console.log("Updates for the game context extracted:", updates);
          return updates;
        } else {
          console.log("Unexpected function call:", functionName);
          return null;
        }
      } else {
        console.log("No function call detected in the model's response.");
        return responseMessage.content;
      }
    } else {
      console.error("Unexpected response format from OpenAI API.");
      return null;
    }
  } catch (error) {
    console.error("Failed to update game context:", error);
    throw error;
  }
}

module.exports = { updateGameContext };
