# Grue

Grue is an homage to the old text-based adventure games like Zork and Oregon Trail. I wanted to see what would happen if we wired one of those up to a LLM AI dungeon master. The only issue was, I don't know how to program. I decided to see if I could direct the LLM to write it for me. I was very pleased with the outcome. Play it at [http://grue.is](http://grue.is).

The game is focused on people interested in learning history by playing a game, much like Oregon Trail. You can pick any time period and you'll be engaged in a series of challenges to overcome. It should handle any language the user reads/writes. There are certainly improvements to be made, feedback welcome. https://www.threads.net/@leonardspeiser

## How to get the most out of an LLM as a non-programmer

### Picking your environment:
A real programmer would have chosen an IDE like Visual Studio for their desktop. I tried a few of these and ran into environmental setup problems too often. I attempted to ask the LLM to explain how to fix them, but they gave instructions that I often failed to understand or did not match the interface I looked at. This would not be a problem for a real programmer, but I wanted results immediately. This is where Replit really shines. I want to compliment this team for building such an incredible experience. I'd seen my kids use this when learning programming, and now I understood why. I didn't have to NPM this or that in the shell. I just started using a function and it took care of everything. I wanted to compile and run my code, no issues. Need a database, done. Want to deploy to the web, easy. This allowed me to focus the LLM on only one thing, code. However, this did impact some decisions later.

### Choosing your language:
I started by building a simple program that was only accessible via the console log. I chose Python based on its popularity as the example code used for API docs. Generally, it worked well and if I were a programmer I might have stayed with it. However, I ran into one issue that was a non-starter for a non-programmer. Python's insistence on proper formatting. LLMs would often give me a chunk of code to replace. When I would paste it in, I would mess up the tabs. I started to refine my prompts to fix this, but I was impatient. That's why I never became a computer programmer, I'm too impatient to learn the right way. I cut corners. That's why I start companies, to get out of hard work :). So getting the formatting to work was too much effort. Friends told me that modern IDEs would have solved this for me, but per my first point about environments, I was not willing to trade. Because I wasn't doing the code, what did I care which language I chose. So I chose another language. I heard amazing things about Rust. I don't think my program necessarily needed it, but I'd get some cool points for it, so I rewrote it in Rust. I mean, my LLM rewrote it. However, I found that the LLM did a lot worse coding in Rust. I tried a few other formats. I heard good things about Next.JS and Vercel, so I switched to that and set up auto deployment. Very cool, but later when I started testing databases I again ran into issues with deployments. I tried Go and a few other languages. Eventually, I settled on Node JS. I found that for some reason, choosing Node also made passing data between the front end and backend much easier than I found with Python. I'm sure an experienced programmer would have figured out what was wrong with my sockets or whatnot, but this is where another LLM issue cropped up. LLMs tend to make the same mistakes over and over, and for some reason, maybe there aren't enough examples of people building web apps with Python, I don't know, but I was spending days copying and pasting code from the LLM and having it not work. Node, perhaps because of its web roots, was something LLMs made fewer mistakes on.

### Console.logs, the eyes of the LLM:
I attempted to install log software into my code, but again the environmental issues were often beyond my patience to figure out and I couldn't just paste in what the LLM gave me. So I found myself putting in console logs. A LOT OF CONSOLE LOGS. And I started giving it a format. console.log("[index.js/createuser] Created user:", userid); By giving it the file name, function name, and as often as possible any dynamic data, the LLM could see what went wrong. It created really long console logs, which in itself is a problem with what LLMs can handle today, and I'm sure there are performance issues with it, but it is totally worth it. At one point I created a flag that allowed me to turn the logs on and off but eventually I skipped it because I always wanted the logs on. Perhaps as we move into product, costs, and performance I'll have the LLM put it back in again. That said I had to tell LLMs to do this for me very explicitly because it is not a normal pattern.

