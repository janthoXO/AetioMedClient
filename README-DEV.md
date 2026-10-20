# AetioMed Client: developer guide

User docs: [README.md](README.md).

## Stack

- React 19, Vite 8, Tailwind 4.
- TypeScript 6 pinned (`~6.0.3`). typescript-eslint does not support TypeScript 7 yet.
- shadcn `base-nova` style on Base UI. Use `render` prop. Never `asChild`.
- Dexie and dexie-react-hooks for local storage.
- `@nats-io/nats-core` and `@nats-io/jetstream` over WebSocket.
- mermaid, lazy-loaded, for graph.
- tiptap for plan editor.

## Layout

```
docker-compose.yml        Server, NATS, nats-init, lgtm
nats/nats.conf            NATS config: JetStream, WebSocket, auth
nats/init.sh              Creates mirror streams
.env.example              Compose and VITE_* variables
vite.config.ts            Alias @, /loki proxy
src/main.tsx              Entry
src/App.tsx               Routes, calls resumeRuns on startup
src/lib/nats.ts           Connection, ask, submitJob, watchJob, storedMessage
src/lib/jobs.ts           Run lifecycle: start, watch, settle, cancel, resume
src/lib/db.ts             Dexie schema, deleteCase
src/lib/loki.ts           Node output query
src/lib/settings.ts       Provider URL and API key in localStorage
src/lib/types.ts          Wire types copied from AetioMed contracts
src/lib/graph.ts          Graph structure to mermaid text
src/lib/graph.check.ts    Self-check for graph.ts (pnpm check)
src/lib/plan-editor.ts    Plan editor model helpers
src/lib/utils.ts          cn helper
src/hooks/useMeta.ts      useAllowedLlms, useFeatures, useGraph
src/hooks/use-mobile.ts   Mobile breakpoint hook (shadcn)
src/context/              ThemeProvider
src/pages/Layout.tsx      Sidebar shell
src/pages/HomePage.tsx    Start page
src/pages/CasePage.tsx    Runs table, add run, compare
src/pages/RunPage.tsx     Run tabs, cancel, rerun, plan review
src/components/AppSidebar.tsx        Case list, settings entry
src/components/GenerateDialog.tsx    New case dialog
src/components/PlanReviewDialog.tsx  Plan editor dialog
src/components/PlanView.tsx          Read-only plan
src/components/CaseView.tsx          Render generated case
src/components/RunGraph.tsx          Live graph and node outputs
src/components/RunStatusBadge.tsx    Status badge
src/components/SettingsDialog.tsx    Provider settings
src/components/ui/                   shadcn components
```

## Data flow

### Submit

`startRun` in `src/lib/jobs.ts`:

1. Create `jobId` with `crypto.randomUUID()`.
2. Add run row to Dexie with status `queued`.
3. Subscribe to `cases.progress.<jobId>.>` first. Progress is core NATS. Nothing is replayed.
4. Publish to `cases.request.generate` through JetStream. `msgID` equals `jobId`. Deduplicates retries.
5. On any error, mark run `failed` with code `SUBMIT_FAILED`.

`withCredentials` adds URL and API key from localStorage to `llmConfig` at send time.

### Progress

Three event types on core NATS. Type is last subject token.

- `accepted`: status becomes `running`.
- `label`: push to `run.labels`, status becomes `running`.
- `complete`: stop watching, then settle.

### Settle

`storedMessage` in `src/lib/nats.ts` reads last message for `cases.result.<jobId>` or `cases.plan.<jobId>`. It uses `last_by_subj`. Order:

1. Results: `CASE_RESULTS`, then `CASE_ARCHIVE`.
2. Plans: `CASE_PLANS`, then `PLAN_ARCHIVE`.

Missing stream counts as not found.

Result may land after `complete`. `complete` retries settle 20 times, 500 ms apart. After that run becomes `failed` with code `NO_RESULT`, or `cancelled` if event status is `cancelled`.

`settle` maps stored messages to status:

| Stored                                          | Status      |
| ----------------------------------------------- | ----------- |
| Response with error code `GENERATION_CANCELLED` | `cancelled` |
| Response with other error                       | `failed`    |
| Response without error                          | `done`      |
| No response, plan with mode `plan`              | `planned`   |
| No response, plan with mode `normal`            | not final   |

