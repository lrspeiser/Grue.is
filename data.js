// data.js
// Firebase Admin SDK
const { initializeApp: initializeAdminApp, cert: adminCert, getApps: getAdminApps, getApp: getAdminApp } = require("firebase-admin/app");
const { getStorage } = require("firebase-admin/storage");

const sharp = require("sharp");
const { Buffer } = require('node:buffer'); // For base64 decoding

// Node.js core modules (fs.promises and path were in your original, kept for fidelity)
const fs = require("fs").promises; // Not directly used but kept
const path = require("path");     // Not directly used but kept

const {
  ensureUserDirectoryAndFiles,
  getUserData,
  writeJsonToFirebase,
  readJsonFromFirebase,
} = require("./util");

const OpenAIApi = require("openai");
const { coerceInteger } = require("openai/core"); // Kept from original
const openai = new OpenAIApi(process.env.OPENAI_API_KEY);

// --- Firebase Admin SDK Initialization (Corrected and Robust) ---
let serviceAccount;
try {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    throw new Error("CRITICAL: GOOGLE_SERVICE_ACCOUNT environment variable is not set in data.js.");
  }
  serviceAccount = JSON.parse(serviceAccountJson);
} catch (error) {
  console.error("FATAL ERROR in data.js: Failed to parse GOOGLE_SERVICE_ACCOUNT JSON.", error);
  throw error;
}

const ADMIN_APP_NAME_DATA_JS = 'grue-admin-data-js';
let adminAppInstance;
if (!getAdminApps().find(app => app.name === ADMIN_APP_NAME_DATA_JS)) {
    adminAppInstance = initializeAdminApp({
        credential: adminCert(serviceAccount),
        storageBucket: process.env.storageBucket,
    }, ADMIN_APP_NAME_DATA_JS);
    console.log(`Firebase Admin SDK initialized in data.js with name: ${ADMIN_APP_NAME_DATA_JS}.`);
} else {
    adminAppInstance = getAdminApp(ADMIN_APP_NAME_DATA_JS);
    console.log(`Firebase Admin SDK for data.js (name: ${ADMIN_APP_NAME_DATA_JS}) already initialized.`);
}
const bucket = getStorage(adminAppInstance).bucket(process.env.file_storage);
// --- End Firebase Admin SDK Initialization ---


async function updateStoryContext(userId, conversationData, ioInstance) {
  console.log("[data.js/updateStoryContext] Starting updateStoryContext for user:", userId);
  const filePaths = await ensureUserDirectoryAndFiles(userId);
  const userData = await getUserData(userId);
  let storyDataToUpdate = userData.story || { active_game: false, language_spoken: "English" };
  let currentRoomObjectForPrompt = userData.room || {};
  let playerArrayForPrompt = userData.player || [];
  let questArrayForPrompt = userData.quest || [];
  let formattedHistory = "";
  if (conversationData && Array.isArray(conversationData) && conversationData.length > 0) {
    formattedHistory = conversationData.slice(-5)
      .map(msg => `#${msg.messageId || 'N/A'} [${msg.timestamp || 'N/A'}]: User: ${msg.userPrompt || ''}\nAssistant: ${msg.response || ''}`)
      .join("\n\n");
  }
  console.log("[data.js/updateStoryContext] Formatted History (last 5):", formattedHistory.substring(0, 200) + "...");
  const { messages, tools } = getStoryContextMessages(storyDataToUpdate, currentRoomObjectForPrompt, playerArrayForPrompt, questArrayForPrompt, formattedHistory);
  console.log("[data.js/updateStoryContext] Calling OpenAI for story update...");
  try {
    const response = await openai.chat.completions.create({ model: "gpt-4.1", messages, tools, tool_choice: "auto" });
    const responseMessage = response.choices[0].message;
    console.log("[data.js/updateStoryContext] OpenAI Response for story:", JSON.stringify(responseMessage).substring(0, 200) + "...");
    if (responseMessage && responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      const toolCall = responseMessage.tool_calls[0];
      if (toolCall.function && toolCall.function.name === "update_story_context" && toolCall.function.arguments) {
        try {
          const functionArgs = JSON.parse(toolCall.function.arguments);
          const updatedStoryDetailsFromTool = functionArgs.story_details;
          if (updatedStoryDetailsFromTool) {
            console.log("[data.js/updateStoryContext] Story details from tool:", updatedStoryDetailsFromTool);
            const previousActiveGame = storyDataToUpdate.active_game;
            const finalStoryData = { ...storyDataToUpdate, ...updatedStoryDetailsFromTool };
            if (finalStoryData.room_location_user !== null && finalStoryData.room_location_user !== undefined) finalStoryData.room_location_user = String(finalStoryData.room_location_user);
            if (finalStoryData.previous_user_location !== null && finalStoryData.previous_user_location !== undefined) finalStoryData.previous_user_location = String(finalStoryData.previous_user_location);
            await writeJsonToFirebase(filePaths.story, finalStoryData);
            console.log("[data.js/updateStoryContext] Story data updated for user:", userId);
            if (previousActiveGame === true && finalStoryData.active_game === false) {
              console.log(`[data.js/updateStoryContext] Game inactive for ${userId}. Clearing data.`);
              await clearGameData(userId, ioInstance);
            }
            const newRoomIdStr = finalStoryData.room_location_user ? String(finalStoryData.room_location_user) : null;
            const oldRoomIdStr = storyDataToUpdate.room_location_user ? String(storyDataToUpdate.room_location_user) : null;
            if (newRoomIdStr && newRoomIdStr !== oldRoomIdStr) console.log(`[data.js/updateStoryContext] Room change for ${userId} from ${oldRoomIdStr || 'N/A'} to ${newRoomIdStr}. Listener handles 'roomData' emit.`);
          } else console.log("[data.js/updateStoryContext] No valid story_details in tool call.");
        } catch (e) { console.error("[data.js/updateStoryContext] Error parsing story tool args:", e, toolCall.function.arguments); }
      } else console.log("[data.js/updateStoryContext] Tool call not 'update_story_context' or args missing.");
    } else if (responseMessage && responseMessage.content) {
      console.log("[data.js/updateStoryContext] Model responded with content (story):", responseMessage.content.substring(0,100)+"...");
      try {
        const updatedStoryDataFromContent = JSON.parse(responseMessage.content);
        await writeJsonToFirebase(filePaths.story, { ...storyDataToUpdate, ...updatedStoryDataFromContent });
        console.log("[data.js/updateStoryContext] Story updated from model content.");
      } catch (e) { console.error("[data.js/updateStoryContext] Could not parse model content as JSON for story:", e); }
    } else console.log("[data.js/updateStoryContext] No update from API for story.");
  } catch (error) { console.error("[data.js/updateStoryContext] Error in story update API call:", error); }
}

