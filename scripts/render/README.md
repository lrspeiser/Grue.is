Render debugging scripts

These scripts help quickly determine if an issue is caused by the Render service (deploy/build/app/request logs) and to watch live logs.

Files
- check.sh
  - Pulls recent build logs, filters app errors, and lists 5xx request logs for a specific path. Handles pagination.
- deploy_status.sh
  - Shows the most recent deploys and any failureMessage.
- logs_follow.sh
  - Streams live logs via Server-Sent Events.
- env.example
  - Sample environment variables. Copy to .env (or export in your shell) and fill values.

Setup
1) Copy env.example and set values (or export them in your shell):
   cp scripts/render/env.example scripts/render/.env
   # edit scripts/render/.env and set RENDER_API_TOKEN, OWNER_ID, SERVICE_ID

2) Source the env when running scripts:
   set -a; source scripts/render/.env; set +a

Usage
- Check recent logs (last 60 minutes by default):
  START_MINUTES=60 scripts/render/check.sh

- Change the path filter (for 5xx request logs):
  PATH_FILTER=/v2/api/generate-world scripts/render/check.sh

- Show last 3 deploys:
  scripts/render/deploy_status.sh
  LIMIT=1 scripts/render/deploy_status.sh

- Follow live logs (Ctrl-C to stop):
  scripts/render/logs_follow.sh
  TYPES=app,request scripts/render/logs_follow.sh

Security
- Never commit your real RENDER_API_TOKEN. Keep it in your shell environment or an untracked .env.
- These scripts only read logs/status; they do not modify resources.