Normal-mode plan arrives before case. Client keeps plan and waits.

### Resume

`resumeRuns` runs on app start. For each run in `queued` or `running`: settle. If not final, watch again. Covers jobs that finished while tab was closed.

### Cancel

`cancelRun` sends request to `cases.cancel.<jobId>`. Owner replica replies `{ cancelled }`. No responders means job not running: queued, unknown, or over. Client shows toast.

### Plan mode

1. Run with `mode: "plan"` ends `planned`. Plan stored on run.
2. User edits plan in `PlanReviewDialog`.
3. `generateFromPlan` starts new run. Request is `{ ...run.request, mode: "normal", plan }`. New run sets `fromPlanOf` to plan run `jobId`.

### Meta reads

`useMeta` asks server on request/reply subjects:

- `meta.allowedLlms`
- `meta.features`
- `meta.graph`

One request per subject per page load. Shared cache. Failure clears cache, next mount retries.

## Storage

Dexie database `AetioMedClient`, version 1.

- `cases`: `++id, createdAt`. Fields: `id`, `createdAt`, `request`.
- `runs`: `jobId, caseId, status`. Fields: `jobId`, `caseId`, `createdAt`, `request`, `llm`, `fromPlanOf`, `status`, `labels`, `plan`, `result`, `error`, `finishedAt`.

`run.request` is what was sent, minus `jobId` and `llmConfig`. Credentials never go in runs. They live in localStorage key `llmSettings`.

Run status: `queued`, `running`, `planned`, `done`, `failed`, `cancelled`.

## Mirror streams

Server keeps results and plans 1 hour. Client needs them longer.

`nats/init.sh` waits for origin streams. Server creates them on startup. Then it runs:

- `CASE_ARCHIVE` mirrors `CASE_RESULTS`
- `PLAN_ARCHIVE` mirrors `CASE_PLANS`

Flags: `--mirror`, `--max-age 0`, `--allow-direct`. Mirrors have no subjects of their own. No overlap with server streams. Script is idempotent. Skips stream that exists.

## Observability

Server exports OpenTelemetry over OTLP HTTP to `lgtm:4318`.

Node output is one log record per finished node. Attribute `event.name=aetiomed.node.output`. Loki stores attributes as structured metadata. Dots become underscores.

Query in `src/lib/loki.ts`:

```
{service_name="aetiomed"} | aetiomed_job_id="<id>"
```

Fields used: `aetiomed_node_id`, `aetiomed_node_output_truncated`, `aetiomed_node_output_bytes`, `trace_id`. Truncated output is `{ truncated, bytes, preview }`.

Loki has no CORS headers. Vite proxies `/loki` to `http://localhost:3100`. Dev and preview both.

Polling in `RunGraph`:

- Run live: poll every 3 s.
- Run finished: one more fetch after 5 s. OTel batches records.

Each node span is its own trace. Server has no job root span. Tempo shows no per-job waterfall. Open Grafana at http://localhost:3000 to dig manually.

## Graph rendering

`toMermaid` in `src/lib/graph.ts`:

- Node ids are `:`-qualified. Example `plan_phase:outline_phase:outline_evaluate`. Each prefix becomes nested subgraph.
- Mermaid node ids are `n<index>` into `graph.nodes`. Subgraph ids are `g<count>`.
- Server drops synthetic entry and exit nodes, so phases share no edges. Client adds invisible `~~~` chain between top-level phases in run order. Order equals node order.
- State per node comes from labels and Loki outputs. Emitted as `class` lines. Class defs live in `RunGraph.tsx`.

`RunGraph.tsx` loads mermaid lazily. Settings: `securityLevel: "strict"`, `useMaxWidth: false`. Click maps element id with regex `flowchart-(n\d+)-` back to node id through `nodeIdOf`.

Run `pnpm check` after changing `graph.ts`.

## Plan editor

Model in `src/lib/plan-editor.ts`, UI in `PlanReviewDialog.tsx`. Plan is list of segments `{ fixed, text }`.

