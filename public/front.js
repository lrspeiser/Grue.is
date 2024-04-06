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
        if (
          data.userId &&
          data.userId !== "undefined" &&
          data.userId.trim() !== ""
        ) {
          userId = data.userId;
          localStorage.setItem("userId", userId);
          console.log("[front.js/init] User data loaded or created", {
            userId,
          });
          if (Array.isArray(data.conversationHistory)) {
            conversationHistory = data.conversationHistory;
            console.log("[front.js/init] Conversation history");
            displayConversationHistory();
          } else {
            console.warn(
              "[front.js/init] Conversation history is not an array, initializing as an empty array.",
            );
            conversationHistory = [];
          }
        } else {
          console.error("[front.js/init] Invalid userId received", data);
          throw new Error("Invalid userId received");
        }
      })
      .catch((error) => {
        console.error("[front.js/init] Error initializing user data:", error);
        userId = localStorage.getItem("userId") || null;
        if (userId) {
          console.log(
            "[front.js/init] Using userId from local storage:",
            userId,
          );
        } else {
          console.log(
            "[front.js/init] No userId found in local storage, creating new user",
          );
          createNewUser();
        }
      });
  };

  const createNewUser = () => {
    console.log("[front.js/init] Creating new user");
    const options = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    };
    fetch("/api/users", options)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to create new user: ${response.statusText}`);
        }
        return response.json();
      })
      .then((data) => {
        if (
          data.userId &&
          data.userId !== "undefined" &&
          data.userId.trim() !== ""
        ) {
          userId = data.userId;
          localStorage.setItem("userId", userId);
          console.log("[front.js/init] New user created", {
            userId,
          });
          conversationHistory = [];
        } else {
          console.error("[front.js/init] Failed to create new user", data);
        }
      })
      .catch((error) => {
        console.error("[front.js/init] Error creating new user:", error);
      });
  };

  initializeUserData();

  async function callChatAPI(userPrompt, userId) {
    console.log("[front.js/callChatAPI] Calling /api/chat with", {
      userPrompt,
      userId,
    });

    // Creating a copy of the conversation history to include the new user prompt
    const messagesToSend = [
      ...conversationHistory,
      { role: "user", content: userPrompt },
    ];
    console.log(
      "[front.js/callChatAPI] Sending messages to /api/chat",
      messagesToSend,
    );

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messagesToSend,
          userId,
        }),
      });
      console.log("[front.js/callChatAPI] Fetch response:", response);

      if (!response.ok) {
        console.error(
          "[front.js/callChatAPI] Failed to start chat session. Response status:",
          response.status,
        );
        throw new Error("Failed to start chat session");
      }

      const reader = response.body
        .pipeThrough(new TextDecoderStream())
        .getReader();
      console.log("[front.js/callChatAPI] Reader created:", reader);

      while (true) {
        const { value, done } = await reader.read();
        console.log(
          "[front.js/callChatAPI] Read from reader. Value:",
          value,
          "Done:",
          done,
        );

        if (done) {
          console.log("[front.js/callChatAPI] Chat session ended");
          markLastAssistantMessageAsComplete();
          break;
        }

        console.log("[front.js/callChatAPI] Received chunk:", value);
        value.split("\n").forEach((line) => {
          console.log("[front.js/callChatAPI] Processing line:", line);

          try {
            if (line.startsWith("data:")) {
              const parsedLine = JSON.parse(line.substr(5));

              if (parsedLine.content !== undefined) {
                const content = parsedLine.content;
                console.log("[front.js/callChatAPI] Parsed content:", content);
                console.log(
                  "[front.js/callChatAPI] Displaying message:",
                  content,
                );
                displayAssistantMessage(content);
              }
            } else if (line.trim() === "[DONE]") {
              console.log("[front.js/callChatAPI] Message stream completed");
              markLastAssistantMessageAsComplete();
            }
          } catch (error) {
            if (line.trim() !== "[DONE]") {
              console.error(
                "[front.js/callChatAPI] Error parsing chunk:",
                error,
              );
            }
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

        if (!Array.isArray(conversationHistory)) {
          console.warn(
            "[front.js/userInput] Conversation history is not an array, initializing as an empty array.",
          );
          conversationHistory = [];
        }
        conversationHistory.push({ role: "user", content: userPrompt });
        callChatAPI(userPrompt, userId);
      }
    }
  });

  function displayConversationHistory() {
    console.log(
      "[front.js/displayConversationHistory] Displaying last 5 messages from conversation history",
    );

    // Assuming 'messageContainer' is the DOM element where messages are to be displayed
    for (let i = 1; i <= 5 && i <= conversationHistory.length; i++) {
      const message = conversationHistory[conversationHistory.length - i]; // Direct access to the message

      // Display assistant's response
      if (message.response) {
        console.log(
          `[front.js/displayConversationHistory] (#${message.messageId}) Displaying response:`,
          message.response,
        );

        const assistantMessageElement = document.createElement("div");
        assistantMessageElement.classList.add("assistant-message");
        assistantMessageElement.textContent = `${message.response}`;
        messageContainer.appendChild(assistantMessageElement); // Appending to the container
      }

      // Display user's prompt
      if (message.userPrompt) {
        console.log(
          `[front.js/displayConversationHistory] (#${message.messageId}) Displaying user prompt:`,
          message.userPrompt,
        );

        const userMessageElement = document.createElement("div");
        userMessageElement.classList.add("user-message");
        userMessageElement.textContent = `${message.userPrompt}`;
        messageContainer.appendChild(userMessageElement); // Appending to the container
      }
    }
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
    console.log(
      "[front.js/displayAssistantMessage] Displaying assistant message:",
      content,
    );

    // Directly check for null or instantiate a new message element if needed
    if (
      lastAssistantMessageElement === null ||
      lastAssistantMessageElement.getAttribute("data-complete") === "true"
    ) {
      lastAssistantMessageElement = document.createElement("div");
      lastAssistantMessageElement.classList.add("response-message");
      lastAssistantMessageElement.setAttribute("data-complete", "false");
      messageContainer.prepend(lastAssistantMessageElement); // Prepend to make it appear at the top
      console.log(
        "[front.js/displayAssistantMessage] New message element created:",
        lastAssistantMessageElement,
      );
    }

    // Use innerText to append the content, respecting existing text formatting
    lastAssistantMessageElement.innerText += content;
    console.log(
      "[front.js/displayAssistantMessage] Message content appended:",
      lastAssistantMessageElement.innerText,
    );

    console.log(
      "[front.js/displayAssistantMessage] Assistant message displayed",
    );
  }

  function markLastAssistantMessageAsComplete() {
    if (lastAssistantMessageElement) {
      console.log(
        "[front.js/markLastAssistantMessageAsComplete] Marking last assistant message as complete:",
        lastAssistantMessageElement,
      );
      lastAssistantMessageElement.setAttribute("data-complete", "true");
    }
    lastAssistantMessageElement = null;
    console.log(
      "[front.js/markLastAssistantMessageAsComplete] Last assistant message element reset to null",
    );
  }
});

function displayErrorMessage(message) {
  console.log("[front.js/displayErrorMessage] Displaying error message", {
    message,
  });
  const errorMessageElement = document.createElement("div");
  errorMessageElement.classList.add("error-message");
  errorMessageElement.textContent = message;
  messageContainer.prepend(errorMessageElement);
  console.log("[front.js/displayErrorMessage] Error message displayed");
}
