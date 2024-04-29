//data.js
const { initializeApp, cert } = require("firebase-admin/app");
const { getStorage } = require("firebase-admin/storage");
const { Storage } = require("@google-cloud/storage");
const sharp = require("sharp");

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
const { coerceInteger } = require("openai/core");
const openai = new OpenAIApi(process.env.OPENAI_API_KEY); //never change this

async function updateStoryContext(userId, conversationData) {
  console.log("[data.js/updateStoryContext] Starting updateStoryContext");

  const filePaths = await ensureUserDirectoryAndFiles(userId);
  console.log("[data.js/updateStoryContext] File paths:", filePaths);

  const userData = await getUserData(userId);
  console.log("[data.js/updateStoryContext] User data");

  let storyData = {};
  let roomData = {};

  try {
    storyData = (await readJsonFromFirebase(filePaths.story)) || {};
    console.log("[data.js/updateStoryContext] Retrieved story data");

    roomData = (await readJsonFromFirebase(filePaths.room)) || {};
    console.log("[data.js/updateStoryContext] Retrieved room data");
  } catch (error) {
    console.error(
      "[data.js/updateStoryContext] Error reading story data:",
      error,
    );
    storyData = {};
  }

  let formattedHistory = "";
  if (conversationData && conversationData.length > 0) {
    formattedHistory = conversationData
      .slice(-5)
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
    roomData,
    userData.player,
    userData.quest,
    formattedHistory,
  );

  const response = await openai.chat.completions.create({
    model: "gpt-4-turbo",
    messages: messages,
    tools: tools,
    tool_choice: "auto",
  });

  const responseMessage = response.choices[0].message;
  console.log("[data.js/updateStoryContext] Response Message");

  if (
    responseMessage &&
    responseMessage.tool_calls &&
    responseMessage.tool_calls.length > 0
  ) {
    const toolCall = responseMessage.tool_calls[0];
    if (toolCall && toolCall.function && toolCall.function.arguments) {
      const functionArgs = JSON.parse(toolCall.function.arguments);
      const updatedStoryData = functionArgs.story_details;

      if (updatedStoryData) {
        console.log(
          "[data.js/updateStoryContext] Updated Story Data from tool call",
        );

        const previousActiveGame = storyData.active_game;
        const currentActiveGame = updatedStoryData.active_game;

        await writeJsonToFirebase(filePaths.story, updatedStoryData);
        console.log(
          "[data.js/updateStoryContext] Story data updated in Firebase for user ID:",
          userId,
        );

        if (previousActiveGame === true && currentActiveGame === false) {
          // Clear game-related data when active_game goes from true to false
          await clearGameData(userId);
        }

        const newRoomId = updatedStoryData.room_location_user;
        if (newRoomId && storyData.room_location_user !== newRoomId) {
          console.log(
            `[data.js/updateStoryContext] Room change detected from ${storyData.room_location_user} to ${newRoomId}`,
          );

          try {
            console.log("[data.js/updateStoryContext] Room data:", roomData);

            const newRoom = roomData.find((room) => room.room_id === newRoomId);
            console.log("[data.js/updateStoryContext] New room data:", newRoom);

            if (newRoom && newRoom.image_url) {
              const newImageUrl = newRoom.image_url;
              console.log(
                `[data.js/updateStoryContext] New room image URL: ${newImageUrl}`,
              );

              // Emit the latestImageUrl event to the specific user's socket
              const socket = app.get("socket");
              if (socket) {
                console.log(
                  `[data.js/updateStoryContext] Emitting latestImageUrl event to user ${userId} with imageUrl: ${newImageUrl} and roomId: ${newRoomId}`,
                );
                socket.emit("latestImageUrl", {
                  imageUrl: newImageUrl,
                  roomId: newRoomId,
                });
              } else {
                console.log("[data.js/updateStoryContext] Socket not found.");
              }
            } else {
              console.log(
                `[data.js/updateStoryContext] No image URL found for room ${newRoomId}`,
              );
              console.log(
                "[data.js/updateStoryContext] New room data:",
                newRoom,
              );
            }
          } catch (error) {
            console.error(
              `[data.js/updateStoryContext] Error fetching room data for user ${userId}:`,
              error,
            );
          }
        }
      } else {
        console.log(
          "[data.js/updateStoryContext] No valid story data to update.",
        );
      }
    }
  } else if (responseMessage && responseMessage.content) {
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
}

async function handleRoomChange(userId, newRoomId) {
  console.log(
    `[handleRoomChange] Handling room change for user ${userId} to room ${newRoomId}`,
  );

  try {
    // Fetch new room details from Firebase
    const filePaths = await ensureUserDirectoryAndFiles(userId);
    const roomData = await readJsonFromFirebase(filePaths.room);

    if (roomData && Array.isArray(roomData)) {
      const newRoom = roomData.find((room) => room.room_id === newRoomId);

      if (newRoom && newRoom.image_url) {
        const newImageUrl = newRoom.image_url;
        console.log(`[handleRoomChange] New room image URL: ${newImageUrl}`);

        // Emit new image URL to the specific user's socket
        io.to(userId).emit("latestImageUrl", newImageUrl);
      } else {
        console.log(
          `[handleRoomChange] No image URL found for room ${newRoomId}`,
        );
      }
    } else {
      console.log(`[handleRoomChange] No room data found for user ${userId}`);
    }
  } catch (error) {
    console.error(
      `[handleRoomChange] Error fetching room data for user ${userId}:`,
      error,
    );
  }
}

function getStoryContextMessages(
  storyData,
  roomData,
  playerData,
  questData,
  formattedHistory,
) {
  const storyDataJson = JSON.stringify(storyData, null, 2);
  const roomDataJson = roomData ? JSON.stringify(roomData, null, 2) : "{}";
  const playerDataJson = playerData
    ? JSON.stringify(playerData, null, 2)
    : "{}";
  const questDataJson = questData ? JSON.stringify(questData, null, 2) : "{}";

  const messages = [
    {
      role: "system",
      content: `You are a world-class storyteller and you are crafting a personalized story for this user. Please use the following conversation history and the existing story data to update the story json file. MAKE SURE THE USER HAS SELECTED THE TIME PERIOD AND THE NAME OF THE CHARACTER THEY WANT TO BE BEFORE SETTING THE ACTIVE_GAME TO true. Story data from the story.json file: ${storyDataJson}
      
      Room data: ${roomDataJson}
      
      Player data: ${playerDataJson}
      
      Crisis data: ${questDataJson}
      
      Last few messages: Message History:\n${formattedHistory} 
      
      You must take this data and update the story json with anything new based on the latest conversation update. This includes updating the room number where the user is currently. You must include the original data as well if you are adding new data to it because we will overwrite the old entry with the new one.`,
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
                    "English by default, but if the user is typing in a different language make sure to indicate which language here.",
                },
                character_played_by_user: {
                  type: "string",
                  description:
                    "This will be the character played by the user in the story. If there is no name given for their player, create one that makes the most sense, usually the hero in the story. Leave blank until you can make the assessment.",
                },
                player_resources: {
                  type: "string",
                  description:
                    "These are the resources the player will posses at the beginning of the game. Examples are: Gold: 200, Lumber: 300, Soliders: 20,000, Land: 10,000 acres, etc. These numbers should go down as the user expends them to solve a crisis by taking actions with costs. THESE MUST OBJECTS OR PEOPLE LIKE MONEY, ITEMS, SUPPORTERS, SOLDIERS, NOT SKILLS OF THE CHARACTER.",
                },
                player_attitude: {
                  type: "string",
                  description:
                    "This is how the character behaves in the world. As the user makes decisions in the game, update this. For example: You are hated by the people of this world because you are always killing people. Or You are well loved by the people for all the good you do. Leave blank until you can make the assessment.",
                },
                player_lives_in_real_life: {
                  type: "string",
                  description:
                    "If the user tells you where they live, record it here. For instance if they say China, then record China here. If they say Los Altos, CA, then record Los Altos, CA, USA. If they give you a zip code, convert it to a proper name.",
                },
                game_description: {
                  type: "string",
                  description:
                    "List out all of the important events or areas of education that the user should learn about this time period.",
                },
                player_profile: {
                  type: "string",
                  description:
                    "This should be information you learn about the player as they play. This should not be specific to the time period, rather it should be insights you learn about the player. For instance do they tend to fight, do they like to talk, etc. You can also include details about where they live, male/female, age, etc.",
                },
                education_level: {
                  type: "string",
                  description:
                    "The user's education level. For instance, if they are in a particular grade in school. If they want the game to be harder, make this higher. If easier, make this lower. They can also say things like they are an expert at something like WWII history and if they do give them a high level of education like Ph.D.",
                },
                time_period: {
                  type: "string",
                  description:
                    "The time period the user is in. For instance, 1920-1930.",
                },
                story_location: {
                  type: "string",
                  description:
                    "The location of the story. For instance it might be Ancient Egypt or WWII Europe.",
                },
                previous_user_location: {
                  type: "integer",
                  description:
                    "This can only be a room number from the rooms feed, do not make up a room number. If the user moves during this turn, like they say leave room or go north, we must take the previous number in the room_location_user field and populate it in this field. If the user does anything else in the room that does not move them, we also must populate the room_location_user room number in this field, but in that case the two numbers will match.",
                },
                room_location_user: {
                  type: "integer",
                  description:
                    "This can only be a room number from the rooms feed, do not make up a room number. This is the room location that the user is currently in. Review the last conversation output and make sure that the room_id from the room_name where the user is located is used here to indicate what room they are currently in. This should change to the new room anytime a user moves. In the room json feed this room_id must be set to user_in_room equal to true.",
                },
                current_room_name: {
                  type: "string",
                  description:
                    "This is the name of the room that the user is currently in. This should appear at the top of the most recent conversation and should also match one of the rooms in the feed from our backend. This should change to the new room anytime a user moves. In the room json feed this room_id must be set to user_in_room equal to true.",
                },
                active_game: {
                  type: "boolean",
                  description:
                    "DO NOT SET THIS TO TRUE until these fields are populated: character_played_by_user, education_level, game_description.  After we have collected all of these answers set this to true. Don't set this to true until we have all of these answers. If the user quits or are kicked out for bad behavior or they win/lose the game, set to false again. YOU MUST SET THIS TO FALSE IF THE USER WANTS TO QUIT.",
                },
                save_key: {
                  type: "string",
                  description:
                    "After the active_game is set to true, create a unique key for the user. It must be random and start with a proper name, then a verb and finally an object. For instance: jimmyeatsshoes",
                },
              },
              required: [
                "language_spoken",
                "game_description",
                "player_resources",
                "player_attitude",
                "player_lives_in_real_life",
                "character_played_by_user",
                "player_profile",
                "education_level",
                "time_period",
                "story_location",
                "previous_user_location",
                "room_location_user",
                "current_room_name",
                "save_key",
                "active_game",
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

  const userData = await getUserData(userId);

  if (!Array.isArray(userData.locations)) {
    userData.locations = [];
  }

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

  const recentMessages = userData.conversation.slice(-5);

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

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messages,
      tools: tools,
      tool_choice: "auto",
    });

    console.log("[data.js/updateRoomContext] Response from OpenAI processed.");

    processGPTResponse(response, filePaths, userId);
  } catch (error) {
    console.error(
      "[data.js/updateRoomContext] Failed to update room context:",
      error,
    );
  }
}

