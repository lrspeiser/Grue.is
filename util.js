// util.js - don't remove this line so you know what file it is. Don't remove content or logging when updating this file.

const { getDbClient } = require("./dbClient");
const { ref, get, set, update } = require("firebase/database");
const db = getDbClient();

async function useDbClient() {
  console.log("[useDbClient] Fetching data for 'key' from Firebase");
  const dbRef = ref(db, "key"); // Example key, change as per your data structure
  try {
    const snapshot = await get(dbRef);
    const value = snapshot.exists() ? snapshot.val() : null;
    console.log("[useDbClient] Value fetched from Firebase:", value);
  } catch (error) {
    console.error("[useDbClient] Failed to fetch data from Firebase:", error);
  }
}

useDbClient();

async function ensureUserDirectoryAndFiles(userId) {
  console.log("[ensureUserDirectoryAndFiles] Starting", userId);
  const userRef = ref(db, `users/${userId}`);
  const initData = {
    conversations: [], // List of conversations
    rooms: [], // List of rooms
    players: [], // List of players
    story: {
      active_game: false, // Single object for the story
    },
    quests: [], // List of quests
  };
  console.log("[ensureUserDirectoryAndFiles] Setting initial data...");
  await set(userRef, initData)
    .then(() => {
      console.log("[ensureUserDirectoryAndFiles] Data set for user", userId);
    })
    .catch((error) => {
      console.error(
        "[ensureUserDirectoryAndFiles] Error setting data for",
        userId,
        error,
      );
    });
  console.log("[ensureUserDirectoryAndFiles] Completed for", userId);
}

async function getUserData(userId) {
  console.log(
    "[getUserData] Fetching user data from Firebase for user ID:",
    userId,
  );
  if (!userId) {
    console.error("[getUserData] Error: User ID is undefined.");
    return null; // Return null to indicate failure
  }
  const userRef = ref(db, `users/${userId}`);
  console.log(`[getUserData] Fetching data for user ID: ${userId}`);
  try {
    const dataSnapshot = await get(userRef);
    if (dataSnapshot.exists()) {
      const userData = dataSnapshot.val();
      console.log("[getUserData] Data fetched for user ID:", userId, userData);
      return userData;
    } else {
      console.log(`[getUserData] No data found for user ID: ${userId}`);
      return null; // Return null to handle this cleanly in your logic
    }
  } catch (error) {
    console.error(
      "[getUserData] Error fetching data for user ID:",
      userId,
      error,
    );
    return null; // Return null to handle errors cleanly
  }
}

module.exports = {
  ensureUserDirectoryAndFiles,
  getUserData,
};