### Performance and LLMs not getting LLMs:
In my ideal world I would pipe every action into an LLM to take care of for me. However, I noticed almost immediately that its speed could not compare to a local coding operation. If I wanted to craft a detailed world in advance, the user would be waiting a long time until it was all generated. This might go away in the future, machines are getting faster, but then again like video games and graphic cards, we often fill the available processing up with more complex things to process. So I started to look at two concepts. Run as much as you can before the user engages you and store it. Second, keep simple functions where you can be exact in your matches local. LLM functions are the lifeblood of this. By getting back JSON fields with strict details like Boolean, Integers, or Text chosen from a list, I could run functions quickly and more cheaply. Ok, real programmer, yes this is basic. But here is where I would run into the problem. LLMs are actually really bad at figuring out how LLM functions are part of the code. Now this will go away when there are a billion lines of code that use LLMs, but there are not right now. There are so little that LLMs are super bad at helping with this. Not only that, it's like it treats LLM prompts like wasted space that needs to be rewritten and reduced from 40 lines to 10 words and ... It doesn't understand that the data that comes back is what will power the code. It will try to take your example issue and then hard code if-then statements around the content. More about this in the prompt section.

### Database vs. Flat Files:
Ok, a little background on why I built this game. I like to build companies, but I don't trust writers to focus on the issues that can kill a company. So I need to personally dive in so I understand the pros/cons/gotchas at a very detailed level. Then I can get out of the water and trust my teams to do what they do best. Because that was my goal, I tested a lot of approaches out that might have been overkill for what I was doing. I tested SQLite, Postgres, serverless databases like CockroachDB. To speed up the system figuring out what the user wanted without waiting for the LLM to round trip I built PGVector databases (which I learned didn't work on CockroachDB). I tested flat files with JSON. I passed data via in-memory databases, worked with cookies and localStorage. I learned about frameworks like Sequelize and started to download SQL navigators to better see the data. I had LLMs build me scripts to preloading the databases or making changes to ones that already had data in them. Here is my summary: It's all doable with LLMs and it's pretty awesome. But as a non-programmer, I'd say it's a bit of a wash. Flat files with JSON were great because you could make changes to the data structure easily without having to learn how to migrate data and you can be sloppy, and in the world of LLMs sloppy is just fine, preferable in many cases. However, there is a lot of setup that is needed with JSON, from creating the files (in my case per user so a sloppy change wouldn't break everyone and the data didn't get so large it would not load), to figuring out how to add, update or remove data from them. I'm sure there is some sort of hybrid out there between the two systems. One issue with flatfiles, Replit has not released an easy way to see flatfiles created by the code when in production. So strangely their postgres support makes it easier to see what is going on. For now I am backing up the flatfiles to a Google Drive, but as I've mentioned elsewhere in this post, it was a huge challenge for LLMs to guide me through the setup and I lost a day going down an hole and then reverting and finally getting it to work, mostly.

### Prompt engineering:
I'm ashamed to say that my prompt engineering was so bad at the beginning I got very abusive with my LLM. "NO, I told you to give me the full code! You know I don't know how to code. You've done it three times in a row! Just do what I asked." When the robot uprising comes, you might want to stay clear of me, for your own safety. Let's jump to the punchline. For a non-programmer, I would follow a fairly standard process: 1) I want to add a new field for the user called age. 2) It gives me a little code, maybe referencing a function where it belongs, but without all the code in it. 50% of the time if I tried to add it myself I'd break something. Brackets and try/else statements are the bane of my existence. 2) Great, add your code above into my function. Make sure you remove no content or functions and you don't shorten it. Make sure you add console.logs at every step including dynamic data. Paste: function code or entire file depending on how extensive the changes. 3) Most of the time you get back what you need, you copy and paste it in. Occasionally it adds something that belongs at the top of the page. In time you see the patterns and can do it yourself but at the beginning you can paste the entire file in, although the more code you paste in, the more likely it will summarize something even with your instructions. As your code gets longer, consider refactoring it into multiple files, but understand that this is again where the LLMs get a little confused and expect to spend a lot of time with this exercise. This problem goes away as context windows get larger, so I think this isn't too worrisome.

