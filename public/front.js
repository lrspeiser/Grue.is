//public/front.js

let lastAssistantMessageElement = null;
let lastDisplayedImageUrl = null;
let lastDisplayedRoomId = null;
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

// Function to adjust image max width based on the window size
function adjustImageMaxWidth() {
  const maxWidth = window.innerWidth;
  const maxImageWidth = Math.min(maxWidth, 512);
  const imageContainer = document.getElementById("imageContainer");

  if (imageContainer) {
    const images = imageContainer.getElementsByTagName("img");
    for (const img of images) {
      img.style.maxWidth = maxImageWidth + "px";
    }
  }
}

async function createNewUser() {
  console.log("[front.js/createNewUser] Creating new user");
  const response = await fetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw new Error(`Failed to create new user: ${response.statusText}`);
  }

  const data = await response.json();
  console.log(
    "[front.js/createNewUser] New user created with ID:",
    data.userId,
  );
  return data.userId;
}

let userId = localStorage.getItem("userId");

function updateRoomDisplay(roomId, imageUrl) {
  const roomImageElement = document.getElementById("room-image");

  // Update the room image if the element exists
  if (roomImageElement) {
    roomImageElement.src = imageUrl;
    roomImageElement.alt = `Room ${roomId} Image`;
    console.log("[updateRoomDisplay] Room image updated:", roomId, imageUrl);
  } else {
    console.error("[updateRoomDisplay] Error: room-image element not found.");
  }
}

