// public/front.js

let lastAssistantMessageElement = null;
let fullResponse = ""; // Keep track of the full response for the current stream

(function () {
  const originalLog = console.log;
  const originalError = console.error;
  console.log = function () {
    originalLog.apply(console, arguments);
    const message = Array.from(arguments).map(arg => (typeof arg === "object" ? JSON.stringify(arg) : arg)).join(" ");
    sendLogToServer("log", message);
  };
  console.error = function () {
    originalError.apply(console, arguments);
    const message = Array.from(arguments).map(arg => (typeof arg === "object" ? JSON.stringify(arg) : arg)).join(" ");
    sendLogToServer("error", message);
  };
  function sendLogToServer(type, message) {
    fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, message }),
    }).catch(err => originalError("Failed to send log to server", err));
  }
})();

function adjustImageMaxWidth() {
  const maxWidth = window.innerWidth;
  const maxImageWidth = Math.min(maxWidth, 896);
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
    const errorText = await response.text();
    throw new Error(`Failed to create new user: ${response.statusText} - ${errorText}`);
  }
  const data = await response.json();
  console.log("[front.js/createNewUser] New user created with ID:", data.userId);
  return data.userId;
}

let userId = localStorage.getItem("userId");
let socket;
let conversationHistory = []; // Global conversation history

function updateRoomDisplay(roomId, imageUrl) {
  const roomImageElement = document.getElementById("room-image");
  const defaultImageUrl = "https://firebasestorage.googleapis.com/v0/b/grue-4e13c.appspot.com/o/systemimages%2Fgrueoverview.png?alt=media&token=36b1d99f-82ff-4acf-8766-c7f2ca757b9a";

  if (roomImageElement) {
    const validRoomId = (roomId && roomId !== "null" && roomId !== "undefined") ? String(roomId) : "unknown";
    roomImageElement.dataset.roomId = validRoomId;

    if (imageUrl) {
      roomImageElement.src = imageUrl;
      roomImageElement.alt = `Image for Room ${validRoomId}`;
    } else {
      roomImageElement.src = defaultImageUrl;
      roomImageElement.alt = `Image loading or not available for Room ${validRoomId}`;
    }
  } else {
    console.error("[updateRoomDisplay] Error: room-image element not found.");
  }
}

function setupSocket() {
    if (!userId) {
        console.log("[Socket] No userId, socket cannot be initialized yet.");
        return;
    }
    if (socket && socket.connected) {
        return;
    }
    socket = io({ query: { userId } });
    socket.on("connect", () => console.log("[Socket] Successfully connected to the server with userId:", userId));
    socket.on("roomData", (data) => {
        // console.log("[Socket] Room data received:", data);
        if (data && (data.room_id !== null && data.room_id !== "")) {
            updateRoomDisplay(String(data.room_id), data.image_url);
        } else {
            // console.warn("[Socket] Warning: Room data received with invalid room_id. Data:", data);
            updateRoomDisplay(null, null); // Show default state if room_id is invalid
        }
    });
    socket.on("newImageUrlForRoom", (data) => {
        // console.log("[Socket] newImageUrlForRoom received:", data);
        const roomImageElement = document.getElementById("room-image");
        const currentDisplayedRoomId = roomImageElement ? roomImageElement.dataset.roomId : null;
        if (data && data.roomId && data.imageUrl && String(data.roomId) === String(currentDisplayedRoomId)) {
            updateRoomDisplay(String(data.roomId), data.imageUrl);
        }
    });
    socket.on("gameCleared", () => {
        console.log("[Socket] gameCleared event received. Resetting client state.");
        conversationHistory = [];
        displayConversationHistory();
        updateRoomDisplay(null, null);
    });
    socket.on("connect_error", (error) => console.error("[Socket] Connection Error:", error));
    socket.on("disconnect", (reason) => console.log("[Socket] Disconnected:", reason));
}