### Comments:
Comments are meant for the next programmer, but in my case, I don't have any human programmers. However, I have noticed that the LLMs can break the code in the exact same way over and over again. For instance, if they only know of an old OpenAI model, they will swap the one I wanted for an old one. They will do this while you are trying to change something else and you might not realize that. Some of their changes will fundamentally break something, but then when you paste the logs into it the prescribed fix will be in another area. Before you know it you've destroyed your code with changes and you can't remember how much to undo to find that little change the LLM snuck it. So here is where comments matter. // DO NOT CHANGE THIS, EVER

### Why being a connoisseur is valuable:
You can become knowledgeable about many products without knowing how to make them. You can describe the benefits of house construction materials, styles and the difficulty of working with them, without knowing how to lay concrete or the order to assemble a house. My experience here is that while I did not learn how to code, I did take the time to learn what the code assembles into. Understanding that allowed me to direct the LLM much more efficiently. My first version of Grue took months and I never really got it to work the way I wanted. I took a break and built a hands-free trivia game in two weeks, then I came back and in two weeks rebuilt my entire game and felt the results were vastly better. Instead of trying to refactor my first program, I found it much easier to just rewrite the entire program given that I knew all the pieces I needed. I did go back to my old software to grab sections where I processed the LLM function calls, but again that was due to the lack of existing examples of code that did that, and I had already worked through those issues with my previous software and could use it as a component of sorts.

## Dissecting Grue: Data, Prompts, and Code

This section dives into the core components that make Grue work: how data is structured and stored, how prompts are engineered to guide the LLM, and an overview of the codebase.

### Data Elements: The Memory of the World

Grue stores all its persistent data in **Firebase Realtime Database**, a NoSQL cloud database where data is stored as JSON and synchronized in real-time to every connected client. User-specific game data is organized under a path structure like `data/users/<userId>/`, ensuring each player's adventure is isolated.

Here's a breakdown of the key data entities for each user:

*   **`story.json`**: This is the central hub for the overall game state and user profile.
    *   `active_game` (boolean): Indicates if a game is currently in progress.
    *   `language_spoken` (string): The language the user interacts in.
    *   `character_played_by_user` (string): The name of the user's character.
    *   `player_resources` (string): E.g., "Gold: 200, Lumber: 300".
    *   `time_period` (string): The historical setting of the game.
    *   `story_location` (string): The geographical setting.
    *   `room_location_user` (string): The `room_id` of the room the user is currently in. This is critical for linking to the correct room data.
    *   `previous_user_location` (string): The `room_id` of the room the user was in before the current one.
    *   `current_room_name` (string): A descriptive name for the current room.
    *   Other fields like `player_attitude`, `player_lives_in_real_life`, `game_description`, `player_profile`, `education_level`, `save_key`.

*   **`conversation.json`**: An array storing the history of interactions between the user and the AI. Each entry typically contains:
    *   `messageId` (number): A sequential ID.
    *   `timestamp` (string): ISO date string of when the message occurred.
    *   `userPrompt` (string): The text input by the user.
    *   `response` (string): The AI's response.

*   **`room.json`**: An array of room objects that define the game world for the user. Each room object can have:
    *   `room_id` (string): A unique identifier for the room (e.g., "store-001", "mainroad-002"). This ID is crucial for navigation and linking.
    *   `room_name` (string): A descriptive name for the room.
    *   `interesting_details` (string): Textual description of the room's contents and atmosphere.
    *   `available_directions` (string): Possible exits or movement options (e.g., "North to the forest, East to the town square").
    *   `characters_in_room` (string): NPCs present in the room.
    *   `room_description_for_dalle` (string): A prompt specifically crafted for DALL-E to generate an image for this room.
    *   `image_url` (string/null): The URL of the DALL-E generated image for this room, stored in Firebase Storage. Null if no image is generated yet.
    *   `user_in_room` (boolean): `true` if the user is currently in this room, `false` otherwise. Only one room should have this set to `true`.