// Establish the socket connection with the userId only if it's present
if (userId) {
  const socket = io({ query: { userId } });

  socket.on("connect", () => {
    console.log(
      "[Socket] Successfully connected to the server with userId:",
      userId,
    );
  });

  socket.on("roomData", (data) => {
    console.log("[Socket] Room data received:", data);
    if (data.room_id && data.image_url) {
      updateRoomDisplay(data.room_id, data.image_url);
    } else {
      console.log("[Socket] Error: Room data missing room_id or image_url");
    }
  });

  socket.on("connect_error", (error) => {
    console.error("[Socket] Connection Error:", error);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  console.log("[front.js/DOMContentLoaded] Page loaded");
  const userInput = document.getElementById("userInput");
  const messageContainer = document.getElementById("messageContainer");

  // Adjust image max width on load and resize
  window.addEventListener("resize", adjustImageMaxWidth);
  window.addEventListener("load", adjustImageMaxWidth);

  let conversationHistory = [];
  let lastDisplayedImageUrl = null;
  let lastDisplayedRoomId = null;

  if (!userId) {
    userId = await createNewUser();
    localStorage.setItem("userId", userId); // Store the userId in localStorage after creation
  }

  const initializeUserData = async () => {
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

          if (data.story && data.story.active_game === true) {
            if (data.latestImageUrl) {
              console.log(
                "[front.js/init] Displaying initial image URL for active game:",
                data.latestImageUrl,
              );
              displayStoryImage(data.latestImageUrl, userId);
              lastDisplayedImageUrl = data.latestImageUrl; // Update the last displayed image URL for comparison
            }
            if (Array.isArray(data.conversation)) {
              conversationHistory = data.conversation;
              console.log("[front.js/init] Conversation history loaded");
              displayConversationHistory();
            } else {
              console.warn(
                "[front.js/init] Conversation history is not an array, initializing as an empty array.",
              );
              conversationHistory = [];
            }
          } else {
            console.log(
              `[front.js/init] No active game found for ID: ${userId}`,
            );

            // Display a default placeholder image
            displayStoryImage(
              "https://firebasestorage.googleapis.com/v0/b/grue-4e13c.appspot.com/o/systemimages%2Fgrueoverview.png?alt=media&token=36b1d99f-82ff-4acf-8766-c7f2ca757b9a",
              userId,
            );
            const firstTimeUserMessage =
              "This is a system generated message on behalf of a user who is loading this game for the first time: This is my first time loading the page. Tell me about how I can be the hero in my own story, I just need to give you some clues into what world you want to enter. Let me know that I can tell you specifically, or give you the name of an author, story, or movie that can help guide the creation of our world. And if I speak a language other than English to just let you know.";
            //console.log(`[front.js/init] Sending first time user message: ${firstTimeUserMessage}`);
            // Send the first-time user message using the callChatAPI function without storing it in the conversation history
            callChatAPI(firstTimeUserMessage, userId, false);
          }
        } else {
          console.error("[front.js/init] Invalid userId received", data);
          throw new Error("Invalid userId received");
        }
      })
      .catch((error) => {
        console.error("[front.js/init] Error initializing user data:", error);
        // Display a default placeholder image even on error
        displayStoryImage(
          "https://firebasestorage.googleapis.com/v0/b/grue-4e13c.appspot.com/o/systemimages%2Fgrueoverview.png?alt=media&token=8382dbec-03c7-4c51-821d-d037f8c9ed47",
          userId,
        );
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
          createNewUser().then((newUserId) => {
            userId = newUserId;
            localStorage.setItem("userId", userId);
          });
        }
      });
  };

  initializeUserData();

  async function callChatAPI(userPrompt, userId, storeInHistory = true) {
    console.log("[front.js/callChatAPI] Calling /api/chat with", {
      userPrompt,
      userId,
    });

    const messagesToSend = storeInHistory
      ? [...conversationHistory, { role: "user", content: userPrompt }]
      : [...conversationHistory];
    console.log(
      "[front.js/callChatAPI] Sending messages to /api/chat",
      messagesToSend,
    );

    let retryCount = 0;
    const maxRetries = 1;

    async function fetchChatAPI() {
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

          value.split("\n").forEach((line) => {
            try {
              if (line.startsWith("data:")) {
                const parsedLine = JSON.parse(line.substr(5));

                if (parsedLine.content !== undefined) {
                  const content = parsedLine.content;
                  displayAssistantMessage(content);

                  if (
                    parsedLine.imageUrl !== undefined &&
                    parsedLine.imageUrl
                  ) {
                    console.log(
                      "[front.js/callChatAPI] Image URL received:",
                      parsedLine.imageUrl,
                    );
                    displayStoryImage(parsedLine.imageUrl);
                  }
                }
              } else if (line.trim() === "[DONE]") {
                console.log("[front.js/callChatAPI] Message stream completed");
                markLastAssistantMessageAsComplete();
              }
            } catch (error) {
              console.error(
                "[front.js/callChatAPI] Error parsing chunk:",
                error,
              );
            }
          });
        }
      } catch (error) {
        console.error("[front.js/callChatAPI] Error:", error);
        removePartialMessage();
        displayErrorMessage("Oops! Something went wrong. Retrying...");

        if (retryCount < maxRetries) {
          retryCount++;
          await fetchChatAPI();
        } else {
          displayErrorMessage(
            "Oops! Something went wrong. Please try again.",
            true,
          );
        }
      }
    }

    await fetchChatAPI();
  }

  userInput.addEventListener("keydown", async (event) => {
    if (event.key === "Enter") {
      event.preventDefault();

      // Prevents multiple intervals from being set
      clearInterval(checkImageInterval);
      const imageLoadingElement = document.querySelector(".image-loading");
      if (imageLoadingElement) {
        imageLoadingElement.remove();
      }
      const userPrompt = userInput.value.trim();
      if (userPrompt !== "") {
        console.log("[front.js/userInput] User prompt entered", { userPrompt });
        displayUserMessage(userPrompt);
        userInput.value = "";
        if (!Array.isArray(conversationHistory)) {
          console.warn(
            "[front.js/userInput] Initializing empty conversation history.",
          );
          conversationHistory = [];
        }
        conversationHistory.push({ role: "user", content: userPrompt });
        callChatAPI(userPrompt, userId);
        await fetchStoryImage(userId);
        const newImageLoadingElement = document.createElement("div");
        newImageLoadingElement.classList.add("image-loading");
        messageContainer.prepend(newImageLoadingElement);
      }
    }
  });

  // Function to fetch room data and update the image display

  async function displayStoryImage(imageUrl, userId = null) {
    if (!imageUrl && !userId) {
      console.error(
        "[displayStoryImage] No imageUrl or userId provided, unable to display image.",
      );
      return;
    }

    // If no imageUrl is provided and userId is not null, fetch the image using the userId
    if (!imageUrl && userId) {
      console.log("[displayStoryImage] Fetching image using userId:", userId);
      try {
        const response = await fetch(`/api/get-latest-image-url/${userId}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch image URL: ${response.statusText}`);
        }
        const data = await response.json();
        imageUrl = data.imageUrl; // Assuming the API returns an object with an imageUrl field
        if (!imageUrl) {
          console.error(
            "[displayStoryImage] No image URL returned from the server.",
          );
          return;
        }
      } catch (error) {
        console.error("[displayStoryImage] Error fetching image URL:", error);
        return;
      }
    }

    const roomImageElement = document.getElementById("room-image");
    if (roomImageElement) {
      roomImageElement.src = imageUrl;
      roomImageElement.alt = "Story Image";
      console.log("[displayStoryImage] Image displayed:", imageUrl);
    } else {
      console.error("[displayStoryImage] room-image element not found.");
    }
  }

  let checkImageInterval;

  function displayConversationHistory() {
    console.log(
      "[front.js/displayConversationHistory] Displaying last 5 messages from conversation history",
    );

    const lastFiveMessages = conversationHistory.slice(-5);

    lastFiveMessages.reverse().forEach((message, index) => {
      const messageGroup = document.createElement("div");
      messageGroup.classList.add("message-group");

      // Append the image element only if index is greater than 0
      if (message.imageUrl && index > 0) {
        const imgElement = document.createElement("img");
        imgElement.src = message.imageUrl;
        imgElement.alt = "Story Image";
        messageGroup.appendChild(imgElement);
      }

      if (message.response) {
        const assistantMessageElement = document.createElement("div");
        assistantMessageElement.classList.add("assistant-message");
        assistantMessageElement.innerHTML = message.response.replace(
          /\n/g,
          "<br>",
        );
        messageGroup.appendChild(assistantMessageElement);
      }

      if (message.userPrompt) {
        const userMessageElement = document.createElement("div");
        userMessageElement.classList.add("user-message");
        userMessageElement.textContent = message.userPrompt;
        messageGroup.appendChild(userMessageElement);
      }

      messageGroup.appendChild(document.createElement("br"));
      messageGroup.appendChild(document.createElement("br"));

      messageContainer.appendChild(messageGroup);
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
  // Helper function to find the last assistant message element if it exists

  function formatContent(content) {
    // Replace newlines with HTML line breaks
    content = content.replace(/\n/g, "<br>");

    // Add space before numbers if not already spaced properly. Ensure no extra space is added after the number.
    content = content.replace(/([^ ])(\d+)/g, "$1 $2");
    content = content.replace(/(\d) /g, "$1");

    return content;
  }

  function displayAssistantMessage(content) {
    //console.log("[front.js/displayAssistantMessage] Displaying assistant message:",content,);

    if (
      lastAssistantMessageElement === null ||
      lastAssistantMessageElement.getAttribute("data-complete") === "true"
    ) {
      lastAssistantMessageElement = document.createElement("div");
      lastAssistantMessageElement.classList.add("response-message");
      lastAssistantMessageElement.setAttribute("data-complete", "false");
      messageContainer.prepend(lastAssistantMessageElement);
      //console.log("[front.js/displayAssistantMessage] New message element created:",lastAssistantMessageElement,);
    }

    // Format content to handle spacing and line breaks
    content = formatContent(content);

    // Use innerHTML to append the formatted content
    lastAssistantMessageElement.innerHTML += content;
    //console.log("[front.js/displayAssistantMessage] Message content appended with line breaks and numbers:",lastAssistantMessageElement.innerHTML,);

    console.log(
      "[front.js/displayAssistantMessage] Assistant message displayed",
    );
  }

  function markLastAssistantMessageAsComplete() {
    if (lastAssistantMessageElement) {
      //console.log("[front.js/markLastAssistantMessageAsComplete] Marking last assistant message as complete:", lastAssistantMessageElement,);
      lastAssistantMessageElement.setAttribute("data-complete", "true");

      // Check if imageUrl is provided and display the placeholder
      const imageUrl =
        lastAssistantMessageElement.getAttribute("data-image-url");
      if (imageUrl === "true") {
        console.log(
          "[front.js/markLastAssistantMessageAsComplete] Image URL expected, displaying placeholder.",
        );
        const imgPlaceholder = document.createElement("div");
        imgPlaceholder.classList.add("image-placeholder");
        imgPlaceholder.textContent = "Image Generating...";
        messageContainer.prepend(imgPlaceholder);
        console.log(
          "[front.js/markLastAssistantMessageAsComplete] Image placeholder appended to message container.",
        );
      }
    }
    lastAssistantMessageElement = null;
    console.log(
      "[front.js/markLastAssistantMessageAsComplete] Last assistant message element reset to null",
    );
    setTimeout(() => {
      fetchStoryImage(userId);
    }, 5000); // 5000 milliseconds equals 5 seconds
  }

  function displayErrorMessage(message, showRetryButton = false) {
    console.log("[front.js/displayErrorMessage] Displaying error message", {
      message,
    });
    const errorMessageElement = document.createElement("div");
    errorMessageElement.classList.add("error-message");
    errorMessageElement.textContent = message;
    messageContainer.prepend(errorMessageElement);

    if (showRetryButton) {
      const retryButton = document.createElement("button");
      retryButton.textContent = "Retry";
      retryButton.addEventListener("click", () => {
        errorMessageElement.remove();
        callChatAPI(userInput.value.trim(), userId);
      });
      errorMessageElement.appendChild(retryButton);
    }

    console.log("[front.js/displayErrorMessage] Error message displayed");
  }

  function removePartialMessage() {
    const lastMessage = messageContainer.lastElementChild;
    if (lastMessage && !lastMessage.hasAttribute("data-complete")) {
      lastMessage.remove();
    }
  }

  async function fetchStoryImage(userId) {
    console.log("[fetchStoryImage] Fetching story image for user:", userId);
    const eventSource = new EventSource(`/api/story-image-proxy/${userId}`);

    return new Promise((resolve, reject) => {
      eventSource.onmessage = (event) => {
        const imageUrl = event.data;
        console.log("[fetchStoryImage] Image URL received:", imageUrl);
        displayStoryImage(imageUrl, userId);
        eventSource.close();
        resolve(imageUrl);
      };

      eventSource.onerror = (error) => {
        console.error("[fetchStoryImage] Error fetching story image:", error);
        eventSource.close();
        reject(error);
      };
    });
  }
});
