// util.js
const fsp = require("fs").promises;
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const { Readable } = require('stream'); // Correctly import Readable

const serviceAccountCredentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

// Initialize Google Drive API
const auth = new google.auth.GoogleAuth({
  credentials: serviceAccountCredentials,
  scopes: ["https://www.googleapis.com/auth/drive"],
});

const driveService = google.drive({ version: "v3", auth });
const defaultParentId = process.env['google_drive']

async function createFolder(
  name,
  parentId = defaultParentId,
) {
  console.log(`[createFolder] Attempting to create or find folder: ${name}`);

  // Search for an existing folder with the same name under the same parent.
  try {
    const query = `mimeType='application/vnd.google-apps.folder' and name='${name}' and '${parentId}' in parents and trashed=false`;
    const searchResult = await driveService.files.list({
      q: query,
      spaces: "drive",
      fields: "files(id, name)",
    });

    if (searchResult.data.files.length > 0) {
      // If the folder already exists, use the existing folder's ID
      const existingFolderId = searchResult.data.files[0].id;
      console.log(
        `[createFolder] Existing folder found with ID: ${existingFolderId}`,
      );
      return existingFolderId;
    } else {
      // If the folder does not exist, create it
      const fileMetadata = {
        name: name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      };
      const folder = await driveService.files.create({
        resource: fileMetadata,
        fields: "id",
      });
      console.log(
        `[createFolder] New folder created with ID: ${folder.data.id}`,
      );
      return folder.data.id; // Return the new folder ID
    }
  } catch (error) {
    console.error(
      `[createFolder] Error checking or creating folder: ${error.message}`,
    );
    throw error;
  }
}

async function uploadJsonToDrive(folderId, name, dataPath) {
  console.log(
    `[uploadJsonToDrive] Uploading ${name} to folder ID: ${folderId}`,
  );

  // Step 1: Search for the file in the specified folder
  const searchResponse = await driveService.files.list({
    q: `name='${name}' and '${folderId}' in parents and trashed=false`,
    spaces: "drive",
    fields: "files(id)",
  });

  // Step 2: Read file content
  const fileContent = await fsp.readFile(dataPath, "utf8");

  // Step 3: Convert file content to a stream
  const media = {
    mimeType: "application/json",
    body: new Readable({
      read() {
        this.push(fileContent);
        this.push(null); // End of stream
      },
    }),
  };

  if (searchResponse.data.files.length > 0) {
    // File exists, update it
    const fileId = searchResponse.data.files[0].id;
    await driveService.files.update({
      fileId,
      media,
    });
    console.log(`[uploadJsonToDrive] Updated existing file: ${name}`);
  } else {
    // File does not exist, create it
    const fileMetadata = {
      name,
      parents: [folderId],
      mimeType: "application/json",
    };
    await driveService.files.create({
      resource: fileMetadata,
      media,
      fields: "id",
    });
    console.log(`[uploadJsonToDrive] Uploaded new file: ${name}`);
  }
}

async function ensureUserDirectoryAndFiles(userId) {
    console.log("[ensureUserDirectoryAndFiles] Called with userId:", userId);

    const userDirPath = path.join(__dirname, "data", "users", userId);
    console.log("[ensureUserDirectoryAndFiles] User directory path:", userDirPath);

    await fsp.mkdir(userDirPath, { recursive: true });
    console.log("[ensureUserDirectoryAndFiles] Directory ensured for user");

    const filePaths = {
        conversation: path.join(userDirPath, "conversation.json"),
        room: path.join(userDirPath, "room.json"),
        player: path.join(userDirPath, "player.json"),
        story: path.join(userDirPath, "story.json"),
        quest: path.join(userDirPath, "quest.json"),
    };

    let userFolderId;
    try {
        const storyContent = await fsp.readFile(filePaths.story, "utf8");
        const storyData = JSON.parse(storyContent);
        userFolderId = storyData.google_id;
        if (userFolderId) {
            console.log(`[ensureUserDirectoryAndFiles] Using existing Google Drive Folder ID from story.json: ${userFolderId}`);
        } else {
            throw new Error("Google Drive Folder ID not found or invalid in story.json");
        }
    } catch (error) {
        console.log("[ensureUserDirectoryAndFiles] Google Drive Folder ID not found or invalid in story.json, checking or creating new folder.");
        userFolderId = await createFolder(userId);
        let storyContent;
        try {
            storyContent = JSON.parse(await fsp.readFile(filePaths.story, "utf8"));
        } catch (error) {
            storyContent = {};
        }
        storyContent.google_id = userFolderId;
        await fsp.writeFile(filePaths.story, JSON.stringify(storyContent, null, 2));
        console.log("[ensureUserDirectoryAndFiles] story.json updated with Google Drive folder ID.");
    }

    for (const [key, filePath] of Object.entries(filePaths)) {
        try {
            await fsp.access(filePath);
            console.log(`[ensureUserDirectoryAndFiles] ${key} file exists, skipping creation.`);
        } catch (error) {
            console.log(`[ensureUserDirectoryAndFiles] ${key} file does not exist, creating.`);
            const initialContent = key === "conversation" ? [] : {};
            await fsp.writeFile(filePath, JSON.stringify(initialContent, null, 2));
            console.log(`[ensureUserDirectoryAndFiles] ${key} file created with initial content.`);
        }

        console.log(`[ensureUserDirectoryAndFiles] Initiating backup for ${key} file to Google Drive.`);
        uploadJsonToDrive(userFolderId, `${key}.json`, filePath)
            .then(() => console.log(`[ensureUserDirectoryAndFiles] Backup completed for ${key}.`))
            .catch(error => console.error(`[ensureUserDirectoryAndFiles] Backup failed for ${key}: ${error}`));
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
    const fileContent = await fsp.readFile(filePath, "utf8");
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