document.addEventListener("DOMContentLoaded", async () => {
  console.log("[front.js/DOMContentLoaded] Page loaded");
  const userInput = document.getElementById("userInput");
  const messageContainer = document.getElementById("messageContainer");

  window.addEventListener("resize", adjustImageMaxWidth);
  adjustImageMaxWidth();

  if (!userId) {
    try {
        userId = await createNewUser();
        localStorage.setItem("userId", userId);
    } catch (error) {
        console.error("Failed to create new user ID on load:", error);
        displayErrorMessage("Critical: Could not initialize session. Please refresh.", false);
        return;
    }
  }
  setupSocket();

  const initializeUserData = async () => {
    console.log("[front.js/init] Initializing user data for ID:", userId);
    fetch("/api/users", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    })
    .then(response => {
      if (!response.ok) return response.text().then(text => { throw new Error(`Init user data failed: ${response.statusText} - ${text}`); });
      return response.json();
    })
    .then(data => {
      if (data.userId && data.userId !== "undefined" && data.userId.trim() !== "") {
        if (userId !== data.userId) {
            console.warn(`[front.js/init] UserID corrected by server: ${data.userId}. Updating localStorage.`);
            userId = data.userId; localStorage.setItem("userId", userId);
            if (socket) socket.disconnect(); setupSocket();
        }
        console.log("[front.js/init] User data loaded/created", { userId: data.userId });
        conversationHistory = Array.isArray(data.conversation) ? data.conversation : [];
        displayConversationHistory();

        const initialRoomId = data.story ? String(data.story.room_location_user) : null;
        if (data.story && data.story.active_game === true) {
          if (data.latestImageUrl) {
            displayStoryImage(data.latestImageUrl, initialRoomId);
          } else {
            if(initialRoomId && initialRoomId !== "null" && initialRoomId !== "undefined") fetchStoryImage(userId).catch(err => console.warn("Initial fetchStoryImage on active game failed:", err.message));
            else displayStoryImage(null, null);
          }
        } else {
          displayStoryImage(null, null);
          const firstTimeUserMessage = "This is a system generated message on behalf of a user who is loading this game for the first time: This is my first time loading the page. Tell me about how I can be the hero in my own story, I just need to give you some clues into what world you want to enter. Let me know that I can tell you specifically, or give you the name of an author, story, or movie that can help guide the creation of our world. And if I speak a language other than English to just let you know.";
          if(conversationHistory.length === 0) { // Only send if history is actually empty
            console.log("[front.js/init] No active game & empty history. Sending first time message.");
            callChatAPI(firstTimeUserMessage, userId, false); // storeInHistory = false for this system message
          } else {
            // console.log("[front.js/init] No active game, but history exists. Not sending first time message.");
          }
        }
      } else { throw new Error("Invalid userId in response from /api/users init"); }
    })
    .catch(error => {
      console.error("[front.js/init] Error initializing user data:", error);
      displayErrorMessage("Error initializing application. " + error.message, false);
      displayStoryImage(null, null);
      if (!localStorage.getItem("userId")) {
          createNewUser().then(newUid => { userId = newUid; localStorage.setItem("userId", newUid); setupSocket(); initializeUserData(); })
                         .catch(err => console.error("Fallback createNewUser also failed:", err));
      } else { userId = localStorage.getItem("userId"); if(!socket || !socket.connected) setupSocket(); }
    });
  };

  await initializeUserData();

  async function callChatAPI(userPrompt, currentUserId, storeInHistory = true) {
    console.log("[front.js/callChatAPI] Calling /api/chat with prompt for user:", currentUserId);

    if (!currentUserId) {
        displayErrorMessage("User ID is missing. Cannot send message.", true); return;
    }

    // Prepare messages for API: always include the current userPrompt for the API call.
    // `storeInHistory` will control if the *assistant's* response gets added to local `conversationHistory`.
    // The user's prompt itself (if typed by user) is added to `conversationHistory` by the keydown listener.
    const contextMessages = conversationHistory.slice(-10); // Use recent history for context
    const messagesToSend = [...contextMessages];
    // Ensure the current prompt is the last user message sent to API if not already there from history slice
    if (!messagesToSend.length || messagesToSend[messagesToSend.length-1].content !== userPrompt || messagesToSend[messagesToSend.length-1].role !== 'user') {
        messagesToSend.push({ role: "user", content: userPrompt });
    }

    console.log("[front.js/callChatAPI] Sending messages to /api/chat (count):", messagesToSend.length);

    let retryCount = 0;
    const maxRetries = 1;
    fullResponse = ""; // Reset for the new stream
    if (lastAssistantMessageElement) {
        lastAssistantMessageElement.setAttribute("data-complete", "true");
    }
    lastAssistantMessageElement = null; // Prepare for new message element

    async function fetchChatAPI() {
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: messagesToSend,
            userId: currentUserId,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("[front.js/callChatAPI] Failed to start chat session. Status:", response.status, "Body:", errorText);
          throw new Error(`Failed to start chat session: ${response.statusText} - ${errorText}`);
        }

        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        // console.log("[front.js/callChatAPI] Reader created.");

        while (true) {
          const { value, done } = await reader.read();
          // console.log("[front.js/callChatAPI] Read from reader. Value:", value, "Done:", done);

          if (done) {
            console.log("[front.js/callChatAPI] Chat session stream ended (reader.done is true).");
            markLastAssistantMessageAsComplete();
            if (storeInHistory && fullResponse.trim() !== "") {
                // Add the successfully accumulated assistant response to local history
                conversationHistory.push({ role: "assistant", content: fullResponse });
            }
            break;
          }

          // Process each line from the chunk
          value.split("\n").forEach((line) => {
            if (line.startsWith("data:")) {
              const jsonDataString = line.substring(5).trim();
              if (jsonDataString && jsonDataString.toUpperCase() !== "[DONE]") {
                try {
                  const parsedLine = JSON.parse(jsonDataString);
                  if (parsedLine.content !== undefined) {
                    displayAssistantMessage(parsedLine.content); // This prepends
                    fullResponse += parsedLine.content; // Accumulate for history
                  }
                  // Image URL from stream (original logic, but image updates primarily via socket now)
                  if (parsedLine.imageUrl) {
                    console.log("[front.js/callChatAPI] Image URL in stream (rarely used now):", parsedLine.imageUrl);
                    // displayStoryImage(parsedLine.imageUrl); // displayStoryImage needs room_id too
                  }
                } catch (error) {
                  console.error("[front.js/callChatAPI] Error parsing JSON chunk:", error);
                  console.error("[front.js/callChatAPI] Offending line content (after 'data:'):", jsonDataString);
                }
              }
              // No specific handling for "[DONE]" in data payload here, as `reader.done` is the main signal
            } else if (line.trim() !== "") { // Log any non-empty, non-data lines
              // console.warn("[front.js/callChatAPI] Unexpected line in stream (not starting with 'data:'):", line);
            }
          });
        }
      } catch (error) {
        console.error("[front.js/callChatAPI] Error in fetchChatAPI:", error);
        removePartialMessage();
        if (retryCount < maxRetries) {
          retryCount++;
          displayErrorMessage("Oops! Connection issue. Retrying...", false);
          await new Promise(resolve => setTimeout(resolve, 1500 * retryCount)); // Slightly longer backoff
          await fetchChatAPI();
        } else {
          displayErrorMessage("Oops! Something went wrong after retries. Please try again. " + error.message, true);
        }
      }
    }
    await fetchChatAPI();
  }

  userInput.addEventListener("keydown", async (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      // clearInterval(checkImageInterval); // This was from old code, not used now
      // const imageLoadingElement = document.querySelector(".image-loading"); // This was from old code
      // if (imageLoadingElement) imageLoadingElement.remove();

      const userPrompt = userInput.value.trim();
      if (userPrompt !== "" && userId) {
        console.log("[front.js/userInput] User prompt entered", { userPrompt });
        displayUserMessage(userPrompt); // Prepends
        userInput.value = "";
        if (!Array.isArray(conversationHistory)) { // Should always be an array due to init
          console.warn("[front.js/userInput] Initializing empty conversation history (should not happen here).");
          conversationHistory = [];
        }
        conversationHistory.push({ role: "user", content: userPrompt }); // Add to local history
        callChatAPI(userPrompt, userId, true); // Assistant response will also be handled

        // Fetching story image immediately after sending prompt might be too soon.
        // Image updates are now primarily driven by socket events.
        // If you need an explicit fetch here, consider a delay or specific condition.
        // await fetchStoryImage(userId); // Kept from your original, but consider its timing

        // const newImageLoadingElement = document.createElement("div"); // Old logic
        // newImageLoadingElement.classList.add("image-loading");
        // messageContainer.prepend(newImageLoadingElement); // Old logic
      }
    }
  });

  function displayStoryImage(imageUrl, currentRoomId = null) {
    const roomImageElement = document.getElementById("room-image");
    const defaultImageUrl = "https://firebasestorage.googleapis.com/v0/b/grue-4e13c.appspot.com/o/systemimages%2Fgrueoverview.png?alt=media&token=36b1d99f-82ff-4acf-8766-c7f2ca757b9a";
    if (roomImageElement) {
      roomImageElement.src = imageUrl || defaultImageUrl;
      roomImageElement.alt = imageUrl ? `Image for Room ${currentRoomId || 'current'}` : "Default Grue Image";
      if(currentRoomId && currentRoomId !== "null" && currentRoomId !== "undefined") {
          roomImageElement.dataset.roomId = String(currentRoomId);
      } else {
          roomImageElement.dataset.roomId = "unknown";
      }
    } else { console.error("[displayStoryImage] room-image element not found."); }
  }

  // let checkImageInterval; // From your original code, not currently used with socket-driven updates

  function displayConversationHistory() {
    // console.log("[front.js/displayConversationHistory] Displaying last 10 messages.");
    messageContainer.innerHTML = '';
    const messagesToDisplay = conversationHistory.slice(-10);

    messagesToDisplay.forEach(message => {
      // This will display history with oldest at top of this block, newest at bottom.
      // New live messages are prepended above this.
      if (message.role === "user" && message.content) {
        const el = document.createElement("div"); el.classList.add("user-message");
        el.textContent = message.content; messageContainer.appendChild(el);
      } else if (message.role === "assistant" && message.content) {
        const el = document.createElement("div"); el.classList.add("response-message");
        el.setAttribute("data-complete", "true"); el.innerHTML = formatContent(message.content);
        messageContainer.appendChild(el);
      }
    });
    // If you want the scroll to be at the bottom of this history block after loading:
    // messageContainer.scrollTop = messageContainer.scrollHeight;
    // But since new messages are prepended, the view naturally stays at the top.
  }

  function displayUserMessage(message) {
    // console.log("[front.js/displayUserMessage] Prepending user message:", { message });
    const userMessageElement = document.createElement("div");
    userMessageElement.classList.add("user-message");
    userMessageElement.textContent = message;
    messageContainer.prepend(userMessageElement); // PREPEND for newest at top
    // console.log("[front.js/displayUserMessage] User message prepended.");
  }

  function formatContent(content) {
    content = String(content || ''); // Ensure it's a string
    content = content.replace(/\n/g, "<br>");
    content = content.replace(/([^ \n\d])(\d)/g, "$1 $2"); // Add space before number if not preceded by space/newline/digit
    // The regex content = content.replace(/(\d) /g, "$1"); // was in your original, removed as it can strip needed spaces
    return content;
  }

  function displayAssistantMessage(contentChunk) {
    // console.log("[front.js/displayAssistantMessage] Prepending/appending assistant chunk:", contentChunk.substring(0,30)+"...");
    if (!lastAssistantMessageElement || lastAssistantMessageElement.getAttribute("data-complete") === "true") {
      lastAssistantMessageElement = document.createElement("div");
      lastAssistantMessageElement.classList.add("response-message");
      lastAssistantMessageElement.setAttribute("data-complete", "false");
      messageContainer.prepend(lastAssistantMessageElement); // PREPEND new assistant message bubble
      // console.log("[front.js/displayAssistantMessage] New assistant message element prepended.");
    }
    lastAssistantMessageElement.innerHTML += formatContent(contentChunk);
    // console.log("[front.js/displayAssistantMessage] Chunk appended to current assistant bubble.");
  }

  function markLastAssistantMessageAsComplete() {
    if (lastAssistantMessageElement) {
      // console.log("[front.js/markLastAssistantMessageAsComplete] Marking last assistant message as complete.");
      lastAssistantMessageElement.setAttribute("data-complete", "true");
    }
    lastAssistantMessageElement = null;
    // console.log("[front.js/markLastAssistantMessageAsComplete] Last assistant message element reset.");
    // setTimeout for fetchStoryImage was in your original, kept commented out as socket events are primary.
    // setTimeout(() => {
    //   if (userId) fetchStoryImage(userId).catch(e => console.warn("Delayed fetchStoryImage failed:", e.message));
    // }, 5000);
  }

  function displayErrorMessage(message, showRetryButton = false) {
    console.log("[front.js/displayErrorMessage] Prepending error:", { message });
    const errorMessageElement = document.createElement("div");
    errorMessageElement.classList.add("error-message");
    errorMessageElement.textContent = message;
    if (showRetryButton && userId) {
      const retryButton = document.createElement("button");
      retryButton.textContent = "Retry"; // Original was "Retry"
      retryButton.addEventListener("click", () => {
        errorMessageElement.remove();
        // Retry last user prompt if available in history
        const lastUserPromptEntry = conversationHistory.findLast(m => m.role === 'user');
        if (lastUserPromptEntry) {
            callChatAPI(lastUserPromptEntry.content, userId, true);
        } else {
            // Or retry the text in the input field if nothing in history
            callChatAPI(userInput.value.trim(), userId, true);
        }
      });
      errorMessageElement.appendChild(retryButton);
    }
    messageContainer.prepend(errorMessageElement); // PREPEND error
    // console.log("[front.js/displayErrorMessage] Error message prepended.");
  }

  function removePartialMessage() {
    if (lastAssistantMessageElement && lastAssistantMessageElement.getAttribute("data-complete") === "false") {
      lastAssistantMessageElement.remove();
      lastAssistantMessageElement = null;
      console.log("[front.js/removePartialMessage] Removed partial assistant message bubble.");
    }
  }

  async function fetchStoryImage(currentUserId) { // currentUserId is passed
    if (!currentUserId) { console.error("[fetchStoryImage] No userId provided."); return Promise.reject(new Error("No userId for fetchStoryImage")); }
    // console.log("[fetchStoryImage] Fetching story image for user:", currentUserId);
    const eventSource = new EventSource(`/api/story-image-proxy/${currentUserId}`);
    return new Promise((resolve, reject) => {
      eventSource.onmessage = (event) => {
        const imageUrl = event.data;
        // console.log("[fetchStoryImage] Image URL received via SSE:", imageUrl);
        const roomImageElement = document.getElementById("room-image");
        const currentRoomIdOnImage = roomImageElement ? roomImageElement.dataset.roomId : null;
        displayStoryImage(imageUrl, currentRoomIdOnImage); // Pass current room ID for context
        eventSource.close();
        resolve(imageUrl);
      };
      eventSource.onerror = (errorEvent) => {
        console.error("[fetchStoryImage] SSE Error for user:", currentUserId, "ReadyState:", eventSource.readyState, "Event:", errorEvent);
        const roomImageElement = document.getElementById("room-image");
        displayStoryImage(null, roomImageElement ? roomImageElement.dataset.roomId : null); // Show placeholder
        eventSource.close();
        reject(new Error("SSE connection error or server error during image fetch."));
      };
    });
  }
});