async function handleRoomChange(userId, newRoomId, ioInstance) {
  console.log(`[data.js/handleRoomChange] User ${userId} to room ${newRoomId}.`);
  if (!ioInstance) { console.warn("[data.js/handleRoomChange] ioInstance missing."); return; }
  if (!newRoomId) { console.log(`[data.js/handleRoomChange] newRoomId null/undefined for ${userId}.`); return; }
  try {
    const roomsArrayPath = `data/users/${userId}/room`;
    const allRoomsArray = await readJsonFromFirebase(roomsArrayPath);
    if (allRoomsArray && Array.isArray(allRoomsArray)) {
      const newRoomData = allRoomsArray.find(room => room && String(room.room_id) === String(newRoomId));
      if (newRoomData && newRoomData.image_url) {
        console.log(`[data.js/handleRoomChange] Image for new room ${newRoomId}: ${newRoomData.image_url}`);
        ioInstance.to(userId).emit("latestImageUrl", { imageUrl: newRoomData.image_url, roomId: String(newRoomId) });
      } else console.log(`[data.js/handleRoomChange] No image URL for room ${newRoomId}. Room data:`, newRoomData);
    } else console.log(`[data.js/handleRoomChange] No room array for ${userId} at ${roomsArrayPath}`);
  } catch (error) { console.error(`[data.js/handleRoomChange] Error for ${userId}, room ${newRoomId}:`, error); }
}

  function getStoryContextMessages(storyData, currentRoomData, playerData, questData, formattedHistory) {
    const storyDataJson = JSON.stringify(storyData || {}, null, 2);
    const currentRoomDataJson = currentRoomData ? JSON.stringify(currentRoomData, null, 2) : "{}";
    const playerDataJson = playerData ? JSON.stringify(playerData, null, 2) : "[]";
    const questDataJson = questData ? JSON.stringify(questData, null, 2) : "[]";

    // CRITICAL: Get the current room_id from the story if it exists
    const currentActualRoomIdInStory = storyData && storyData.room_location_user ? String(storyData.room_location_user) : null;

    const messages = [
      {
        role: "system",
        content: `You are a world-class storyteller. Update the story JSON based on the latest conversation.
        CONTEXT:
        - Current Story State (before this turn): ${storyDataJson}
        - Current Room Object (if user was in a known room before this turn): ${currentRoomDataJson}
        - Player data (array): ${playerDataJson}
        - Crisis data (array): ${questDataJson}
        - Last few messages (user's latest action is at the end):\n${formattedHistory}

        INSTRUCTIONS FOR 'story_details' UPDATE (CRITICAL ACCURACY NEEDED):
        1.  'active_game': Set to false ONLY if the user explicitly quits or the game logically ends. Otherwise, keep true.
        2.  'current_room_name': Set to the descriptive name of the room the user is NOW in based on the LATEST assistant message.
        3.  'room_location_user' (TARGET ROOM ID): THIS IS THE MOST CRITICAL FIELD.
            -   Analyze the LATEST assistant message which describes the user's new state/location.
            -   **If the user HAS MOVED to a NEW conceptual area** that likely doesn't have an existing room_id:
                -   You MUST assign a NEW, unique, simple, hyphenated 'room_id' (e.g., 'dark-forest-entrance-001', 'village-well-002', 'river-crossing-north-001').
                -   This NEW 'room_id' you create for 'room_location_user' here will be the EXACT 'room_id' that the 'update_room_context' tool (which runs next) MUST use when it creates the details for this new room and sets 'user_in_room: true'.
            -   **If the user HAS MOVED to an EXISTING conceptual area** that likely ALREADY HAS a 'room_id' (discernible from context or game flow):
                -   Set 'room_location_user' to that specific, existing 'room_id'. The 'update_room_context' tool MUST then find and update this existing room, using this exact 'room_id', and set its 'user_in_room: true'.
            -   **If the user has NOT MOVED from their current room** (e.g., they interacted within the same room):
                -   'room_location_user' MUST REMAIN UNCHANGED. It should be '${currentActualRoomIdInStory || 'the_current_room_id_if_any'}'.
            -   This 'room_location_user' value is PARAMOUNT for game consistency.
        4.  'previous_user_location':
            -   If the user HAS MOVED (i.e., the new 'room_location_user' is different from '${currentActualRoomIdInStory || 'null'}'): Set 'previous_user_location' to '${currentActualRoomIdInStory || 'null'}'.
            -   If the user has NOT MOVED: 'previous_user_location' should remain unchanged from its value in the 'Current Story State'.
        5.  Update all other story_details fields based on the conversation, maintaining relevant existing information.
        Ensure all IDs are strings. Consistency in 'room_location_user' is vital.`
      },
      {
        role: "user", // This user message is for the AI generating the story_details
        content: `Based on the LATEST assistant message in the history (which describes the user's new location and actions) and all provided context:
        1. Determine if the user moved to a new location or stayed in the same one ('${currentActualRoomIdInStory || 'their_current_room_id_if_any'}').
        2. If they moved to a NEW conceptual area, create a NEW, simple, hyphenated 'room_id' for 'room_location_user' (e.g., 'market-square-001'). This ID MUST be used by the subsequent room update tool.
        3. If they moved to an EXISTING area (check game context), use its known 'room_id'.
        4. If they did NOT move, 'room_location_user' MUST be '${currentActualRoomIdInStory || 'the_current_room_id_if_any'}'.
        5. Set 'previous_user_location' to '${currentActualRoomIdInStory || 'null'}' ONLY IF they moved to a different room.
        6. Update 'current_room_name' to the new room's descriptive name.
        7. Set 'active_game' appropriately.
        Output the full 'story_details' object.`
      },
    ];


  const tools = [
    {
      type: "function",
      function: {
        name: "update_story_context",
        description: "Generates an updated story outline based on conversation and existing data.",
        parameters: {
          type: "object",
          properties: {
            story_details: {
              type: "object",
              properties: {
                language_spoken: { type: "string", description: "Language user is interacting in." },
                character_played_by_user: { type: "string", description: "User's character name in the game." },
                player_resources: { type: "string", description: "Player's resources, e.g., Gold: 200, Lumber: 300." },
                player_attitude: { type: "string", description: "Player's behavioral profile." },
                player_lives_in_real_life: { type: "string", description: "User's real-life location if shared." },
                game_description: { type: "string", description: "Overall description of the game/adventure." },
                player_profile: { type: "string", description: "General profile of the player (not character)." },
                education_level: { type: "string", description: "User's education level if shared." },
                time_period: { type: "string", description: "Historical time period of the game." },
                story_location: { type: "string", description: "Geographical location of the story." },
                previous_user_location: { type: "string", description: "The room_id user was in before the current room. Null if new game." },
                room_location_user: { type: "string", description: "The room_id user is currently in. Must match an existing room_id." },
                current_room_name: { type: "string", description: "The name of the room user is currently in." },
                active_game: { type: "boolean", description: "True if game is active, false otherwise. Set to false on quit/end." },
                save_key: { type: "string", description: "Unique save key for the game session (e.g., word-verb-noun)." },
              },
              required: [
                "language_spoken", "character_played_by_user", "player_resources", "player_attitude",
                "player_lives_in_real_life", "game_description", "player_profile", "education_level",
                "time_period", "story_location", "previous_user_location", "room_location_user",
                "current_room_name", "active_game", "save_key"
              ]
            }
          },
          required: ["story_details"]
        }
      }
    }
  ];
  return { messages, tools };
}


