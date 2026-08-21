export const DELEGATE_TASK_INSTRUCTIONS = `You have access to the opencode-mcp server, which lets you delegate work to OpenCode agents. Follow this workflow whenever you delegate tasks:

Model selection guide — pick the model per task via the optional "model" input of opencode_start_task ('providerID/modelID'). Match the model tier to the task's difficulty; do not burn a scarce frontier model on work a cheap model handles well. Usage quotas (requests per 5h) are noted as a scarcity signal — lower quota means reserve it for harder work.

IMPORTANT — model IDs: the display names below are NOT model IDs. Never guess or construct a 'providerID/modelID' string from a display name. Always copy the exact provider id and model id verbatim from opencode_list_agents output (models.providers[].provider + '/' + an entry of its models list). The same model may be exposed under different providers (e.g. 'opencode-go/minimax-m3' vs 'opencode/some-other-model'), so the provider prefix cannot be inferred. If opencode_start_task returns status "unknown_model", pick a model from the available_models list it returns instead of retrying a guessed id.

Frontier tier (scarce — architecture, hard debugging, critical decisions):
- Grok 4.5 (~80 req/5h): top-end reasoning and coding; reserve for the hardest problems, cross-cutting refactors, and tasks where a wrong answer is expensive.
- Kimi K3 (~140 req/5h): frontier reasoning with very strong agentic stability and tool calling over long sessions; best for long-horizon multi-step tasks that must not derail.

High tier (strong daily drivers — feature implementation, non-trivial debugging, review):
- GLM-5.2 (~880 req/5h): open-weight leader on coding and agentic-coding benchmarks (SWE-bench Pro ~62%); best default for substantial implementation and refactoring work.
- Kimi K2.7 Code (~1,150 req/5h): coding-specialized; ~30% fewer thinking tokens, excellent precise tool invocation (MCP-heavy pipelines) and 4,000+ tool-call sequences; best for long agentic coding runs.

Mid tier (high volume — standard features, tests, medium complexity):
- MiniMax M3 (~3,200 req/5h): frontier-adjacent coding plus 1M context and native multimodality; best for large-codebase context ingestion or tasks involving images/video.
- MiMo-V2.5-Pro (~3,250 req/5h): strong general agentic capability and complex software engineering (high SWE-bench Pro rankings); good GLM alternative at higher volume.
- DeepSeek V4 Pro (~3,450 req/5h): solid all-round flagship; good balance of capability and quota for everyday implementation tasks.
- Qwen3.7 Plus (~4,300 req/5h): capable mid-range generalist; good for standard features and tests at volume.

Fast tier (near-unlimited — mechanical work, boilerplate, formatting, simple fixes, docs, exploration):
- MiMo-V2.5 (~30,100 req/5h): lightweight reasoning model; better than Flash on agentic tasks, at some latency/token cost.
- DeepSeek V4 Flash (~31,650 req/5h): cheapest and fastest, non-reasoning; best for mechanical edits, boilerplate, renames, doc updates, and quick lookups where latency matters.

Rule of thumb: exploration/mechanical → Fast tier; standard implementation → Mid tier; complex features and long agentic runs → High tier; architecture or hardest debugging → Frontier tier.

Workflow — non-blocking by default (keeps the session responsive to user messages):
1. Ensure an OpenCode server is running. If you don't already have a server_id from a previous opencode_start_server call, call opencode_start_server first.
2. Call opencode_list_agents with the server_id to discover the available agents (native and custom) and the exact model ids. Agents may have a pre-assigned model ("provider/model"); you can still override it per task.
3. For each task, call opencode_start_task with the server_id and the task's prompt. Optionally pass an agent name and/or a model override copied verbatim from opencode_list_agents — never a guessed id. Collect the returned task_id for every call. Tell the user the task_id immediately so they can ask for progress while it runs.
4. Do NOT block the session with a long opencode_wait_for_task. Instead poll without blocking: use opencode_get_task_status (single task) or opencode_list_tasks (all tasks, with optional include_progress) when the user asks for progress or on next turn. This keeps the session responsive to user messages while the agent works.
5. For tasks expected to run >30s: spawn a Claude background Task (Task tool with run_in_background:true) that polls opencode_get_task_status / opencode_list_tasks until completed, then calls opencode_get_task_result and reports back. Main session stays free to handle user messages; the background Task's completion is the signal that the agent finished — do not use a long wait_for_task in the main session.
6. Only use opencode_wait_for_task when the user explicitly asks to wait, and keep the timeout short (<=30s). It now respects cancellation (AbortSignal) and streams progress via notifications/progress when the client supplies a progressToken — the caller can abort to regain responsiveness without cancelling the remote task.
   - Single task: mode "all" with the single task_id.
   - Multiple tasks, incremental results: call it repeatedly with mode "any", removing completed task_ids each time.
   - Multiple tasks, all at once: call it once with mode "all" and every task_id.
7. Once a task is reported finished, call opencode_get_task_result for that task_id to retrieve its output. If you lost the task_id, rediscover via opencode_list_tasks (optionally filtered by server_id).`;
