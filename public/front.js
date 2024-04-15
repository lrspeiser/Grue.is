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

  if (!userId) {
    createNewUser(); // Automatically create a new user if no userId is found
  } else {
    initializeUserData(); // Proceed to initialize user data if userId exists
  }

  function initializeUserData() {
    console.log("[front.js/init] Attempting to load or create user data");
    fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }), // Send the userId from local storage to the backend
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Failed to initialize user data: ${response.statusText}`,
          );
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

          // Update the conversation history with the received recent messages
          if (Array.isArray(data.recentMessages)) {
            conversationHistory = data.recentMessages;
            console.log("[front.js/init] Recent conversation history received");
            displayConversationHistory(conversationHistory);
          } else {
            console.warn(
              "[front.js/init] Recent messages not received or not an array, initializing as an empty array.",
            );
            conversationHistory = [];
          }

          // Check if it's the user's first time and the conversation history is empty
          if (conversationHistory.length === 0) {
            console.log(
              `[front.js/init] First time user detected for ID: ${userId}`,
            );
            sendFirstTimeUserMessage();
          }
        } else {
          console.error("[front.js/init] Invalid userId received", data);
          throw new Error("Invalid userId received");
        }
      })
      .catch((error) => {
        console.error("[front.js/init] Error initializing user data:", error);
        displayErrorMessage("Initialization error: " + error.message);
      });
  }

  function createNewUser() {
    console.log("[front.js/init] Creating new user");
    fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}), // No need to send userId for new user creation
    })
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
          console.log("[front.js/init] New user created", { userId });
          conversationHistory = []; // Initialize an empty conversation history
          sendFirstTimeUserMessage(); // Send the first-time user message after creating a new user
        } else {
          console.error("[front.js/init] Failed to create new user", data);
        }
      })
      .catch((error) => {
        console.error("[front.js/init] Error creating new user:", error);
        displayErrorMessage("Error creating new user: " + error.message);
      });
  }

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
        // Instead of throwing an error, display an error message and continue
        displayErrorMessage("Failed to start chat session. Please try again.");
        return;
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
      displayErrorMessage(
        "An error occurred while processing your request. Please try again later.",
      );
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

  function displayConversationHistory(conversationHistory) {
    console.log(
      "[front.js/displayConversationHistory] Displaying last 5 messages from conversation history",
    );

    // Assuming 'messageContainer' is the DOM element where messages are to be displayed
    const messageContainer = document.getElementById("messageContainer"); // Ensure you have this element in your HTML
    const numberOfMessagesToDisplay = Math.min(5, conversationHistory.length);
    for (let i = 0; i < numberOfMessagesToDisplay; i++) {
      const messageIndex = conversationHistory.length - 1 - i;
      const message = conversationHistory[messageIndex]; // Accessing the message from the end

      console.log(
        `[front.js/displayConversationHistory] (#${message.messageId}) Displaying message:`,
        message.content,
      );

      // Create a div element for each message
      const messageElement = document.createElement("div");
      messageElement.classList.add(message.role + "-message"); // Add class based on the role to style accordingly
      if (message.content) {
        // Ensure there is content to display
        messageElement.textContent = message.content; // Set the text content of the message
        messageContainer.appendChild(messageElement); // Append the message element to the container
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

  function sendFirstTimeUserMessage() {
    const firstTimeUserMessage =
      "This is a system generated message on behalf of a user who is loading this game for the first time: This is my first time loading the page. Tell me about how I can be the hero in my own story, I just need to give you some clues into what world you want to enter. Let me know that I can tell you specifically, or give you the name of an author, story, or movie that can help guide the creation of our world. And if I speak a language other than English to just let you know.";
    console.log(
      "[front.js/init] Sending first time user message:",
      firstTimeUserMessage,
    );
    callChatAPI(firstTimeUserMessage, userId);
  }

  function updateConversationHistory(messages) {
    console.log(
      "[front.js/updateConversationHistory] Updating conversation history",
    );
    conversationHistory = messages;
    displayConversationHistory(conversationHistory);
  }

  initializeUserData();
});