async function updateRoomContext(userId, ioInstance) {
  console.log("[data.js/updateRoomContext] Starting for user:", userId);
  const filePaths = await ensureUserDirectoryAndFiles(userId);
  const userData = await getUserData(userId); // Fetches all data including story

  // CRITICAL: Get the target room ID that storyContext should have set
  const targetCurrentRoomIdFromStory = userData.story && userData.story.room_location_user
                                      ? String(userData.story.room_location_user)
                                      : null;

  if (!targetCurrentRoomIdFromStory) {
    console.warn(`[data.js/updateRoomContext] story.room_location_user is null for user ${userId}. Cannot reliably update room context. Skipping.`);
    return; // Or handle as an error / no-op
  }
  console.log(`[data.js/updateRoomContext] Target current room_id from story for user ${userId} is: '${targetCurrentRoomIdFromStory}'`);


  const allRoomsArrayForContext = userData.allRooms || []; // Use allRooms from getUserData
  const recentMessages = userData.conversation.slice(-5);
  const conversationForGPT = recentMessages.map(m => `User: ${m.userPrompt || ''}\nAssistant: ${m.response || ''}`).join("\n\n");
  console.log("[data.js/updateRoomContext] History for GPT:", conversationForGPT.substring(0,200)+"...");

  // Pass targetCurrentRoomIdFromStory to the prompt generation
  const { messages, tools } = getRoomContextMessagesForUpdate(allRoomsArrayForContext, conversationForGPT, targetCurrentRoomIdFromStory);

  console.log("[data.js/updateRoomContext] Calling OpenAI for room update...");
  try {
    const response = await openai.chat.completions.create({ model: "gpt-4.1", messages, tools, tool_choice: "auto" });
    console.log("[data.js/updateRoomContext] OpenAI response for room.");
    await processGPTResponseForRoomUpdate(response, filePaths, userId, ioInstance, targetCurrentRoomIdFromStory); // Pass target ID for validation
  } catch (error) { console.error("[data.js/updateRoomContext] Failed:", error); }
}


