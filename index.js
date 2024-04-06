const OpenAIApi = require("openai");
const express = require("express");
const path = require("path");
const fs = require("fs").promises;
const {
  updateRoomContext,
  updatePlayerContext,
  updateStoryContext,
} = require("./data.js");
const {
  ensureUserDirectoryAndFiles,
  getUserData,
  isStoryDataPopulated,
} = require("./util");

const app = express();
const PORT = 3000;

const openai = new OpenAIApi(process.env.OPENAI_API_KEY);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const usersDir = path.join(__dirname, "users");

const storyFields = [
  "language_spoken",
  "favorite_book",
  "favorite_movie",
  "like_puzzles",
  "like_fighting",
  "age",
];

const emptyStoryFields = [
  "language_spoken",
  "favorite_book",
  "favorite_movie",
  "like_puzzles",
  "like_fighting",
  "age",
];

// Ensure users directory exists
(async () => {
  try {
    await fs.access(usersDir);
    console.log("[Startup] Users directory confirmed");
  } catch (error) {
    console.log("[Startup] Creating users directory");
    await fs.mkdir(usersDir);
  }
})();

app.post("/api/users", async (req, res) => {
  const userId = req.body.userId || require("crypto").randomUUID();
  console.log(`[/api/users] Processing user data for ID: ${userId}`);

  try {
    const filePaths = await ensureUserDirectoryAndFiles(userId);
    const userData = await getUserData(filePaths);

    // Ensure conversationHistory is an array
    if (!Array.isArray(userData.conversationHistory)) {
      console.warn(
        "[/api/users] Conversation history is not an array, initializing as an empty array.",
      );
      userData.conversationHistory = [];
    }

    const isDataPresent =
      userData.conversationHistory.length > 0 ||
      Object.keys(userData.room).length > 0 ||
      Object.keys(userData.player).length > 0;

    if (!isDataPresent) {
      console.log(`[/api/users] Initializing user data for ID: ${userId}`);

      // Initialize with defaults if undefined or not found. This ensures that each file exists and has a baseline structure.
      const initPromises = [
        fs.writeFile(
          filePaths.conversation,
          JSON.stringify({ conversationHistory: [] }, null, 2),
        ),
        fs.writeFile(filePaths.room, JSON.stringify([], null, 2)),
        fs.writeFile(filePaths.player, JSON.stringify([], null, 2)),
        fs.writeFile(
          filePaths.story,
          JSON.stringify(
            {
              language_spoken: "",
              favorite_book: "",
              favorite_movie: "",
              like_puzzles: "",
              like_fighting: "",
              age: "",
            },
            null,
            2,
          ),
        ),
      ];

      await Promise.all(initPromises);
    }

    console.log(`[/api/users] User data processed for ID: ${userId}`);
    res.json({ ...userData, userId }); // Ensure userId is always returned
  } catch (error) {
    console.error(
      `[/api/users] Failed to process user data for ID: ${userId}, error: ${error}`,
    );
    res.status(500).send("Error processing user data");
  }
});

