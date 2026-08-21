import { describe, expect, it } from "vitest";
import {
  clearTasks,
  getTask,
  listTasks,
  registerTask,
  removeTask,
  type TaskRecord,
} from "../../../src/modules/shared/task-registry.js";

function makeTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    taskId: "task-1",
    serverId: "srv-1",
    sessionId: "session-1",
    ...overrides,
  };
}

describe("task-registry", () => {
  it("registers and retrieves a task", () => {
    const task = makeTask();
    registerTask(task);
    expect(getTask("task-1")).toBe(task);
  });

  it("returns undefined for an unknown task id", () => {
    expect(getTask("missing-task")).toBeUndefined();
  });

  it("removes a registered task", () => {
    const task = makeTask({ taskId: "task-2" });
    registerTask(task);
    removeTask("task-2");
    expect(getTask("task-2")).toBeUndefined();
  });

  it("lists all registered tasks", () => {
    clearTasks();
    const a = makeTask({ taskId: "a" });
    const b = makeTask({ taskId: "b" });
    registerTask(a);
    registerTask(b);
    expect(listTasks()).toEqual(expect.arrayContaining([a, b]));
    clearTasks();
    expect(listTasks()).toEqual([]);
  });

  it("clears all tasks", () => {
    const task = makeTask({ taskId: "clear-me" });
    registerTask(task);
    clearTasks();
    expect(getTask("clear-me")).toBeUndefined();
    expect(listTasks()).toHaveLength(0);
  });
});
