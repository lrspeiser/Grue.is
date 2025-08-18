# Grue.is LLM Prompts and Data Storage Guide

This document explains how LLM prompts drive each phase of the game (planning, generation, gameplay) and where/how game elements are stored.

Scope covers the current v2 architecture:
- Planning: v2/game-planner.js
- Generation: v2/world-generator.js
- Runtime/Gameplay: v2/game-engine.js
- Images: v2/image-service.js
- Server/API + Storage: server.js, db/database.js (PostgreSQL)

1) High-level flow
- Plan: AI designs the full world structure (locations, characters, quests) using a tool-call schema.
- Generate: AI produces rich content for rooms, characters, quests; batch image generation for rooms.
- Play: A single DM prompt + a structured tool schema updates the game state every user turn.
- Persist: Worlds, states, and logs stored in PostgreSQL as JSONB and columns.

2) Planning phase (v2/game-planner.js)
Primary function: planGameWorld(userProfile)
- System prompt (planningPrompt):
  Design a text adventure game set in {timePeriod} at {storyLocation}. Player role: {characterRole}. Create 10–12 locations, 5–8 characters, and 3 main quests. Make it educational and engaging.

- Tool schema: create_game_design
  Returns a single JSON object with:
  - title: string
  - setting: string
  - main_story: string
  - starting_location: string
  - locations: array of { id, name, description, connections[] }
  - characters: array of { id, name, location, role }
  - quests: array of { id, name, description, steps[] }

- Enforcement: tool_choice forces the model to respond via create_game_design.
- Post-processing: enhanceGameDesign() adds structure for engine use:
  - game_overview
  - world_map (locations enriched + connection logic)
  - characters (personality, knowledge, dialogue themes)
  - quests (typed, giver, steps metadata)
  - items/challenges (placeholders)
  - progression (acts, victory/failure conditions)
  - historical_elements

3) Content generation phase (v2/world-generator.js)
3.1 Rooms (generateAllRoomContent)
- System prompt (roomGenerationPrompt):
  Create immersive room descriptions aligned with the game overview (title, setting, main story). Include sensory detail, exits/actions hints, historical accuracy, and educational goals.
- Tool schema: generate_all_rooms
  Returns { rooms: [{
    id, name, description (2–3 paragraphs), first_visit_text,
    image_prompt, ambient_details[],
    examine_responses{ key → string }, available_actions[],
    exit_descriptions{ direction → string }
  }] }

3.2 Characters (generateAllCharacters)
- System prompt (characterPrompt):
  Create rich, memorable characters with authentic dialogue, distinct personality and speech, historically appropriate knowledge, dynamic quest-aware responses, and integrated educational content.
- Tool schema: generate_all_characters
  Returns { characters: [{
    id, name, title, appearance, personality, speaking_style,
    greeting, dialogue_trees { default[], quest_related[], educational[], farewell[] },
    knowledge_base[], quest_dialogue{ key → string }
  }] }

3.3 Quests (generateQuestContent)
- System prompt (questPrompt):
  Create engaging, educational quests with objectives, multiple paths, historical puzzles, hints, and rewards.
- Tool schema: generate_quest_content
  Returns { quests: [{
    id, name, introduction_text, objectives[], hints[],
    completion_text, failure_text, educational_content,
    item_interactions{ key → string },
    branching_choices[{ choice_text, consequence, outcome }]
  }] }

3.4 Images (generateAllImages) and composition
- After textual content, images for rooms generated via OpenAI Images API (dall-e-3). Prompt uses each room.image_prompt, with enforced style: 1980s pixel art like Oregon Trail/King’s Quest, no text/UI, historically accurate.
- Complete world assembled as:
  {
    metadata: {...},
    overview: game_overview,
    progression,
    historical: historical_elements,
    world: { rooms[], characters[], quests[], items[], challenges[] },
    navigation: buildNavigationMap(locations)
  }

4) Gameplay phase (v2/game-engine.js)
Primary method: processUserInput(userInput)
- System prompt (dmPrompt) constructed per turn with:
  - Current room name/id, description, exits
  - Inventory, active quests, health, resources
  - NPCs/items in room, available actions
  - Recent conversation history (last 3 turns)
  - User input
  - Style directives: be DM; interpret intent; apply game rules; update game state; concise 2–3 paragraph narrative; include educational context aligned with world.overview.setting

- Tool schema: update_game_state (forced tool_choice)
  Arguments:
  - narrative_response: string (2–3 paragraphs to display)
  - state_changes: {
      new_room_id?: string,
      inventory_add?: string[],
      inventory_remove?: string[],
      quest_updates?: [{ quest_id, action: start|progress|complete, progress_note }],
      npc_interactions?: [{ npc_id, relationship_change:int, unlocked_dialogue?:string }],
      resource_changes?: { gold?:int, supplies?:int, health?:int },
      game_flags?: { [key]: boolean }
    }
  - action_type: movement|interaction|combat|dialogue|examine|use_item|quest|system
  - educational_note?: string