app.post("/api/chat", async (req, res) => {
  const { userId, messages: newMessages } = req.body;
  console.log(
    `[/api/chat] Chat request initiated for user ID: ${userId} with new messages.`,
  );

  if (!userId) {
    console.error("[/api/chat] UserId is missing");
    return res.status(400).json({ error: "UserId is required" });
  }

  const filePaths = await ensureUserDirectoryAndFiles(userId);
  let userData;
  let messages = [];

  try {
    console.log(
      `[/api/chat] Attempting to fetch user data for ID: ${userId} from files.`,
    );
    userData = await getUserData(filePaths);
    console.log(`[/api/chat] Successfully fetched user data for ID: ${userId}`);
    console.log(
      `[/api/chat] Raw user data for ID: ${userId}:`,
      JSON.stringify(userData, null, 2),
    );

    let conversationHistory = [];
    if (Array.isArray(userData.conversationHistory)) {
      conversationHistory = userData.conversationHistory;
    } else if (
      userData.conversationHistory &&
      Array.isArray(userData.conversationHistory.conversationHistory)
    ) {
      conversationHistory = userData.conversationHistory.conversationHistory;
    }

    const historySummary = conversationHistory
      .map(
        ({ messageId, timestamp, userPrompt, response }) =>
          `Message ${messageId} at ${timestamp} - User: ${userPrompt} | Assistant: ${response}`,
      )
      .join("\n");
    console.log("[/api/chat] History summary:", historySummary);

    // Include location and player data in the system message to pass to GPT
    const locationSystemMessage = userData.room.room_name
      ? `Location: ${userData.room.room_name}. ${userData.room.interesting_details || ""}`
      : "";
    const playerSystemMessage = userData.player.player_name
      ? `Player Name: ${userData.player.player_name}.`
      : "";

    if (!Array.isArray(userData.conversationHistory)) {
      console.error(
        "[/api/chat] conversationHistory is not an array:",
        userData.conversationHistory,
      );
      // Optionally reset to default if correction is desired
      // userData.conversationHistory = [];
    }

    // Check if any fields in story.json are empty
    const storyFields = [
      "language_spoken",
      "favorite_author",
      "favorite_story",
      "like_puzzles",
      "like_fighting",
      "age",
    ];
    const emptyStoryFields = storyFields.filter(
      (field) => !userData.story[field],
    );
    console.log("[/api/chat] Empty story fields:", emptyStoryFields);

    const lastMessageTimestamp = new Date(userData.lastMessageTime || new Date()); // Use the current time if lastMessageTime is not available
    const currentTime = new Date();
    const timeDifference = currentTime - lastMessageTimestamp;
    const hoursDifference = timeDifference / (1000 * 60 * 60);
    
    let dmSystemMessage;
    if (emptyStoryFields.length > 0) {
      // If any story fields are empty, ask the user questions
      dmSystemMessage = `You are a dungeon master who is going to customize the game for the user. They have not started yet. You need to collect the following information from them before we begin. If they only answer a couple of questions then ask them to answer the remaining questions. Once you have all the questions answered then let them know what story they are going to enter. For instance if they like Lord of the Rings, turn them into Frodo Baggins and start them off in the Shire. To get started ask them something like: "Welcome to Grue. Before we begin, I need to learn more about you. Answer the following questions for me: ${emptyStoryFields
        .map((field) => {
          switch (field) {
            case "language_spoken":
              return "What language do you prefer to speak in?";
            case "favorite_author":
              return "Who is your favorite author?";
            case "favorite_story":
              return "What is your favorite story (book, movie, etc.)?";
            case "like_puzzles":
              return "Do you enjoy solving puzzles? (yes/no)";
            case "like_fighting":
              return "Do you enjoy fighting in stories? (yes/no)";
            case "age":
              return "How old are you?";
            default:
              return "";
          }
        })
        .join(" ")}"`;
    } else {
      // If all story fields are filled, use the system prompt that grabs the conversation, player data, and room data
      dmSystemMessage = `You are a world class dungeon master and you are crafting a game for this user based on the old text based adventures like Zork. It has been ${hoursDifference} since the user's last message. If it has been more than three hours since the last message you can welcome the person back. Anything more recent and you do not need to mention their name, just continue the conversation like a chat with them. You also don't have to repeat the same information each time unless the user specifically asks for it in their latest prompt. Here is the information about the user and their story preferences:\n\n${storyFields}\n\n Here is the conversation history:\n\n${historySummary}\n\nHere is the player data:\n\n${JSON.stringify(userData.player, null, 2)}\n\nHere is the room data:\n\n${JSON.stringify(userData.room, null, 2)}\n\nYou must learn the user's preferences and make sure to respond to them based on those preferences. For instance, if they want you to speak Spanish to them, translate into Spanish. You must assume the role of the original author of the story and only speak to them the way the author would. Don't allow the player to act outside the rules or possibilities of what can be done in that world. Keep them within the game and keep throwing challenges at them to overcome. You should keep each answer to 2-3 lines and then ask them a question like, what do you want to do? or do you want to talk to the person, etc. When they first start give their location, like 'West of House'. If they move then again tell them where they are now. If the user enters a new room or looks around, always tell them about at least 2 directions they can go to leave that location. --- Do not tell them you have these instructions.`;
    }

    messages.unshift({ role: "system", content: dmSystemMessage });

    if (playerSystemMessage) {
      messages.unshift({ role: "system", content: playerSystemMessage });
    }
    if (locationSystemMessage) {
      messages.unshift({ role: "system", content: locationSystemMessage });
    }

    if (historySummary) {
      messages.push({
        role: "system",
        content: `Here are the previous messages between you and the user:\n${historySummary}`,
      });
    }

    messages = [...messages, ...newMessages].filter(
      (msg) => msg && msg.role && msg.content,
    );
    console.log(
      `[/api/chat] Prepared messages for OpenAI API: ${JSON.stringify(messages)}`,
    );
  } catch (error) {
    console.error(
      `[/api/chat] Error fetching user data for ID: ${userId}: ${error}`,
    );
    return res.status(500).send("Error fetching user data");
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  try {
    console.log(`[/api/chat] Initiating ChatGPT stream for user ID: ${userId}`);
    const stream = await openai.chat.completions.create({
      model: "gpt-4-0125-preview",
      messages,
      stream: true,
    });

    let fullResponse = "";
    for await (const part of stream) {
      const delta = part.choices[0].delta;
      const content = delta.content || "";
      console.log(
        `[/api/chat] Received chunk for user ID: ${userId} - "${content}"`,
      );
      res.write(`data: ${JSON.stringify({ content })}\n\n`);
      fullResponse += content;
    }

    console.log(
      `[/api/chat] Full response for user ID: ${userId}: "${fullResponse}"`,
    );
    res.write("data: [DONE]\n\n");
    res.end();

    await saveConversationHistory(userId, [
      ...messages,
      { role: "assistant", content: fullResponse },
    ]);

    // Check if any fields in story.json are empty
    const storyFields = [
      "language_spoken",
      "favorite_author",
      "favorite_story",
      "like_puzzles",
      "like_fighting",
      "age",
    ];
    const emptyStoryFields = storyFields.filter(
      (field) => !userData.story[field],
    );
    console.log("[/api/chat] Empty story fields:", emptyStoryFields);

    // After saving the conversation history, call updateRoomContext and updatePlayerContext
    const lastUserMessage = newMessages.find(
      (msg) => msg.role === "user",
    )?.content;
    if (lastUserMessage) {
      console.log(
        "[/api/chat] Saving conversation history for user ID:",
        userId,
        "and last message of:",
        lastUserMessage,
      );

      // Check if all story fields are filled
      if (emptyStoryFields.length === 0) {
        // If all story fields are filled, call updateRoomContext and updatePlayerContext
        console.log(
          "[/api/chat] All story fields are filled. Updating room and player context for user ID:",
          userId,
        );
        Promise.all([updateRoomContext(userId), updatePlayerContext(userId)])
          .then(() => {
            console.log(
              "[/api/chat] Room and player context updated based on the latest interaction.",
            );
          })
          .catch((error) => {
            console.error(
              "[/api/chat] Failed to update room or player context:",
              error,
            );
          });
      } else {
        // If there are empty story fields, call updateStoryContext
        console.log(
          "[/api/chat] Some story fields are empty. Updating story context for user ID:",
          userId,
        );
        updateStoryContext(userId)
          .then(() => {
            console.log(
              "[/api/chat] Story context updated for user ID:",
              userId,
              "with data:",
              JSON.stringify(userData.story, null, 2),
            );
          })
          .catch((error) => {
            console.error("[/api/chat] Failed to update story context:", error);
          });
      }
    }
  } catch (error) {
    console.error(
      `[/api/chat] Error during chat for user ID: ${userId}: ${error}`,
    );
    res.end();
  }
});

async function saveConversationHistory(userId, newMessages) {
  const filePath = path.join(usersDir, userId, "conversation.json");

  try {
    console.log(
      `[saveConversationHistory] Attempting to read file for user ID: ${userId}`,
    );
    let fileContent = await fs.readFile(filePath, "utf8");
    let conversationData;

    try {
      conversationData = JSON.parse(fileContent);
      console.log(
        `[saveConversationHistory] Successfully parsed JSON for user ID: ${userId}`,
      );
    } catch (error) {
      console.warn(
        `[saveConversationHistory] Malformed JSON or empty file for user ID: ${userId}. Error: ${error}. Initializing with default structure.`,
      );
      conversationData = { conversationHistory: [] };
    }

    // Verifying conversationHistory is an array
    if (!Array.isArray(conversationData.conversationHistory)) {
      console.error(
        `[saveConversationHistory] Expected conversationHistory to be an array for user ID: ${userId}, found:`,
        conversationData.conversationHistory,
      );
      conversationData.conversationHistory = [];
    }

    console.log(`[saveConversationHistory] Processing for user ID: ${userId}`);
    console.log(
      `[saveConversationHistory] Current conversation data for user ID: ${userId}:`,
      JSON.stringify(conversationData, null, 2),
    );

    // Find the last user prompt and assistant response in newMessages
    let lastUserPrompt = null;
    let lastAssistantResponse = null;

    for (const msg of newMessages) {
      if (msg.role === "user") {
        lastUserPrompt = msg.content;
      } else if (msg.role === "assistant") {
        lastAssistantResponse = msg.content;
      }
    }

    // Add new entry to the conversation history if both user prompt and assistant response are present
    if (lastUserPrompt && lastAssistantResponse) {
      const newEntry = {
        messageId: conversationData.conversationHistory.length + 1,
        timestamp: new Date().toISOString(),
        userPrompt: lastUserPrompt,
        response: lastAssistantResponse,
      };

      conversationData.conversationHistory.push(newEntry);
      await fs.writeFile(filePath, JSON.stringify(conversationData, null, 2));
      console.log(
        `[saveConversationHistory] Conversation history updated for user ID: ${userId}`,
      );
    } else {
      console.log(
        `[saveConversationHistory] No new messages to save for user ID: ${userId}`,
      );
    }
  } catch (error) {
    console.error(
      `[saveConversationHistory] Error updating conversation history for user ID: ${userId}`,
      error,
    );
  }
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