*   **`player.json`**: An array of player character (PC) or non-player character (NPC) objects encountered or relevant to the user's story.
    *   `player_id` (string): A unique identifier for the character.
    *   `player_name` (string): The character's name.
    *   `player_looks` (string): Description of the character's appearance.
    *   `player_location` (string): The `room_id` or general area where the character is.
    *   `player_health` (string): Character's health status.
    *   `player_type` (string): Role or type of character (e.g., "merchant", "guard", "main_character").

*   **`quest.json`**: An array of quest or crisis objects that the user might be involved in.
    *   `quest_id` (string): A unique identifier for the quest.
    *   `quest_name` (string): The title of the quest.
    *   `quest_characters` (string): Key characters involved in the quest.
    *   `quest_steps` (string): Description of the objectives or steps involved.
    *   `quest_completed_percentage` (integer): Progress indicator (0-100).

*   **Firebase Storage (`images/<userId>/`)**: While not a JSON file, this is where DALL-E generated images for rooms are stored. The `image_url` in `room.json` points to these files.

*   **Chat Data (`chats/<userId>`)**: For the "Chat with Me" feature (the separate chat with AI Leonard Speiser), conversation history is stored in a different Firebase path, `chats/<userId>`, as an array of objects, each containing `userPrompt`, `assistantResponse`, and `timestamp`.

### Prompt Elements: Directing the AI Dungeon Master

Grue heavily relies on prompt engineering to guide the LLM's behavior, especially for structured data updates using OpenAI's function calling feature and for generating game narrative and images.

*   **General Game Chat (`/api/chat` in `index.js`):**
    *   **`getDMSystemMessage`**: This is a crucial dynamic prompt that changes based on whether `active_game` is `false` (setup phase) or `true` (gameplay phase).
        *   **Setup Phase**: Instructs the AI to act as the creator of Oregon Trail, guide the user through setting up their historical adventure by asking about their age/grade, location, desired language, preferred time period, and character choice. It provides a step-by-step questioning flow.
        *   **Gameplay Phase (Implied by absence of setup phase instructions)**: The AI transitions to being the Dungeon Master for the chosen adventure.
    *   Contextual information like conversation history (`getHistorySummary`), current story fields (`getStoryFields`), user details (`getUserFields`), current room details (`getRoomFields`), active quests (`getQuestFields`), and player characters (`getPlayerFields`) are dynamically injected into the system prompts to give the LLM necessary context for its responses.