- Engine applies state_changes, updates history buffer, and returns:
  { narrative, educationalNote, actionType, currentRoom, gameState }

5) Image generation at runtime (v2/image-service.js)
- Lazy, queued generation via Images API (dall-e-3) only for current and adjacent rooms.
- Cache (in-memory Map) for generated images; prevents duplicate generation with generatingRooms set.
- Queue with priorities; limited concurrency and delay for rate-limiting compliance.
- Prompts reuse room.image_prompt or fallback to room.description with the same pixel-art style instructions.
- Emits imageGenerated events to client (if Socket.IO available in engine context).

6) Storage model (db/database.js) – PostgreSQL
- Connection: DATABASE_URL (Render internal in production), else external connection string for local.
- Tables (created in initialize() on server start):
  - users(id, user_id UNIQUE, created_at, updated_at)
  - game_worlds(id, user_id, title, description, setting, world_data JSONB, created_at)
  - game_states(id, user_id, world_id, current_room, inventory JSONB, health, score, game_state JSONB, openai_response_id, updated_at, UNIQUE(user_id, world_id))
  - game_logs(id, user_id, world_id, action, details JSONB, created_at)
  - Indexes on user_id/world_id where appropriate

- Access helpers:
  - createUser(userId)
  - saveGameWorld(userId, worldData)
  - getGameWorld(worldId)
  - getUserWorlds(userId)
  - saveGameState(userId, worldId, stateData, responseId?)
  - getGameState(userId, worldId)
  - logAction(userId, worldId, action, details)

- JSON structure examples:
  - world_data JSONB stores the entire assembled world object from the generation phase (overview, progression, historical, world{rooms,characters,quests,...}, navigation).
  - game_state JSONB stores the engine’s state snapshot (currentRoomId, visitedRooms, inventory, quests, turnCount, score, health, resources, flags).

7) API surface and endpoints (server.js)
- Static: public assets for v1/v2 UIs
- API routes (mounted):
  - /v2/api/process-command – AI-driven user command processing (uses engine under the hood) [see api/v2 folder]
  - /v2/api/generate-* – world generation utilities (render/simple/test)
  - /v2/api/test-openai, /v2/api/check-usage – diagnostics
- Game state endpoints:
  - POST /api/game/save { userId, worldId, gameState } → db.saveGameState
  - GET /api/game/load/:userId/:worldId → db.getGameState
  - GET /api/game/worlds/:userId → db.getUserWorlds

8) Where each game element lives
- World definition (static per run):
  - Rooms: world.world.rooms[] with narrative description, first_visit_text, image_prompt, ambient_details, examine_responses, available_actions, exit_descriptions, imageUrl
  - Characters: world.world.characters[] with identity, appearance, personality, dialogue trees, knowledge
  - Quests: world.world.quests[] with objectives, branching choices, educational content
  - Navigation: navigation map derived from locations.connections
  - Stored in DB: game_worlds.world_data (JSONB)

- Runtime state (mutable per player/session):
  - Current room id, visited, inventory, quest progress, resources, health, flags, conversation buffer (last turns kept in memory)
  - Stored in DB: game_states.game_state (JSONB) and columns for quick reads

- Logs:
  - Stored per action in game_logs, with JSON “details”

- Images:
  - Generated lazily via Images API; URLs attached to rooms (world.world.rooms[].imageUrl)
  - Cached in-memory during runtime by image-service

9) Prompt design principles used here
- Always force tool-based structured outputs for planning/generation/gameplay updates (tool_choice with function name) for robust JSON.
- System prompts anchor historical setting, educational goals, and style, while user messages provide immediate context (user input or requested batch).
- Runtime DM prompt composes a narrow window of context (current state + last N dialogue turns) to keep responses consistent and actionable.
- Image prompts maintain strict art direction and safe generation constraints.

10) Extending prompts safely
- Add fields to tool schemas rather than adding freeform text wherever possible.
- Version schemas with explicit required fields.
- Keep engine-side state transition logic small and auditable; let LLM propose changes but validate before applying.
- Log raw tool-call arguments for audit/debugging (openai-logger wrapper already prints truncated details; consider adding persistent logging to game_logs in production).

11) Files involved
- v2/game-planner.js – planningPrompt + create_game_design tool schema
- v2/world-generator.js – roomGenerationPrompt + generate_all_rooms, characterPrompt + generate_all_characters, questPrompt + generate_quest_content
- v2/game-engine.js – dmPrompt + update_game_state tool schema and state reducer
- v2/image-service.js – DALL·E prompt enforcement and queueing/caching
- db/database.js – PostgreSQL schema and JSONB storage for world/state/logs
- server.js – Express routes wiring and DB initialization

This guide documents the authoritative prompts and schemas currently used in code; update it in tandem with any schema or prompt changes.