async function processGPTResponseForRoomUpdate(response, filePaths, userId, ioInstance, expectedCurrentRoomId) {
  const responseMessage = response.choices[0].message;
  console.log("[data.js/processGPTResponseForRoomUpdate] Processing OpenAI response:", JSON.stringify(responseMessage).substring(0,200)+"...");
  if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
    const toolCall = responseMessage.tool_calls[0];
    if (toolCall.function.name === "update_room_context") {
      try {
        const functionArgs = JSON.parse(toolCall.function.arguments);
        console.log("[data.js/processGPTResponseForRoomUpdate] Args for update_room_context:", functionArgs);

        let foundExpectedRoom = false;
        const roomsFromToolWithStringId = functionArgs.rooms.map(r => {
          const currentRoomIsThisOne = String(r.room_id) === String(expectedCurrentRoomId);
          if (currentRoomIsThisOne && r.user_in_room !== true) {
            console.warn(`[data.js/processGPTResponseForRoomUpdate] WARNING: Room '${r.room_id}' (matches expected current) returned by tool with user_in_room:false. Forcing to true.`);
            r.user_in_room = true;
          }
          if (currentRoomIsThisOne) {
            foundExpectedRoom = true;
          }
          if (r.user_in_room === true && !currentRoomIsThisOne) {
            console.warn(`[data.js/processGPTResponseForRoomUpdate] WARNING: Tool set user_in_room:true for '${r.room_id}', but expected current room was '${expectedCurrentRoomId}'. Forcing user_in_room:false for this unexpected room.`);
            r.user_in_room = false;
          }
          return { ...r, room_id: String(r.room_id) };
        });

        if (!foundExpectedRoom && roomsFromToolWithStringId.length > 0) {
            // If the exact ID wasn't found but rooms were returned, this is a problem.
            // For now, we'll log a severe warning. Ideally, you might try to find the *one* room marked user_in_room:true by the LLM
            // and if its ID is different, you might have to reconcile story.room_location_user.
            // Or, if no room is marked user_in_room:true, you might default to the first one and force it.
            // This indicates the LLM failed to follow the strict 'room_id' instruction for the target room.
            console.error(`[data.js/processGPTResponseForRoomUpdate] CRITICAL MISMATCH: Tool did not return a room object with the expected current room_id: '${expectedCurrentRoomId}'. The LLM may have changed the ID. Attempting to find a room with user_in_room:true instead.`);
            let actualCurrentRoomFromTool = roomsFromToolWithStringId.find(r => r.user_in_room === true);
            if (actualCurrentRoomFromTool) {
                console.warn(`[data.js/processGPTResponseForRoomUpdate] Found room '${actualCurrentRoomFromTool.room_id}' marked user_in_room:true by tool. This differs from expected '${expectedCurrentRoomId}'. Game state might become inconsistent if story.room_location_user isn't updated to match this.`);
                // Potentially, you could update story.room_location_user here, but it's messy.
                // For now, the existing `updateRoomData` will proceed and the mismatch will persist for this turn.
            } else {
                console.error(`[data.js/processGPTResponseForRoomUpdate] NO ROOM FOUND with user_in_room:true from tool. This is a major failure. The user will likely be in an undefined state.`);
                // Not calling updateRoomData might be safer here, or calling it with an empty array.
                return; // Exit early
            }
        } else if (!foundExpectedRoom && roomsFromToolWithStringId.length === 0) {
             console.warn(`[data.js/processGPTResponseForRoomUpdate] Tool returned no rooms and did not include expected current room_id: '${expectedCurrentRoomId}'.`);
        }


        await updateRoomData(roomsFromToolWithStringId, filePaths.room, userId, ioInstance);
        console.log("[data.js/processGPTResponseForRoomUpdate] Room data update process done.");
      } catch (e) { console.error("[data.js/processGPTResponseForRoomUpdate] Error parsing room args:", e, toolCall.function.arguments); }
    } else console.log("[data.js/processGPTResponseForRoomUpdate] Unexpected tool call:", toolCall.function.name);
  } else console.log("[data.js/processGPTResponseForRoomUpdate] No tool call for room update.");
}


          function getRoomContextMessagesForUpdate(allRoomsArray, conversationForGPT, targetCurrentRoomIdFromStory) {
            const allRoomsJson = JSON.stringify(allRoomsArray || [], null, 2);
            const messages = [
              {
                role: "system",
                content: `You are a DM. Your task is to update or create room data based on the latest conversation and the user's current location.
                CONTEXT:
                - Existing room data (array of all known room objects): ${allRoomsJson}
                - Latest Conversation History (user's latest action is at the end):\n${conversationForGPT}
                - CRITICAL TARGET: The user is NOW considered to be in the room with 'room_id': '${targetCurrentRoomIdFromStory}'. This ID was determined by the preceding story update logic.

                INSTRUCTIONS FOR 'rooms' ARRAY OUTPUT (ABSOLUTE PRECISION REQUIRED):
                1.  The primary focus is the room where the user is currently located: '${targetCurrentRoomIdFromStory}'.
                    -   If '${targetCurrentRoomIdFromStory}' corresponds to an EXISTING room_id in the 'Existing room data':
                        -   You MUST find that room object.
                        -   You MUST use its EXACT, UNCHANGED 'room_id': '${targetCurrentRoomIdFromStory}'. DO NOT ALTER THIS ID.
                        -   Update its other properties (description, characters, etc.) based on the LATEST conversation.
                        -   Set 'user_in_room: true' for THIS room.
                    -   If '${targetCurrentRoomIdFromStory}' is a NEW 'room_id' (meaning it's not in 'Existing room data'):
                        -   You MUST create a NEW room object.
                        -   Its 'room_id' MUST be EXACTLY '${targetCurrentRoomIdFromStory}'. DO NOT DEVIATE FROM THIS ID.
                        -   Populate its properties based on the LATEST conversation.
                        -   Set 'user_in_room: true' for THIS room.
                2.  For ANY OTHER rooms that might be mentioned or relevant from the conversation (but are NOT '${targetCurrentRoomIdFromStory}'):
                    -   If they are existing rooms, update them using their existing 'room_id's.
                    -   If they are new conceptual areas (and NOT '${targetCurrentRoomIdFromStory}'), assign them new, unique, simple, hyphenated 'room_id's.
                    -   ALL these other rooms MUST have 'user_in_room: false'.
                3.  Ensure the room object for '${targetCurrentRoomIdFromStory}' has a detailed 'room_description_for_dalle'.
                4.  Ensure at least two 'available_directions' for the room '${targetCurrentRoomIdFromStory}'.
                5.  Return an array of room objects. This array MUST include the updated/created room object for '${targetCurrentRoomIdFromStory}' (with 'user_in_room: true'), and any other relevant updated/new rooms (all with 'user_in_room: false').
                ACCURACY OF 'room_id' FOR '${targetCurrentRoomIdFromStory}' IS PARAMOUNT.`
              },
              {
                role: "user",
                content: `Based on the LATEST assistant message in the history and all provided context:
                The user is now in room '${targetCurrentRoomIdFromStory}'.
                1. If room '${targetCurrentRoomIdFromStory}' already exists in the provided room data, update it. ITS 'room_id' MUST BE '${targetCurrentRoomIdFromStory}'. Set 'user_in_room: true'.
                2. If room '${targetCurrentRoomIdFromStory}' is new, create it. ITS 'room_id' MUST BE '${targetCurrentRoomIdFromStory}'. Set 'user_in_room: true'.
                3. Describe any other relevant rooms, ensuring they have 'user_in_room: false'.
                4. Provide a 'room_description_for_dalle' for room '${targetCurrentRoomIdFromStory}'.
                Output the 'rooms' array.`
              },
            ];
  const tools = [ /* Kept original tool definition */
    { type: "function", function: {
        name: "update_room_context", description: "You must describe every location described in the conversation...",
        parameters: { type: "object", properties: { rooms: { type: "array", items: { type: "object", properties: {
            room_name: { type: "string", /* descriptions from original */ },
            room_id: { type: "string", description: "A unique identifier for the room, string type..." }, // Ensure string type
            interesting_details: { type: "string", /* ... */ },
            available_directions: { type: "string", /* ... */ },
            characters_in_room: { type: "string", /* ... */ },
            actions_taken_in_room: { type: "string", /* ... */ },
            room_description_for_dalle: { type: "string", /* ... */ },
            user_in_room: { type: "boolean", /* ... */ },
        }, required: [
            "room_name", "room_id", "interesting_details", "available_directions", "characters_in_room",
            "actions_taken_in_room", "room_description_for_dalle", "user_in_room",
        ]}}}}, required: ["rooms"]}}];
  return { messages, tools };
}


