# Model Selection for Grue v2

This document explains which LLM models to use for each part of the game and how to configure them via environment variables. It reflects your requirements and the provided model comparison guidance.

Summary
- World building (planning/generation): Use the best GPT-5 model for highest quality outputs.
- Gameplay (user prompts): Use the fastest, most cost-efficient GPT-5 variant ("nano" tier) with a large context window, since we pass only the relevant slice of the world each turn.

Why these choices
- World building needs rich structure, long outputs, and high reasoning quality. Using GPT-5 reduces retries and malformed JSON and produces better worlds.
- Gameplay prompts are frequent, short, and require tight latency and cost control. The fast cost-efficient GPT-5 variant provides excellent cost/performance for this workload with a shared 400k-token context window.

Model tiers (from the provided comparison)
- GPT-5 (best for coding/agentic tasks)
  - Context window: 400,000
  - Max output: 128,000
  - Pricing (per 1M tokens): Input $1.25, Output $10.00
  - Endpoints: v1/chat/completions, v1/responses
  - Features: streaming, function calling, structured outputs, fine-tuning, distillation, image input
- Faster, cost-efficient GPT-5 (mid-tier)
  - Context window: 400,000
  - Pricing (per 1M tokens): Input $0.25, Output $2.00
  - Endpoints/features as above
- Fastest, most cost-efficient GPT-5 (nano-tier)
  - Context window: 400,000
  - Pricing (per 1M tokens): Input $0.05, Output $0.40
  - Endpoints/features as above

Grue configuration
- Environment variables (read by the API):
  - WORLD_MODEL: defaults to gpt-5
- PROMPT_MODEL: defaults to gpt-5-nano (latest nano-tier); fastest, most cost-efficient GPT-5 variant for gameplay.

Recommended settings (Render → Environment)
- WORLD_MODEL=gpt-5  (latest)
- PROMPT_MODEL=gpt-5-nano  (latest nano-tier)

Notes on identifiers
- The comparison provided lists capabilities and pricing but not the exact model IDs. Use the official identifier for the "Fastest, most cost-efficient version of GPT-5" from your API provider. Examples (these are placeholders; choose the exact name from your account’s Models page):
  - PROMPT_MODEL=gpt-5-nano
  - PROMPT_MODEL=gpt-5-mini

How the server uses them
- World generation endpoint (POST /v2/api/generate-world)
  - Uses WORLD_MODEL (default gpt-5) for planning and world creation.
- Gameplay command endpoint (POST /v2/api/process-command)
  - Uses PROMPT_MODEL (default gpt-5-nano, latest nano-tier) for best latency/cost.

Context strategy at runtime
- We pass only the relevant subset of worldData to the gameplay model each turn:
  - Current room (name, description, exits)
  - Adjacent rooms summary
  - NPCs present in the room
  - Items in room + inventory
  - Active missions
- This keeps prompts small and fast, leveraging the large context window when needed without paying for the full world each turn.

Operational tips
- Start with WORLD_MODEL=gpt-5 and PROMPT_MODEL set to the nano-tier GPT-5 model. Monitor latency and token usage in logs; adjust if gameplay feels too terse (increase temperature slightly) or expensive (further trim context).
- Rate limits differ by tier; nano-tier supports higher TPM. If you scale concurrent users, ensure your account tier aligns with expected throughput.

Verification
- The server logs can be updated to print WORLD_MODEL and PROMPT_MODEL on startup if desired.

Change history
- 2025-08-18: Defaulted world gen to gpt-5 and added env overrides; gameplay prompts configurable via PROMPT_MODEL; documented model choices here.

