const fs = require("fs").promises;
const path = require("path");
const { ensureUserDirectoryAndFiles, getUserData } = require("./util");

const OpenAIApi = require("openai"); //never change this
const openai = new OpenAIApi(process.env.OPENAI_API_KEY); //never change this

async function updateRoomContext(userId) {
  console.log(
    "[data.js/updateRoomContext] Starting updateRoomContext with the latest message and conversation history.",
  );

  const filePaths = await ensureUserDirectoryAndFiles(userId);
  const userData = await getUserData(filePaths);

  if (!Array.isArray(userData.locations)) {
    userData.locations = [];
  }

  // Get the most recent 5 messages from the conversation history
  const recentMessages = userData.conversationHistory.slice(-5);

  // Format the recent messages for GPT
  const conversationForGPT = recentMessages
    .map(
      (message) =>
        `User: ${message.userPrompt}\nAssistant: ${message.response}`,
    )
    .join("\n\n");

  console.log(
    "[data.js/updateRoomContext] conversationForGPT:",
    conversationForGPT,
  );

  const messages = [
    {
      role: "system",
      content: `You are a world class dungeon master and you are crafting a game for this user based on the old text based adventures like Zork. Analyze the following conversation and the latest interaction to update the game's context, feel free to fill in the blanks if the dialogue is missing anything. Analyze the following conversation and the latest interaction to update the game's context. Then extract the data about the room into the fields. If any, here is the current location data where the player may be or has been in the past: ${JSON.stringify(userData.locations)}. Take this data and update with anything new based on the latest conversation update. That means if we need to add anything, you must include the original data in the output or it will be deleted. If it is a new location, create it.`,
    },
    {
      role: "system",
      content: `Current room data: ${JSON.stringify(userData.room)}`,
    },
    {
      role: "user",
      content: `Message History:\n${conversationForGPT}`,
    },
  ];

  const tools = [
    {
      type: "function",
      function: {
        name: "update_room_context",
        description:
          "List as many rooms or locations are described in the conversation in the below array. If the room already exists, update the room context based on the latest conversation by including the original data and making the changes based on the latest details. The function should output an array of structured data regarding each room's state, including room details and item interactions.",
        parameters: {
          type: "object",
          properties: {
            rooms: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  room_name: {
                    type: "string",
                    description:
                      "The name of the current room. Example: West of House",
                  },
                  room_id: {
                    type: "string",
                    description:
                      "A unique identifier for the room, such as a sequential number like 1, 2, 3...",
                  },
                  interesting_details: {
                    type: "string",
                    description: "A summary of what the room looks like.",
                  },
                  available_directions: {
                    type: "string",
                    description:
                      "Directions the user can go, like North, South, Up, etc.",
                  },
                  characters_in_room: {
                    type: "string",
                    description: "Computer generated characters in the room.",
                  },
                  unmovable_items_in_room: {
                    type: "string",
                    description: "Items in the room that the user cannot take.",
                  },
                  takeable_but_hidden_items: {
                    type: "string",
                    description: "Items the user can take but may be hidden.",
                  },
                  takeable_but_visible_items: {
                    type: "string",
                    description: "Visible items that the user can take.",
                  },
                  actions_taken_in_room: {
                    type: "string",
                    description: "Actions the user tried to take in the room.",
                  },
                  players_conversation_ids_in_room: {
                    type: "string",
                    description:
                      "Indicate which conversation numbers the player was in this room. Example: 1, 2, 3",
                  },
                },
                required: [
                  "room_name",
                  "room_id",
                  "interesting_details",
                  "available_directions",
                  "characters_in_room",
                  "unmovable_items_in_room",
                  "takeable_but_hidden_items",
                  "takeable_but_visible_items",
                  "actions_taken_in_room",
                  "players_conversation_ids_in_room",
                ],
              },
            },
          },
          required: ["rooms"],
        },
      },
    },
  ];

  try {
    console.log("Calling OpenAI API with the prepared messages and tools.");
    console.log(
      "Data sent to GPT:",
      JSON.stringify({ messages, tools }, null, 2),
    );
    const response = await openai.chat.completions.create({
      model: "gpt-4-1106-preview",
      messages: messages,
      tools: tools,
      tool_choice: "auto",
    });

    console.log(
      "[data.js/updateRoomContext] Raw OpenAI API response:",
      JSON.stringify(response, null, 2),
    );

    const responseMessage = response.choices[0].message;
    console.log(
      "[data.js/updateRoomContext] Response Message:",
      JSON.stringify(responseMessage, null, 2),
    );

    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      const toolCall = responseMessage.tool_calls[0];
      console.log(
        "[data.js/updateRoomContext] Function call:",
        JSON.stringify(toolCall, null, 2),
      );

      if (toolCall.function.name === "update_room_context") {
        const functionArgs = JSON.parse(toolCall.function.arguments);
        console.log(
          "[data.js/updateRoomContext] Function arguments:",
          JSON.stringify(functionArgs, null, 2),
        );

        const updatedRooms = functionArgs.rooms;
        console.log(
          "[data.js/updateRoomContext] Updated rooms:",
          JSON.stringify(updatedRooms, null, 2),
        );

        // Iterate over the updated rooms
        updatedRooms.forEach((updatedRoom) => {
          // Check if the room already exists in userData.locations
          const existingRoomIndex = userData.locations.findIndex(
            (location) => location.room_id === updatedRoom.room_id,
          );

          if (existingRoomIndex !== -1) {
            // If the room exists, update its properties
            userData.locations[existingRoomIndex] = {
              ...userData.locations[existingRoomIndex],
              ...updatedRoom,
            };
          } else {
            // If the room doesn't exist, add it to userData.locations
            userData.locations.push(updatedRoom);
          }
        });

        await fs.writeFile(
          filePaths.room,
          JSON.stringify(userData.locations, null, 2),
        );
        console.log(
          `[data.js/updateRoomContext] Updated user data saved for ID: ${userId}`,
        );
      } else {
        console.log(
          "[data.js/updateRoomContext] Unexpected function call:",
          toolCall.function.name,
        );
      }
    } else {
      console.log(
        "[data.js/updateRoomContext] No function call detected in the model's response.",
      );
    }
  } catch (error) {
    console.error(
      "[data.js/updateRoomContext] Failed to update room context:",
      error,
    );
    throw error;
  }
}

