let chatUserId = localStorage.getItem("userId") || uuid.v4();
let conversationHistory = [];
let messageContainerIndex = 0;

document.addEventListener("DOMContentLoaded", async () => {
  const chatUserInput = document.getElementById("chat-userInput");
  const chatMessageContainer = document.getElementById("chat-messageContainer");

  if (!localStorage.getItem("userId")) {
    localStorage.setItem("userId", chatUserId);
  }

  console.log(`[chatUserInput] Initialized with user ID: ${chatUserId}`);

  chatUserInput.addEventListener("keydown", async (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const userPrompt = chatUserInput.value.trim();
      if (userPrompt !== "") {
        displayChatUserMessage(userPrompt);
        chatUserInput.value = "";
        conversationHistory.unshift({ role: "user", content: userPrompt });
        console.log(`[chatUserInput] User prompt entered: '${userPrompt}'`);
        await callChatAPI(userPrompt, chatUserId);
      }
    }
  });

  async function callChatAPI(userPrompt, chatUserId) {
    const lastFiveMessages = conversationHistory.slice(0, 5);
    const response = await fetch("/api/chat-with-me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [...lastFiveMessages, { role: "user", content: userPrompt }],
        userId: chatUserId,
      }),
    });

    if (!response.ok) {
      console.error(
        `Failed to start chat session. Response status: ${response.status}`,
      );
      return;
    }

    const messageContainer = createMessageContainer();
    const reader = response.body
      .pipeThrough(new TextDecoderStream())
      .getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        console.log("[callChatAPI] End of message stream.");
        break;
      }
      processServerMessage(value, messageContainer);
    }
  }

  function processServerMessage(value, messageContainer) {
    value.split("\n").forEach((line) => {
      if (line.trim() === "[DONE]") {
        console.log("[processServerMessage] Message stream completed.");
        return;
      }
      if (line.startsWith("data:")) {
        const data = JSON.parse(line.substr(5));
        if (data.content !== undefined) {
          displayAssistantMessage(data.content, messageContainer);
          conversationHistory.unshift({
            role: "assistant",
            content: data.content,
          });
        }
      }
    });
  }

  function displayAssistantMessage(content, messageContainer) {
    // Ensure the message container is empty before appending new content to prevent repeated additions
    if (!messageContainer.hasChildNodes()) {
      const assistantMessageElement = document.createElement("div");
      assistantMessageElement.classList.add("chat-assistant-message");
      assistantMessageElement.innerHTML = formatContent(content); // Set content as innerHTML directly
      messageContainer.appendChild(assistantMessageElement); // Append to the container
      console.log(
        `[Chat] New assistant message displayed in container: ${content}`,
      );
    } else {
      // If the container already has the message element, append to its content
      const assistantMessageElement = messageContainer.firstChild;
      assistantMessageElement.innerHTML += formatContent(content);
      console.log(
        `[Chat] Updated assistant message in container: ${assistantMessageElement.innerHTML}`,
      );
    }
  }

  function formatContent(content) {
    // Process the content to replace unwanted new lines and trim spaces around punctuation
    return content.replace(/\n/g, " ").replace(/([!?.])\s+/g, "$1 "); // Improve punctuation spacing
  }

  function displayChatUserMessage(message) {
    const messageContainer = createMessageContainer();
    const userMessageElement = document.createElement("div");
    userMessageElement.classList.add("chat-user-message");
    userMessageElement.textContent = message;
    messageContainer.prepend(userMessageElement);
    console.log(
      `[displayChatUserMessage] User message displayed in container ${messageContainerIndex}: ${message}`,
    );
  }

  function createMessageContainer() {
    const messageContainer = document.createElement("div");
    messageContainer.id = `chat-message-container-${messageContainerIndex}`;
    messageContainer.classList.add("chat-message-container");
    chatMessageContainer.prepend(messageContainer);
    messageContainerIndex++;
    return messageContainer;
  }

  function formatContent(content) {
    content = content.replace(/\n/g, "<br>");
    content = content.replace(/([^ ])(\d+)/g, "$1 $2");
    content = content.replace(/(\d) /g, "$1");
    return content;
  }
});
