import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeMcpServer } from "../../../src/test-utils/fake-mcp-server.js";

const clientForTaskMock = vi.fn();
const lastAssistantEntryMock = vi.fn();
const toolErrorTextsMock = vi.fn();

vi.mock("../../../src/modules/shared/opencode-client.js", () => ({
  clientForTask: (...args: unknown[]) => clientForTaskMock(...args),
  lastAssistantEntry: (...args: unknown[]) => lastAssistantEntryMock(...args),
  toolErrorTexts: (...args: unknown[]) => toolErrorTextsMock(...args),
}));

const { registerOpencodeGetTaskResult } = await import(
  "../../../src/modules/tools/get_task_result.js"
);

describe("opencode_get_task_result", () => {
  beforeEach(() => {
    clientForTaskMock.mockReset();
    lastAssistantEntryMock.mockReset();
    toolErrorTextsMock.mockReset();
    toolErrorTextsMock.mockReturnValue([]);
  });

  it("returns not_found when the task cannot be resolved", async () => {
    clientForTaskMock.mockReturnValue(undefined);
    const fake = createFakeMcpServer();
    registerOpencodeGetTaskResult(fake.server);
    const handler = fake.getHandler();

    const result = await handler({ task_id: "missing" });

    expect(result).toEqual({
      isError: true,
      content: [
        { type: "text", text: JSON.stringify({ task_id: "missing", status: "not_found" }) },
      ],
    });
  });

  it("returns pending with a null result when there is no assistant entry", async () => {
    clientForTaskMock.mockReturnValue({ client: {}, sessionId: "s1" });
    lastAssistantEntryMock.mockResolvedValue(undefined);
    const fake = createFakeMcpServer();
    registerOpencodeGetTaskResult(fake.server);
    const handler = fake.getHandler();

    const result = await handler({ task_id: "task-1" });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({ task_id: "task-1", status: "pending", result: null }),
        },
      ],
    });
  });

  it("returns failed when the assistant entry has an error", async () => {
    clientForTaskMock.mockReturnValue({ client: {}, sessionId: "s1" });
    lastAssistantEntryMock.mockResolvedValue({
      info: { error: { name: "OOPS" }, time: {} },
      parts: [],
    });
    const fake = createFakeMcpServer();
    registerOpencodeGetTaskResult(fake.server);
    const handler = fake.getHandler();

    const result = await handler({ task_id: "task-1" });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            task_id: "task-1",
            status: "failed",
            error: "OOPS",
            result: null,
          }),
        },
      ],
    });
  });

  it("returns running with a null result when not completed yet", async () => {
    clientForTaskMock.mockReturnValue({ client: {}, sessionId: "s1" });
    lastAssistantEntryMock.mockResolvedValue({ info: { time: {} }, parts: [] });
    const fake = createFakeMcpServer();
    registerOpencodeGetTaskResult(fake.server);
    const handler = fake.getHandler();

    const result = await handler({ task_id: "task-1" });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({ task_id: "task-1", status: "running", result: null }),
        },
      ],
    });
  });

  it("returns the joined text of completed text parts", async () => {
    clientForTaskMock.mockReturnValue({ client: {}, sessionId: "s1" });
    lastAssistantEntryMock.mockResolvedValue({
      info: { time: { completed: 123 } },
      parts: [
        { type: "text", text: "Hello, " },
        { type: "tool", text: "ignored" },
        { type: "text", text: "world!" },
      ],
    });
    const fake = createFakeMcpServer();
    registerOpencodeGetTaskResult(fake.server);
    const handler = fake.getHandler();

    const result = await handler({ task_id: "task-1" });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({ task_id: "task-1", status: "completed", result: "Hello, world!" }),
        },
      ],
    });
  });

  it("returns completed_with_errors with tool errors when a tool part failed", async () => {
    clientForTaskMock.mockReturnValue({ client: {}, sessionId: "s1" });
    lastAssistantEntryMock.mockResolvedValue({
      info: { time: { completed: 123 } },
      parts: [
        { type: "text", text: "Hello, world!" },
        { type: "tool", tool: "bash", state: { status: "error", error: "Tool execution aborted" } },
      ],
    });
    toolErrorTextsMock.mockReturnValue(["Tool execution aborted"]);
    const fake = createFakeMcpServer();
    registerOpencodeGetTaskResult(fake.server);
    const handler = fake.getHandler();

    const result = await handler({ task_id: "task-1" });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            task_id: "task-1",
            status: "completed_with_errors",
            result: "Hello, world!",
            tool_errors: ["Tool execution aborted"],
          }),
        },
      ],
    });
  });

  it("returns an error result when the client throws an Error", async () => {
    clientForTaskMock.mockReturnValue({ client: {}, sessionId: "s1" });
    lastAssistantEntryMock.mockRejectedValue(new Error("network fail"));
    const fake = createFakeMcpServer();
    registerOpencodeGetTaskResult(fake.server);
    const handler = fake.getHandler();

    const result = await handler({ task_id: "task-1" });

    expect(result).toEqual({
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify({ task_id: "task-1", status: "error", message: "network fail" }),
        },
      ],
    });
  });

  it("returns an error result when the client throws a non-Error value", async () => {
    clientForTaskMock.mockReturnValue({ client: {}, sessionId: "s1" });
    lastAssistantEntryMock.mockRejectedValue("weird");
    const fake = createFakeMcpServer();
    registerOpencodeGetTaskResult(fake.server);
    const handler = fake.getHandler();

    const result = await handler({ task_id: "task-1" });

    expect(result).toEqual({
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify({ task_id: "task-1", status: "error", message: "weird" }),
        },
      ],
    });
  });
});
