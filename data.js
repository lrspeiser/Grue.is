//data.js
const { initializeApp, cert } = require('firebase-admin/app');
const { getStorage } = require('firebase-admin/storage');
const { Storage } = require("@google-cloud/storage");

const fs = require("fs").promises;
const path = require("path");
const {
  ensureUserDirectoryAndFiles,
  getUserData,
  writeJsonToFirebase,
  readJsonFromFirebase,
} = require("./util");

const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(serviceAccount) });
const bucket = getStorage().bucket(process.env.file_storage);

const OpenAIApi = require("openai"); //never change this
const openai = new OpenAIApi(process.env.OPENAI_API_KEY); //never change this

async function updateStoryContext(userId) {
  console.log("[data.js/updateStoryContext] Starting updateStoryContext");

  const filePaths = await ensureUserDirectoryAndFiles(userId);
  console.log("[data.js/updateStoryContext] File paths:", filePaths);

  const userData = await getUserData(filePaths);
  console.log("[data.js/updateStoryContext] User data");

  // Initialize storyData and retrieve from Firebase
  let storyData = {};
  try {
    storyData = (await readJsonFromFirebase(filePaths.story)) || {};
    console.log("[data.js/updateStoryContext] Retrieved story data");
  } catch (error) {
    console.error(
      "[data.js/updateStoryContext] Error reading story data:",
      error,
    );
    storyData = {}; // Initialize with an empty object if no data is found or an error occurs
  }

  // Formatting and preparing data for OpenAI call
  let formattedHistory = "";
  if (userData.conversation && userData.conversation.length > 0) {
    const lastFiveMessages = userData.conversation.slice(-5);
    formattedHistory = lastFiveMessages
      .map(
        (msg) =>
          `#${msg.messageId} [${msg.timestamp}]:\nUser: ${msg.userPrompt}\nAssistant: ${msg.response}`,
      )
      .join("\n\n");
  }
  console.log(
    "[data.js/updateStoryContext] Formatted Conversation History for GPT:",
  );

  const { messages, tools } = getStoryContextMessages(
    storyData,
    formattedHistory,
  );

  try {
    console.log(
      "[data.js/updateStoryContext] Calling OpenAI API with the prepared messages and tools.",
      {
        messages,
        tools,
      },
    );

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messages,
      tools: tools,
      tool_choice: "auto",
    });

    const responseMessage = response.choices[0].message;
    console.log("[data.js/updateStoryContext] Response Message");

    // Check if there are tool calls and handle them
    if (
      responseMessage &&
      responseMessage.tool_calls &&
      responseMessage.tool_calls.length > 0
    ) {
      const toolCall = responseMessage.tool_calls[0]; // Assume we only deal with one tool call for simplicity
      if (toolCall && toolCall.function && toolCall.function.arguments) {
        const functionArgs = JSON.parse(toolCall.function.arguments);
        const updatedStoryData = functionArgs.story_details; // Directly using the nested story_details

        if (updatedStoryData) {
          console.log(
            "[data.js/updateStoryContext] Updated Story Data from tool call",
          );

          // Check if active_game changed from true to false
          if (
            storyData.active_game === true &&
            updatedStoryData.active_game === false
          ) {
            console.log(
              "[data.js/updateStoryContext] active_game changed from true to false. Clearing conversation, player, room, and quest data.",
            );

            // Clear conversation, player, room, and quest data
            await writeJsonToFirebase(filePaths.conversation, []);
            await writeJsonToFirebase(filePaths.player, {});
            await writeJsonToFirebase(filePaths.room, {});
            await writeJsonToFirebase(filePaths.quest, {});

            // Reset character_played_by_user and game_description in story data
            updatedStoryData.character_played_by_user = "";
            updatedStoryData.game_description = "";
          }

          await writeJsonToFirebase(filePaths.story, updatedStoryData);
          console.log(
            "[data.js/updateStoryContext] Story data updated in Firebase for user ID:",
            userId,
          );
        } else {
          console.log(
            "[data.js/updateStoryContext] No valid story data to update.",
          );
        }
      }
    } else if (responseMessage && responseMessage.content) {
      // Handle direct content updates (fallback if needed)
      const updatedStoryData = JSON.parse(responseMessage.content);
      await writeJsonToFirebase(filePaths.story, updatedStoryData);
      console.log(
        "[data.js/updateStoryContext] Story data updated in Firebase for user ID:",
        userId,
      );
    } else {
      console.log(
        "[data.js/updateStoryContext] No update needed or provided by API.",
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

function getStoryContextMessages(storyData, formattedHistory) {
  const storyDataJson = JSON.stringify(storyData, null, 2);

  const messages = [
    {
      role: "system",
      content: `You are a world-class storyteller and you are crafting a personalized story for this user. Please use the following conversation history and the existing story data to update the story json file. Here is the current story data from the story.json file: ${storyDataJson} and the last few messages: Message History:\n${formattedHistory}. Take this data and update it with anything new based on the latest conversation update. You must include the original data as well if you are adding new data to it because we will overwrite the old entry with the new one.`,
    },
    {
      role: "user",
      content: `Based on the conversation history and the existing story data, generate an updated story outline that incorporates the user's preferences and characteristics. If the user is trying to quit the game and after you asked them in a follow up conversation thread if they are sure they want to quit and they still said they wanted to quit, set the active_game to false. Also, if they die, health goes to zero, or if they behave badly, set it to false. It is important that we continue to collect the users preferences and behaviors so we can customize the game for them.`,
    },
  ];

  const tools = [
    {
      type: "function",
      function: {
        name: "update_story_context",
        description:
          "Based on the conversation history and the existing story data, generate an updated story outline that incorporates the user's preferences and characteristics. If the user is trying to quit the game and after you asked them in a follow up conversation thread if they are sure they want to quit and they still said they wanted to quit, set the active_game to false. Also, if they die, health goes to zero, or if they behave badly, set it to false. It is important that we continue to collect the users preferences and behaviors so we can customize the game for them.",
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
                narrator_style: {
                  type: "string",
                  description:
                    "This should be the voice of the narrator of this story. This will likely be an author that best represents the story telling we want. For instance if this were old england we might say 'Narrate this story in the style of William Shakespeare' or if this were Star Wars say 'Write the story and dialogue as though you are George Lucas.'",
                },
                favorite_story: {
                  type: "string",
                  description:
                    "The user's favorite story from a movie or book.",
                },
                active_game: {
                  type: "boolean",
                  description:
                    "The response from GPT in the conversation thread should indicate that the game will officially start and describe what the world will be. This is when you set this to true. This should only be set to true when you have enough information to officially start the game. If you are still asking the user questions to figure out what they want, keep as false. As soon as you have enough information to populate the game_description and character_played_by_user, set this to true. If the user quits or are kicked out for bad behavior or they win/lose the game, set to false again.",
                },
                character_played_by_user: {
                  type: "string",
                  description:
                    "This will be the character played by the user in the story. If there is no name given for their player, create one that makes the most sense, usually the hero in the story.",
                },
                player_level: {
                  type: "string",
                  description:
                    "The player starts at level 1. Every time they solve a quest increment them up 1 level. Represent this as: 'You are now level X/100. You went up one more level by solving the <name of quest> quest.'",
                },
                player_health: {
                  type: "string",
                  description:
                    "This will start at 100. This is based on how well the player takes care of themselves. If they get hurt in a battle or exhaust themselves or don't eat, this would change. For example: You are getting hungry. or You have a bag cut across your head and will die if you do not get help. Health is 20/100.",
                },
                player_attitude: {
                  type: "string",
                  description:
                    "This is how the character behaves in the world. If they are nice to other characters or mean. If they do bad things or good things. For example: You are hated by the people of this world because you are always killing people. Or You are well loved by the people for all the good you do.",
                },
                player_special_abilities: {
                  type: "string",
                  description:
                    "These are the special abilities your character has in this world. For instance if you were a spy you might speak many languages and be an excellent shot. Or if you were a Wizard you might have an affinity to water magic. These can change as you train up within the world.",
                },
                game_description: {
                  type: "string",
                  description:
                    "The description of the game the user is playing. Some details of the world and what they might need to overcome. List five challenges here that the player might need to overcome while playing. Also, list out the main areas of the world they will travel through.",
                },
                player_profile: {
                  type: "string",
                  description:
                    "Every time the user types something, you should be able to get information about them to fill in this area. Even when they start you can use what they told you to describe the kind of person they might be. Anytime the user expresses a preference to the AI, like to stop doing something or to do something different, record it in this field. As the user plays the game, collect more information about their style based on what they submit and how they react to the game. Are they sarcastic or serious? How serious of a gamer are they? Do they like to talk to characters or take actions? Are they kind or mean? Are they young or old? Naive or mature? Build a full profile of the user. Limit this to 100 words, if it goes longer then rewrite it. This is very important for the game play.",
                },
                image_description: {
                  type: "string",
                  description:
                    "Using the latest details, provide a prompt for DALL-E to generate an image that shows where the user is in the story. For instance: This is a dark cellar with a fireplace. There is a table with a key on it. There is a door that is locked. Our hero is wearing a trenchcoat and using a flashlight to expose a secret keyhole in the wall.",
                },
              },
              required: [
                "language_spoken",
                "narrator_style",
                "favorite_story",
                "active_game",
                "game_description",
                "player_level",
                "player_health",
                "player_attitude",
                "player_special_abilities",
                "character_played_by_user",
                "player_profile",
                "image_description",
              ],
            },
          },
          required: ["story_details"],
        },
      },
    },
  ];

  return { messages, tools };
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

  // Read room data from Firebase
  let roomData = {};
  try {
    roomData = (await readJsonFromFirebase(filePaths.room)) || {};
    console.log(
      "[data.js/updateRoomContext] Retrieved Room Data from Firebase:",
    );
  } catch (error) {
    console.error(
      "[data.js/updateRoomContext] Error reading room data from Firebase:",
      error,
    );
  }

  // Get the most recent 5 messages from the conversation history
  const recentMessages = userData.conversation.slice(-5);

  // Format the recent messages for GPT
  const conversationForGPT = recentMessages
    .map(
      (message) =>
        `User: ${message.userPrompt}\nAssistant: ${message.response}`,
    )
    .join("\n\n");

  console.log("[data.js/updateRoomContext] conversationForGPT");

  const { messages, tools } = getRoomContextMessages(
    userData.locations,
    roomData,
    conversationForGPT,
  );

  try {
    console.log("Calling OpenAI API with the prepared messages and tools.");
    console.log("Data sent to GPT");

    const response = await openai.chat.completions.create({
      model: "gpt-4-0125-preview",
      messages: messages,
      tools: tools,
      tool_choice: "auto",
    });

    const responseMessage = response.choices[0].message;
    console.log("[data.js/updateRoomContext] Response Message");

    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      const toolCall = responseMessage.tool_calls[0];
      console.log("[data.js/updateRoomContext] Function call");

      if (toolCall.function.name === "update_room_context") {
        const functionArgs = JSON.parse(toolCall.function.arguments);
        console.log("[data.js/updateRoomContext] Function arguments");

        const updatedRooms = functionArgs.rooms;
        console.log("[data.js/updateRoomContext] Updated rooms");

        // Read existing room data from Firebase
        const existingRoomData =
          (await readJsonFromFirebase(filePaths.room)) || [];

        // Iterate over the updated rooms
        updatedRooms.forEach((updatedRoom) => {
          // Check if the room already exists in existingRoomData
          const existingRoomIndex = existingRoomData.findIndex(
            (room) => room.room_id === updatedRoom.room_id,
          );

          if (existingRoomIndex !== -1) {
            // If the room exists, update its properties
            existingRoomData[existingRoomIndex] = {
              ...existingRoomData[existingRoomIndex],
              ...updatedRoom,
            };
          } else {
            // If the room doesn't exist, add it to existingRoomData
            existingRoomData.push(updatedRoom);
          }
        });

        // Write updated room data to Firebase
        await writeJsonToFirebase(filePaths.room, existingRoomData);
        console.log(
          `[data.js/updateRoomContext] Updated room data saved for ID: ${userId}`,
        );

        return JSON.stringify(existingRoomData); // Or any other info you need to return
      } else {
        console.log(
          "[data.js/updateRoomContext] Unexpected function call:",
          toolCall.function.name,
        );
        return null; // Handle unexpected function call
      }
    } else {
      console.log(
        "[data.js/updateRoomContext] No function call detected in the model's response.",
      );
      return responseMessage.content; // Handle no function call
    }
  } catch (error) {
    console.error(
      "[data.js/updateRoomContext] Failed to update room context:",
      error,
    );
    throw error;
  }
}

