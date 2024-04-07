// util.js
const fs = require("fs").promises;
const path = require("path");

async function ensureUserDirectoryAndFiles(userId) {
  console.log("[ensureUserDirectoryAndFiles] Called with userId:", userId);

  const userDirPath = path.join(__dirname, "data", "users", userId);

  console.log(
    "[ensureUserDirectoryAndFiles] User directory path:",
    userDirPath,
  );

  await fs.mkdir(userDirPath, { recursive: true });

  console.log("[ensureUserDirectoryAndFiles] Directory ensured for user");

  const filePaths = {
    conversation: path.join(userDirPath, "conversation.json"),
    room: path.join(userDirPath, "room.json"),
    player: path.join(userDirPath, "player.json"),
    story: path.join(userDirPath, "story.json"),
    quest: path.join(userDirPath, "quest.json"),
  };

  console.log(
    "[ensureUserDirectoryAndFiles] Checking and initializing files if needed.",
  );

  for (const [key, filePath] of Object.entries(filePaths)) {
    try {
      await fs.access(filePath);
      console.log(
        `[ensureUserDirectoryAndFiles] ${key} file exists, skipping creation.`,
      );
    } catch {
      console.log(
        `[ensureUserDirectoryAndFiles] ${key} file does not exist, creating.`,
      );
      // Initializing conversation.json with an array and others with an empty object
      const initialContent = key === "conversation" ? [] : {};
      await fs.writeFile(filePath, JSON.stringify(initialContent, null, 2));
      console.log(
        `[ensureUserDirectoryAndFiles] ${key} file created with initial content.`,
      );
    }
  }

  return filePaths;
}

async function getUserData(filePaths) {
  console.log("[getUserData] Called with filePaths:", filePaths);

  const conversationData = await readJsonFileSafe(filePaths.conversation, []);
  console.log("[getUserData] Conversation data fetched:", conversationData);

  const roomData = await readJsonFileSafe(filePaths.room, {});
  console.log("[getUserData] Room data fetched:", roomData);

  const playerData = await readJsonFileSafe(filePaths.player, {});
  console.log("[getUserData] Player data fetched:", playerData);

  const storyData = await readJsonFileSafe(filePaths.story, {});
  console.log("[getUserData] Story data fetched:", storyData);

  const questData = await readJsonFileSafe(filePaths.quest, {});
  console.log("[getUserData] Quest data fetched:", questData);

  const lastFiveMessages = conversationData; // Assuming conversationData is always an array
  console.log("[getUserData] Last 5 conversation messages:", lastFiveMessages);

  console.log("[getUserData] Final fetched data:", {
    conversationData,
    roomData,
    playerData,
    storyData,
    questData,
  });

  return {
    conversationHistory: conversationData.conversationHistory || [],
    room: roomData,
    player: playerData,
    story: storyData,
    quest: questData,
  };
}

async function readJsonFileSafe(filePath, defaultValue) {
  try {
    const fileContent = await fs.readFile(filePath, "utf8");
    console.log(
      `[readJsonFileSafe] Raw file content for ${filePath}:`,
      fileContent,
    );
    return JSON.parse(fileContent);
  } catch (error) {
    console.log(
      `[readJsonFileSafe] Could not read ${filePath}, defaulting to:`,
      defaultValue,
    );
    return defaultValue;
  }
}

module.exports = {
  ensureUserDirectoryAndFiles,
  getUserData,
};