async function processGPTResponse(response, filePaths, userId) {
  const responseMessage = response.choices[0].message;

  console.log("[data.js/processGPTResponse] Processing response message");

  if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
    const toolCall = responseMessage.tool_calls[0];

    if (toolCall.function.name === "update_room_context") {
      const functionArgs = JSON.parse(toolCall.function.arguments);

      await updateRoomData(functionArgs.rooms, filePaths.room, userId);

      console.log("[data.js/processGPTResponse] Room data updated with images");
    } else {
      console.log(
        "[data.js/processGPTResponse] Unexpected function call:",
        toolCall.function.name,
      );
    }
  } else {
    console.log(
      "[data.js/processGPTResponse] No function call detected in model's response.",
    );
  }
}

async function updateRoomData(updatedRooms, roomFilePath, userId) {
  const existingRoomData = (await readJsonFromFirebase(roomFilePath)) || [];

  for (const updatedRoom of updatedRooms) {
    const index = existingRoomData.findIndex(
      (room) => room.room_id === updatedRoom.room_id,
    );

    if (index !== -1) {
      existingRoomData[index] = {
        ...existingRoomData[index],
        ...updatedRoom,
        image_url:
          existingRoomData[index].image_url || updatedRoom.image_url || null, // Preserve existing image_url or set it to null if not present
      };
    } else {
      existingRoomData.push({
        ...updatedRoom,
        image_url: updatedRoom.image_url || null, // Set image_url to null if not present
      });
    }
  }

  await writeJsonToFirebase(roomFilePath, existingRoomData);
  console.log(
    `[data.js/updateRoomData] Updated room data saved for user ID: ${userId}`,
  );

  for (const room of existingRoomData) {
    if (room.room_description_for_dalle && !room.image_url) {
      const imageUrl = await generateStoryImage(
        userId,
        room.room_description_for_dalle,
        room,
      );
      if (imageUrl !== null) {
        await updateRoomImageUrl(userId, room.room_id, imageUrl);
      }
    }
  }

  console.log(
    `[data.js/updateRoomData] Room images updated for user ID: ${userId}`,
  );
}