async function updatePlayerContext(userId) {
  console.log(
    "[data.js/updatePlayerContext] Starting with the latest message.",
  );

  const filePaths = await ensureUserDirectoryAndFiles(userId);

  // Initialize conversationHistory as an empty array
  let conversationHistory = [];

  try {
    const conversationData = await fs.readFile(filePaths.conversation, "utf8");
    const parsedData = JSON.parse(conversationData);

    // Check if conversationHistory exists and is an array before attempting to slice it
    if (parsedData && Array.isArray(parsedData.conversationHistory)) {
      conversationHistory = parsedData.conversationHistory;
    } else {
      console.warn(
        "[data.js/updatePlayerContext] conversationHistory is not an array or is missing. Initializing as an empty array.",
      );
      // Initialize conversationHistory as an empty array if it's not an array or missing
      conversationHistory = [];
    }
  } catch (error) {
    console.error(
      "[data.js/updatePlayerContext] Error reading conversation history:",
      error,
    );
    // You might decide to initialize conversationHistory as an empty array here too, to ensure further operations don't fail.
  }

  // Proceed with using conversationHistory as an array confidently
  console.log(
    "[data.js/updatePlayerContext] Retrieved Conversation History for GPT:",
    JSON.stringify(conversationHistory, null, 2),
  );

  // Read player data directly from the JSON file
  let playerData = {};
  try {
    const playerDataRaw = await fs.readFile(filePaths.player, "utf8");
    playerData = JSON.parse(playerDataRaw) || {};
  } catch (error) {
    console.error(
      "[data.js/updatePlayerContext] Error reading player data:",
      error,
    );
  }

  const playerDataJson = JSON.stringify(playerData, null, 2);
  console.log(
    "[data.js/updatePlayerContext] Player Data JSON:",
    playerDataJson,
  );

  // Formatting the last five messages for the GPT call
  let formattedHistory = "";
  if (conversationHistory && conversationHistory.length > 0) {
    formattedHistory = conversationHistory
      .map(
        (msg) =>
          `#${msg.messageId} [${msg.timestamp}]:\nUser: ${msg.userPrompt}\nAssistant: ${msg.response}`,
      )
      .join("\n\n");
  }
  console.log(
    "[data.js/updatePlayerContext] Formatted Conversation History for GPT:",
    formattedHistory,
  );

  const messages = [
    {
      role: "system",
      content: `You are a world class dungeon master and you are crafting a game for this user based on the old text based adventures like Zork. Analyze the following conversation and the latest interaction to update the game's context, feel free to fill in the blanks if the dialogue is missing anything. Here is the current player data from the player.json file: ${playerDataJson}. Take this data and update with anything new based on the latest conversation update. For instance if the player takes something from the room, you must add it to their inventory. You must include the original data as well if you are adding new data to it because we will overwrite the old entry with the new one. If there are multiple players, return an array of player objects. For instance, if there is another character in the room, immediately create that player record with as much detail as possible.`,
    },
    {
      role: "user",
      content: `Last five messages:\n${formattedHistory}`,
    },
  ];

  const tools = [
    {
      type: "function",
      function: {
        name: "update_player_context",
        description:
          "Identify every character in the room and add them to the array below, generating as many characters as needed to match the conversation details. Update the player context based on the latest conversations. The function should output structured data regarding the player's or players' state, including player details and inventory. If there is nothing new but there was content there before, output the previous content again. If there is no content for the field, return nothing. If there are multiple players, return an array of player objects.",
        parameters: {
          type: "object",
          properties: {
            players: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  player_name: {
                    type: "string",
                    description:
                      "The name of the player, likely this is the hero's name in the story but the player can change that.",
                  },
                  player_id: {
                    type: "integer",
                    description:
                      "A unique identifier for the player, such as a sequential number like 1, 2, 3...",
                  },
                  player_type: {
                    type: "string",
                    description:
                      "If the user who is playing the game is this character, mark as 'user' If this is a computer generated character then mark as computer_controlled: ally, villian, neutral.",
                  },
                  player_looks: {
                    type: "string",
                    description:
                      "Describe what the character looks like and what they are wearing.",
                  },
                  player_location: {
                    type: "string",
                    description: "Room or place the player is currently in.",
                  },
                  inventory: {
                    type: "string",
                    description:
                      "These are the items the player already has in inventory or they take from another player or from the rooms.",
                  },
                  player_health: {
                    type: "string",
                    description:
                      "The current health status of the player. This should start at 100 but if they get hungry or get hurt this should decrease. Zero health means the player is dead.",
                  },
                },
                required: [
                  "player_name",
                  "player_id",
                  "player_type",
                  "player_looks",
                  "player_location",
                  "inventory",
                  "player_health",
                ],
              },
            },
          },
          required: ["players"],
        },
      },
    },
  ];

  try {
    console.log("Calling OpenAI API with the prepared messages and tools.");
    console.log(
      "Data sent to GPT:",
      JSON.stringify({ messages, tools }, null, 2),
    );

    const response = await openai.chat.completions.create({
      model: "gpt-4-1106-preview",
      messages: messages,
      tools: tools,
      tool_choice: "auto",
    });

    console.log("Raw OpenAI API response:", JSON.stringify(response, null, 2));

    const responseMessage = response.choices[0].message;
    console.log("Response Message:", JSON.stringify(responseMessage, null, 2));

    // Check if the model wanted to call a function
    console.log("[data.js/updatePlayerContext] Checking for function calls...");
    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      const functionCall = responseMessage.tool_calls[0];
      console.log(
        "[data.js/updatePlayerContext] Function call:",
        JSON.stringify(functionCall, null, 2),
      );

      if (functionCall.function.name === "update_player_context") {
        const functionArgs = JSON.parse(functionCall.function.arguments);
        console.log(
          "[data.js/updatePlayerContext] Function arguments:",
          JSON.stringify(functionArgs, null, 2),
        );

        const updatedPlayers = functionArgs.players;
        console.log(
          "[data.js/updatePlayerContext] Updated players:",
          JSON.stringify(updatedPlayers, null, 2),
        );

        // Update the existing player data with the received updates
        playerData = playerData.map((player) => {
          const updatedPlayer = updatedPlayers.find(
            (p) => p.player_id === player.player_id,
          );
          return updatedPlayer ? { ...player, ...updatedPlayer } : player;
        });

        // Add new players that don't exist in the current data
        updatedPlayers.forEach((updatedPlayer) => {
          if (
            !playerData.some((p) => p.player_id === updatedPlayer.player_id)
          ) {
            playerData.push(updatedPlayer);
          }
        });

        // Save updated player data to the player.json file
        await fs.writeFile(
          filePaths.player,
          JSON.stringify(playerData, null, 2),
        );
        console.log(
          `[data.js/updatePlayerContext] Updated player data saved for ID: ${userId}`,
        );

        return JSON.stringify(playerData); // Or any other info you need to return
      } else {
        console.log(
          "[data.js/updatePlayerContext] Unexpected function call:",
          functionCall.function.name,
        );
        return null; // Handle unexpected function call
      }
    } else {
      console.log(
        "[data.js/updatePlayerContext] No function call detected in the model's response.",
      );
      return responseMessage.content; // Handle no function call
    }
  } catch (error) {
    console.error(
      "[data.js/updatePlayerContext] Failed to update player context:",
      error,
    );
    throw error;
  }
}

module.exports = { updateRoomContext, updatePlayerContext };