*   **Structured Data Updates (`data.js` functions):**
    These functions use specific prompts and OpenAI's "tool calls" (function calling) to get structured JSON back from the LLM for updating game state.

    *   **`updateStoryContext` (Tool: `update_story_context`):**
        *   **System Prompt**: "You are a world-class storyteller. Update the story JSON based on the latest conversation."
        *   **Context**: Provides previous story data, current room data, player data, crisis data, and recent conversation history.
        *   **Instruction Focus**: Critically, it instructs the LLM to anticipate and set the `room_location_user` to the unique `room_id` that the `update_room_context` tool *will later* assign to the new room. It also updates `previous_user_location`, `current_room_name`, and `active_game` status (e.g., if the user quits).
        *   **Tool Schema**: `story_details` object with properties like `language_spoken`, `character_played_by_user`, `time_period`, `room_location_user`, `active_game`, etc.

    *   **`updateRoomContext` (Tool: `update_room_context`):**
        *   **System Prompt**: "You are a DM. Analyze conversation to update/create room data objects."
        *   **Context**: Provides existing array of all known room objects and the latest conversation history.
        *   **Instruction Focus**: Identify all rooms mentioned or implied. For new rooms, assign a *new unique `room_id`*. For existing rooms, update details *without changing `room_id`*. Critically, set `user_in_room: true` for *only one* room (the user's current location) and `false` for all others. Provide a `room_description_for_dalle`.
        *   **Tool Schema**: `rooms` array, where each item is a room object with properties like `room_name`, `room_id` (string), `interesting_details`, `available_directions`, `room_description_for_dalle`, `user_in_room` (boolean).

    *   **`updatePlayerContext` (Tool: `update_player_context`):**
        *   **System Prompt**: "You are a world class dungeon master... identify every character..."
        *   **Context**: Current story data, existing player data array, and conversation history.
        *   **Instruction Focus**: Identify all characters (PC or NPC) from the conversation, update existing ones, or create new entries.
        *   **Tool Schema**: `players` array, where each item is a player object with `player_id` (string), `player_name`, `player_looks`, `player_location`, `player_health`.

    *   **`updateQuestContext` (Tool: `update_quest_context`):**
        *   **System Prompt**: "You are a world class dungeon master... extract the data about the crisis..."
        *   **Context**: Current story data, existing quest data array, and conversation history.
        *   **Instruction Focus**: Identify and update information about ongoing or new quests/crises.
        *   **Tool Schema**: `quests` array, where each item is a quest object with `quest_id` (string), `quest_name`, `quest_characters`, `quest_steps`, `quest_completed_percentage`.

    *   **`generateStoryImage` (for DALL-E via OpenAI API):**
        *   **Prompt Construction**: Dynamically creates a prompt for the `gpt-image-1` model.
        *   **Content**: Includes the game's `time_period` and `story_location` for context.
        *   **Style Instruction**: "The style is like Oregon Trail or Zork, so create an image in an old pixel game style."
        *   **Negative Prompt**: "DO NOT PUT ANY TEXT OR WORDS IN THE IMAGE."
        *   **Content Guideline**: "If there are any copyright issues, generate an image that just shows the background and objects, no characters at all."
        *   **Scene Description**: Appends the `room_description_for_dalle` from the current room object.

*   **Chat with Me Feature (`/api/chat-with-me` in `index.js`):**
    *   **System Prompt**: Instructs the AI to introduce itself as "AI Leonard Speiser," engage in friendly conversation, discuss the Grue game, gather feedback, and share some (provided) biographical details about the real Leonard Speiser. It uses the last five chat messages for context.

### Code Elements: The Engine of Grue

Grue is a Node.js application with a web frontend. Here's a look at its main code components:

*   **Frontend (Client-Side - in `public/` directory):**
    *   **`index.html`**: The main page for the Grue game.
        *   Structure: Contains divs for image display (`imageContainer`, `room-image`), room description (`room-display`), user input (`input-container`, `userInput`), and message history (`messageContainer`).
        *   Dependencies: Loads `style.css`, Socket.IO client library, UUID library, FontAwesome, and `front.js`.
    *   **`chat.html`**: A separate HTML page for the "Chat with Me" feature, allowing users to talk with "AI Leonard Speiser." Similar input/message display structure.
    *   **`style.css`**: Defines the visual appearance of the game, giving it a retro, green-text-on-black-background, monospace-font aesthetic reminiscent of old computer terminals like the Apple II.
    *   **`front.js` (Module - Not provided but referenced):** This would be the client-side JavaScript logic.
        *   Handles user input from the text field.
        *   Communicates with the backend server via Socket.IO for sending commands and receiving game updates, new room descriptions, and image URLs.
        *   Updates the DOM to display new messages, room descriptions, and images.
        *   Manages client-side session/user ID.

*   **Backend (Server-Side):**
    *   **`index.js`**: The main server file.
        *   Framework: Uses **Express.js** for handling HTTP requests and routing.
        *   Real-time Communication: Implements **Socket.IO** for bidirectional, real-time communication between the client and server, essential for game updates. The `io` instance is made available to other parts of the app.
        *   LLM Integration: Uses the **OpenAI API** (via `openai` library) to send prompts and receive responses from GPT models for game narration and logic.
        *   Firebase:
            *   Initializes Firebase Client SDK (`clientAppInstance`, `dbClient`) for database operations (passed to `util.js`).
            *   Initializes Firebase Admin SDK (named `grue-admin-index`) for backend administrative tasks (though primary admin storage use is in `data.js`).
            *   Sets up a Firebase Realtime Database `onValue` listener for changes to a user's `story/room_location_user`. When this value changes, it fetches the corresponding room's image URL (or triggers generation if needed via `generateStoryImage` from `data.js`) and emits it to the specific user via Socket.IO (`roomData` event).
        *   API Endpoints:
            *   `/api/users` (POST): Handles user creation or loading existing user data. Initializes default data structures if the user is new or data is missing.
            *   `/api/chat` (POST): The primary endpoint for game interactions. Receives user input, constructs detailed system prompts with game context, streams responses from the OpenAI API back to the client, and then triggers updates to game state (story, room, player, quest contexts) via functions in `data.js`.
            *   `/api/story-image-proxy/:userId` (GET): Streams the image URL for the user's current room.
            *   `/api/room/:roomId/image` (GET): (Seems to be for a global, non-user-specific room image, potentially legacy or for shared assets).
            *   `/api/chat-with-me` (POST): Handles the "Chat with Me" feature, streaming responses from OpenAI based on a different system prompt.
            *   `/start-session` (GET): Acknowledges session initiation.
            *   `/api/logs` (POST): A simple endpoint for client-side logging.
        *   Error Tracking: Integrates **Sentry** for monitoring and tracking errors.
        *   Static Files: Serves static files (HTML, CSS, client-side JS) from the `public` directory.

    *   **`data.js`**: The core logic for LLM-driven game state management.
        *   Firebase Admin SDK: Initializes its own Firebase Admin SDK instance (named `grue-admin-data-js`) primarily for accessing Firebase Storage (`bucket`) to upload images.
        *   LLM Interaction: Contains functions that call the OpenAI API to update different aspects of the game state using function calling:
            *   `updateStoryContext()`: Updates the main story/game state.
            *   `updateRoomContext()`: Manages room creation and updates.
            *   `updatePlayerContext()`: Manages player/NPC data.
            *   `updateQuestContext()`: Manages quest/crisis data.
        *   Image Generation:
            *   `generateStoryImage()`: Constructs a DALL-E prompt and calls the OpenAI API to generate an image for a room.
            *   `uploadImageToFirebase()`: Uploads the generated (and resized using `sharp`) image to Firebase Storage and returns its public URL.
            *   `updateRoomImageUrl()`: Updates the `image_url` in the specific room object in Firebase and emits an event (`newImageUrlForRoom`) via Socket.IO.
        *   Data Handling: Relies on `util.js` for reading/writing JSON data to Firebase Realtime Database.
        *   Game Lifecycle: `clearGameData()` resets user-specific game data when a game ends.
        *   Prompt Construction: Includes helper functions like `getStoryContextMessages`, `getRoomContextMessagesForUpdate`, `getPlayerContextMessages`, `getQuestContextMessages` which define the specific prompts and tool schemas for OpenAI function calls.

    *   **`util.js`**: Utility functions for Firebase Realtime Database operations.
        *   Database Client: Crucially, it *receives* the initialized `dbClient` (Firebase Client SDK database instance) from `index.js` via the `setDbClient()` function. This ensures a single client DB initialization.
        *   `ensureUserDirectoryAndFiles()`: Checks if the necessary JSON data structures (conversation, room, player, story, quest as arrays or default objects) exist for a user in Firebase and initializes them if not.
        *   `writeJsonToFirebase()`: Writes JSON data to a specified path in Firebase.
        *   `readJsonFromFirebase()`: Reads JSON data from a specified path in Firebase.
        *   `getUserData()`: A key function that aggregates all relevant data for a user (story, current room object, all rooms array, player array, quest array, conversation history, latest image URL) from Firebase into a single object.
        *   `setupRoomDataListener()`: A Firebase listener (potentially legacy or for specific use cases, as the main listener is in `index.js`).

    *   **`dbClient.js`**:
        *   Initializes and exports the Firebase Client SDK's database instance (`dbClient`). This is used by `index.js` and then injected into `util.js`. Also initializes Firebase Analytics if supported.

    *   **`database.js`**: A command-line interface (CLI) utility script for developers/admins to interact directly with the Firebase Realtime Database.
        *   Uses `readline` for user input in the console.
        *   Allows listing users, getting specific user data, setting/updating data for a user at a specific node (e.g., `conversation`, `player`), and deleting user data.
        *   Uses the `dbClient` from `dbClient.js`. **Not part of the main game server runtime for players.**

*   **Configuration (Environment Variables):**
    *   The application relies on environment variables (e.g., set in Replit's "Secrets") for sensitive information:
        *   `OPENAI_API_KEY`: For accessing OpenAI models.
        *   Firebase Configuration: `FIREBASE_API_KEY`, `authDomain`, `databaseURL`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`, `measurementId`.
        *   `GOOGLE_SERVICE_ACCOUNT`: JSON key for Firebase Admin SDK authentication (used by `data.js` for storage and `index.js`).
        *   `file_storage`: Name of the Firebase Storage bucket for images.

This detailed breakdown should give a comprehensive understanding of Grue's architecture.

## Ideal World

### Seeing all the code, all the time:
If our context windows get really large, and if we can automatically grab the logs as we run the code and have the LLMs process them, this entire experience will go 10x faster. I spent a lot of time copying and pasting and then focusing its suggested changes into parts of my code. As a stopgap I tried to create readme files from every part of the code and databases via the LLM summarizing the data structures and core functions and pasting that in first. That was critical at the beginning of this process but already both OpenAI and Anthropic have really gone far on their windows and intelligence, so I have stopped building these cheat sheets to kick off each new session.

### If LLMs ever wire up to compilers:
I would suggest LLMs go a step further and integrate compilers and entire environments like Replit directly into their experiences (hint to Anthropic and OpenAI, acquire Replit if they will have it). I don't think it's a big step to have me ask it to make a change, then have it make the change, run the code, get the logs, and iterate until we get what we want. That is an oversimplification, but not by much. I also think such an approach will work much better than OpenAI's attempts to use assistants and files. I actually love the assistants concept of having multiple systems share in the same pool of information but with different objectives, but the file reading function never worked properly. I think any LLM player can go two directions and it is worth doing both rather than trying to consolidate them into one. First building out a RAG document repository hosted environment. Second building out a code repository wired up to compilers that handle all of the environmental issues and make anyone who has an API enable a one-click auth to enable it to pull from it (not like the current plugins, straight up access to the API calls, like allow me to access my Google Sheet and read/write to it with nothing more than a sign-in).

### As code that uses LLMs get incorporated into LLMs:
This is more short term, but there is an irony that there isn't enough existing code in the models today to know how to effectively code with LLMs. It will get there of course, but I would make this a priority for any LLM as it will accelerate the very proliferation of that code. Even if they just paid high schoolers to write hundreds of cool games and dumped their code into the engine, it would be well worth it.

## Future of programming

### Does this put programmers out of a job?
Let's take emotion out of this question first. Given the basic supply and demand curve, the world is filled with absolutely crappy software and user experiences. You could train 100x the programmers out there and we still wouldn't make a dent in it. I think the issue is more than just are there enough programmers. I think the question is whether the cost of making those changes is supported by the revenue they generate. It reminds me a bit of the buildings in Madrid. They went through a massive boom of construction in the '60s. Unfortunately, the '60s were a decade of experimenting with cheap materials that now look super ugly. Do they keep people dry and protected? Yes. Are they ugly? Yes. If we change the economics of beautiful, high-quality user experiences by allowing one person to generate 10x the value, I can only see this as a net positive for society and I believe a quarter of the world could one day be employed building online experiences.

### What should your kids study?
Yeah, coding used to be the safe backup. Should your kids learn to code now? Absolutely. As I mentioned, having a strong understanding of how programs should work is critical to being successful with this technology. What needs to change, and I fear teachers will struggle with this, is the content of teaching computer programming. Instead of teaching the student exactly what line of code does what, we should treat those as spelling and grammar. We need to understand it and recognize it, but we don't actually need to generate it anymore. Like a form of Maslow's hierarchy, allow the student to focus on the higher levels of the value the code can bring, and use the automation to 10x their productivity and quality of output.

## Why Grue?

A grue is a fictional, predatory creature that dwells in the dark. The term was first used to identify a human-bat hybrid predator in the Dying Earth series. The term was then borrowed to introduce a similar monster in Zork, a 1977 interactive fiction computer game published by Infocom.