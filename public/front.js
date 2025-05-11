// public/front.js

let lastAssistantMessageElement = null;
let fullResponse = ""; // Keep track of the full response for the current stream

// --- Start of logging override ---
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
// --- End of logging override ---

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
    body: JSON.stringify({}), // Send empty body, server will generate ID if needed
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

// --- New/Enhanced Image Handling Logic ---
let currentVisibleRoomId = null; // Tracks the ID of the room whose details are currently shown
let roomImageCache = {};       // Simple cache for { roomId: imageUrl }
const DEFAULT_IMAGE_URL = "https://firebasestorage.googleapis.com/v0/b/grue-4e13c.appspot.com/o/systemimages%2Fgrueoverview.png?alt=media&token=36b1d99f-82ff-4acf-8766-c7f2ca757b9a";

/**
 * Updates the main room image display.
 * @param {string | null} imageUrl The URL of the image to display, or null for default/none.
 * @param {string} imageAltText Alt text for the image.
 */
function updateDisplayImage(imageUrl, imageAltText) {
  const roomImageElement = document.getElementById('room-image');
  if (!roomImageElement) {
    console.error("[Client] updateDisplayImage: room-image element not found.");
    return;
  }

  const finalImageUrl = imageUrl || DEFAULT_IMAGE_URL;
  const finalAltText = imageAltText || (imageUrl ? `Image for current room` : "Default Grue overview image");

  if (roomImageElement.src !== finalImageUrl) { // Only update if src actually changes
    console.log('[Client] Setting room image src to:', finalImageUrl);
    roomImageElement.src = finalImageUrl;
  }
  roomImageElement.alt = finalAltText;
  roomImageElement.style.display = 'block'; // Ensure it's visible

  roomImageElement.onerror = () => {
    console.error('[Client] Error loading image:', finalImageUrl, "Displaying default.");
    roomImageElement.src = DEFAULT_IMAGE_URL; // Fallback to default on error
    roomImageElement.alt = "Error loading image. Displaying default Grue overview.";
    roomImageElement.style.display = 'block';
  };
  roomImageElement.onload = () => {
    // console.log('[Client] Image loaded successfully:', roomImageElement.src);
  };
}
// --- End of New/Enhanced Image Handling Logic ---


// This function is kept from your original, but its direct calls are less critical now
// with socket events. It's primarily used by the SSE fallback.
function displayStoryImage(imageUrl, roomIdForAlt = null) {
  const altText = imageUrl
    ? `Image for Room ${roomIdForAlt || currentVisibleRoomId || 'current'}`
    : "Default Grue Image";
  updateDisplayImage(imageUrl, altText); // Uses the new central function

  // Update dataset.roomId on the image element if it exists
  const roomImageElement = document.getElementById("room-image");
  if (roomImageElement) {
      const effectiveRoomId = roomIdForAlt || currentVisibleRoomId;
      roomImageElement.dataset.roomId = (effectiveRoomId && effectiveRoomId !== "null" && effectiveRoomId !== "undefined")
                                        ? String(effectiveRoomId)
                                        : "unknown";
  }
}


