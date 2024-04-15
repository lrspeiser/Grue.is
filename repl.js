const readline = require("readline").createInterface({
  input: process.stdin,
  output: process.stdout,
});
const { getClient } = require("./dbClient");

async function setKeyValue(key, value) {
  const db = await getClient();
  await db.set(key, value);
  console.log(`Key "${key}" set to "${value}"`);
}

async function getKeyValue(key) {
  const db = await getClient();
  let value = await db.get(key);

  // Check if the value is an object and stringify it for logging
  if (typeof value === 'object') {
    value = JSON.stringify(value, null, 2); // Beautify the JSON output
  }

  console.log(`Value for "${key}": ${value}`);
}


async function deleteKey(key) {
  const db = await getClient();
  await db.delete(key);
  console.log(`Key "${key}" deleted`);
}

async function listAllKeys() {
  const db = await getClient();
  const keys = await db.list();
  console.log("All keys:", keys.join(", "));
}

async function listKeysWithPrefix(prefix) {
  const db = await getClient();
  const keys = await db.list(prefix);
  console.log(`Keys with prefix "${prefix}":`, keys.join(", "));
}

function mainMenu() {
  console.log("Initializing client...");
  getClient().then(() => {
    console.log("Client initialized successfully.");
    readline.question(`
Choose an option:
1. Set a key-value pair
2. Get a key's value
3. Delete a key
4. List all keys
5. List keys with a prefix
Enter your choice: `, async (choice) => {
      switch (choice.trim()) {
        case '1':
          readline.question("Enter key and value separated by a space: ", async (input) => {
            const [key, value] = input.split(" ");
            await setKeyValue(key, value);
            readline.close();
          });
          break;
        case '2':
          readline.question("Enter key: ", async (key) => {
            await getKeyValue(key);
            readline.close();
          });
          break;
        case '3':
          readline.question("Enter key: ", async (key) => {
            await deleteKey(key);
            readline.close();
          });
          break;
        case '4':
          await listAllKeys();
          readline.close();
          break;
        case '5':
          readline.question("Enter prefix: ", async (prefix) => {
            await listKeysWithPrefix(prefix);
            readline.close();
          });
          break;
        default:
          console.log("Invalid choice.");
          readline.close();
      }
    });
  });
}

mainMenu();
