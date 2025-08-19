OpenAI API quick reference for this project

Authentication
- Use Bearer auth with an API key stored in environment variables only.
- Do not expose API keys in client code or logs.
- Example header: Authorization: Bearer $OPENAI_API_KEY
- Optional headers when needed: OpenAI-Organization, OpenAI-Project

Core endpoints used here
1) Responses API: POST /v1/responses
- Purpose: general text/JSON generation and tool use.
- Minimal request used in this codebase:
  {
    "model": "gpt-5",
    "input": [
      {"role": "system", "content": "..."},
      {"role": "user", "content": "..."}
    ]
  }
- Notes: We rely on defaults for temperature and token limits. Avoid specifying non-default params unless required by behavior.
- Reading output: prefer resp.output_text when available; otherwise concatenate output[].content parts of type output_text.

2) Chat Completions API: POST /v1/chat/completions
- Purpose: chat-style generations; supports JSON mode via response_format.
- Minimal request shape we use:
  {
    "model": "gpt-5",
    "messages": [
      {"role":"system","content":"..."},
      {"role":"user","content":"..."}
    ],
    "response_format": {"type":"json_object"}
  }
- Notes: keep defaults (don’t specify temperature or token caps unless necessary).

Structured outputs
- Two approaches supported:
  a) Responses API: text.format (and variants) may require exact shapes; SDK versions can differ. When unsure, fall back to plain instructions to “Return ONLY valid JSON …” and parse.
  b) Chat Completions JSON mode: response_format: { type: "json_object" } and strong prompt instructions.

Debugging requests
- Log request IDs (x-request-id) and usage when available.
- The SDK exposes response.usage; avoid logging secrets.

Rate limits and pagination
- Watch HTTP headers like x-ratelimit-remaining-* and x-ratelimit-reset-* when troubleshooting throttling.

Model tips in this repo
- WORLD_MODEL defaults to gpt-5 for planning/generation.
- PROMPT_MODEL defaults to gpt-5-nano for gameplay prompts.
- Keep temperature and token limits at defaults unless a specific use case requires otherwise.

Security
- Keep OPENAI_API_KEY in .env (server-side). Never commit or echo secrets.
- Rotate keys if exposed.

Example minimal calls used in code
- Responses (world gen):
  await openai.responses.create({ model: WORLD_MODEL, input: messages });

- Chat Completions (planner JSON mode):
  await openai.chat.completions.create({
    model: WORLD_MODEL,
    messages,
    response_format: { type: 'json_object' }
  });

Parsing output
- Prefer resp.output_text (Responses API) when present.
- Else, iterate resp.output[].content parts where type === 'output_text'.
- For Chat Completions, use choices[0].message.content.

When confused
- Recheck parameter names (e.g., Chat Completions uses max_completion_tokens, not max_tokens with some models).
- Avoid specifying optional params unless necessary.
- Fall back to plain JSON instructions if structured output knobs cause schema errors.

