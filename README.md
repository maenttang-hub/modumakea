# ModuMake

ModuMake is a verification-first hardware design workspace for Arduino- and Raspberry Pi-style projects.

The current product direction is intentionally narrow:

- Draw and arrange simple circuits quickly
- Catch wiring and power mistakes before hardware is built
- Generate starter firmware and review it against the circuit
- Simulate enough of the design flow to help learners and prototypers move forward

PCB production is not the primary goal of this MVP.

## Local development

```bash
npm install
npm run dev
```

For Launch Desk, create a local env file before starting the dev server:

```bash
cp .env.example .env.local
```

Then set `OPENAI_API_KEY` in `.env.local`. The server-side Launch Desk route uses that key with the OpenAI Agents SDK. `LAUNCH_DESK_MODEL` defaults to `gpt-5.5`.

Cloud compile is now disabled by default until a real sandboxed runtime exists. For internal development only, you must explicitly opt in with:

- `MODUMAKE_ENABLE_UNSANDBOXED_COMPILE=true`
- `MODUMAKE_COMPILE_DISPATCH_MODE=direct-http` or `queue`
- `MODUMAKE_COMPILE_QUEUE_STORE=file` or `supabase`
- `MODUMAKE_COMPILE_QUEUE_FILE=.modumake/compile-queue-store.json`
- `MODUMAKE_COMPILE_LAUNCH_MODE=sandbox-request`
- `MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE=file` or `supabase`
- `MODUMAKE_COMPILE_SANDBOX_REQUEST_FILE=.modumake/compile-sandbox-launch-requests.json`
- `MODUMAKE_COMPILE_RESULT_STORE=file` or `supabase`
- `MODUMAKE_COMPILE_RESULT_FILE=.modumake/compile-results.json`
- `MODUMAKE_COMPILE_ARTIFACT_BLOB_ROOT=.modumake/compile-artifact-blobs`
- `MODUMAKE_ARTIFACT_DOWNLOAD_SECRET=...`
- `MODUMAKE_INTERNAL_API_BASE_URL=http://127.0.0.1:3000`
- `MODUMAKE_COMPILE_WORKER_MAX_JOBS=1`
- `MODUMAKE_COMPILE_WORKER_POLL_INTERVAL_MS=3000`
- `MODUMAKE_COMPILE_SANDBOX_RUNNER_BACKEND=placeholder-compile-server`
- `MODUMAKE_COMPILE_SANDBOX_LAUNCHER_URL=http://127.0.0.1:4200`
- `MODUMAKE_SANDBOX_LAUNCH_QUEUE_FILE=.modumake/sandbox-launch-queue.json`
- `MODUMAKE_SANDBOX_WORKER_MAX_JOBS=1`
- `MODUMAKE_SANDBOX_EXECUTOR_BACKEND=docker-cli-one-shot`
- `MODUMAKE_SANDBOX_RUNTIME_BACKEND=docker-cli-one-shot`
- `MODUMAKE_SANDBOX_RUNTIME_IMAGE=modumake/compile-sandbox-runtime:local`
- `MODUMAKE_SANDBOX_RUNTIME_UID_GID=10001:10001`
- `MODUMAKE_PREBAKED_LIBRARY_ALLOWLIST=...`
- `MODUMAKE_COMPILE_SERVER_SHARED_TOKEN=...`

The backend compile path now has four layers. `queue` writes durable queue records, the internal launcher route at `/api/internal/compile/queue/launch` creates durable sandbox launch requests by default, worker routes can claim `/api/internal/compile/sandbox/launch/claim`, acknowledge `/api/internal/compile/sandbox/launch/[launchRequestId]`, then hand off to `/api/v1/sandbox-launch`, and the sandbox launcher service writes one-shot runtime specs into its own durable launch queue. `npm run dev:compile-worker` runs the app-side polling worker, `npm run dev:sandbox-launcher` accepts internal `/api/v1/sandbox-launch` requests, and `npm run dev:sandbox-launcher-worker` drains the launcher queue and posts terminal results back through `/api/internal/compile/sandbox/launch/[launchRequestId]/result`.

Compile results and artifacts are now split into three stores: queue metadata, result metadata, and artifact blob content. Queue status polling returns the latest artifact metadata plus a short-lived signed download path instead of embedding artifact content in the queue record.

The default launcher executor is now `docker-cli-one-shot`. Build the runtime image locally before using it:

```bash
npm run build:sandbox-runtime-image
```

`build:sandbox-runtime-image`는 빠른 local/runtime verification용 AVR-only 이미지입니다. ESP32 toolchain까지 포함한 전체 이미지는:

```bash
npm run build:sandbox-runtime-image:full
```

Main quality checks:

```bash
npm run test
npm run test:coverage
npm run lint
npm run build
```

Launch Desk specific checks:

```bash
npm run test:launch-desk
npm run lint:launch-desk
npm run verify:launch-desk-stream
```

## Launch Desk

Launch Desk lives at `/launch-desk` in local development.

It includes:

- A polished frontend for entering a product brief, audience, launch date, constraints, assets, channels, and owners
- An OpenAI Agents SDK workflow with tools for task extraction, readiness scoring, owner checklists, and channel copy
- Streaming SSE updates from the local API route so the UI can show both tool progress and model text deltas
- Validation notes in [/Users/gimdong-il/Desktop/프로그램/modumake/docs/launch-desk-validation-checklist.md](/Users/gimdong-il/Desktop/프로그램/modumake/docs/launch-desk-validation-checklist.md)

