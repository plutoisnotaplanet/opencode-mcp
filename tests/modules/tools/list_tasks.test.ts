import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeMcpServer } from "../../../src/test-utils/fake-mcp-server.js";

const clientForTaskMock = vi.fn();
const deriveTaskStatusMock = vi.fn();
const listTasksMock = vi.fn();

vi.mock("../../../src/modules/shared/opencode-client.js", () => ({
  clientForTask: (...args: unknown[]) => clientForTaskMock(...args),
  deriveTaskStatus: (...args: unknown[]) => deriveTaskStatusMock(...args),
}));

vi.mock("../../../src/modules/shared/task-registry.js", () => ({
  listTasks: () => listTasksMock(),
}));

const { registerOpencodeListTasks } = await import("../../../src/modules/tools/list_tasks.js");

describe("opencode_list_tasks", () => {
  beforeEach(() => {
    clientForTaskMock.mockReset();
    deriveTaskStatusMock.mockReset();
    listTasksMock.mockReset();
  });

  it("returns empty list when no tasks tracked", async () => {
    listTasksMock.mockReturnValue([]);
    const fake = createFakeMcpServer();
    registerOpencodeListTasks(fake.server);
    const handler = fake.getHandler();

    const result = await handler({});

    expect(result).toEqual({
      content: [{ type: "text", text: JSON.stringify({ tasks: [] }) }],
    });
  });

  it("returns filtered tasks by server_id", async () => {
    listTasksMock.mockReturnValue([
      { taskId: "t1", serverId: "s1", sessionId: "sess1", createdAt: 100 },
      { taskId: "t2", serverId: "s2", sessionId: "sess2", createdAt: 200 },
    ]);
    const client = {};
    clientForTaskMock.mockReturnValue({ client, sessionId: "sess1" });
    deriveTaskStatusMock.mockResolvedValue({ task_id: "t1", status: "running" });
    const fake = createFakeMcpServer();
    registerOpencodeListTasks(fake.server);
    const handler = fake.getHandler();

    const result = await handler({ server_id: "s1" });

    const parsed2 = JSON.parse((result as { content: { text: string }[] }).content[0].text);
    expect(parsed2.tasks).toHaveLength(1);
    expect(parsed2.tasks[0].task_id).toBe("t1");
    expect(parsed2.tasks[0].server_id).toBe("s1");
    expect(parsed2.tasks[0].session_id).toBe("sess1");
    expect(parsed2.tasks[0].status).toBe("running");
  });

  it("returns all tasks when server_id not provided", async () => {
    listTasksMock.mockReturnValue([
      { taskId: "t1", serverId: "s1", sessionId: "sess1", createdAt: 100 },
    ]);
    const client = {};
    clientForTaskMock.mockReturnValue({ client, sessionId: "sess1" });
    deriveTaskStatusMock.mockResolvedValue({ task_id: "t1", status: "completed" });
    const fake = createFakeMcpServer();
    registerOpencodeListTasks(fake.server);
    const handler = fake.getHandler();

    const result = await handler({});

    expect(deriveTaskStatusMock).toHaveBeenCalledWith(client, "sess1", "t1", {
      includeProgress: undefined,
    });
    const parsed = JSON.parse((result as { content: { text: string }[] }).content[0].text);
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tasks[0].status).toBe("completed");
  });

  it("passes include_progress through to deriveTaskStatus", async () => {
    listTasksMock.mockReturnValue([
      { taskId: "t1", serverId: "s1", sessionId: "sess1", createdAt: 100 },
    ]);
    const client = {};
    clientForTaskMock.mockReturnValue({ client, sessionId: "sess1" });
    deriveTaskStatusMock.mockResolvedValue({
      task_id: "t1",
      status: "running",
      progress: { text_snippet: "hi", tool_calls_completed: 1 },
    });
    const fake = createFakeMcpServer();
    registerOpencodeListTasks(fake.server);
    const handler = fake.getHandler();

    const result = await handler({ include_progress: true });

    expect(deriveTaskStatusMock).toHaveBeenCalledWith(client, "sess1", "t1", {
      includeProgress: true,
    });
    const parsed = JSON.parse((result as { content: { text: string }[] }).content[0].text);
    expect(parsed.tasks[0].progress).toBeDefined();
  });

  it("returns server_not_found error per task when client cannot be resolved", async () => {
    listTasksMock.mockReturnValue([
      { taskId: "t1", serverId: "s1", sessionId: "sess1", createdAt: 100 },
    ]);
    clientForTaskMock.mockReturnValue(undefined);
    const fake = createFakeMcpServer();
    registerOpencodeListTasks(fake.server);
    const handler = fake.getHandler();

    const result = await handler({});

    const parsed = JSON.parse((result as { content: { text: string }[] }).content[0].text);
    expect(parsed.tasks[0].status).toBe("error");
    expect(parsed.tasks[0].error).toBe("server_not_found");
  });

  it("returns error per task when deriveTaskStatus throws Error", async () => {
    listTasksMock.mockReturnValue([
      { taskId: "t1", serverId: "s1", sessionId: "sess1", createdAt: 100 },
    ]);
    const client = {};
    clientForTaskMock.mockReturnValue({ client, sessionId: "sess1" });
    deriveTaskStatusMock.mockRejectedValue(new Error("boom"));
    const fake = createFakeMcpServer();
    registerOpencodeListTasks(fake.server);
    const handler = fake.getHandler();

    const result = await handler({});

    const parsed = JSON.parse((result as { content: { text: string }[] }).content[0].text);
    expect(parsed.tasks[0].status).toBe("error");
    expect(parsed.tasks[0].error).toBe("boom");
  });

  it("returns error per task when deriveTaskStatus throws non-Error", async () => {
    listTasksMock.mockReturnValue([
      { taskId: "t1", serverId: "s1", sessionId: "sess1", createdAt: 100 },
    ]);
    const client = {};
    clientForTaskMock.mockReturnValue({ client, sessionId: "sess1" });
    deriveTaskStatusMock.mockRejectedValue("oops");
    const fake = createFakeMcpServer();
    registerOpencodeListTasks(fake.server);
    const handler = fake.getHandler();

    const result = await handler({});

    const parsed = JSON.parse((result as { content: { text: string }[] }).content[0].text);
    expect(parsed.tasks[0].error).toBe("oops");
  });

  it("returns empty after filtering when no tasks match server_id", async () => {
    listTasksMock.mockReturnValue([
      { taskId: "t1", serverId: "s1", sessionId: "sess1", createdAt: 100 },
    ]);
    const fake = createFakeMcpServer();
    registerOpencodeListTasks(fake.server);
    const handler = fake.getHandler();

    const result = await handler({ server_id: "other" });

    expect(result).toEqual({
      content: [{ type: "text", text: JSON.stringify({ tasks: [] }) }],
    });
  });
});
