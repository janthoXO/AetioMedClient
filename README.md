# AetioMed Client

Debug client for AetioMed. AetioMed is stateless medical case generator. This client talks to it over NATS.

Developer guide: **[README-DEV.md](README-DEV.md)**.

## What it does

- Generate cases for one diagnosis with several LLMs at once. One run per LLM.
- Compare finished cases side by side.
- Plan mode. Review and edit plan first. Generate case from edited plan.
- Watch generation graph live. Inspect output of each node.
- Cancel and rerun runs.

## Architecture

Browser client sends job to AetioMed server through NATS WebSocket. Server publishes live progress and stores result. Client reads result from NATS streams. Node outputs come from Loki. Client runs outside Docker. Everything else runs in Docker Compose:

- `aetiomed`: server image from `ghcr.io/janthoxo/aetiomed/server`.
- `nats`: NATS with JetStream and WebSocket.
- `nats-init`: one-shot job. Creates mirror streams that never expire.
- `lgtm`: Grafana, Loki, Tempo. Receives OpenTelemetry from server.

## Prerequisites

- Docker
- Node and pnpm
- AetioMed catalogue data directory. YAML files are not in server image. Set `AETIOMED_DATA_DIR`. Default is `../AetioMed/data`.

## Setup

```sh
cp .env.example .env
# edit ALLOWED_LLMS in .env
docker compose up -d
pnpm install
pnpm dev
```

Open http://localhost:5173.

Ports:

| Port | Service                  |
| ---- | ------------------------ |
| 5173 | Client dev server (Vite) |
| 8080 | NATS WebSocket           |
| 4222 | NATS                     |
| 8222 | NATS monitoring          |
| 3000 | Grafana                  |
| 3100 | Loki                     |
| 3200 | Tempo                    |

## Usage

### Settings

Open Settings. Set URL and API key per provider. Stored in browser localStorage. Sent with each request.

Server runs in Docker. Ollama URL must be reachable from container. Use `http://host.docker.internal:11434` or `https://ollama.com`. Never use `localhost`.

### New case

Open New case dialog. Set:

- Diagnosis
- Language
- Mode: normal or plan
- Difficulty
- Per field (patient, chief complaint, anamnesis, procedures): generate or ignore. Add instructions if wanted.
- LLMs: multi-select. Each selected LLM gets one run.

### Case page

Shows runs table. Add run with another LLM. Compare row shows finished cases side by side.

### Run page

Tabs:

- Case: generated case.
- Plan: plan text.
- Graph: live generation graph. Click node to see its output.
- Labels: progress events.
- Raw: run record as JSON.

Cancel running run. Rerun any run.

### Plan review

Run in plan mode ends as `planned`. Click Review plan. Edit text. Generate. Client starts new run in normal mode with edited plan. New run links back to plan run.

## Known limits

- Model names in `ALLOWED_LLMS` containing `:` get truncated by server. `ollama:gpt-oss:120b` shows as `gpt-oss`. Server bug. Workaround: `ollama cp gemma4:12b gemma4`, then use `gemma4`.
- Labels are live only. Core NATS does not replay. Closed tab misses labels.
- Server caps node outputs at 50 KB.
- Runs live in browser IndexedDB. Clearing site data deletes them. Results also stay forever in NATS mirror streams.
- Debug only. NATS credentials end up in browser bundle. No TLS.
