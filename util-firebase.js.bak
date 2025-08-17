// util.js
const express = require("express"); // This was in your original util.js, keeping it.
const { initializeApp, getApps, getApp } = require("firebase/app"); // Kept from original
const { getDatabase, ref, set, get, update, onValue } = require("firebase/database"); // Added onValue as setupRoomDataListener uses it

const app = express(); // This was in your original util.js, keeping it.

// --- Start of dbClient Injection Pattern ---
let dbClientInternal; // This will store the dbClient instance passed from index.js

// Function to allow index.js to set the dbClient instance
function setDbClient(client) {
    if (!dbClientInternal) { // To prevent accidental reassignment
        dbClientInternal = client;
        console.log("[util.js] dbClientInternal has been set by index.js.");
    } else {
        console.warn("[util.js] Attempted to set dbClientInternal again. It's already set.");
    }
}

// Internal helper function to get the dbClient instance for use within this file
function getDb() {
    if (!dbClientInternal) {
        console.error("FATAL [util.js]: dbClientInternal is not set. Ensure index.js calls setDbClient(dbClient) after initializing its dbClient.");
        throw new Error("dbClient not initialized for util.js operations. Critical setup error.");
    }
    return dbClientInternal;
}
// --- End of dbClient Injection Pattern ---


// Firebase configuration and initialization THAT WAS AT THE TOP OF YOUR util.js IS NOW REDUNDANT
// if index.js provides the dbClient.
// For clarity, I am removing it here, assuming index.js is the sole initializer of the client DB.
/*
const firebaseConfig = {
  apiKey: process.env["FIREBASE_API_KEY"],
  authDomain: process.env["authDomain"],
  databaseURL: process.env["databaseURL"],
  projectId: process.env["projectId"],
  storageBucket: process.env["storageBucket"],
  messagingSenderId: process.env["messagingSenderId"],
  appId: process.env["appId"],
  measurementId: process.env["measurementId"],
};

let firebaseApp;
if (!getApps().length) {
  firebaseApp = initializeApp(firebaseConfig);
  console.log("Firebase app initialized successfully IN UTIL.JS (this might be redundant).");
} else {
  firebaseApp = getApp();
}
const localDbClientInUtil = getDatabase(firebaseApp); // This local dbClient is what we are replacing with the injected one.
*/


// Function to set up a listener on room data
// This function was in your original util.js.
// Note: `io` would need to be passed if this function is responsible for socket emissions.
// The primary listener is in index.js. This might be for a specific, different purpose.
function setupRoomDataListener(userId, io) { // Assuming io might be passed for emits
  console.log(`[util.js/setupRoomDataListener] Setting up listener for user ${userId}.`);
  const roomRefPath = `data/users/${userId}/story/room_location_user`;
  try {
    const roomRef = ref(getDb(), roomRefPath ); // Use injected DB client
    onValue(
      roomRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const roomLocationUser = snapshot.val();
          console.log(`[util.js/Firebase Listener] Room location updated for user ${userId}: ${roomLocationUser}`);
          // If this listener needs to emit, `io` must be valid and passed.
          // Example: if (io) io.to(userId).emit("roomDataFromUtilListener", { room_id: roomLocationUser });
        } else {
          console.log(`[util.js/Firebase Listener] No room location data found for user ${userId} at ${roomRefPath}`);
        }
      },
      (error) => {
        console.error(`[util.js/Firebase Listener] Error listening for user ${userId} at ${roomRefPath}:`, error);
      }
    );
  } catch (error) {
    console.error(`[util.js/setupRoomDataListener] Error setting up ref for ${roomRefPath}:`, error);
  }
}

async function ensureUserDirectoryAndFiles(userId) {
  const basePath = `data/users/${userId}`;
  const dataPaths = {
    conversation: `${basePath}/conversation`,
    room: `${basePath}/room`, // This will store an array of room objects
    player: `${basePath}/player`, // This will store an array of player objects
    story: `${basePath}/story`,   // This will store the story object
    quest: `${basePath}/quest`,   // This will store an array of quest objects
  };

  for (const [key, path] of Object.entries(dataPaths)) {
    // console.log(`[util.js/ensureUserDirectoryAndFiles] Checking/creating for ${key} at ${path}`);
    const existingData = await readJsonFromFirebase(path, `ensureUserDir - ${key}`);
    if (existingData === null) { // Only create if truly null (path doesn't exist or has no data)
      // console.log(`[util.js/ensureUserDirectoryAndFiles] No existing ${key} data, creating initial for ${path}.`);
      // Initialize room, player, quest, conversation as empty arrays.
      // Initialize story with default object.
      const initialContent = (key === "story")
                             ? { language_spoken: "English", active_game: false, room_location_user: null, previous_user_location: null /* other defaults */ }
                             : []; // Empty array for conversation, room, player, quest
      await writeJsonToFirebase(path, initialContent);
      // console.log(`[util.js/ensureUserDirectoryAndFiles] Initial ${key} data created for user ${userId}.`);
    }
  }
  return dataPaths;
}

