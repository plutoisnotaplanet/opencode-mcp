import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { jsonResult } from "../shared/mcp-result.js";
import { clientForTask, deriveTaskStatus } from "../shared/opencode-client.js";
import { listTasks } from "../shared/task-registry.js";

export function registerOpencodeListTasks(server: McpServer) {
  server.registerTool(
    "opencode_list_tasks",
    {
      description:
        "List all tracked delegated tasks with their current status (and optional progress). Use to rediscover tasks after losing task_id or to poll without blocking. Prefer this + get_task_status over long wait_for_task when the session must stay responsive to user messages.",
      inputSchema: {
        server_id: z
          .string()
          .optional()
          .describe("Optional server filter: only tasks for this server_id"),
        include_progress: z
          .boolean()
          .optional()
          .describe(
            "If true, include a partial output snippet and the currently running tool for tasks that are still running",
          ),
      },
    },
    async ({ server_id, include_progress }) => {
      const all = listTasks();
      const filtered = server_id !== undefined ? all.filter((t) => t.serverId === server_id) : all;

      if (filtered.length === 0) {
        return jsonResult({ tasks: [] });
      }

      const results = await Promise.all(
        filtered.map(async (task) => {
          const resolved = clientForTask(task.taskId);
          if (!resolved) {
            return {
              task_id: task.taskId,
              server_id: task.serverId,
              session_id: task.sessionId,
              createdAt: task.createdAt,
              status: "error" as const,
              error: "server_not_found",
            };
          }
          try {
            const status = await deriveTaskStatus(
              resolved.client,
              resolved.sessionId,
              task.taskId,
              { includeProgress: include_progress },
            );
            return {
              server_id: task.serverId,
              session_id: task.sessionId,
              createdAt: task.createdAt,
              ...status,
            };
          } catch (error) {
            return {
              task_id: task.taskId,
              server_id: task.serverId,
              session_id: task.sessionId,
              createdAt: task.createdAt,
              status: "error" as const,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        }),
      );

      return jsonResult({ tasks: results });
    },
  );
}
