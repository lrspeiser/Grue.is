const express = require("express");

const { initializeApp, getApps, getApp } = require("firebase/app");
const { getDatabase, ref, set, get, update } = require("firebase/database");

const app = express();

// Firebase configuration
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
  console.log("Firebase app initialized successfully.");
} else {
  firebaseApp = getApp();
}

const dbClient = getDatabase(firebaseApp);

// Function to set up a listener on room data
function setupRoomDataListener(userId) {
  const roomRef = ref(dbClient, `data/users/${userId}/story/room_location_user`);
  onValue(roomRef, (snapshot) => {
    if (snapshot.exists()) {
      const roomLocationUser = snapshot.val();
      console.log(`[Firebase Listener] Room location updated for user ${userId}: ${roomLocationUser}`);
      io.to(userId).emit('roomData', { room_id: roomLocationUser });
    } else {
      console.log(`[Firebase Listener] No room location data found for user ${userId}`);
    }
  }, (error) => {
    console.error(`[Firebase Listener] Error listening to room location data for user ${userId}:`, error);
  });
}


async function ensureUserDirectoryAndFiles(userId) {
  const basePath = `data/users/${userId}`;
  const dataPaths = {
    conversation: `${basePath}/conversation`,
    room: `${basePath}/room`,
    player: `${basePath}/player`,
    story: `${basePath}/story`,
    quest: `${basePath}/quest`,
  };

  // Check for existing data or create initial structure
  for (const [key, path] of Object.entries(dataPaths)) {
    console.log(
      `[ensureUserDirectoryAndFiles] Checking or creating data for ${key} at ${path}`,
    );
    const existingData = await readJsonFromFirebase(path);
    if (existingData === null) {
      console.log(
        `[ensureUserDirectoryAndFiles] No existing ${key} data found, creating initial data.`,
      );
      const initialContent = key === "conversation" ? [] : {};
      await writeJsonToFirebase(path, initialContent);
      console.log(
        `[ensureUserDirectoryAndFiles] Initial ${key} data created for user ${userId}.`,
      );
    } else {
      console.log(
        `[ensureUserDirectoryAndFiles] Existing data found for ${key}, no need to create.`,
      );
    }
  }

  return dataPaths;
}

async function writeJsonToFirebase(path, data) {
  try {
    await set(ref(dbClient, path), data);
    //console.log(`[writeJsonToFirebase] Data successfully written to path: ${path}`, data,);
  } catch (error) {
    console.error(
      `[writeJsonToFirebase] Error writing data to Firebase at path ${path}: ${error}`,
    );
    throw error;
  }
}

async function readJsonFromFirebase(path, caller) {
  try {
    console.log(`[readJsonFromFirebase] Called by: ${caller}`);

    const snapshot = await get(ref(dbClient, path));
    if (snapshot.exists()) {
      const data = snapshot.val();
      console.log(`[readJsonFromFirebase] Data found at path: ${path}`);
      return data;
    } else {
      console.log(`[readJsonFromFirebase] No data found at path: ${path}`);
      return null;
    }
  } catch (error) {
    console.error(
      `[readJsonFromFirebase] Error reading data from Firebase at path ${path}:`,
      error,
    );
    throw error;
  }
}

async function getUserData(userId) {
  console.log("[getUserData] Called for user:", userId);

  const basePath = `data/users/${userId}`;
  const filePaths = {
    conversation: `${basePath}/conversation`,
    room: `${basePath}/room`,
    player: `${basePath}/player`,
    story: `${basePath}/story`,
    quest: `${basePath}/quest`,
  };

  const data = {
    conversation:
      (await readJsonFromFirebase(
        filePaths.conversation,
        "getUserData - conversation",
      )) || [],
    room: {},
    player:
      (await readJsonFromFirebase(filePaths.player, "getUserData - player")) ||
      {},
    story:
      (await readJsonFromFirebase(filePaths.story, "getUserData - story")) ||
      {},
    quest:
      (await readJsonFromFirebase(filePaths.quest, "getUserData - quest")) ||
      {},
    latestImageUrl: null, // Initialize latestImageUrl as null
  };

  // Fetch the room data using the 'room_location_user' identifier from the story
  if (data.story && data.story.room_location_user) {
    console.log(
      "[getUserData] Current room fetched:",
      data.story.room_location_user,
    );
    const roomPath = `${basePath}/room/${data.story.room_location_user}`;
    data.room = await readJsonFromFirebase(roomPath, "getUserData - room");
    if (data.room) {
      data.latestImageUrl = data.room.image_url || null;
      console.log(
        `[getUserData] Latest image URL fetched: ${data.latestImageUrl}`,
      );
    } else {
      console.log(
        "[getUserData] No valid room data found for the given room identifier.",
      );
    }
  } else {
    console.log(
      "[getUserData] 'room_location_user' is not defined in the story data.",
    );
  }

  return data;
}

module.exports = {
  ensureUserDirectoryAndFiles,
  getUserData,
  writeJsonToFirebase,
  readJsonFromFirebase,
  setupRoomDataListener,
};
