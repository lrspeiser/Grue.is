// util.js
const fs = require('fs').promises;
const path = require('path');


async function ensureUserDirectoryAndFiles(userId) {
    console.log("[ensureUserDirectoryAndFiles] Called with userId:", userId);

    const userDirPath = path.join(__dirname, 'users', userId);
    console.log("[ensureUserDirectoryAndFiles] User directory path:", userDirPath);

    await fs.mkdir(userDirPath, { recursive: true });
    console.log("[ensureUserDirectoryAndFiles] Directory ensured for user");

    const filePaths = {
        conversation: path.join(userDirPath, "conversation.json"),
        room: path.join(userDirPath, "room.json"),
        player: path.join(userDirPath, "player.json"),
    };

    console.log("[ensureUserDirectoryAndFiles] Checking and initializing files if needed.");
    for (const [key, filePath] of Object.entries(filePaths)) {
        try {
            await fs.access(filePath);
            console.log(`[ensureUserDirectoryAndFiles] ${key} file exists, skipping creation.`);
        } catch {
            console.log(`[ensureUserDirectoryAndFiles] ${key} file does not exist, creating.`);
            const initialContent = key === 'conversation' ? { conversationHistory: [] } : {};
            await fs.writeFile(filePath, JSON.stringify(initialContent, null, 2));
            console.log(`[ensureUserDirectoryAndFiles] ${key} file created.`);
        }
    }

    return filePaths;
}

async function getUserData(filePaths) {
    console.log("[getUserData] Called with filePaths:", filePaths);

    // Use readJsonFileSafe to safely read the JSON data with default values
    const conversationData = await readJsonFileSafe(filePaths.conversation, { conversationHistory: [] });
    console.log("[getUserData] Conversation data fetched:", conversationData);

    const roomData = await readJsonFileSafe(filePaths.room, {});
    console.log("[getUserData] Room data fetched:", roomData);

    const playerData = await readJsonFileSafe(filePaths.player, {});
    console.log("[getUserData] Player data fetched:", playerData);

    // Extract the last five messages from the conversation history safely
  const lastFiveMessages = (conversationData.conversationHistory || []).slice(-5);
    console.log("[getUserData] Last 5 conversation messages:", lastFiveMessages);

    return {
        conversationHistory: lastFiveMessages,
        room: roomData,
        player: playerData,
    };
}


async function readJsonFileSafe(filePath, defaultValue) {
    try {
        const fileContent = await fs.readFile(filePath, 'utf8');
        return JSON.parse(fileContent);
    } catch (error) {
        console.log(`[readJsonFileSafe] Could not read ${filePath}, defaulting to:`, defaultValue);
        return defaultValue;
    }
}

module.exports = { ensureUserDirectoryAndFiles, getUserData };