async function updateRoomData(updatedRoomsFromTool, roomArrayPath, userId, ioInstance) {
  console.log(`[data.js/updateRoomData] START User: ${userId}, Path: ${roomArrayPath}. Received ${updatedRoomsFromTool.length} rooms from tool.`);
  let existingRoomDataArray = (await readJsonFromFirebase(roomArrayPath, `updateRoomData - existing for ${userId}`)) || [];
  console.log(`[data.js/updateRoomData] Initial existing rooms count for user ${userId}: ${existingRoomDataArray.length}`);
  let currentRoomForImageGeneration = null;

  const storyData = await readJsonFromFirebase(`data/users/${userId}/story`, `updateRoomData - storyData for ${userId}`);
  const currentUserRoomIdFromStory = storyData ? String(storyData.room_location_user) : null; // Ensure string or null
  console.log(`[data.js/updateRoomData] Current room_location_user from story for user ${userId}: '${currentUserRoomIdFromStory}'`);

  if (!Array.isArray(updatedRoomsFromTool)) {
    console.error(`[data.js/updateRoomData] ERROR: updatedRoomsFromTool is not an array for user ${userId}. Value:`, updatedRoomsFromTool);
    // Potentially return or throw to prevent further processing with invalid data
    return;
  }

  for (const roomFromTool of updatedRoomsFromTool) {
    if (!roomFromTool || typeof roomFromTool.room_id === 'undefined') {
      console.warn(`[data.js/updateRoomData] WARNING: Skipping a room object from tool because it's invalid or missing room_id. Room data from tool:`, roomFromTool);
      continue; // Skip this malformed room object
    }
    const toolRoomIdStr = String(roomFromTool.room_id); // Ensure string for consistent comparison
    const index = existingRoomDataArray.findIndex(r => r && String(r.room_id) === toolRoomIdStr);

    if (index !== -1) { // Room exists, update it
      const existingRoom = existingRoomDataArray[index];
      console.log(`[data.js/updateRoomData] UPDATING existing room '${toolRoomIdStr}' for user ${userId}.`);
      // console.log(`[data.js/updateRoomData] Existing room data before merge:`, JSON.stringify(existingRoom));
      // console.log(`[data.js/updateRoomData] Room data from tool for merge:`, JSON.stringify(roomFromTool));

      let newImageUrl;
      if (roomFromTool.image_url !== undefined) {
        newImageUrl = roomFromTool.image_url; // Use tool's image_url if provided (even if null)
        // console.log(`[data.js/updateRoomData] Using image_url from tool for room '${toolRoomIdStr}': '${newImageUrl}'`);
      } else {
        newImageUrl = existingRoom.image_url || null; // Otherwise, use existing or default to null
        // console.log(`[data.js/updateRoomData] Tool did not provide image_url for room '${toolRoomIdStr}'. Preserving existing: '${newImageUrl}' (defaulted to null if was undefined/falsey).`);
      }

      existingRoomDataArray[index] = {
        ...existingRoom,  // Preserve all fields from existing room first
        ...roomFromTool,   // Override with all fields from tool's version of the room
        image_url: newImageUrl, // Explicitly set image_url using the logic above
      };
      // console.log(`[data.js/updateRoomData] Room '${toolRoomIdStr}' data after merge:`, JSON.stringify(existingRoomDataArray[index]));
    } else { // New room, add it
      console.log(`[data.js/updateRoomData] ADDING new room '${toolRoomIdStr}' for user ${userId}.`);
      // console.log(`[data.js/updateRoomData] New room data from tool:`, JSON.stringify(roomFromTool));
      existingRoomDataArray.push({
        ...roomFromTool,
        image_url: roomFromTool.image_url || null, // Ensure image_url is explicitly null if not provided by tool or is falsey
      });
      // console.log(`[data.js/updateRoomData] New room '${toolRoomIdStr}' added with image_url: '${roomFromTool.image_url || null}'`);
    }

    // Check if this room (new or updated) is the current user's room and needs an image
    if (toolRoomIdStr === currentUserRoomIdFromStory) {
      const finalRoomStateInArray = existingRoomDataArray.find(r => String(r.room_id) === toolRoomIdStr); // Re-find to get the merged state
      if (finalRoomStateInArray) { // Ensure the room was actually found/added
        // console.log(`[data.js/updateRoomData] Room '${toolRoomIdStr}' IS current. Checking for image gen. Dalle prompt: '${finalRoomStateInArray.room_description_for_dalle ? "Exists" : "Missing"}'. Current image_url: '${finalRoomStateInArray.image_url}'`);
        if (finalRoomStateInArray.room_description_for_dalle && !finalRoomStateInArray.image_url) {
          currentRoomForImageGeneration = finalRoomStateInArray;
          console.log(`[data.js/updateRoomData] SUCCESS: Room '${toolRoomIdStr}' is current AND has DALL-E prompt AND no image_url. Flagged for image generation.`);
        } else {
          // console.log(`[data.js/updateRoomData] INFO: Room '${toolRoomIdStr}' is current but either no DALL-E prompt or image_url already exists. No image gen needed now.`);
        }
      }
    }
  }

  // Final check for any undefined image_urls before writing
  existingRoomDataArray.forEach(room => {
    if (room.image_url === undefined) {
      console.warn(`[data.js/updateRoomData] CRITICAL PRE-WRITE CHECK: Room '${room.room_id}' has undefined image_url. Setting to null for user ${userId}.`);
      room.image_url = null;
    }
  });

  // console.log(`[data.js/updateRoomData] FINAL data to be written to Firebase for user ${userId}:`, JSON.stringify(existingRoomDataArray, null, 2).substring(0, 500) + "...");

  try {
    await writeJsonToFirebase(roomArrayPath, existingRoomDataArray);
    console.log(`[data.js/updateRoomData] SUCCESS: Saved ${existingRoomDataArray.length} rooms for user ${userId} to ${roomArrayPath}.`);
  } catch (error) {
      console.error(`[data.js/updateRoomData] FATAL ERROR: Failed to write room data for user ${userId} to ${roomArrayPath}. Error:`, error);
      // Depending on desired behavior, you might re-throw or handle gracefully.
      // For now, the error will propagate from writeJsonToFirebase if it throws.
  }


  if (currentRoomForImageGeneration) {
    console.log(`[data.js/updateRoomData] Proceeding to generate image for room '${currentRoomForImageGeneration.room_id}' (${currentRoomForImageGeneration.room_name}) for user ${userId}.`);
    await generateStoryImage(userId, currentRoomForImageGeneration.room_description_for_dalle, currentRoomForImageGeneration, ioInstance);
  } else {
    console.log(`[data.js/updateRoomData] No current room was flagged for immediate image generation for user ${userId}.`);
  }
  console.log(`[data.js/updateRoomData] END User: ${userId}, Path: ${roomArrayPath}.`);
}

async function updateRoomImageUrl(userId, roomId, imageUrl, ioInstance) { // roomId should be string
  console.log(`[data.js/updateRoomImageUrl] START User: ${userId}, RoomID: '${roomId}', Attempting to set URL: '${imageUrl ? imageUrl.substring(0,50)+'...' : 'null'}'`);
  const roomArrayPath = `data/users/${userId}/room`;
  try {
    let roomsArray = await readJsonFromFirebase(roomArrayPath, `updateRoomImageUrl - for ${userId}`);
    if (Array.isArray(roomsArray)) {
      const roomIndex = roomsArray.findIndex(r => r && String(r.room_id) === String(roomId));
      if (roomIndex !== -1) {
        if (roomsArray[roomIndex].image_url === imageUrl) {
          console.log(`[data.js/updateRoomImageUrl] INFO: Image URL for room '${roomId}' (user ${userId}) is already set to '${imageUrl}'. No update needed.`);
        } else {
          roomsArray[roomIndex].image_url = imageUrl; // Directly assign, can be null if imageUrl is null
          await writeJsonToFirebase(roomArrayPath, roomsArray);
          console.log(`[data.js/updateRoomImageUrl] SUCCESS: Image URL for room '${roomId}' (user ${userId}) updated in Firebase.`);
        }
        if (ioInstance) {
          ioInstance.to(userId).emit("newImageUrlForRoom", { roomId: String(roomId), imageUrl: imageUrl });
          console.log(`[data.js/updateRoomImageUrl] Emitted 'newImageUrlForRoom' for room '${roomId}' to user ${userId}.`);
        } else {
          console.warn(`[data.js/updateRoomImageUrl] WARNING: ioInstance not provided for room '${roomId}' (user ${userId}), cannot emit socket event.`);
        }
      } else {
        console.error(`[data.js/updateRoomImageUrl] ERROR: Room '${roomId}' not found in array for user ${userId}. Cannot update image URL.`);
      }
    } else {
      console.error(`[data.js/updateRoomImageUrl] ERROR: Rooms data at ${roomArrayPath} is not an array for user ${userId}. Value:`, roomsArray);
    }
  } catch (error) {
    console.error(`[data.js/updateRoomImageUrl] FATAL ERROR updating image URL for room '${roomId}' of user ${userId}:`, error);
  }
  console.log(`[data.js/updateRoomImageUrl] END User: ${userId}, RoomID: '${roomId}'.`);
}


