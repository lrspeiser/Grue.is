const fs = require("fs").promises;
const path = require("path");
const {
  ensureUserDirectoryAndFiles,
  getUserData,
  isStoryDataPopulated,
} = require("./util");

const OpenAIApi = require("openai"); //never change this
const openai = new OpenAIApi(process.env.OPENAI_API_KEY); //never change this

async function updateStoryContext(userId) {
  console.log("[data.js/updateStoryContext] Starting updateStoryContext");

  const filePaths = await ensureUserDirectoryAndFiles(userId);
  console.log("[data.js/updateStoryContext] File paths:", filePaths);

  const userData = await getUserData(filePaths);
  console.log("[data.js/updateStoryContext] User data:", userData);

  let storyData = {};
  try {
    const storyDataRaw = await fs.readFile(filePaths.story, "utf8");
    console.log("[data.js/updateStoryContext] Raw story data");
    storyData = JSON.parse(storyDataRaw) || {};
  } catch (error) {
    console.error(
      "[data.js/updateStoryContext] Error reading story data:",
      error,
    );
    storyData = {}; // Initialize with an empty object if the file doesn't exist or is empty
  }

  console.log(
    "[data.js/updateStoryContext] Retrieved Conversation History for GPT");
  const storyDataJson = JSON.stringify(storyData, null, 2);
  console.log("[data.js/updateStoryContext] Story Data JSON");

  let formattedHistory = "";
  if (userData.conversationHistory && userData.conversationHistory.length > 0) {
    formattedHistory = userData.conversationHistory
      .map(
        (msg) =>
          `#${msg.messageId} [${msg.timestamp}]:\nUser: ${msg.userPrompt}\nAssistant: ${msg.response}`,
      )
      .join("\n\n");
  }
  console.log(
    "[data.js/updateStoryContext] Formatted Conversation History for GPT:",
    formattedHistory,
  );

  const messages = [
    {
      role: "system",
      content: `You are a world-class storyteller and you are crafting a personalized story for this user. Please use the following conversation history and the existing story data to update the story json file. Here is the current story data from the story.json file: ${storyDataJson} and the last few messages: Message History:\n${formattedHistory}. Take this data and update it with anything new based on the latest conversation update. You must include the original data as well if you are adding new data to it because we will overwrite the old entry with the new one.`,
    },
    {
      role: "user",
      content: `Based on the conversation history and the existing story data, generate an updated story outline that incorporates the user's preferences and characteristics. The function should output an object with the following fields: language_spoken, favorite_author, favorite_story, like_puzzles, like_fighting, character_played_by_user.`,
    },
  ];

  const tools = [
    {
      type: "function",
      function: {
        name: "update_story_context",
        description:
          "Based on the conversation history and the existing story data, generate an updated story outline that incorporates the user's preferences and characteristics. The function should output an object with the following fields: language_spoken, favorite_author, favorite_story, like_puzzles, like_fighting, character_played_by_user.",
        parameters: {
          type: "object",
          properties: {
            story_details: {
              type: "object",
              properties: {
                language_spoken: {
                  type: "string",
                  description:
                    "The language the user prefers to use in the story.",
                },
                favorite_author: {
                  type: "string",
                  description: "The user's favorite author.",
                },
                favorite_story: {
                  type: "string",
                  description:
                    "The user's favorite story from a movie or book.",
                },
                like_puzzles: {
                  type: "boolean",
                  description:
                    "Whether the user enjoys solving puzzles and riddles.",
                },
                like_fighting: {
                  type: "boolean",
                  description:
                    "Whether the user enjoys physical combat and fighting in the story.",
                },
                character_played_by_user: {
                  type: "string",
                  description: "This will be the character played by the user in the story.",
                },
              },
              required: [
                "language_spoken",
                "favorite_author",
                "favorite_story",
                "like_puzzles",
                "like_fighting",
                "character_played_by_user",
              ],
            },
          },
          required: ["story_details"],
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
      model: "gpt-4-0125-preview",
      messages: messages,
      tools: tools,
      tool_choice: "auto",
    });

    const responseMessage = response.choices[0].message;
    console.log(
      "[data.js/updateStoryContext] Response Message:",
      JSON.stringify(responseMessage, null, 2),
    );

    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      const toolCall = responseMessage.tool_calls[0];
      console.log(
        "[data.js/updateStoryContext] Function call:",
        JSON.stringify(toolCall, null, 2),
      );

      if (toolCall.function.name === "update_story_context") {
        const functionArgs = JSON.parse(toolCall.function.arguments);
        console.log(
          "[data.js/updateStoryContext] Function arguments:",
          JSON.stringify(functionArgs, null, 2),
        );

        storyData = functionArgs.story_details;

        await fs.writeFile(filePaths.story, JSON.stringify(storyData, null, 2));
        console.log(
          `[data.js/updateStoryContext] Updated story data saved for ID: ${userId}`,
        );
      } else {
        console.log(
          "[data.js/updateStoryContext] Unexpected function call:",
          toolCall.function.name,
        );
      }
    } else {
      console.log(
        "[data.js/updateStoryContext] No function call detected in the model's response.",
      );
    }
  } catch (error) {
    console.error(
      "[data.js/updateStoryContext] Failed to update story context:",
      error,
    );
    throw error;
  }
}

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
    "[data.js/updateRoomContext] conversationForGPT");

  const messages = [
    {
      role: "system",
      content: `You are a world class dungeon master and you are crafting a game for this user based on the old text based adventures like Zork. Analyze the following conversation and the latest interaction to update the game's context, feel free to fill in the blanks if the dialogue is missing anything. Analyze the following conversation and the latest interaction to update the game's context. Then extract the data about the room into the fields. If any, here is the current location data where the player may be or has been in the past: ${JSON.stringify(userData.locations)}. Take this data and update with anything new based on the latest conversation update. That means if we need to add anything, you must include the original data in the output or it will be deleted. If it is a new location, create it. Make sure that when the player moves to a new room or location, that you remove them from the previous room and add them to the new room. I character can only ever be in one room at a time and the last response message is the final decider if the character is moving between rooms.`,
    },
    {
      role: "system",
      content: `Current room data: ${JSON.stringify(userData.room)} and Message History:\n${conversationForGPT}`,
    },
    {
      role: "user",
      content: `You must list as many rooms or locations are described in the conversation in the below array. If the room already exists, update the room context based on the latest conversation by including the original data and making the changes based on the latest details. The function should output an array of structured data regarding each room's state, including room details and item interactions.`,
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
      model: "gpt-4-0125-preview",
      messages: messages,
      tools: tools,
      tool_choice: "auto",
    });

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

        // Preserve existing rooms that were not updated
        const existingRooms = userData.locations.filter(
          (location) =>
            !updatedRooms.some((room) => room.room_id === location.room_id),
        );

        // Combine updated and existing rooms
        userData.locations = [...updatedRooms, ...existingRooms];

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
      content: `You are a world class dungeon master and you are crafting a game for this user based on the old text based adventures like Zork. Analyze the following conversation and the latest interaction to update the game's context, feel free to fill in the blanks if the dialogue is missing anything. This function will describe every character in the world as we encounter them. Even if we don't know the name, fill out as much as possible in the function below. Here are all the characters we know so far: ${playerDataJson}. Last five messages:\n${formattedHistory} Take this data and update with anything new based on the latest conversation update. For instance if the player takes something from the room, you must add it to their inventory. You must include the original data as well if you are adding new data to it because we will overwrite the old entry with the new one. If there are multiple players, return an array of player objects. For instance, if there is another character in the room, immediately create that player record with as much detail as possible. Also, if the user says they want to quit the game take their health score to 0. That will reset the game and erase all their data so be sure that is what they want. Also, if the user is violating the rules we will say in the response that a grue has killed them and you should also set their health to zero.`,
    },
    {
      role: "user",
      content: `You must identify every character in the location from the dialogue and add them to the array below, generating as many characters as needed to match the conversation details. Update the player context based on the latest conversations. The function should output structured data regarding the player's or players' state, including player details and inventory. If there is nothing new but there was content there before, output the previous content again. If there is no content for the field, return nothing. Most locations will have multiple characters in the game and you must return an array of players with their details.`,
    },
  ];

  const tools = [
    {
      type: "function",
      function: {
        name: "update_player_context",
        description:
          "You must identify every character in the location from the dialogue and add them to the array below, generating as many characters as needed to match the conversation details. Update the player context based on the latest conversations. The function should output structured data regarding the player's or players' state, including player details and inventory. If there is nothing new but there was content there before, output the previous content again. If there is no content for the field, return nothing. Most locations will have multiple characters in the game and you must return an array of players with their details.",
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
                      "The name of the player. If the character has not been revealed yet, you must still create the name here. This should be a proper name, not a description.",
                  },
                  player_id: {
                    type: "integer",
                    description:
                      "A unique identifier for the player, such as a sequential number like 1, 2, 3...",
                  },
                  player_type: {
                    type: "string",
                    description:
                      "Most of the time this is a computer generated character then mark as 'computer_controlled: ally', 'computer_controlled: villian', 'computer_controlled: neutral'. If the user who is playing the game is this character, mark as 'user' ",
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
      model: "gpt-4-0125-preview",
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

        // Check if the user's player health has reached zero
        const userPlayer = updatedPlayers.find(
          (player) => player.player_type === "user",
        );
        if (userPlayer && userPlayer.player_health === "0") {
          console.log(
            "[data.js/updatePlayerContext] User's player health has reached zero. Resetting game.",
          );

          // Reset favorite_author and favorite_story in story.json
          const storyData = JSON.parse(
            await fs.readFile(filePaths.story, "utf8"),
          );
          storyData.favorite_author = "";
          storyData.favorite_story = "";
          await fs.writeFile(
            filePaths.story,
            JSON.stringify(storyData, null, 2),
          );

          // Reset conversation.json, player.json, and room.json
          const initPromises = [
            fs.writeFile(
              filePaths.conversation,
              JSON.stringify({ conversationHistory: [] }, null, 2),
            ),
            fs.writeFile(filePaths.room, JSON.stringify([], null, 2)),
            fs.writeFile(filePaths.player, JSON.stringify([], null, 2)),
          ];
          await Promise.all(initPromises);

          console.log("[data.js/updatePlayerContext] Game reset completed.");
          return null; // Return null to indicate game reset
        }

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

module.exports = { updateRoomContext, updatePlayerContext, updateStoryContext };
