//public/front.js
let lastAssistantMessageElement = null;
let fullResponse = "";

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

      // Creating a copy of the conversation history to include the new user prompt
      const messagesToSend = [...conversationHistory, { role: "user", content: userPrompt }];
      console.log("[front.js/callChatAPI] Sending messages to /api/chat", messagesToSend);

      try {
          const response = await fetch("/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                  messages: messagesToSend,
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
                  console.log("[front.js/callChatAPI] Chat session ended");
                  markLastAssistantMessageAsComplete();
                  break;
              }

              console.log("[front.js/callChatAPI] Received chunk:", value);
              value.split("\n").forEach(line => {
                  try {
                      if (line.startsWith("data:")) {
                          const parsedLine = JSON.parse(line.substr(5)); // Correct parsing of the data
                          const content = parsedLine.content;
                          if (content) {
                              console.log("[front.js/callChatAPI] Displaying message:", content);
                              displayAssistantMessage(content);
                          }
                      } else if (line.trim() === "[DONE]") {
                          console.log("[front.js/callChatAPI] Message stream completed");
                          markLastAssistantMessageAsComplete(); // Marks the last assistant message as complete
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
    console.log("[front.js/displayUserMessage] Displaying user message", {
      message,
    });
    const userMessageElement = document.createElement("div");
    userMessageElement.classList.add("user-message");
    userMessageElement.textContent = message;
    messageContainer.prepend(userMessageElement); // Append at the end, visually appears at the top
    console.log("[front.js/displayUserMessage] User message displayed");
  }

  // Helper function to find the last assistant message element if it exists
  function getLastAssistantMessageElement() {
    const messages = Array.from(
      messageContainer.getElementsByClassName("response-message"),
    );
    if (messages.length > 0) {
      return messages[messages.length - 1]; // Get the last message element
    }
    return null; // No assistant message element found
  }

  function displayAssistantMessage(content) {
      console.log("[front.js/displayAssistantMessage] Displaying assistant message:", content);

      // Directly check for null or instantiate a new message element if needed
      if (lastAssistantMessageElement === null || lastAssistantMessageElement.getAttribute("data-complete") === "true") {
          lastAssistantMessageElement = document.createElement("div");
          lastAssistantMessageElement.classList.add("response-message");
          lastAssistantMessageElement.setAttribute("data-complete", "false");
          messageContainer.prepend(lastAssistantMessageElement); // Prepend to make it appear at the top
      }

      // Use innerText to append the content, respecting existing text formatting
      lastAssistantMessageElement.innerText += content;

      console.log("[front.js/displayAssistantMessage] Assistant message displayed");
  }

  function markLastAssistantMessageAsComplete() {
      if (lastAssistantMessageElement) {
          lastAssistantMessageElement.setAttribute("data-complete", "true");
      }
      // After marking the current message as complete, explicitly set it to null
      // This forces a new message element to be created for the next assistant message,
      // mimicking the initial setup and ensuring no unintended carriage returns are inserted.
      lastAssistantMessageElement = null;
  }


});
