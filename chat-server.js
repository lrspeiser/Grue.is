const express = require("express");
const { getDatabase, ref, set } = require("firebase/database");
const OpenAIApi = require("openai");

const app = express();
const openai = new OpenAIApi(process.env.OPENAI_API_KEY);

// ... Firebase initialization code ...

app.post("/api/chat-with-me", async (req, res) => {
  const { userId, messages: newMessages } = req.body;

  try {
    const messages = [
      { role: "system", content: "You are chatting with the creator of the game. Answer questions about them and their background." },
      ...newMessages,
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages,
      stream: true,
    });

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    let fullResponse = "";
    for await (const part of response) {
      const content = part.choices[0].delta.content || "";
      res.write(`data: ${JSON.stringify({ content })}\n\n`);
      fullResponse += content;
    }

    res.write("data: [DONE]\n\n");
    res.end();

    await saveChatConversationHistory(userId, [...newMessages, { role: "assistant", content: fullResponse }]);
  } catch (error) {
    console.error(`Error during chat for user ID: ${userId}:`, error);
    if (!res.headersSent) {
      res.status(500).send("Error during chat");
    }
  }
});

async function saveChatConversationHistory(userId, newMessages) {
  const filePath = `chats/${userId}`;

  const conversationData = await updateChatConversationHistory(userId, newMessages, filePath);

  if (!conversationData) {
    console.log(`No new messages to save for user ID: ${userId}`);
  }
}

async function updateChatConversationHistory(userId, newMessages, filePath) {
  const dbClient = getDatabase();
  const conversationRef = ref(dbClient, filePath);

  const snapshot = await get(conversationRef);
  let conversationData = snapshot.val() || [];

  newMessages.forEach((message) => {
    conversationData.push({
      role: message.role,
      content: message.content,
      timestamp: new Date().toISOString(),
    });
  });

  await set(conversationRef, conversationData);
  console.log(`Updated chat conversation history for user ID: ${userId}`);

  return conversationData;
}

app.listen(3001, () => {
  console.log("Chat server is running on port 3001");
});