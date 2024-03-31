//public/front.js
let lastAssistantMessageElement = null;

(function () {
  const originalLog = console.log;
  const originalError = console.error;

  console.log = function () {
    originalLog.apply(console, arguments);
    // Convert all arguments to a string
    const message = Array.from(arguments)
      .map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : arg))
      .join(" ");
    sendLogToServer("log", message);
  };

  console.error = function () {
    originalError.apply(console, arguments);
    // Convert all arguments to a string
    const message = Array.from(arguments)
      .map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : arg))
      .join(" ");
    sendLogToServer("error", message);
  };

  function sendLogToServer(type, message) {
    fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, message }),
    }).catch((err) => originalError("Failed to send log to server", err));
  }
})();

document.addEventListener("DOMContentLoaded", () => {
  console.log("[front.js/DOMContentLoaded] Page loaded");
  const userInput = document.getElementById("userInput");
  const messageContainer = document.getElementById("messageContainer");

  let conversationHistory = [];
  let userId = localStorage.getItem("userId");

  const initializeUserData = () => {
    console.log("[front.js/init] Attempting to load or create user data");
    // Only include userId in the body if it's truthy
    const bodyContent = userId ? JSON.stringify({ userId }) : "{}";
    const options = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: bodyContent,
    };
    fetch("/api/users", options)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch user data: ${response.statusText}`);
        }
        return response.json();
      })
      .then((data) => {
        if (data.userId && data.userId !== "undefined") {
          userId = data.userId;
          localStorage.setItem("userId", userId);
          console.log("[front.js/init] User data loaded or created", {
            userId,
          });
          if (data.conversationHistory) {
            conversationHistory = data.conversationHistory;
            displayConversationHistory();
          }
        } else {
          console.error("[front.js/init] Invalid userId received", data);
        }
      })
      .catch((error) => {
        console.error("[front.js/init] Error initializing user data:", error);
      });
  };

  initializeUserData();

  async function callChatAPI(userPrompt, userId) {
      console.log("[front.js/callChatAPI] Calling /api/chat with", {
        userPrompt,
        userId,
      });

      const messages = conversationHistory.map((item) => ({
        role: item.role,
        content: item.content,
      }));

      // Append the latest user prompt to the messages array
      messages.push({ role: "user", content: userPrompt });

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: messages,
            userId,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to start chat session");
        }

        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();

        while (true) {
          const { value, done } = await reader.read();
          if (done) {
              markLastAssistantMessageAsComplete(); // Mark the last message as complete when the stream is finished
              break;
          }

          // Directly parse and display each received chunk
          console.log("[front.js/callChatAPI] Received chunk:", value);

          // Attempt to parse each line of the received chunk and display it
          value.split('\n').forEach(line => {
            try {
              if (line.startsWith('data:')) {
                const parsedLine = JSON.parse(line.replace('data: ', ''));
                const content = parsedLine.content;
                if (content) {
                  displayAssistantMessage(content);
                }
              } else if (line.startsWith('[DONE]')) {
                markLastAssistantMessageAsComplete(); // Call when a message is fully received
              }
            } catch (error) {
              console.error("[front.js/callChatAPI] Error parsing chunk:", error);
            }
          });
        }
      } catch (error) {
        console.error("[front.js/callChatAPI] Error:", error);
      }
  }


  function listenToGPTStream(userId) {
      if (!userId) {
          console.error("[listenToGPTStream] No userId provided.");
          return;
      }

      console.log("[listenToGPTStream] Initializing SSE connection for userId:", userId);
      const eventSource = new EventSource(`/api/chat/stream?userId=${encodeURIComponent(userId)}`);

      eventSource.onmessage = (event) => {
          try {
              const data = JSON.parse(event.data);
              console.log("[listenToGPTStream] Received data chunk:", data);
              if (data.content !== undefined) {
                  displayAssistantMessage(data.content);
              }
          } catch (error) {
              console.error("[listenToGPTStream] Error parsing server response:", error);
          }
      };

      eventSource.addEventListener('done', () => {
          console.log("[listenToGPTStream] SSE stream ended for userId:", userId);
          // Mark the last message element as complete
          let lastMessageElement = document.querySelector('.response-message:last-child');
          if (lastMessageElement) {
              lastMessageElement.setAttribute('data-complete', 'true');
          }
          eventSource.close();
      });

      eventSource.onerror = (error) => {
          console.error("[listenToGPTStream] EventSource failed:", error);
          eventSource.close();
      };

      console.log("[listenToGPTStream] SSE connection initialized for userId:", userId);
  }


  userInput.addEventListener("keydown", async (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const userPrompt = userInput.value.trim();
      if (userPrompt !== "") {
        console.log("[front.js/userInput] User prompt entered", { userPrompt });
        displayUserMessage(userPrompt);
        userInput.value = "";

        conversationHistory.push({ role: "user", content: userPrompt });
        callChatAPI(userPrompt, userId);
      }
    }
  });

  function displayConversationHistory() {
    console.log(
      "[front.js/displayConversationHistory] Displaying conversation history",
    );
    conversationHistory.forEach((message) => {
      if (message.role === "user") {
        displayUserMessage(message.content);
      } else if (message.role === "assistant") {
        displayAssistantMessage(message.content);
      }
    });
  }

  function displayUserMessage(message) {
      console.log("[front.js/displayUserMessage] Displaying user message", { message });
      const userMessageElement = document.createElement("div");
      userMessageElement.classList.add("user-message");
      userMessageElement.textContent = message;
      messageContainer.appendChild(userMessageElement); // Append at the end, visually appears at the top
      console.log("[front.js/displayUserMessage] User message displayed");
  }

  // Helper function to find the last assistant message element if it exists
  function getLastAssistantMessageElement() {
      const messages = Array.from(messageContainer.getElementsByClassName('response-message'));
      if (messages.length > 0) {
          return messages[messages.length - 1]; // Get the last message element
      }
      return null; // No assistant message element found
  }

  function displayAssistantMessage(content) {
      console.log("[front.js/displayAssistantMessage] Displaying assistant message:", content);

      let assistantMessageElement = getLastAssistantMessageElement();

      // Check if we can append to the existing message element
      if (!assistantMessageElement || assistantMessageElement.getAttribute('data-complete') === 'true') {
          // Need to create a new message element
          assistantMessageElement = document.createElement('div');
          assistantMessageElement.classList.add('response-message');
          assistantMessageElement.setAttribute('data-complete', 'false'); // Mark as incomplete initially
          messageContainer.appendChild(assistantMessageElement);
      }

      // Append the content to the existing or new message element
      assistantMessageElement.textContent += content;

      console.log("[front.js/displayAssistantMessage] Assistant message displayed");
  }

  function markLastAssistantMessageAsComplete() {
      let assistantMessageElement = getLastAssistantMessageElement();
      if (assistantMessageElement) {
          assistantMessageElement.setAttribute('data-complete', 'true');
      }
  }


  function scrollToBottom() {
      // Automatically scroll to the bottom of the message container
      messageContainer.scrollTop = messageContainer.scrollHeight;
  }



  async function saveConversationHistory(userId, newEntries) {
      const filePath = path.join(usersDir, `${userId}.json`);

      try {
          let userData;
          // Attempt to read the existing file, if it exists
          try {
              const data = await fs.readFile(filePath, 'utf8');
              userData = JSON.parse(data);
          } catch (error) {
              // If the file does not exist, initialize userData
              userData = { conversationHistory: [] };
          }

          // Append new entries to the conversation history
          // Assuming newEntries is structured as [{role: 'user', content: '...'}, {role: 'assistant', content: '...'}]
          const updatedHistory = userData.conversationHistory.concat(newEntries);

          // Save the updated conversation history
          await fs.writeFile(filePath, JSON.stringify({ conversationHistory: updatedHistory }, null, 2));
          console.log("[saveConversationHistory] Conversation history updated successfully.");
      } catch (error) {
          console.error("[saveConversationHistory] Error updating conversation history:", error);
      }
  }


});
