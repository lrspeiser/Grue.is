//data.js - never remove this comment
const { getDbClient } = require('./dbClient');
const { ref, set, get, remove } = require("firebase/database"); // Correct import for Firebase database functions
const db = getDbClient();

const fs = require("fs").promises;
const path = require("path");
const { ensureUserDirectoryAndFiles, getUserData } = require("./util");

const OpenAIApi = require("openai"); //never change this
const openai = new OpenAIApi(process.env.OPENAI_API_KEY); //never change this

async function updateStoryContext(userId) {
  console.log("[data.js/updateStoryContext] Starting updateStoryContext");

  await ensureUserDirectoryAndFiles(userId);
  console.log("[data.js/updateStoryContext] User data ensured in ReplDB");

  const userData = await getUserData(userId);
  console.log("[data.js/updateStoryContext] User data:", userData);

  // Define dbClient here by calling getDbClient()
  const dbClient = await getDbClient();

  let storyDataResponse = await dbClient.get(`${userId}_story`);
  let storyData = storyDataResponse ? storyDataResponse.value : {};
  console.log(
    "[data.js/updateStoryContext] Retrieved story data from ReplDB:",
    JSON.stringify(storyData),
  );

  console.log(
    "[data.js/updateStoryContext] Retrieved Conversation History for GPT",
  );
  const storyDataJson = JSON.stringify(storyData, null, 2);
  console.log("[data.js/updateStoryContext] Story Data JSON");

  let formattedHistory = "";
  if (userData.conversationHistory && Array.isArray(userData.conversationHistory)) {
    // Get only the last 5 messages
    const lastFiveMessages = userData.conversationHistory.slice(-5);
    formattedHistory = lastFiveMessages
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
      content: `Based on the conversation history and the existing story data, generate an updated story outline that incorporates the user's preferences and characteristics. If the user is trying to quit the game and we've confirmed with them they do, set the active_game to false. Also, if they die, health goes to zero, or if they behave badly, set it to false. It is important that we continue to collect the users preferences and behaviors so we can customize the game for them.`,
    },
  ];

  const tools = [
    {
      type: "function",
      function: {
        name: "update_story_context",
        description:
          "Based on the conversation history and the existing story data, generate an updated story outline that incorporates the user's preferences and characteristics. If the user is trying to quit the game and we've confirmed with them they do, set the active_game to false. Also, if they die, health goes to zero, or if they behave badly, set it to false. It is important that we continue to collect the users preferences and behaviors so we can customize the game for them.",
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
                active_game: {
                  type: "boolean",
                  description:
                    "This should only be set to true when you have enough information to officially start the game. If you are still asking the user questions to figure out what they want, keep as false. As soon as you have enough information to populate the game_description and character_played_by_user, set this to true. If the user quits or are kicked out for bad behavior or they win/lose the game, set to false again.",
                },
                character_played_by_user: {
                  type: "string",
                  description:
                    "This will be the character played by the user in the story.",
                },
                game_description: {
                  type: "string",
                  description:
                    "The description of the game the user is playing. Some details of the world and what they might need to overcome.",
                },
                player_profile: {
                  type: "string",
                  description:
                    "Every time the user types something, you should be able to get information about them to fill in this area. Even when they start you can use what they told you to describe the kind of person they might be. Anytime the user expresses a preference to the AI, like to stop doing something or to do something different, record it in this field. As the user plays the game, collect more information about their style based on what they submit and how they react to the game. Are they sarcastic or serious? How serious of a gamer are they? Do they like to talk to characters or take actions? Are they kind or mean? Are they young or old? Naive or mature? Build a full profile of the user. Limit this to 100 words, if it goes longer then rewrite it. This is very important for the game play.",
                },
              },
              required: [
                "language_spoken",
                "favorite_author",
                "favorite_story",
                "active_game",
                "game_description",
                "character_played_by_user",
                "player_profile",
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
        await dbClient.set(`${userId}_story`, storyData);
        console.log(
          `[data.js/updateStoryContext] Updated story data saved in ReplDB for ID: ${userId}`,
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

  await ensureUserDirectoryAndFiles(userId);
  const userData = await getUserData(userId);

  if (!Array.isArray(userData.locations)) {
    userData.locations = [];
  }

  // Get the most recent 5 messages from the conversation history
  const recentMessages = userData.conversationHistory && Array.isArray(userData.conversationHistory)
  ? userData.conversationHistory.slice(-5)
  : [];
  
  // Format the recent messages for GPT
  const conversationForGPT = recentMessages
    .map(
      (message) =>
        `User: ${message.userPrompt}\nAssistant: ${message.response}`,
    )
    .join("\n\n");

  console.log("[data.js/updateRoomContext] conversationForGPT");

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
      content: `You must list as many rooms or locations are described in the conversation in the below array. If the user goes in a direction, you must create a new room or location for that direction. If there are available directions for the user to go in, create those rooms or locations in preparation for them to go in those directions. If the room already exists, update the room context based on the latest conversation by including the original data and making the changes based on the latest details. The function should output an array of structured data regarding each room's state, including room details and item interactions.`,
    },
  ];

  const tools = [
    {
      type: "function",
      function: {
        name: "update_room_context",
        description:
          "You must list as many rooms or locations are described in the conversation in the below array. If the user goes in a direction, you must create a new room or location for that direction. If there are available directions for the user to go in, create those rooms or locations in preparation for them to go in those directions. If the room already exists, update the room context based on the latest conversation by including the original data and making the changes based on the latest details. The function should output an array of structured data regarding each room's state, including room details and item interactions.",
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
                    description:
                      "Computer generated characters in the room. Always use names for characters.",
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
                      "Indicate the messageIds from the conversation history when the player was in this room. Example: 1, 2, 3. When the player moves rooms, record that messageId in the new room. Don't make up any ids for this, if you don't see it in the conversation message ids, then leave this blank.",
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

        // Read all the existing rooms from ReplDB
        const dbClient = await getDbClient();
        const existingRooms = (await dbClient.get(`${userId}_locations`)) || [];

        // Create a map of existing rooms by room_id for faster lookup
        const existingRoomsMap = new Map(
          existingRooms.map((room) => [room.room_id, room]),
        );

        // Iterate over the updated rooms
        updatedRooms.forEach((updatedRoom) => {
          // Check if the room already exists in the map
          if (existingRoomsMap.has(updatedRoom.room_id)) {
            // If the room exists, update its properties
            const existingRoom = existingRoomsMap.get(updatedRoom.room_id);
            Object.assign(existingRoom, updatedRoom);
          } else {
            // If the room doesn't exist, add it to the map
            existingRoomsMap.set(updatedRoom.room_id, updatedRoom);
          }
        });

        // Convert the map values back to an array
        const updatedLocations = Array.from(existingRoomsMap.values());

        // Update ReplDB with the updated locations
        await dbClient.set(`${userId}_locations`, updatedLocations);
        console.log(
          `[data.js/updateRoomContext] Updated room data saved in ReplDB for user ID: ${userId}`,
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

  await ensureUserDirectoryAndFiles(userId);

  const userData = await getUserData(userId);
  const conversationHistory = userData.conversationHistory || [];

  console.log(
    "[data.js/updatePlayerContext] Retrieved Conversation History for GPT:",
    JSON.stringify(conversationHistory, null, 2),
  );

  // Read player data directly from ReplDB
  const dbClient = await getDbClient();
  let playerData = (await dbClient.get(`${userId}_player`)) || {};

  const playerDataJson = JSON.stringify(playerData, null, 2);
  console.log(
    "[data.js/updatePlayerContext] Player Data JSON:",
    playerDataJson,
  );

  // Read story data directly from ReplDB
  let storyData = (await dbClient.get(`${userId}_story`)) || {};

  const storyDataJson = JSON.stringify(storyData, null, 2);
  console.log("[data.js/updatePlayerContext] Story Data JSON:", storyDataJson);

  let formattedHistory = "";
  if (conversationHistory && conversationHistory.length > 0) {
    // Get only the last 5 messages
    const lastFiveMessages = conversationHistory.slice(-5);
    formattedHistory = lastFiveMessages
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
      content: `You are a world class dungeon master and you are crafting a game for this user based on the old text based adventures like Zork. Analyze the following conversation and the latest interaction to update the game's context, feel free to fill in the blanks if the dialogue is missing anything. This function will describe every character in the world as we encounter them. Even if we don't know the name, fill out as much as possible in the function below. Here is the story and user data: ${storyDataJson}. Here are all the characters we know so far: ${playerDataJson}. Last five messages:\n${formattedHistory} Take this data and update with anything new based on the latest conversation update. For instance if the player takes something from the room, you must add it to their inventory. You must include the original data as well if you are adding new data to it because we will overwrite the old entry with the new one. If there are multiple players, return an array of player objects. For instance, if there is another character in the room, immediately create that player record with as much detail as possible. Also, if the user says they want to quit the game take their health score to 0. That will reset the game and erase all their data so be sure that is what they want. Also, if the user is violating the rules we will say in the response that a grue has killed them and you should also set their health to zero.`,
    },
    {
      role: "user",
      content: `You must identify every character in the location from the dialogue and add them to the array below, generating as many characters as needed to match the conversation details. If the conversation doesn't have much detail, take the concept of the story and make up the details to fit that, including the name of the character, their appearance, their friend or foe status, and any items they might have on them. Update the player context based on the latest conversations. The function should output structured data regarding the player's or players' state, including player details and inventory. If there is nothing new but there was content there before, output the previous content again. If there is no content for the field, return nothing. Most locations will have multiple characters in the game and you must return an array of players with their details.`,
    },
  ];

  const tools = [
    {
      type: "function",
      function: {
        name: "update_player_context",
        description:
          "You must identify every character in the location from the dialogue and add them to the array below, generating as many characters as needed to match the conversation details. If the conversation doesn't have much detail, take the concept of the story and make up the details to fit that, including the name of the character, their appearance, their friend or foe status, and any items they might have on them. Update the player context based on the latest conversations. The function should output structured data regarding the player's or players' state, including player details and inventory. If there is nothing new but there was content there before, output the previous content again. If there is no content for the field, return nothing. Most locations will have multiple characters in the game and you must return an array of players with their details.",
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

          // Reset favorite_author and favorite_story in story data
          storyData.favorite_author = "";
          storyData.favorite_story = "";
          await dbClient.set(`${userId}_story`, storyData);

          // Reset conversation, player, room, and quest data
          const initData = {
            conversationHistory: [],
            room: [],
            player: [],
            quest: [],
          };
          await Promise.all([
            dbClient.set(
              `${userId}_conversation`,
              initData.conversationHistory,
            ),
            dbClient.set(`${userId}_room`, initData.room),
            dbClient.set(`${userId}_player`, initData.player),
            dbClient.set(`${userId}_quest`, initData.quest),
          ]);

          console.log("[data.js/updatePlayerContext] Game reset completed.");
          return null; // Return null to indicate game reset
        }

        // Read the existing player data from ReplDB
        let existingPlayerData = (await dbClient.get(`${userId}_player`)) || [];

        // Create a map of existing players by player_id for faster lookup
        const existingPlayersMap = new Map(
          existingPlayerData.map((player) => [player.player_id, player]),
        );

        // Iterate over the updated players
        updatedPlayers.forEach((updatedPlayer) => {
          // Check if the player already exists in the map
          if (existingPlayersMap.has(updatedPlayer.player_id)) {
            // If the player exists, update its properties
            const existingPlayer = existingPlayersMap.get(
              updatedPlayer.player_id,
            );
            Object.assign(existingPlayer, updatedPlayer);
          } else {
            // If the player doesn't exist, add it to the map
            existingPlayersMap.set(updatedPlayer.player_id, updatedPlayer);
          }
        });

        // Convert the map values back to an array
        const updatedPlayerData = Array.from(existingPlayersMap.values());

        // Save updated player data to ReplDB
        await dbClient.set(`${userId}_player`, updatedPlayerData);
        console.log(
          `[data.js/updatePlayerContext] Updated player data saved in ReplDB for user ID: ${userId}`,
        );

        return JSON.stringify(updatedPlayerData); // Or any other info you need to return
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

async function updateQuestContext(userId) {
  console.log(
    "[data.js/updateQuestContext] Starting updateQuestContext with the latest message and conversation history.",
  );

  await ensureUserDirectoryAndFiles(userId);
  const userData = await getUserData(userId);

  if (!Array.isArray(userData.quest)) {
    userData.quest = [];
  }

  // Read story data directly from ReplDB
  const dbClient = await getDbClient();
  let storyData = (await dbClient.get(`${userId}_story`)) || {};

  const storyDataJson = JSON.stringify(storyData, null, 2);
  console.log("[data.js/updateQuestContext] Story Data JSON:", storyDataJson);

  // Get the most recent 5 messages from the conversation history
  const recentMessages = userData.conversationHistory && Array.isArray(userData.conversationHistory)
  ? userData.conversationHistory.slice(-5)
  : [];
  
  // Format the recent messages for GPT
  const conversationForGPT = recentMessages
    .map(
      (message) =>
        `User: ${message.userPrompt}\nAssistant: ${message.response}`,
    )
    .join("\n\n");

  console.log("[data.js/updateQuestContext] conversationForGPT");

  const messages = [
    {
      role: "system",
      content: `You are a world class dungeon master and you are crafting a game for this user based on the old text based adventures like Zork. Analyze the following conversation and the latest interaction to update the game's context. Then extract the data about the quests into the fields. There should always be two active quests at all time. If a quest gets over 50% complete, you should create another quest. Make quests very specific and actionable, don't make their goals vague. Take this data and update with anything new based on the latest conversation update. Add more quests anytime the player interacts in the game and it seems like a good opportunity to introduce more quests.`,
    },
    {
      role: "system",
      content: `Story data: Here is the story and user data: ${storyDataJson}. Current quest data: ${JSON.stringify(userData.quests)} and Message History:\n${conversationForGPT}`,
    },
    {
      role: "user",
      content: `You must continue to create quests based on the latest dialogue. If the quest already exists, update the quest context based on the latest conversation by including the original data and making the changes based on the latest details. The function should output an array of structured data regarding each quests state.`,
    },
  ];

  const tools = [
    {
      type: "function",
      function: {
        name: "update_quest_context",
        description:
          "User the conversation details to create quests that the story can use to give the user challenges. Make sure there are always several possible quests and make them very specific. Unless they are easy make sure to define the steps the user might have to complete to win the quest. If the quest already exists, update the quest context based on the latest conversation by including the original data and making the changes based on the latest details. The function should output an array of structured data regarding each quests state.",
        parameters: {
          type: "object",
          properties: {
            quests: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  quest_id: {
                    type: "string",
                    description:
                      "A unique identifier for the quest, such as a sequential number like 1, 2, 3... Never replace an old quest with a new one, always generate a new number.",
                  },
                  quest_name: {
                    type: "string",
                    description: "The name of the quest.",
                  },
                  quest_giver: {
                    type: "string",
                    description:
                      "The NPC or character who gave the quest. This might be needed so the user can come back to complete the quest and get their prize from the giver of the quest.",
                  },
                  quest_goal: {
                    type: "string",
                    description:
                      "The objective or goal of the quest. This must be very specific and actionable like get me an item, eliminate a foe, return a person to me, etc.",
                  },
                  quest_characters: {
                    type: "string",
                    description:
                      "The characters involved in the quest and why the user needs to interact with them to complete the quest. You might ask them to find someone specific or avoid certain people or defeat these people.",
                  },
                  quest_reward: {
                    type: "string",
                    description:
                      "The reward for completing the quest, such as items, information or money. Be specific.",
                  },
                  quest_difficulty: {
                    type: "string",
                    description:
                      "The difficulty level of the quest (e.g., very easy, easy, medium, hard, so hard). Generally the first quests should be very easy. Easy means it only takes a couple of turns to win it. As it gets harder they should have to do more to win the quest and that will take more thinking, risk and turns. Give the risks to the user for taking on the quest including their chance of getting killed trying to take it on.",
                  },
                  quest_type: {
                    type: "string",
                    description:
                      "The type of quest (e.g., puzzle, defeat enemy, obtain item, obtain information, find a person). Be specific on what they have to do to solve the quest.",
                  },
                  quest_completed_percentage: {
                    type: "integer",
                    description:
                      "The percentage of the quest that has been completed (0-100). Quests always start at 0%.",
                  },
                },
                required: [
                  "quest_id",
                  "quest_name",
                  "quest_giver",
                  "quest_goal",
                  "quest_characters",
                  "quest_reward",
                  "quest_difficulty",
                  "quest_type",
                  "quest_completed_percentage",
                ],
              },
            },
          },
          required: ["quests"],
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
      "[data.js/updateQuestContext] Response Message:",
      JSON.stringify(responseMessage, null, 2),
    );

    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      const toolCall = responseMessage.tool_calls[0];
      console.log(
        "[data.js/updateQuestContext] Function call:",
        JSON.stringify(toolCall, null, 2),
      );

      if (toolCall.function.name === "update_quest_context") {
        const functionArgs = JSON.parse(toolCall.function.arguments);
        console.log(
          "[data.js/updateQuestContext] Function arguments:",
          JSON.stringify(functionArgs, null, 2),
        );

        const updatedQuests = functionArgs.quests;
        console.log(
          "[data.js/updateQuestContext] Updated quests:",
          JSON.stringify(updatedQuests, null, 2),
        );

        // Read existing quests from ReplDB
        const existingQuests = (await dbClient.get(`${userId}_quest`)) || [];

        // Create a map of existing quests by quest_id for faster lookup
        const existingQuestsMap = new Map(
          existingQuests.map((quest) => [quest.quest_id, quest]),
        );

        // Iterate over the updated quests
        updatedQuests.forEach((updatedQuest) => {
          // Check if the quest already exists in the map
          if (existingQuestsMap.has(updatedQuest.quest_id)) {
            // If the quest exists, update its properties
            const existingQuest = existingQuestsMap.get(updatedQuest.quest_id);
            Object.assign(existingQuest, updatedQuest);
          } else {
            // If the quest doesn't exist, add it to the map
            existingQuestsMap.set(updatedQuest.quest_id, updatedQuest);
          }
        });

        // Convert the map values back to an array
        const updatedQuestData = Array.from(existingQuestsMap.values());

        // Save updated quests to ReplDB
        await dbClient.set(`${userId}_quest`, updatedQuestData);
        console.log(
          `[data.js/updateQuestContext] Updated quest data saved in ReplDB for user ID: ${userId}`,
        );
      } else {
        console.log(
          "[data.js/updateQuestContext] Unexpected function call:",
          toolCall.function.name,
        );
      }
    } else {
      console.log(
        "[data.js/updateQuestContext] No function call detected in the model's response.",
      );
    }
  } catch (error) {
    console.error(
      "[data.js/updateQuestContext] Failed to update quest context:",
      error,
    );
    throw error;
  }
}

module.exports = {
  updateRoomContext,
  updatePlayerContext,
  updateStoryContext,
  updateQuestContext,
};
