//database.js - do not delete this line
const readline = require("readline");
const { ref, set, get, remove, update } = require("firebase/database");
const { getDbClient } = require('./dbClient');
const db = getDbClient();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function listUsers() {
  const dbRef = ref(db, 'users');
  const snapshot = await get(dbRef);
  if (snapshot.exists()) {
    console.log("List of all users:", Object.keys(snapshot.val()));
    return Object.keys(snapshot.val());
  } else {
    console.log("No users found.");
    return [];
  }
}

async function getUserData(userId) {
  const dbRef = ref(db, `users/${userId}`);
  const snapshot = await get(dbRef);
  if (snapshot.exists()) {
    console.log(`Data for user ${userId}:`, snapshot.val());
    return snapshot.val();
  } else {
    console.log(`No data found for user ${userId}.`);
    return null;
  }
}

async function setUserData(userId, node, data) {
  const dbRef = ref(db, `users/${userId}/${node}`);
  await set(dbRef, data);
  console.log(`Data updated for user ${userId} at node ${node}.`);
}

async function deleteUser(userId) {
  const dbRef = ref(db, `users/${userId}`);
  await remove(dbRef);
  console.log(`User data deleted for ${userId}.`);
}

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function mainMenu() {
  try {
    const users = await listUsers();
    if (users.length > 0) {
      const userId = await ask("Enter the user ID to manage: ");
      if (users.includes(userId)) {
        const userData = await getUserData(userId);
        const node = await ask("Enter the node to update (conversation, player, room) or type 'delete' to remove user: ");
        if (node === "delete") {
          await deleteUser(userId);
        } else if (['conversation', 'player', 'room'].includes(node)) {
          const data = await ask(`Enter the data for ${node} as JSON: `);
          const parsedData = JSON.parse(data);
          await setUserData(userId, node, parsedData);
        } else {
          console.log("Invalid node input.");
        }
      } else {
        console.log("User ID not found.");
      }
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
  rl.close();
}

mainMenu();