async function updatePlayerContext(userId, ioInstance) { // ioInstance kept for consistency
  console.log("[data.js/updatePlayerContext] Starting for user:", userId);
  const filePaths = await ensureUserDirectoryAndFiles(userId);
  const userData = await getUserData(userId);
  const playerArrayForContext = userData.player || []; // Should be an array
  const storyDataForContext = userData.story || {};
  const recentMessages = userData.conversation.slice(-5);
  const formattedHistory = recentMessages.map(msg => `#${msg.messageId || 'N/A'} [${msg.timestamp || 'N/A'}]: User: ${msg.userPrompt || ''}\nAssistant: ${msg.response || ''}`).join("\n\n");
  console.log("[data.js/updatePlayerContext] History (last 5):", formattedHistory.substring(0,200)+"...");
  const { messages, tools } = getPlayerContextMessages(storyDataForContext, playerArrayForContext, formattedHistory);
  console.log("[data.js/updatePlayerContext] Calling OpenAI for player update...");
  try {
    const response = await openai.chat.completions.create({ model: "gpt-4.1", messages, tools, tool_choice: "auto" });
    const responseMessage = response.choices[0].message;
    console.log("[data.js/updatePlayerContext] OpenAI response for player:", JSON.stringify(responseMessage).substring(0,200)+"...");
    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      const functionCall = responseMessage.tool_calls[0];
      console.log("[data.js/updatePlayerContext] Tool call for player:", functionCall.function.name);
      if (functionCall.function.name === "update_player_context") {
        try {
          const functionArgs = JSON.parse(functionCall.function.arguments);
          console.log("[data.js/updatePlayerContext] Player args:", functionArgs);
          const updatedPlayersFromTool = functionArgs.players; // Expected array
          const playersWithStrId = updatedPlayersFromTool.map(p => ({ ...p, player_id: String(p.player_id) })); // Original uses integer, ensure string
          let existingPlayerDataArray = (await readJsonFromFirebase(filePaths.player)) || [];
          console.log(`[data.js/updatePlayerContext] Existing players: ${existingPlayerDataArray.length}`);
          playersWithStrId.forEach(updatedPlayer => {
            const idx = existingPlayerDataArray.findIndex(p => p && String(p.player_id) === String(updatedPlayer.player_id));
            if (idx !== -1) {
              console.log(`[data.js/updatePlayerContext] Updating player: ${updatedPlayer.player_id}`);
              existingPlayerDataArray[idx] = { ...existingPlayerDataArray[idx], ...updatedPlayer };
            } else {
              console.log(`[data.js/updatePlayerContext] Adding new player: ${updatedPlayer.player_id}`);
              existingPlayerDataArray.push(updatedPlayer);
            }
          });
          await writeJsonToFirebase(filePaths.player, existingPlayerDataArray);
          console.log(`[data.js/updatePlayerContext] Players saved for ${userId}. New count: ${existingPlayerDataArray.length}`);
        } catch (e) { console.error("[data.js/updatePlayerContext] Error parsing player args:", e, functionCall.function.arguments); }
      }
    } // Original returned responseMessage.content here, removed as function call is primary path.
  } catch (error) { console.error("[data.js/updatePlayerContext] Failed player update:", error); } // Original threw error
}

function getPlayerContextMessages(storyData, playerData, formattedHistory) { // playerData is array
  const storyDataJson = JSON.stringify(storyData || {}, null, 2);
  const playerDataJson = JSON.stringify(playerData || [], null, 2);
  const messages = [ /* Original messages */
    { role: "system", content: `You are a world class dungeon master... Story: ${storyDataJson}. Players: ${playerDataJson}. History:\n${formattedHistory} ...` },
    { role: "user", content: `You must identify every character...` },
  ];
  const tools = [ /* Original tool definition, player_id was integer, changed to string */
    { type: "function", function: {
        name: "update_player_context", description: "You must identify every character...",
        parameters: { type: "object", properties: { players: { type: "array", items: { type: "object", properties: {
            player_name: { type: "string", /* descriptions from original */ },
            player_id: { type: "string", description: "Unique ID, string type (e.g., 'player1'). Must be > '0' if numeric." }, // Changed to string
            player_looks: { type: "string", /* ... */ },
            player_location: { type: "string", /* ... */ },
            player_health: { type: "string", /* ... */ },
        }, required: [ /* Kept player_type from original required, though not in properties. Add to properties if needed. */
            "player_name", "player_id", "player_type", "player_looks", "player_location", "player_health",
        ]}}}}, required: ["players"]}}];
  return { messages, tools };
}