function setupSocket() {
    if (!userId) {
        console.log("[Socket] No userId, socket cannot be initialized yet.");
        return;
    }
    if (socket && socket.connected) {
        // console.log("[Socket] Already connected.");
        return;
    }
    socket = io({ query: { userId } });
    socket.on("connect", () => console.log("[Socket] Successfully connected to the server with userId:", userId));

    socket.on("roomData", (data) => {
        console.log("[Socket] Received 'roomData':", JSON.stringify(data));
        const roomImageElement = document.getElementById("room-image");

        if (data && data.room_id && data.room_id !== "null" && data.room_id !== "undefined") {
            currentVisibleRoomId = String(data.room_id);
            if(roomImageElement) roomImageElement.dataset.roomId = currentVisibleRoomId;
            console.log(`[Socket] Current visible room ID set by roomData: ${currentVisibleRoomId}`);

            const imageUrlToDisplay = data.image_url || roomImageCache[currentVisibleRoomId] || null;
            const altText = `Image for Room ${currentVisibleRoomId}`;
            updateDisplayImage(imageUrlToDisplay, altText);

            // TODO: Update other room details on the page (name, description) from 'data' if provided
            // Example:
            // const roomDisplayElement = document.getElementById('room-display');
            // if (roomDisplayElement && data.room_name) {
            //     roomDisplayElement.textContent = data.room_name + (data.interesting_details ? `: ${data.interesting_details}` : '');
            // }

        } else {
            console.warn("[Socket] 'roomData' received with invalid or null room_id. Clearing display. Data:", data);
            currentVisibleRoomId = null;
            if(roomImageElement) roomImageElement.dataset.roomId = "unknown";
            updateDisplayImage(null, "No current room data.");
        }
    });

    socket.on("newImageUrlForRoom", (data) => {
        console.log("[Socket] Received 'newImageUrlForRoom':", JSON.stringify(data));
        if (data && data.roomId && data.imageUrl) {
            const roomIdStr = String(data.roomId);
            console.log(`[Socket] New image URL for room ${roomIdStr}: ${data.imageUrl.substring(0, 70)}...`);
            roomImageCache[roomIdStr] = data.imageUrl; // Cache it

            if (roomIdStr === currentVisibleRoomId) {
                console.log(`[Socket] Image is for the currently visible room (${currentVisibleRoomId}). Updating display.`);
                const altText = `Image for Room ${currentVisibleRoomId}`;
                updateDisplayImage(data.imageUrl, altText);
                const roomImageElement = document.getElementById("room-image");
                if(roomImageElement) roomImageElement.dataset.roomId = currentVisibleRoomId; // Ensure dataset is also updated
            } else {
                console.log(`[Socket] Image for room ${roomIdStr} received, but current room is ${currentVisibleRoomId || 'not set'}. Cached for later.`);
            }
        } else {
            console.warn('[Socket] "newImageUrlForRoom" event received with incomplete data:', data);
        }
    });

    socket.on("gameCleared", () => {
        console.log("[Socket] gameCleared event received. Resetting client state.");
        conversationHistory = [];
        displayConversationHistory(); // Clears message container
        currentVisibleRoomId = null;
        const roomImageElement = document.getElementById("room-image");
        if(roomImageElement) roomImageElement.dataset.roomId = "unknown";
        updateDisplayImage(null, "Game Cleared. Default Grue Image."); // Show default state
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
  // Initial call to display default image before socket connection or data load
  const roomImageElement = document.getElementById("room-image");
  if (roomImageElement) roomImageElement.dataset.roomId = "unknown"; // Initialize dataset
  updateDisplayImage(null, "Loading Grue..."); // Show default image while loading

  setupSocket(); // Setup socket listeners

  const initializeUserData = async () => {
    console.log("[front.js/init] Initializing user data for ID:", userId);
    if (!userId) { // Double check userId before fetch
        console.error("[front.js/init] Critical: No userId available for initialization.");
        displayErrorMessage("Session ID missing. Cannot initialize.", false);
        return;
    }
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
            if (socket) socket.disconnect(); setupSocket(); // Re-setup socket with new ID
        }
        console.log("[front.js/init] User data loaded/created", { userId: data.userId });
        conversationHistory = Array.isArray(data.conversation) ? data.conversation : [];
        displayConversationHistory();

        const initialRoomIdFromServer = data.story ? String(data.story.room_location_user) : null;
        currentVisibleRoomId = (initialRoomIdFromServer && initialRoomIdFromServer !== "null" && initialRoomIdFromServer !== "undefined") ? initialRoomIdFromServer : null;

        const roomImageElem = document.getElementById("room-image");
        if(roomImageElem && currentVisibleRoomId) roomImageElem.dataset.roomId = currentVisibleRoomId;
        else if(roomImageElem) roomImageElem.dataset.roomId = "unknown";

        if (data.story && data.story.active_game === true) {
          const altText = `Image for Room ${currentVisibleRoomId || 'initial'}`;
          if (data.latestImageUrl) {
            updateDisplayImage(data.latestImageUrl, altText);
          } else {
            // If no latestImageUrl, but we have a valid room, try SSE once as a fallback
            // Otherwise, default image will be shown by updateDisplayImage(null,...)
            if(currentVisibleRoomId) {
                console.log("[front.js/init] Active game, no latestImageUrl from /api/users. Attempting SSE fetch for initial image.");
                fetchStoryImage(userId, currentVisibleRoomId) // Pass currentVisibleRoomId for alt text
                    .catch(err => {
                        console.warn("Initial fetchStoryImage (SSE) on active game failed:", err.message, "Default image will be shown.");
                        updateDisplayImage(null, `Image loading for ${currentVisibleRoomId || 'room'}...`);
                    });
            } else {
                 updateDisplayImage(null, "No current room. Default Grue Image.");
            }
          }
        } else { // No active game
          updateDisplayImage(null, "Welcome to Grue! Default Image.");
          const firstTimeUserMessage = "This is a system generated message on behalf of a user who is loading this game for the first time: This is my first time loading the page. Tell me about how I can be the hero in my own story, I just need to give you some clues into what world you want to enter. Let me know that I can tell you specifically, or give you the name of an author, story, or movie that can help guide the creation of our world. And if I speak a language other than English to just let you know.";
          if(conversationHistory.length === 0) {
            console.log("[front.js/init] No active game & empty history. Sending first time message.");
            callChatAPI(firstTimeUserMessage, userId, false);
          }
        }
      } else { throw new Error("Invalid userId in response from /api/users init"); }
    })
    .catch(error => {
      console.error("[front.js/init] Error initializing user data:", error);
      displayErrorMessage("Error initializing application. " + error.message, false);
      const roomImageElem = document.getElementById("room-image");
      if(roomImageElem) roomImageElem.dataset.roomId = "unknown";
      updateDisplayImage(null, "Error loading. Default Grue Image.");
      // Fallback to ensure userId and socket are attempted if initial load fails
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

    // IMPORTANT: Fix for sending messages to /api/chat
    // Send only the current user prompt and expect the server to use its context.
    // Or, if sending history, format it correctly. For simplicity now, just current prompt.
    const messagesToSend = [{ role: "user", content: userPrompt }];
    // If you want to send more context from client:
    // const recentHistory = conversationHistory.slice(-4).map(msg => ({role: msg.role, content: msg.content || msg.userPrompt || msg.response })); // Adapt based on local history structure
    // messagesToSend = [...recentHistory, { role: "user", content: userPrompt }];


    console.log("[front.js/callChatAPI] Sending messages to /api/chat:", JSON.stringify(messagesToSend));

    let retryCount = 0;
    const maxRetries = 1;
    fullResponse = "";
    if (lastAssistantMessageElement) {
        lastAssistantMessageElement.setAttribute("data-complete", "true");
    }
    lastAssistantMessageElement = null;

    async function fetchChatAPI() {
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: messagesToSend, // Correctly formatted messages
            userId: currentUserId,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("[front.js/callChatAPI] Failed to start chat session. Status:", response.status, "Body:", errorText);
          throw new Error(`Failed to start chat session: ${response.statusText} - ${errorText}`);
        }

        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();

        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            console.log("[front.js/callChatAPI] Chat session stream ended (reader.done is true).");
            markLastAssistantMessageAsComplete();
            if (storeInHistory && fullResponse.trim() !== "") {
                const assistantEntry = { role: "assistant", content: fullResponse, timestamp: new Date().toISOString() };
                // Check if the very last entry is already this assistant message (to avoid duplicates from retries)
                if(conversationHistory.length === 0 || conversationHistory[conversationHistory.length-1].content !== fullResponse || conversationHistory[conversationHistory.length-1].role !== "assistant") {
                    conversationHistory.push(assistantEntry);
                }
            }
            break;
          }
          value.split("\n").forEach((line) => {
            if (line.startsWith("data:")) {
              const jsonDataString = line.substring(5).trim();
              if (jsonDataString && jsonDataString.toUpperCase() !== "[DONE]") {
                try {
                  const parsedLine = JSON.parse(jsonDataString);
                  if (parsedLine.content !== undefined) {
                    displayAssistantMessage(parsedLine.content);
                    fullResponse += parsedLine.content;
                  }
                  // Removed direct image handling from stream as sockets are primary
                } catch (error) {
                  console.error("[front.js/callChatAPI] Error parsing JSON chunk:", error, "Offending line:", jsonDataString);
                }
              }
            }
          });
        }
      } catch (error) {
        console.error("[front.js/callChatAPI] Error in fetchChatAPI:", error);
        removePartialMessage();
        if (retryCount < maxRetries) {
          retryCount++;
          displayErrorMessage("Oops! Connection issue. Retrying...", false);
          await new Promise(resolve => setTimeout(resolve, 1500 * retryCount));
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
      const userPrompt = userInput.value.trim();
      if (userPrompt !== "" && userId) {
        console.log("[front.js/userInput] User prompt entered", { userPrompt });
        const userEntry = { role: "user", content: userPrompt, timestamp: new Date().toISOString() };
        displayUserMessage(userPrompt);
        userInput.value = "";
        if (!Array.isArray(conversationHistory)) conversationHistory = [];
        conversationHistory.push(userEntry);
        callChatAPI(userPrompt, userId, true);
      }
    }
  });

  // `displayStoryImage` is now primarily a helper for the new `updateDisplayImage`
  // and for the SSE fallback. Socket events will call `updateDisplayImage` directly or indirectly.

  function displayConversationHistory() {
    messageContainer.innerHTML = '';
    const messagesToDisplay = conversationHistory.slice(-10);
    messagesToDisplay.forEach(message => {
      const content = message.content || message.userPrompt || message.response; // Adapt to your history structure
      const role = message.role || (message.userPrompt ? 'user' : 'assistant');

      if (role === "user" && content) {
        const el = document.createElement("div"); el.classList.add("user-message");
        el.textContent = content; messageContainer.appendChild(el);
      } else if (role === "assistant" && content) {
        const el = document.createElement("div"); el.classList.add("response-message");
        el.setAttribute("data-complete", "true"); el.innerHTML = formatContent(content);
        messageContainer.appendChild(el);
      }
    });
  }

  function displayUserMessage(message) {
    const userMessageElement = document.createElement("div");
    userMessageElement.classList.add("user-message");
    userMessageElement.textContent = message;
    messageContainer.prepend(userMessageElement);
  }

  function formatContent(content) {
    content = String(content || '');
    content = content.replace(/\n/g, "<br>");
    content = content.replace(/([^ \n\d])(\d)/g, "$1 $2");
    return content;
  }

  function displayAssistantMessage(contentChunk) {
    if (!lastAssistantMessageElement || lastAssistantMessageElement.getAttribute("data-complete") === "true") {
      lastAssistantMessageElement = document.createElement("div");
      lastAssistantMessageElement.classList.add("response-message");
      lastAssistantMessageElement.setAttribute("data-complete", "false");
      messageContainer.prepend(lastAssistantMessageElement);
    }
    lastAssistantMessageElement.innerHTML += formatContent(contentChunk);
  }

  function markLastAssistantMessageAsComplete() {
    if (lastAssistantMessageElement) {
      lastAssistantMessageElement.setAttribute("data-complete", "true");
    }
    lastAssistantMessageElement = null;
  }

  function displayErrorMessage(message, showRetryButton = false) {
    console.log("[front.js/displayErrorMessage] Prepending error:", { message });
    const errorMessageElement = document.createElement("div");
    errorMessageElement.classList.add("error-message");
    errorMessageElement.textContent = message;
    if (showRetryButton && userId) {
      const retryButton = document.createElement("button");
      retryButton.textContent = "Retry";
      retryButton.addEventListener("click", () => {
        errorMessageElement.remove();
        const lastUserPromptEntry = conversationHistory.findLast(m => m.role === 'user');
        if (lastUserPromptEntry && lastUserPromptEntry.content) {
            callChatAPI(lastUserPromptEntry.content, userId, true);
        } else if (userInput.value.trim() !== "") {
            callChatAPI(userInput.value.trim(), userId, true);
        } else {
            console.warn("[displayErrorMessage] No last user prompt to retry.");
            // Optionally, re-initialize or prompt user to type something.
        }
      });
      errorMessageElement.appendChild(retryButton);
    }
    messageContainer.prepend(errorMessageElement);
  }

  function removePartialMessage() {
    if (lastAssistantMessageElement && lastAssistantMessageElement.getAttribute("data-complete") === "false") {
      lastAssistantMessageElement.remove();
      lastAssistantMessageElement = null;
      console.log("[front.js/removePartialMessage] Removed partial assistant message bubble.");
    }
  }

  async function fetchStoryImage(currentUserId, currentRoomIdForAlt = null) { // Added currentRoomIdForAlt
    if (!currentUserId) { console.error("[fetchStoryImage] No userId provided."); return Promise.reject(new Error("No userId for fetchStoryImage")); }
    const eventSource = new EventSource(`/api/story-image-proxy/${currentUserId}`);
    return new Promise((resolve, reject) => {
      eventSource.onmessage = (event) => {
        const imageUrl = event.data;
        console.log("[fetchStoryImage] Image URL received via SSE:", imageUrl);
        const altText = `Image for Room ${currentRoomIdForAlt || currentVisibleRoomId || 'current (SSE)'}`;
        updateDisplayImage(imageUrl, altText); // Use central update function
        const roomImageElement = document.getElementById("room-image");
        if(roomImageElement && (currentRoomIdForAlt || currentVisibleRoomId)) {
             roomImageElement.dataset.roomId = String(currentRoomIdForAlt || currentVisibleRoomId);
        }
        eventSource.close();
        resolve(imageUrl);
      };
      eventSource.onerror = (errorEvent) => {
        console.error("[fetchStoryImage] SSE Error for user:", currentUserId, "ReadyState:", eventSource.readyState, "Event:", errorEvent);
        const altText = `Image loading failed for ${currentRoomIdForAlt || currentVisibleRoomId || 'room (SSE)'}`;
        updateDisplayImage(null, altText); // Show placeholder via central function
        eventSource.close();
        reject(new Error("SSE connection error or server error during image fetch."));
      };
    });
  }
});