async function writeJsonToFirebase(path, data) {
  try {
    await set(ref(getDb(), path), data); // Use injected DB client
    // console.log(`[util.js/writeJsonToFirebase] Data successfully written to path: ${path}`);
  } catch (error) {
    console.error(`[util.js/writeJsonToFirebase] Error writing to Firebase at path ${path}:`, error);
    throw error; // Re-throw to allow caller to handle
  }
}

async function readJsonFromFirebase(path, caller = "unknown") {
  try {
    // console.log(`[util.js/readJsonFromFirebase] Attempting read from path: ${path} (Caller: ${caller})`);
    const snapshot = await get(ref(getDb(), path)); // Use injected DB client
    if (snapshot.exists()) {
      // console.log(`[util.js/readJsonFromFirebase] Data found at path: ${path}`);
      return snapshot.val();
    } else {
      // console.log(`[util.js/readJsonFromFirebase] No data found at path: ${path}`);
      return null; // Consistent return for "not found"
    }
  } catch (error) {
    console.error(`[util.js/readJsonFromFirebase] Error reading from Firebase at path ${path} (Caller: ${caller}):`, error);
    throw error; // Re-throw
  }
}

async function getUserData(userId) {
  console.log(`[util.js/getUserData] Called for user: ${userId}`);

  // First, ensure the basic directory structure and default files/arrays exist.
  // This prevents errors if we try to read a path that hasn't been initialized yet.
  await ensureUserDirectoryAndFiles(userId);

  const basePath = `data/users/${userId}`;
  const filePaths = {
    conversation: `${basePath}/conversation`,
    roomArray: `${basePath}/room`,    // Path to the array of all rooms
    playerArray: `${basePath}/player`,  // Path to the array of all players
    story: `${basePath}/story`,
    questArray: `${basePath}/quest`,    // Path to the array of all quests
  };

  // Fetch all primary data pieces
  const storyData = (await readJsonFromFirebase(filePaths.story, "getUserData - story")) ||
                    { active_game: false, room_location_user: null, previous_user_location: null, language_spoken: "English" }; // Robust default
  const conversationData = (await readJsonFromFirebase(filePaths.conversation, "getUserData - conversation")) || [];
  const allPlayersArray = (await readJsonFromFirebase(filePaths.playerArray, "getUserData - playerArray")) || [];
  const allQuestsArray = (await readJsonFromFirebase(filePaths.questArray, "getUserData - questArray")) || [];
  const allRoomsArray = (await readJsonFromFirebase(filePaths.roomArray, "getUserData - roomArray")) || [];

  let currentRoomObject = {}; // Default to empty object for current room
  let latestImageUrl = null;

  if (storyData && storyData.room_location_user) {
    const currentRoomId = String(storyData.room_location_user); // Ensure string for comparison
    // console.log(`[util.js/getUserData] Current room_location_user from story for user ${userId}: ${currentRoomId}`);

    // Find the current room object from the array of all rooms
    const foundRoom = allRoomsArray.find(r => r && String(r.room_id) === currentRoomId);
    if (foundRoom) {
      currentRoomObject = foundRoom;
      latestImageUrl = foundRoom.image_url || null;
      // console.log(`[util.js/getUserData] Current room object (ID: ${currentRoomId}) found for user ${userId}. Image URL: ${latestImageUrl}`);
    } else {
      // console.log(`[util.js/getUserData] Room ID ${currentRoomId} (from story) not found in user's allRoomsArray.`);
      // If the room_location_user points to a non-existent room_id, currentRoomObject remains empty.
    }
  } else {
    // console.log(`[util.js/getUserData] No 'room_location_user' in story data for user ${userId}, or story data is missing/defaulted.`);
  }

  // The original getUserData had logic to filter player and quest data by excluding key "0".
  // This is usually not needed if data is stored as true arrays from the start.
  // If your "player" and "quest" paths *might* contain an object with a "0" key to be ignored,
  // that filtering logic would need to be re-added here, operating on allPlayersArray/allQuestsArray.
  // For now, assuming they are clean arrays of objects.

  return {
    userId: userId, // For convenience
    conversation: conversationData,   // Array
    room: currentRoomObject,          // Object: the user's current room
    player: allPlayersArray,          // Array: all player characters related to the user
    story: storyData,                 // Object
    quest: allQuestsArray,            // Array: all quests related to the user
    latestImageUrl: latestImageUrl,
    allRooms: allRoomsArray,          // Array: all rooms defined for the user's game
  };
}

module.exports = {
  ensureUserDirectoryAndFiles,
  getUserData,
  writeJsonToFirebase,
  readJsonFromFirebase,
  setupRoomDataListener, // Kept from your original export
  // dbClient, // Not exporting the localDbClientInUtil as it's superseded by injected dbClientInternal
  setDbClient // Exporting the setter function
};