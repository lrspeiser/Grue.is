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
    };

    // Check for existing data or create initial structure
    for (const [key, path] of Object.entries(dataPaths)) {
        console.log(`[ensureUserDirectoryAndFiles] Checking or creating data for ${key} at ${path}`);
        const existingData = await readJsonFromFirebase(path);
        if (existingData === null) {
            console.log(`[ensureUserDirectoryAndFiles] No existing ${key} data found, creating initial data.`);
            const initialContent = (key === "conversation") ? [] : {};
            await writeJsonToFirebase(path, initialContent);
            console.log(`[ensureUserDirectoryAndFiles] Initial ${key} data created for user ${userId}.`);
        } else {
            console.log(`[ensureUserDirectoryAndFiles] Existing data found for ${key}, no need to create.`);
        }
    }

    return dataPaths;
}


// Update Firebase reading and writing functions accordingly
async function readJsonFromFirebase(path) {
    try {
        const snapshot = await get(ref(dbClient, path));
        if (snapshot.exists()) {
            const data = snapshot.val();
            console.log(`[readJsonFromFirebase] Data found at path: ${path}`, JSON.stringify(data, null, 2)); // Log the data in a readable format
            return data;
        } else {
            console.log(`[readJsonFromFirebase] No data found at path: ${path}`);
            return null;
        }
    } catch (error) {
        console.error(`[readJsonFromFirebase] Error reading data from Firebase at path ${path}:`, error);
        throw error;
    }
}


async function writeJsonToFirebase(path, data) {
    try {
        await set(ref(dbClient, path), data);
        console.log(`[writeJsonToFirebase] Data successfully written to path: ${path}`);
    } catch (error) {
        console.error(`[writeJsonToFirebase] Error writing data to Firebase at path ${path}: ${error}`);
        throw error;
    }
}


async function getUserData(filePaths) {
  console.log("[getUserData] Called with filePaths:", filePaths);

  const data = {};
  for (const [key, path] of Object.entries(filePaths)) {
    data[key] = await readJsonFromFirebase(path) || {};
    //console.log(`[getUserData] ${key} data fetched:`, data[key]);
  }

  //console.log("[getUserData] Final fetched data:", data);

  return data;
}

module.exports = {
  ensureUserDirectoryAndFiles,
  getUserData,
  writeJsonToFirebase,
  readJsonFromFirebase,
};