async function updateQuestContext(userId, ioInstance) { // ioInstance kept
  console.log("[data.js/updateQuestContext] Starting for user:", userId);
  const filePaths = await ensureUserDirectoryAndFiles(userId);
  const userData = await getUserData(userId);
  const questArrayForContext = userData.quest || []; // Should be an array
  const storyDataForContext = userData.story || {};
  const recentMessages = userData.conversation.slice(-5);
  const formattedHistory = recentMessages.map(msg => `#${msg.messageId || 'N/A'} [${msg.timestamp || 'N/A'}]: User: ${msg.userPrompt || ''}\nAssistant: ${msg.response || ''}`).join("\n\n");
  console.log("[data.js/updateQuestContext] History (last 5):", formattedHistory.substring(0,200)+"...");
  const { messages, tools } = getQuestContextMessages(storyDataForContext, questArrayForContext, formattedHistory);
  console.log("[data.js/updateQuestContext] Calling OpenAI for quest update...");
  try {
    const response = await openai.chat.completions.create({ model: "gpt-4.1", messages, tools, tool_choice: "auto" });
    const responseMessage = response.choices[0].message;
    console.log("[data.js/updateQuestContext] OpenAI response for quest:", JSON.stringify(responseMessage).substring(0,200)+"...");
    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      const functionCall = responseMessage.tool_calls[0];
      console.log("[data.js/updateQuestContext] Tool call for quest:", functionCall.function.name);
      if (functionCall.function.name === "update_quest_context") {
        try {
          const functionArgs = JSON.parse(functionCall.function.arguments);
          console.log("[data.js/updateQuestContext] Quest args:", functionArgs);
          const updatedQuestsFromTool = functionArgs.quests; // Expected array
          const questsWithStrId = updatedQuestsFromTool.map(q => ({ ...q, quest_id: String(q.quest_id) })); // Original uses string
          let existingQuestDataArray = (await readJsonFromFirebase(filePaths.quest)) || [];
          console.log(`[data.js/updateQuestContext] Existing quests: ${existingQuestDataArray.length}`);
          questsWithStrId.forEach(updatedQuest => {
            const idx = existingQuestDataArray.findIndex(q => q && String(q.quest_id) === String(updatedQuest.quest_id));
            if (idx !== -1) {
              console.log(`[data.js/updateQuestContext] Updating quest: ${updatedQuest.quest_id}`);
              existingQuestDataArray[idx] = { ...existingQuestDataArray[idx], ...updatedQuest };
            } else {
              console.log(`[data.js/updateQuestContext] Adding new quest: ${updatedQuest.quest_id}`);
              existingQuestDataArray.push(updatedQuest);
            }
          });
          await writeJsonToFirebase(filePaths.quest, existingQuestDataArray);
          console.log(`[data.js/updateQuestContext] Quests saved for ${userId}. New count: ${existingQuestDataArray.length}`);
        } catch (e) { console.error("[data.js/updateQuestContext] Error parsing quest args:", e, functionCall.function.arguments); }
      }
    } // Original returned responseMessage.content here
  } catch (error) { console.error("[data.js/updateQuestContext] Failed quest update:", error); } // Original threw error
}

function getQuestContextMessages(storyData, questData, conversationForGPT) { // questData is array
  const storyDataJson = JSON.stringify(storyData || {}, null, 2);
  const questDataJson = JSON.stringify(questData || [], null, 2);
  const messages = [ /* Original messages */
    { role: "system", content: `You are a world class dungeon master... Story data: Here is the story and user data: ${storyDataJson}. Current crisis data: ${questDataJson} and Message History:\n${conversationForGPT} ...`},
    { role: "system", content: `Story data: Here is the story and user data: ${storyDataJson}. Current crisis data: ${questDataJson} and Message History:\n${conversationForGPT}` }, // Duplicate from original
    { role: "user", content: `You are a world class dungeon master... extract the data about the crisis into the fields...`},
  ];
  const tools = [ /* Original tool definition, quest_id is string */
    { type: "function", function: {
        name: "update_quest_context", description: "You are a world class dungeon master... extract the data about the crisis into the fields...",
        parameters: { type: "object", properties: { quests: { type: "array", items: { type: "object", properties: {
            quest_id: { type: "string", description: "A unique identifier for the crisis, string type..." }, // Original was string
            quest_name: { type: "string", /* description from original */ },
            quest_characters: { type: "string", /* ... */ },
            quest_steps: { type: "string", /* ... */ },
            quest_completed_percentage: { type: "integer", /* ... */ },
        }, required: [ /* Kept from original */
            "quest_id", "quest_name", "quest_characters", "quest_steps", "quest_completed_percentage",
        ]}}}}, required: ["quests"]}}];
  return { messages, tools };
}

async function generateStoryImage(userId, roomDescriptionForDalle, roomObject, ioInstance) {
  console.log(`[data.js/generateStoryImage] START - User: ${userId}, RoomID: ${roomObject.room_id}, DALL-E Prompt: "${roomDescriptionForDalle.substring(0, 70)}..."`);

  if (roomObject.image_url) {
    console.log(`[data.js/generateStoryImage] Room ${roomObject.room_id} already has an image_url: ${roomObject.image_url.substring(0,70)}... Skipping generation.`);
    return roomObject.image_url;
  }
  if (!roomDescriptionForDalle || roomDescriptionForDalle.trim() === "") {
    console.warn(`[data.js/generateStoryImage] WARNING - User: ${userId}, RoomID: ${roomObject.room_id} - Empty or missing room_description_for_dalle. Skipping generation.`);
    return null;
  }

  const storyData = await readJsonFromFirebase(`data/users/${userId}/story`, `generateStoryImage - storyData for ${userId}`);
  const timePeriod = storyData.time_period || "an unspecified time period";
  const storyLocation = storyData.story_location || "an unspecified location";
  console.log(`[data.js/generateStoryImage] Context for prompt - Time: ${timePeriod}, Location: ${storyLocation}`);

  const fullPrompt = `This is for a text based adventure game set in the ${timePeriod} at ${storyLocation}. The style is like Oregon Trail or Zork, so create an image in an old pixel game style. DO NOT PUT ANY TEXT OR WORDS IN THE IMAGE. If there are any copyright issues, generate an image that just shows the background and objects, no characters at all. Generate an image based on the following summary of the scene: ${roomDescriptionForDalle}`;
  console.log("[data.js/generateStoryImage] Constructed Full DALL-E Prompt (first 200 chars):", fullPrompt.substring(0,200) + "...");

  try {
    const imageGenParams = {
        model: "gpt-image-1", // Explicitly using gpt-image-1
        prompt: fullPrompt,
        n: 1,
        size: "1024x1024",     // Valid size for gpt-image-1
        quality: "auto",       // Valid quality for gpt-image-1 (high, medium, low, auto)
        output_format: "png",  // Explicitly requesting PNG, default for gpt-image-1 anyway
        // 'response_format' is NOT used for gpt-image-1, it always returns b64_json
    };
    console.log("[data.js/generateStoryImage] Calling OpenAI Images API with params:", JSON.stringify(imageGenParams, null, 2));

    const response = await openai.images.generate(imageGenParams);
    console.log("[data.js/generateStoryImage] OpenAI Images API response received.");

    if (response && response.data && response.data[0] && response.data[0].b64_json) {
        const imageBase64 = response.data[0].b64_json;
        console.log("[data.js/generateStoryImage] Successfully received b64_json data from OpenAI (length):", imageBase64.length);

        // Convert base64 string to a Buffer
        console.log("[data.js/generateStoryImage] Converting b64_json to Buffer...");
        const imageBuffer = Buffer.from(imageBase64, 'base64');
        console.log("[data.js/generateStoryImage] Buffer created successfully, size:", imageBuffer.length);

        // Pass the buffer to uploadImageToFirebase
        const firebaseImageUrl = await uploadImageToFirebase(imageBuffer, userId, roomObject.room_id, "image/png"); // Pass mime type, and room_id for better logging

        if (firebaseImageUrl) {
            console.log(`[data.js/generateStoryImage] Image successfully uploaded to Firebase. URL: ${firebaseImageUrl.substring(0,70)}...`);
            // Update the room object in Firebase with the new image URL
            await updateRoomImageUrl(userId, String(roomObject.room_id), firebaseImageUrl, ioInstance);
            console.log(`[data.js/generateStoryImage] FINISHED SUCCESSFULLY - User: ${userId}, RoomID: ${roomObject.room_id}`);
            return firebaseImageUrl;
        } else {
            console.error(`[data.js/generateStoryImage] ERROR - User: ${userId}, RoomID: ${roomObject.room_id} - Image upload to Firebase failed after generation.`);
            return null;
        }
    } else {
        console.error("[data.js/generateStoryImage] ERROR - Invalid response structure from OpenAI Images API. Expected 'response.data[0].b64_json'. Response data:", JSON.stringify(response.data, null, 2).substring(0, 500) + "...");
        return null;
    }

  } catch (error) {
    console.error(`[data.js/generateStoryImage] FATAL ERROR - User: ${userId}, RoomID: ${roomObject.room_id} - Failed to generate or process story image:`, error);
    if (error.response && error.response.data) {
        console.error("[data.js/generateStoryImage] OpenAI API Error Details during image generation:", JSON.stringify(error.response.data, null, 2));
    }
    return null;
  }
}