Key files:

- [/Users/gimdong-il/Desktop/프로그램/modumake/src/app/launch-desk/page.tsx](/Users/gimdong-il/Desktop/프로그램/modumake/src/app/launch-desk/page.tsx)
- [/Users/gimdong-il/Desktop/프로그램/modumake/src/app/api/launch-desk/route.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/app/api/launch-desk/route.ts)
- [/Users/gimdong-il/Desktop/프로그램/modumake/src/components/launch-desk/launch-desk-app.tsx](/Users/gimdong-il/Desktop/프로그램/modumake/src/components/launch-desk/launch-desk-app.tsx)
- [/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/launch-desk/agent.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/launch-desk/agent.ts)
- [/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/launch-desk/tools.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/launch-desk/tools.ts)
- [/Users/gimdong-il/Desktop/프로그램/modumake/scripts/verify-launch-desk-stream.mjs](/Users/gimdong-il/Desktop/프로그램/modumake/scripts/verify-launch-desk-stream.mjs)

## Supabase seed

The app now prefers Supabase `components` / `arduino_libraries` tables and falls back to the bundled static catalog when cloud data is unavailable.

1. Apply the schema in [/Users/gimdong-il/Desktop/프로그램/modumake/docs/supabase_schema.sql](/Users/gimdong-il/Desktop/프로그램/modumake/docs/supabase_schema.sql)
2. Follow the step-by-step runbook in [/Users/gimdong-il/Desktop/프로그램/modumake/docs/supabase-seed-guide.md](/Users/gimdong-il/Desktop/프로그램/modumake/docs/supabase-seed-guide.md)
3. Set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Prepare seed payloads locally:

```bash
npm run db:seed:dry
```

5. Build a one-shot bootstrap SQL bundle for the SQL editor:

```bash
npm run db:bootstrap:sql
```

6. Upsert seed data into Supabase:

```bash
npm run db:seed
```

If you want a SQL file for manual import in the Supabase SQL editor instead of direct upsert:

```bash
npm run db:seed:components:sql
```

For a large Arduino library index dump:

```bash
npm run libraries:seed:index -- --input /path/to/library_index.json --dry-run
```

Generated seed artifacts are written to:

- [/Users/gimdong-il/Desktop/프로그램/modumake/scripts/component-catalog/generated/components.seed.json](/Users/gimdong-il/Desktop/프로그램/modumake/scripts/component-catalog/generated/components.seed.json)
- [/Users/gimdong-il/Desktop/프로그램/modumake/scripts/component-catalog/generated/arduino-libraries.seed.json](/Users/gimdong-il/Desktop/프로그램/modumake/scripts/component-catalog/generated/arduino-libraries.seed.json)
- [/Users/gimdong-il/Desktop/프로그램/modumake/scripts/component-catalog/generated/components.import.sql](/Users/gimdong-il/Desktop/프로그램/modumake/scripts/component-catalog/generated/components.import.sql)
- [/Users/gimdong-il/Desktop/프로그램/modumake/scripts/component-catalog/generated/arduino-libraries.import.sql](/Users/gimdong-il/Desktop/프로그램/modumake/scripts/component-catalog/generated/arduino-libraries.import.sql)

## What is in the engine today

- Circuit netlist analysis with resistor, capacitor, diode, and LED-aware checks
- Formal code verification against board pins and connected components
- SPICE-like netlist export
- Lightweight fallback simulator with a stable API for future WASM integration
- Browser-local project persistence and project import/export

## Key files

- [/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/circuit-netlist.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/circuit-netlist.ts)
- [/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/formal-verifier.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/formal-verifier.ts)
- [/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/ast-parser.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/ast-parser.ts)
- [/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/spice-simulator.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/spice-simulator.ts)
- [/Users/gimdong-il/Desktop/프로그램/modumake/src/store/use-board-store.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/store/use-board-store.ts)

## Guides

- [Getting Started](/Users/gimdong-il/Desktop/프로그램/modumake/docs/getting-started.md)
- [Simulation Tutorial](/Users/gimdong-il/Desktop/프로그램/modumake/docs/simulation-tutorial.md)
- [Flash Guide](/Users/gimdong-il/Desktop/프로그램/modumake/docs/flash-guide.md)

## Examples

```bash
npm run example:blink
```

Included sample files live in:

- [/Users/gimdong-il/Desktop/프로그램/modumake/examples/blink-uno.modumake.json](/Users/gimdong-il/Desktop/프로그램/modumake/examples/blink-uno.modumake.json)
- [/Users/gimdong-il/Desktop/프로그램/modumake/examples/blink-uno.ino](/Users/gimdong-il/Desktop/프로그램/modumake/examples/blink-uno.ino)
- [/Users/gimdong-il/Desktop/프로그램/modumake/examples/rc-filter-notes.md](/Users/gimdong-il/Desktop/프로그램/modumake/examples/rc-filter-notes.md)

## Current limitations

- The parser facade is ready for a future Tree-sitter backend, but still uses a lightweight fallback parser today.
- The simulator API is stable, but transient and AC traces are still preview-grade rather than a full ngspice WASM implementation.
- Real cloud compile is gated off by default until a sandboxed per-job runtime replaces the current unsandboxed compile server path.
- There is no full Monaco inline diagnostic overlay yet.
- Cross-browser E2E automation and fuzz testing are not finished.
