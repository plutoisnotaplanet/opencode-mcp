import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createOpencodeServer } from "@opencode-ai/sdk";
import { z } from "zod";
import { registerServer } from "../shared/server-registry.js";

const DEFAULT_PORT = 4096;

export function registerOpencodeStartServer(server: McpServer) {
  server.registerTool(
    "opencode_start_server",
    {
      description:
        "Start a headless OpenCode server instance in the current working directory, or attach to one that is already running by passing base_url",
      inputSchema: {
        port: z.number().optional().describe("Port to bind the server on (default 4096)"),
        base_url: z
          .string()
          .optional()
          .describe(
            "URL of an OpenCode server that is already running, e.g. 'http://127.0.0.1:4096'. When given, no server is started and none is stopped on close: the caller owns its lifetime, and sessions survive this client. Without it the bridge starts its own server and kills it when the client goes away, taking every running session with it",
          ),
      },
    },
    async ({ port, base_url }) => {
      // Attach: the caller already runs a server, so registering it is enough - the client in
      // clientForServer only ever needs a base URL. close() is a no-op on purpose: killing a
      // server we did not start would take down sessions belonging to somebody else.
      if (base_url) {
        const serverId = randomUUID();
        // v8 ignore next -- no-op close for attached server, not wired to any resource
        registerServer({ serverId, baseUrl: base_url, close: () => {} });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ server_id: serverId, baseUrl: base_url, status: "attached" }),
            },
          ],
        };
      }
      try {
        // The server inherits this process' cwd, so its project worktree is the
        // directory the MCP host was launched in — no cwd argument needed.
        const instance = await createOpencodeServer({
          hostname: "127.0.0.1",
          port: port ?? DEFAULT_PORT,
        });
        const serverId = randomUUID();
        registerServer({ serverId, baseUrl: instance.url, close: instance.close });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                server_id: serverId,
                baseUrl: instance.url,
                status: "running",
              }),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "error",
                message: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
        };
      }
    },
  );
}