// Modified uploadImageToFirebase to accept imageBuffer or imageUrlFromDalle (for DALL-E 2/3 compatibility if needed)
async function uploadImageToFirebase(imageBuffer, userId, roomIdForLog, mimeType = "image/png") {
  console.log(`[data.js/uploadImageToFirebase] START - User: ${userId}, RoomID for log: ${roomIdForLog}. Attempting to upload image buffer (size: ${imageBuffer.length}) with mimeType: ${mimeType}`);

  const uniqueFileName = `${Date.now()}-${userId}-${roomIdForLog}-${Math.random().toString(36).substring(2, 10)}.png`; // More descriptive filename
  const firebaseFilePath = `images/${userId}/${uniqueFileName}`; // Path within Firebase Storage
  const file = bucket.file(firebaseFilePath);

  try {
    if (!Buffer.isBuffer(imageBuffer)) {
      console.error(`[data.js/uploadImageToFirebase] ERROR - User: ${userId}, RoomID: ${roomIdForLog} - Input is not a Buffer. Type: ${typeof imageBuffer}`);
      throw new Error("Invalid imageDataSource: Must be a Buffer.");
    }

    console.log(`[data.js/uploadImageToFirebase] Resizing image to 512x512 PNG for user ${userId}, room ${roomIdForLog}...`);
    const resizedBuffer = await sharp(imageBuffer)
        .resize(512, 512) // Resize
        .png()            // Ensure PNG format after resize
        .toBuffer();
    console.log(`[data.js/uploadImageToFirebase] Image resized successfully for user ${userId}, room ${roomIdForLog}. New buffer size: ${resizedBuffer.length}`);

    console.log(`[data.js/uploadImageToFirebase] Saving resized image to Firebase Storage at: ${firebaseFilePath} for user ${userId}, room ${roomIdForLog}`);
    await file.save(resizedBuffer, {
        metadata: {
            contentType: "image/png", // Explicitly PNG
            cacheControl: 'public, max-age=31536000' // Long cache for images
        }
    });
    console.log(`[data.js/uploadImageToFirebase] Image saved successfully to Firebase Storage for user ${userId}, room ${roomIdForLog}. Path: ${firebaseFilePath}`);

    // Get a publicly accessible signed URL (long-lived)
    console.log(`[data.js/uploadImageToFirebase] Generating signed URL for ${firebaseFilePath} for user ${userId}, room ${roomIdForLog}...`);
    const [signedUrl] = await file.getSignedUrl({
        action: "read",
        expires: "03-09-2491" // A very distant future date for a "permanent" URL
    });
    console.log(`[data.js/uploadImageToFirebase] Signed URL obtained successfully for user ${userId}, room ${roomIdForLog}: ${signedUrl.substring(0, 100)}...`);
    console.log(`[data.js/uploadImageToFirebase] FINISHED SUCCESSFULLY - User: ${userId}, RoomID: ${roomIdForLog}.`);
    return signedUrl;

  } catch (error) {
    console.error(`[data.js/uploadImageToFirebase] FATAL ERROR - User: ${userId}, RoomID: ${roomIdForLog} - Error during image upload or processing:`, error);
    return null;
  }
}

async function clearGameData(userId, ioInstance) {
  console.log(`[data.js/clearGameData] Clearing all game-specific data for user ${userId}`);
  const filePaths = await ensureUserDirectoryAndFiles(userId);
  await writeJsonToFirebase(filePaths.conversation, []);
  await writeJsonToFirebase(filePaths.room, []);
  await writeJsonToFirebase(filePaths.player, []);
  await writeJsonToFirebase(filePaths.quest, []);
  console.log(`[data.js/clearGameData] Cleared conversation, room, player, quest arrays for user ${userId}.`);

  const storyData = await readJsonFromFirebase(filePaths.story) || {};
  const clearedStoryData = { /* Kept from original, ensuring all fields are reset or preserved as intended */
    language_spoken: storyData.language_spoken || "English",
    player_lives_in_real_life: storyData.player_lives_in_real_life || "",
    education_level: storyData.education_level || "",
    player_profile: storyData.player_profile || "",
    active_game: false, character_played_by_user: "", current_room_name: "", game_description: "",
    previous_user_location: null, room_location_user: null, player_resources: "",
    story_location: "", time_period: "", save_key: "", player_attitude: ""
  };
  await writeJsonToFirebase(filePaths.story, clearedStoryData);
  console.log(`[data.js/clearGameData] Story object reset for user ${userId}.`);

  if (ioInstance) {
    ioInstance.to(userId).emit("gameCleared");
    ioInstance.to(userId).emit("roomData", { room_id: null, image_url: null });
    console.log(`[data.js/clearGameData] Emitted 'gameCleared' and null 'roomData' to user ${userId}`);
  }
}

module.exports = {
  updateRoomContext, updatePlayerContext, updateStoryContext, updateQuestContext,
  generateStoryImage, uploadImageToFirebase, clearGameData,
};