async function updateRoomImageUrl(userId, roomId, imageUrl) {
  const roomPath = `data/users/${userId}/room/${roomId}`;
  try {
    const roomData = await readJsonFromFirebase(roomPath);
    if (roomData) {
      roomData.image_url = imageUrl;
      await writeJsonToFirebase(roomPath, roomData);
      console.log(
        `[data.js/updateRoomImageUrl] Image URL updated for room ${roomId} of user ${userId}`,
      );
    } else {
      console.log(
        `[data.js/updateRoomImageUrl] Room data not found for room ${roomId} of user ${userId}`,
      );
    }
  } catch (error) {
    console.error(
      `[data.js/updateRoomImageUrl] Error updating image URL for room ${roomId} of user ${userId}:`,
      error,
    );
  }
}

function getRoomContextMessages(locations, roomData, conversationForGPT) {
  const messages = [
    {
      role: "system",
      content: `You are a world class dungeon master and you are crafting a game for this user based on the old text based adventures like Oregon Trail. Analyze the following conversation and the latest interaction to update the room data. YOU MUST DESCRIBE THE ROOM THEY ARE IN AND EVERY ROOM OR LOCATION THEY CAN MOVE TO AND BE SPECIFIC ABOUT LOCATIONS, DO NOT CREATE GENERAL CONCEPTS LIKE "AFRICA". If any, here is the current location data where the player may be or has been in the past: ${JSON.stringify(locations)}. Take this data and update with anything new based on the latest conversation update. That means if we need to add anything, you must include the original data in the output or it will be deleted. If it is a new location, create it. THERE MUST ALWAYS BE AT LEAST TWO DIRECTIONS THE PLAY CAN GO FROM A LOCATION AND YOU MUST DESCRIBE THOSE LOCATIONS. Make sure that when the player moves to a new room or location, that you remove them from the previous room and add them to the new room. I character can only ever be in one room at a time and the last response message is the final decider if the character is moving between rooms.`,
    },
    {
      role: "system",
      content: `Current room data: ${JSON.stringify(roomData)} and Message History:\n${conversationForGPT}`,
    },
    {
      role: "user",
      content: `You must describe every location described in the conversation and every room that is adjacent to that room. If the user goes in a direction, you must create a new room or location for that direction and all of the adjacent locations near that one. If there are available directions for the user to go in, create those rooms or locations in preparation for them to go in those directions. If the room already exists, update the room context based on the latest conversation by including the original data and making the changes based on the latest details. The function should output an array of structured data regarding each room's state, including room details and item interactions.`,
    },
  ];

  const tools = [
    {
      type: "function",
      function: {
        name: "update_room_context",
        description:
          "You must describe every location described in the conversation and every room that is adjacent to that room. If the user goes in a direction, you must create a new room or location for that direction and all of the adjacent locations near that one. If there are available directions for the user to go in, create those rooms or locations in preparation for them to go in those directions. If the room already exists, update the room context based on the latest conversation by including the original data and making the changes based on the latest details. The function should output an array of structured data regarding each room's state, including room details and item interactions.",
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
                      "A unique identifier for the room, such as a sequential number like 1, 2, 3... This must be higher than the number 0.",
                  },
                  interesting_details: {
                    type: "string",
                    description:
                      "A summary of what the location looks like. Be very detailed.",
                  },
                  available_directions: {
                    type: "string",
                    description:
                      "Directions the user can go, like North, South, Up, and what location is in that direction. There must always be at least two directions to leave.",
                  },
                  characters_in_room: {
                    type: "string",
                    description:
                      "Computer generated characters in the room. Always use names for characters.",
                  },
                  actions_taken_in_room: {
                    type: "string",
                    description: "Actions the user tried to take in the room.",
                  },
                  room_description_for_dalle: {
                    type: "string",
                    description:
                      "Create a description that we can give to DALLE to generate an image for the room. Make sure you include in this description the time period and location. For example: I want a side view 2D image in the style of an 8bit video game like Oregon Trail that shows a fort from 1775 during the american revolution where you can see an old rifle on the ground along with a settler working at a food stand. The wall of the fort is made form large cut down trees and there is a flag of massachusetts flying over it. The people wear homemade outfits from the early massachusetts colony.",
                  },
                  user_in_room: {
                    type: "boolean",
                    description:
                      "true if they are currently in the room, false if they are not. The user may only be in one room at a time. the most recent conversation history will show the name of the room the user is in and this should be set to true for the room_id of the room_title that matches the conversation room.",
                  },
                },
                required: [
                  "room_name",
                  "room_id",
                  "interesting_details",
                  "available_directions",
                  "characters_in_room",
                  "actions_taken_in_room",
                  "room_description_for_dalle",
                  "user_in_room",
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
      model: "gpt-3.5-turbo",
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
                      "A unique identifier for the player, such as a sequential number like 1, 2, 3...This must be higher than the number 0.",
                  },
                  player_looks: {
                    type: "string",
                    description:
                      "Describe what the character looks like and what they are wearing. Give a little of their backstory as well.",
                  },
                  player_location: {
                    type: "string",
                    description: "Room or place the player is currently in.",
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
  const userData = await getUserData(userId);

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
  let questData = {};
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
      model: "gpt-3.5-turbo",
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
      content: `You are a world class dungeon master and you are crafting a game for this user based on the old text based adventures like Oregon Trail. Analyze the following conversation and the latest interaction to update the game's context. Then extract the data about the crisis into the fields. If a crisis gets over 50% complete, you should prepare the next crisis. The details of the crisis should be to educate people of the key elements of history at that time. Don't make the crisis goals vague. Take this data and update with anything new based on the latest conversation update.`,
    },
    {
      role: "system",
      content: `Story data: Here is the story and user data: ${storyDataJson}. Current crisis data: ${questDataJson} and Message History:\n${conversationForGPT}`,
    },
    {
      role: "user",
      content: `You are a world class dungeon master and you are crafting a game for this user based on the old text based adventures like Oregon Trail. Analyze the following conversation and the latest interaction to update the game's context. Then extract the data about the crisis into the fields. If a crisis gets over 50% complete, you should prepare the next crisis. The details of the crisis should be to educate people of the key elements of history at that time. Don't make the crisis goals vague. Take this data and update with anything new based on the latest conversation update.`,
    },
  ];

  const tools = [
    {
      type: "function",
      function: {
        name: "update_quest_context",
        description:
          "You are a world class dungeon master and you are crafting a game for this user based on the old text based adventures like Oregon Trail. Analyze the following conversation and the latest interaction to update the game's context. Then extract the data about the crisis into the fields. If a crisis gets over 50% complete, you should prepare the next crisis. The details of the crisis should be to educate people of the key elements of history at that time. Don't make the crisis goals vague. Take this data and update with anything new based on the latest conversation update.",
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
                      "A unique identifier for the crisis, such as a sequential number like 1, 2, 3... Never replace an old crisis with a new one, always generate a new number. This must be higher than the number 0.",
                  },
                  quest_name: {
                    type: "string",
                    description:
                      "The name of the crisis, like 'The Cuban Missle Crisis'.",
                  },
                  quest_characters: {
                    type: "string",
                    description:
                      "The names of the characters the player will need to interact with to overcome the crisis.",
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
                  "quest_characters",
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

async function generateStoryImage(userId, roomDescription, room) {
  console.log("[generateStoryImage] Starting generateStoryImage");

  const filePaths = await ensureUserDirectoryAndFiles(userId);
  console.log("[generateStoryImage] File paths:", filePaths);

  const userData = await getUserData(userId);
  console.log("[generateStoryImage] User data");

  // Fetch story data including time period and location
  const storyData = await readJsonFromFirebase(filePaths.story);
  const timePeriod = storyData.time_period || "unknown time period";
  const storyLocation = storyData.story_location || "unknown location";

  console.log("[generateStoryImage] Story details:", {
    timePeriod,
    storyLocation,
  });

  // Check if an image already exists for the room, avoid generating if it does
  if (room.image_url) {
    console.log(
      "[generateStoryImage] Existing image URL found, not generating a new one.",
    );
    return room.image_url; // Return the existing URL instead of generating a new one
  }

  // Update the prompt with time period and location details
  const prompt = `This is for a text based adventure game set in the ${timePeriod} at ${storyLocation}. The style is like Oregon Trail or Zork, so create an image in an old pixel game style. DO NOT PUT ANY TEXT OR WORDS IN THE IMAGE. If there are any copyright issues, generate an image that just shows the background and objects, no characters at all. Generate an image based on the following summary of the scene: ${roomDescription}`;

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

    const imageUrl = await uploadImageToFirebase(response.data[0].url, userId);
    console.log("[generateStoryImage] Generated image URL:", imageUrl);

    if (imageUrl !== null) {
      // Update only the image URL in Firebase
      await updateRoomImageUrl(userId, room.room_id, imageUrl);
      return imageUrl;
    } else {
      console.error("[generateStoryImage] Image upload failed.");
      return null;
    }
  } catch (error) {
    console.error(
      "[generateStoryImage] Failed to generate story image:",
      error,
    );
    // Return a default image URL or null if image generation fails
    return null;
  }
}

async function uploadImageToFirebase(imageUrl, userId) {
  console.log("[uploadImageToFirebase] Starting image upload");

  const { default: fetch } = await import("node-fetch");
  const mimeType = "image/png"; // This can be dynamically set as needed

  // Include the user ID in the file path
  const fileName = `images/${userId}/${Date.now()}-${Math.random().toString(36).substring(2, 15)}.png`;
  const file = bucket.file(fileName);

  try {
    const response = await fetch(imageUrl);
    if (!response.ok)
      throw new Error(
        `Failed to fetch the image from URL: ${response.statusText}`,
      );

    const buffer = await response.buffer();

    console.log("[uploadImageToFirebase] Resizing the image...");
    const resizedBuffer = await sharp(buffer).resize(512, 512).png().toBuffer();

    await file.save(resizedBuffer, {
      metadata: { contentType: mimeType },
    });

    console.log(
      `[uploadImageToFirebase] Image resized and uploaded successfully: ${fileName}`,
    );

    const downloadURL = await file.getSignedUrl({
      action: "read",
      expires: "03-09-2491", // You might want to adjust this date to something more reasonable
    });
    return downloadURL[0];
  } catch (error) {
    console.error(
      "[uploadImageToFirebase] Error in image upload process:",
      error,
    );
    throw error;
  }
}

async function clearGameData(userId) {
  const filePaths = await ensureUserDirectoryAndFiles(userId);

  // Clear conversation data
  await writeJsonToFirebase(filePaths.conversation, []);

  // Reinitialize room, player, and quest data
  await Promise.all([
    writeJsonToFirebase(filePaths.room, [{ initialized: "true" }]),
    writeJsonToFirebase(filePaths.player, [{ initialized: "true" }]),
    writeJsonToFirebase(filePaths.quest, [{ initialized: "true" }]),
  ]);

  // Clear specific story fields
  const storyData = await readJsonFromFirebase(filePaths.story);
  storyData.character_played_by_user = "";
  storyData.current_room_name = "";
  storyData.game_description = "";
  storyData.previous_user_location = "";
  storyData.room_location_user = "";
  storyData.player_resources = "";
  storyData.story_location = "";
  storyData.time_period = "";
  storyData.active_game = false;
  await writeJsonToFirebase(filePaths.story, storyData);
}

module.exports = {
  updateRoomContext,
  updatePlayerContext,
  updateStoryContext,
  updateQuestContext,
  generateStoryImage,
  uploadImageToFirebase,
  clearGameData,
};