- Fixed segment: heading in dialog. Frozen body shown read-only.
- Editable segment: own tiptap editor, indexed by segment.
- Only edited segments get re-serialised. Markdown round trip can rewrite untouched text. Each editor stores fingerprint baseline after load. `editedOutline` compares. Untouched segments return exactly as loaded.
- Sections by position: General, Patient, Chief complaint, Anamnesis, Procedures. Headings are localised, so never match on text. `requestedSections` hides sections whose flag is off. General always shows.

## Scripts

| Command             | Does                            |
| ------------------- | ------------------------------- |
| `pnpm dev`          | Vite dev server                 |
| `pnpm build`        | `tsc -b` then `vite build`      |
| `pnpm lint`         | ESLint                          |
| `pnpm lint:fix`     | ESLint with fixes               |
| `pnpm format`       | Prettier write                  |
| `pnpm format:check` | Prettier check                  |
| `pnpm check`        | Graph self-check                |
| `pnpm preview`      | Serve build, with `/loki` proxy |

## Conventions

- Follow shadcn rules: `gap-*` not `space-y-*`, `Field` and `FieldGroup` for forms, `data-icon` on button icons, semantic colors.
- Base UI: `render` prop, not `asChild`.
- No new dependency without reason.
- Wire types are hand-copied from AetioMed `contracts/*.schema.json`. Update `src/lib/types.ts` when contracts change.

## Compose and environment

Copy `.env.example` to `.env`.

| Variable                     | Used by | Default               | Meaning                                 |
| ---------------------------- | ------- | --------------------- | --------------------------------------- |
| `AETIOMED_TAG`               | compose | `0.0.27`              | Server image tag                        |
| `AETIOMED_DATA_DIR`          | compose | `../AetioMed/data`    | Catalogue YAMLs, mounted at `/app/data` |
| `ALLOWED_LLMS`               | compose | none                  | `PROVIDER:MODEL` pairs, comma separated |
| `LANGUAGES`                  | compose | `en,de`               | ISO 639-1 codes, must include `en`      |
| `ICD_RELEASE`                | compose | `2026-01`             | ICD-11 release loaded by `icd`          |
| `ICD_PORT`                   | compose | `3001`                | Host port of the ICD container          |
| `AETIOREFERRAL_TAG`          | compose | `0.0.1`               | AetioReferral image tag (PDF letters)   |
| `MAX_CONCURRENT_GENERATIONS` | compose | `4`                   | Parallel jobs on server                 |
| `NATS_USER`                  | compose | `nats`                | NATS user                               |
| `NATS_PASSWORD`              | compose | `nats`                | NATS password                           |
| `VITE_NATS_URL`              | client  | `ws://localhost:8080` | NATS WebSocket URL                      |
| `VITE_NATS_USER`             | client  | none                  | NATS user in bundle                     |
| `VITE_NATS_PASSWORD`         | client  | none                  | NATS password in bundle                 |
| `VITE_ICD_RELEASE`           | client  | `2026-01`             | ICD-11 release for the diagnosis search |

Server runs with `FEATURES=NATS,ALLOW_LLMS`. Language dropdown in the client is fixed to `en` and `de` (`GenerateDialog.tsx`). Changing `LANGUAGES` does not change dropdown.

Bump server: set `AETIOMED_TAG` in `.env`, then `docker compose up -d`.

## Debug commands

Run nats-box commands through the `nats-init` service:

```sh
docker compose run --rm -T --entrypoint sh nats-init -c 'nats stream ls'
docker compose run --rm -T --entrypoint sh nats-init -c "nats sub 'cases.progress.>'"
docker compose run --rm -T --entrypoint sh nats-init -c 'nats stream get CASE_ARCHIVE --last-for cases.result.<jobId>'
```

NATS monitoring: http://localhost:8222.

## Troubleshooting

- "no responders" on meta subjects: server not up yet or restarting. Wait. Reload page.
- Loki unreachable alert on graph: `lgtm` container down, or dev server started without proxy. Check `docker compose ps`.
- Model not found: check Ollama URL in Settings and model tag. Check model name has no `:` problem. See known limits in README.
- Server error about legacy stream `cases`: old JetStream stream `cases` overlaps new streams. Delete it: `nats stream rm cases`. Or remove `nats_data` volume.
