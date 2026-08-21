# AGENTS.md

Guidance for OpenCode sessions in this repo. `CLAUDE.md` is just `@AGENTS.md`.

## Project

`opencode-mcp` — MCP server (stdio) that drives an [OpenCode](https://opencode.ai) instance and delegates work to its subagents. `@modelcontextprotocol/sdk` + Zod + `@opencode-ai/sdk` (`createOpencodeServer` / `createOpencodeClient`). Requires `opencode` on `PATH` with at least one provider/model.

Delegation is **async**: `opencode_start_task` creates a session + `promptAsync` (fire-and-forget) → returns `task_id`. Poll via `opencode_get_task_status` / `opencode_get_task_result` or long-poll `opencode_wait_for_task` (`mode: "all" | "any"`).

## Commands

Package manager is **pnpm** (`pnpm-lock.yaml` is source of truth; `package-lock.json` is stale, ignore). Node 22 in CI (requires 18+). Order matters in CI: `lint → test:coverage → build`.

- `pnpm install --frozen-lockfile` — install (CI uses this exact flag)
- `pnpm dev` — MCP Inspector via `tsx` (`npx -y @modelcontextprotocol/inspector pnpx tsx src/index.ts`) — no build needed, use to test wiring interactively
- `pnpm test` — `vitest run` (all)
- `pnpm test:coverage` — `vitest run --coverage` — **100% thresholds** (lines/branches/functions/statements, see `vitest.config.ts`) — any gap fails
- Single file / single case: `pnpm vitest run tests/modules/tools/wait_for_task.test.ts -t "test name"` — tests live in `tests/`, not `src/`
- `pnpm lint` — `biome check .` (read-only) | `pnpm lint:write` — fix (also organizes imports) | `pnpm lint:format` — format only
- `pnpm build` — `rm -rf build && tsc && chmod +x build/src/index.js` — **also the typecheck** (no separate script). Shebang present, `prepare` runs it on install.

`tsconfig.json` excludes `src/**/*.test.ts` → type errors in test files surface only via `vitest`, not `pnpm build`.

## Architecture

- Entrypoint: `src/index.ts` — `McpServer` + `registerTools(server)` + `StdioServerTransport`. Shutdown handlers `SIGHUP`/`SIGINT`/`SIGTERM`/`exit` → `killAllServers()` so no `opencode serve` child outlives the process.
- Tools: `src/modules/tools/*.ts`, each exporting `registerOpencode<Name>(server: McpServer)` → `server.registerTool("opencode_<name>", { inputSchema: Zod })`. Prompts: `src/modules/prompts/*.ts` → `register<Name>Prompt`. Wired in `src/modules/tools/index.ts` / `src/modules/prompts/index.ts`.
- `src/modules/shared/` — cross-tool infra (source of truth, don't bypass):
  - `server-registry.ts` — `Map<serverId, { serverId, baseUrl, close }>`; `killAllServers()` reaps all
  - `task-registry.ts` — `Map<taskId, { taskId, serverId, sessionId, createdAt? }>`; `PENDING_STALL_MS = 15000` — idle session with no assistant output past this → `failed` ("prompt likely rejected")
  - `opencode-client.ts` — `clientForServer(id)` / `clientForTask(id)` (build `OpencodeClient` from registries), `lastAssistantEntry()` (last assistant message), `deriveTaskStatus()` (busy/retry → `running`; else inspect last assistant `error`/`time.completed`; shared by `get_task_status` + `wait_for_task`), `buildProgress()` (`text_snippet` last 500 chars + tool counts)
  - `mcp-result.ts` — `jsonResult()` / `jsonError()` (consistent MCP text envelope)
  - `config.ts` — `getMaxToolTimeoutMs()`: `MCP_TOOL_TIMEOUT` env > `MCP_TOOL_TIMEOUT=<ms>` CLI arg > `300000` ms; reads `process.env`/`process.argv` lazily per call, invalid → default. Clamps `opencode_wait_for_task` `timeout_ms` (default 120s, poll 2.5s, min 500ms)
  - `instructions.ts` — `DELEGATE_TASK_INSTRUCTIONS` (MCP server instructions + model tier guide)
- `src/domain` / `src/application` / `src/infrastructure` are **empty placeholders** — real code is `src/modules/`.

### Adding a tool

1. Create `src/modules/tools/<name>.ts` exporting `registerOpencode<Name>`.
2. Register in `src/modules/tools/index.ts` (`import` + call in `registerTools`).
3. Tool name must be `opencode_<name>`; `inputSchema` is Zod.
4. Reuse `shared/mcp-result.ts` + `shared/opencode-client.ts` (registries are identity source — don't construct clients ad hoc).
5. Add `tests/modules/tools/<name>.test.ts` mirroring `src/` path, using `src/test-utils/fake-mcp-server.ts` (`createFakeMcpServer()` captures `registerTool` handler) — must keep 100% coverage (`src/test-utils/**` itself excluded).

### Tool input quirks (from `start_task` / `wait_for_task`)

- `model` must be verbatim `providerID/modelID` from `opencode_list_agents` (`models.providers[].provider + "/" + models[].id`); display names are not IDs; slash required not at 0/end. `unknown_model` returns `available_models` to pick from.
- `directory` must be absolute (`node:path.isAbsolute`) or `invalid_directory`.
- `tools` is a `record<boolean>` deny map only (`{ "write": false }`); agent `permission` frontmatter is NOT honored by server (all reported `*: allow`), wildcards not supported.
- `variant` (e.g. `"max"`) sets reasoning level explicitly — never inferred from model id.

## Gotchas

- **ESM + NodeNext**: `"type": "module"`, `moduleResolution: NodeNext`. Relative imports must use `.js` even for `.ts` sources (`from "./modules/tools/index.js"`).
- **Build output is `build/src/index.js`** (not `build/index.js`) because `rootDir: "./"` with sources in `src/`; `package.json` `main`/`bin` (`opencode-mcp`) point there — keep in sync if `rootDir` changes.
- **Stale `tsconfig.json` `include`**: `["index.ts", "src/**/*.ts", "bin/**/*.ts"]` — root `index.ts` + `bin/` don't exist, harmless (tsc ignores missing globs), `src/**/*.ts` is what compiles.
- **Biome**: 2-space, 100 cols, double quotes, `organizeImports: on` on write; `build/` + `coverage/` + `*.svg` excluded via `files.includes: "!!**/build"` and `.gitignore` (`build/`, `coverage/`, `node_modules/`).
- **No `opencode.json`** — instructions live in `src/modules/shared/instructions.ts` and are passed as `McpServer` `instructions`.
