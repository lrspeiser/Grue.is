const { initializeApp, getApps, getApp } = require("firebase/app");
const { getDatabase, ref, set, get, update } = require("firebase/database");

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

// Initialize Firebase app
let app;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
  console.log("Firebase app initialized successfully.");
} else {
  app = getApp();
}

// Initialize Firebase Database Client
const dbClient = getDatabase(app);

async function ensureUserDirectoryAndFiles(userId) {
  const basePath = `data/users/${userId}`;
  const dataPaths = {
    conversation: `${basePath}/conversation`,
    room: `${basePath}/room`,
    player: `${basePath}/player`,
    story: `${basePath}/story`,
    quest: `${basePath}/quest`,
    storyImage: `${basePath}/storyImage`,
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

async function readJsonFromFirebase(path) {
  try {
    const snapshot = await get(ref(dbClient, path));
    if (snapshot.exists()) {
      const data = snapshot.val();
      // console.log(`[readJsonFromFirebase] Data found at path: ${path}`, data);
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

async function writeJsonToFirebase(path, data) {
  try {
    await set(ref(dbClient, path), data);
    console.log(
      `[writeJsonToFirebase] Data successfully written to path: ${path}`,
      data,
    );
  } catch (error) {
    console.error(
      `[writeJsonToFirebase] Error writing data to Firebase at path ${path}: ${error}`,
    );
    throw error;
  }
}

async function getUserData(filePaths) {
  console.log("[getUserData] Called with filePaths:", filePaths);

  const data = {
    conversation: (await readJsonFromFirebase(filePaths.conversation)) || [],
    room: (await readJsonFromFirebase(filePaths.room)) || [],
    player: (await readJsonFromFirebase(filePaths.player)) || {},
    story: (await readJsonFromFirebase(filePaths.story)) || {},
    quest: (await readJsonFromFirebase(filePaths.quest)) || {},
    storyImage: (await readJsonFromFirebase(filePaths.storyImage)) || {},
  };

  // console.log("[getUserData] Fetched data:", data);

  // Retrieve the current room location from the story data
  if (data.story && data.story.room_location_user !== undefined) {
    const currentRoomLocation = data.story.room_location_user;
    console.log(`[getUserData] Current room location from story: ${currentRoomLocation}`);
    // console.log("[getUserData] Entire room data:", data.room); // Log entire room data to verify structure

    // Verify the room data structure and retrieve current room data
    if (currentRoomLocation >= 0 && currentRoomLocation < data.room.length) {
      const currentRoom = data.room[currentRoomLocation];
      console.log(`[getUserData] Current room data:`, currentRoom);

      // Extract the image URL from the current room
      if (currentRoom && currentRoom.image_url) {
        data.latestImageUrl = currentRoom.image_url;
        console.log(`[getUserData] Latest image URL fetched from room data: ${data.latestImageUrl}`);
      } else {
        console.log("[getUserData] No image URL found in the current room data.");
        data.latestImageUrl = null;
      }
    } else {
      console.log(`[getUserData] No room found at index ${currentRoomLocation}. Check room data structure or room location index.`);
      data.latestImageUrl = null;
    }
  } else {
    console.log("[getUserData] No room_location_user found in the story data.");
    data.latestImageUrl = null;
  }

  // console.log("[getUserData] Returning data with potential image URL:", data);
  return data;
}




module.exports = {
  ensureUserDirectoryAndFiles,
  getUserData,
  writeJsonToFirebase,
  readJsonFromFirebase,
};