function getRoomContextMessages(locations, roomData, conversationForGPT) {
  const messages = [
    {
      role: "system",
      content: `You are a world class dungeon master and you are crafting a game for this user based on the old text based adventures like Zork. Analyze the following conversation and the latest interaction to update the game's context, feel free to fill in the blanks if the dialogue is missing anything. Analyze the following conversation and the latest interaction to update the game's context. Then extract the data about the room into the fields. If any, here is the current location data where the player may be or has been in the past: ${JSON.stringify(locations)}. Take this data and update with anything new based on the latest conversation update. That means if we need to add anything, you must include the original data in the output or it will be deleted. If it is a new location, create it. Make sure that when the player moves to a new room or location, that you remove them from the previous room and add them to the new room. I character can only ever be in one room at a time and the last response message is the final decider if the character is moving between rooms.`,
    },
    {
      role: "system",
      content: `Current room data: ${JSON.stringify(roomData)} and Message History:\n${conversationForGPT}`,
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
                      "Indicate the messageIds from the conversatoin history when the player was in this room. Example: 1, 2, 3. When the player moves rooms, record that messageId in the new room. Don't make up any ids for this, if you don't see it in the conversation message ids, then leave this blank.",
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

  return { messages, tools };
}

async function updatePlayerContext(userId) {
  console.log(
    "[data.js/updatePlayerContext] Starting with the latest message.",
  );

  const filePaths = await ensureUserDirectoryAndFiles(userId);

  // Read conversation data from Firebase
  let conversationHistory = [];
  try {
    conversationHistory =
      (await readJsonFromFirebase(filePaths.conversation)) || [];
    console.log(
      "[data.js/updatePlayerContext] Retrieved Conversation History from Firebase",
    );
  } catch (error) {
    console.error(
      "[data.js/updatePlayerContext] Error reading conversation history from Firebase:",
      error,
    );
  }

  // Read player data from Firebase
  let playerData = {};
  try {
    playerData = (await readJsonFromFirebase(filePaths.player)) || {};
    console.log(
      "[data.js/updatePlayerContext] Retrieved Player Data from Firebase",
    );
  } catch (error) {
    console.error(
      "[data.js/updatePlayerContext] Error reading player data from Firebase:",
      error,
    );
  }

  // Read story data from Firebase
  let storyData = {};
  try {
    storyData = (await readJsonFromFirebase(filePaths.story)) || {};
    console.log(
      "[data.js/updatePlayerContext] Retrieved Story Data from Firebase",
    );
  } catch (error) {
    console.error(
      "[data.js/updatePlayerContext] Error reading story data from Firebase:",
      error,
    );
  }

  // Get only the last 5 messages from the conversation history
  const lastFiveMessages = conversationHistory.slice(-5);
  const formattedHistory = lastFiveMessages
    .map(
      (msg) =>
        `#${msg.messageId} [${msg.timestamp}]:\nUser: ${msg.userPrompt}\nAssistant: ${msg.response}`,
    )
    .join("\n\n");

  console.log(
    "[data.js/updatePlayerContext] Formatted Conversation History for GPT",
  );

  const { messages, tools } = getPlayerContextMessages(
    storyData,
    playerData,
    formattedHistory,
  );

  try {
    console.log("Calling OpenAI API with the prepared messages and tools.");
    console.log("Data sent to GPT");

    const response = await openai.chat.completions.create({
      model: "gpt-4-0125-preview",
      messages: messages,
      tools: tools,
      tool_choice: "auto",
    });

    console.log("[data.js/updatePlayerContext] Raw OpenAI API response");

    const responseMessage = response.choices[0].message;
    console.log("[data.js/updatePlayerContext] Response Message");

    // Check if the model wanted to call a function
    console.log("[data.js/updatePlayerContext] Checking for function calls...");
    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      const functionCall = responseMessage.tool_calls[0];
      console.log("[data.js/updatePlayerContext] Function call");

      if (functionCall.function.name === "update_player_context") {
        const functionArgs = JSON.parse(functionCall.function.arguments);
        console.log("[data.js/updatePlayerContext] Function arguments");

        const updatedPlayers = functionArgs.players;
        console.log("[data.js/updatePlayerContext] Updated players");

        // Read the existing player data from Firebase
        const existingPlayerData =
          (await readJsonFromFirebase(filePaths.player)) || [];

        updatedPlayers.forEach((updatedPlayer) => {
          const existingPlayerIndex = existingPlayerData.findIndex(
            (player) => player.player_id === updatedPlayer.player_id,
          );

          if (existingPlayerIndex !== -1) {
            // If the player exists, update its properties
            existingPlayerData[existingPlayerIndex] = {
              ...existingPlayerData[existingPlayerIndex],
              ...updatedPlayer,
            };
          } else {
            // If the player doesn't exist, add it to existingPlayerData
            existingPlayerData.push(updatedPlayer);
          }
        });

        // Write updated player data to Firebase
        await writeJsonToFirebase(filePaths.player, existingPlayerData);
        console.log(
          `[data.js/updatePlayerContext] Updated player data saved for ID: ${userId}`,
        );

        return JSON.stringify(existingPlayerData); // Or any other info you need to return
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

function getPlayerContextMessages(storyData, playerData, formattedHistory) {
  const storyDataJson = JSON.stringify(storyData, null, 2);
  const playerDataJson = JSON.stringify(playerData, null, 2);

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

  return { messages, tools };
}

async function updateQuestContext(userId) {
  console.log(
    "[data.js/updateQuestContext] Starting updateQuestContext with the latest message and conversation history.",
  );

  const filePaths = await ensureUserDirectoryAndFiles(userId);
  const userData = await getUserData(filePaths);

  if (!Array.isArray(userData.quest)) {
    userData.quest = [];
  }

  // Read story data from Firebase
  let storyData = {};
  try {
    storyData = (await readJsonFromFirebase(filePaths.story)) || {};
    console.log(
      "[data.js/updateQuestContext] Retrieved Story Data from Firebase",
    );
  } catch (error) {
    console.error(
      "[data.js/updateQuestContext] Error reading story data from Firebase:",
      error,
    );
  }

  // Read quest data from Firebase
  let questData = [];
  try {
    questData = (await readJsonFromFirebase(filePaths.quest)) || [];
    console.log(
      "[data.js/updateQuestContext] Retrieved Quest Data from Firebase",
    );
  } catch (error) {
    console.error(
      "[data.js/updateQuestContext] Error reading quest data from Firebase:",
      error,
    );
  }

  // Get the most recent 5 messages from the conversation history
  const recentMessages = userData.conversation.slice(-5);

  // Format the recent messages for GPT
  const conversationForGPT = recentMessages
    .map(
      (message) =>
        `User: ${message.userPrompt}\nAssistant: ${message.response}`,
    )
    .join("\n\n");

  console.log("[data.js/updateQuestContext] Formatted Conversation for GPT");

  const { messages, tools } = getQuestContextMessages(
    storyData,
    questData,
    conversationForGPT,
  );

  try {
    console.log("Calling OpenAI API with the prepared messages and tools.");
    console.log("Data sent to GPT");

    const response = await openai.chat.completions.create({
      model: "gpt-4-0125-preview",
      messages: messages,
      tools: tools,
      tool_choice: "auto",
    });

    console.log("[data.js/updateQuestContext] Raw OpenAI API response");

    const responseMessage = response.choices[0].message;
    console.log("[data.js/updateQuestContext] Response Message");

    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      const toolCall = responseMessage.tool_calls[0];
      console.log("[data.js/updateQuestContext] Function call");

      if (toolCall.function.name === "update_quest_context") {
        const functionArgs = JSON.parse(toolCall.function.arguments);
        console.log("[data.js/updateQuestContext] Function arguments");

        const updatedQuests = functionArgs.quests;
        console.log("[data.js/updateQuestContext] Updated quests");

        // Read existing quest data from Firebase
        const existingQuestData =
          (await readJsonFromFirebase(filePaths.quest)) || [];

        // Iterate over the updated quests
        updatedQuests.forEach((updatedQuest) => {
          // Check if the quest already exists in existingQuestData
          const existingQuestIndex = existingQuestData.findIndex(
            (quest) => quest.quest_id === updatedQuest.quest_id,
          );

          if (existingQuestIndex !== -1) {
            // If the quest exists, update its properties
            existingQuestData[existingQuestIndex] = {
              ...existingQuestData[existingQuestIndex],
              ...updatedQuest,
            };
          } else {
            // If the quest doesn't exist, add it to existingQuestData
            existingQuestData.push(updatedQuest);
          }
        });

        // Write updated quest data to Firebase
        await writeJsonToFirebase(filePaths.quest, existingQuestData);
        console.log(
          `[data.js/updateQuestContext] Updated quest data saved for ID: ${userId}`,
        );

        return JSON.stringify(existingQuestData); // Or any other info you need to return
      } else {
        console.log(
          "[data.js/updateQuestContext] Unexpected function call:",
          toolCall.function.name,
        );
        return null; // Handle unexpected function call
      }
    } else {
      console.log(
        "[data.js/updateQuestContext] No function call detected in the model's response.",
      );
      return responseMessage.content; // Handle no function call
    }
  } catch (error) {
    console.error(
      "[data.js/updateQuestContext] Failed to update quest context:",
      error,
    );
    throw error;
  }
}

function getQuestContextMessages(storyData, questData, conversationForGPT) {
  const storyDataJson = JSON.stringify(storyData, null, 2);
  const questDataJson = JSON.stringify(questData, null, 2);

  const messages = [
    {
      role: "system",
      content: `You are a world class dungeon master and you are crafting a game for this user based on the old text based adventures like Zork. Analyze the following conversation and the latest interaction to update the game's context. Then extract the data about the quests into the fields. There should always be two active quests at all time. If a quest gets over 50% complete, you should create another quest. Make quests very specific and actionable, don't make their goals vague. Take this data and update with anything new based on the latest conversation update. Add more quests anytime the player interacts in the game and it seems like a good opportunity to introduce more quests.`,
    },
    {
      role: "system",
      content: `Story data: Here is the story and user data: ${storyDataJson}. Current quest data: ${questDataJson} and Message History:\n${conversationForGPT}`,
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
                      "The reward for completing the quest, such as items they can put into inventory or money. Be specific by giving them a tangible prize. Don't say things like the reward for this quest is unlocking more quests or information. For instance: Reward is 200 gold coins. Or Reward is A golden dagger.",
                  },
                  quest_steps: {
                    type: "string",
                    description:
                      "This should be the number of tasks the user must complete to finish the quest and the details of each task. Describe each task the user needs to complete. For instance, if the quest was to return a diamond to the princess the tasks might be: '1) Find the thrown room, 2) defeat the evil guards, 3) solve the puzzle on the door, 4) pick the lock of the chest, 5) return the diamond back to me.'",
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
                  "quest_steps",
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

  return { messages, tools };
}

async function generateStoryImage(userId) {
  console.log("[generateStoryImage] Starting generateStoryImage");

  const filePaths = await ensureUserDirectoryAndFiles(userId);
  console.log("[generateStoryImage] File paths:", filePaths);

  const userData = await getUserData(filePaths);
  console.log("[generateStoryImage] User data");

  // Assuming image_description is at the top level of user data
  const promptText =
    userData.story.image_description ||
    "A library filled with doors that look to go to different genres like sci-fi, spy stories, histories, etc.";
  console.log("[generateStoryImage] Prompt text:", promptText);

  const storySummary = userData.story.game_description || "";

  const prompt = `This is for a text based adventure game in the style of Oregon Trail or Zork, so create an image in an old pixel game style. DO NOT PUT ANY TEXT OR WORDS IN THE IMAGE. Generate an image based on the following summary of the scene: ${promptText}`;

  console.log("[generateStoryImage] Full prompt:", prompt);

  try {
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: prompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      response_format: "url",
    });

    const imageUrl = response.data[0].url;
    console.log("[generateStoryImage] Generated image URL:", imageUrl);

    // Upload the image to Firebase Storage
    const firebaseUrl = await uploadImageToFirebase(imageUrl);
    console.log("[generateStoryImage] Firebase image URL:", firebaseUrl);

    return firebaseUrl;
  } catch (error) {
    console.error(
      "[generateStoryImage] Failed to generate story image:",
      error,
    );
    throw error;
  }
}

async function uploadImageToFirebase(imageUrl) {
  console.log("[uploadImageToFirebase] Starting image upload");

  const { default: fetch } = await import("node-fetch");
  const mimeType = "image/png"; // Dynamically set this based on the image file type if necessary

  // Generate a filename for storage
  const fileName = `images/${Date.now()}-${Math.random().toString(36).substring(2, 15)}.png`;
  const file = bucket.file(fileName);

  try {
    // Fetch the image from the URL
    const response = await fetch(imageUrl);
    if (!response.ok)
      throw new Error(
        `Failed to fetch the image from URL: ${response.statusText}`,
      );

    // Get the buffer from the response
    const buffer = await response.buffer();

    // Upload the buffer to Firebase
    await file.save(buffer, {
      metadata: { contentType: mimeType },
    });

    console.log(
      `[uploadImageToFirebase] Image uploaded successfully: ${fileName}`,
    );
    // Optionally get a download URL
    const downloadURL = await file.getSignedUrl({
      action: "read",
      expires: "03-09-2491",
    });
    return downloadURL[0];
  } catch (error) {
    console.error("[uploadImageToFirebase] Error uploading image:", error);
    throw error;
  }
}

module.exports = {
  updateRoomContext,
  updatePlayerContext,
  updateStoryContext,
  updateQuestContext,
  generateStoryImage,
  uploadImageToFirebase,
};
