import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SubagentThreadStore,
  SUBAGENT_THREAD_STORE_VERSION,
} from "../lib/subagent-thread-store.js";

describe("SubagentThreadStore", () => {
  let tempDir;
  let storePath;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-subagent-threads-"));
    storePath = path.join(tempDir, "subagent-threads.json");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("records an ephemeral thread, attaches its child session, then closes it after the run", () => {
    const store = new SubagentThreadStore(storePath);
    store.beginRun("subagent-1", {
      kind: "ephemeral",
      parentSessionPath: "/parent.jsonl",
      agentId: "hana",
      summary: "read files",
    });
    store.attachSession("subagent-1", "/child.jsonl");
    store.finishRun("subagent-1", { status: "resolved", summary: "done", close: true });

    expect(store.get("subagent-1")).toMatchObject({
      threadId: "subagent-1",
      kind: "ephemeral",
      status: "closed",
      lastRunStatus: "resolved",
      parentSessionPath: "/parent.jsonl",
      agentId: "hana",
      childSessionPath: "/child.jsonl",
      summary: "done",
      runCount: 1,
    });
    expect(store.get("subagent-1").closedAt).toBeTruthy();
  });

  it("keeps reusable threads open across runs and increments runCount", () => {
    const store = new SubagentThreadStore(storePath);
    const threadId = "reusable::/parent.jsonl::butter::探索";

    store.beginRun(threadId, {
      kind: "reusable",
      parentSessionPath: "/parent.jsonl",
      agentId: "butter",
      instance: "探索",
      reuseKey: "/parent.jsonl::butter::探索",
    });
    store.attachSession(threadId, "/child.jsonl");
    store.finishRun(threadId, { status: "resolved", summary: "first", close: false });
    store.beginRun(threadId, {
      kind: "reusable",
      parentSessionPath: "/parent.jsonl",
      agentId: "butter",
      instance: "探索",
      reuseKey: "/parent.jsonl::butter::探索",
    });
    expect(store.get(threadId)).toMatchObject({
      status: "open",
      lastRunStatus: "pending",
      runCount: 2,
    });
    store.finishRun(threadId, { status: "resolved", summary: "second", close: false });

    expect(store.get(threadId)).toMatchObject({
      kind: "reusable",
      status: "open",
      lastRunStatus: "resolved",
      childSessionPath: "/child.jsonl",
      instance: "探索",
      runCount: 2,
    });
    expect(store.get(threadId).closedAt).toBeNull();
  });

  it("persists and reloads thread records with schema version", () => {
    const store = new SubagentThreadStore(storePath);
    store.beginRun("workflow-1::node-1", {
      kind: "workflow_node",
      parentTaskId: "workflow-1",
      nodeId: "node-1",
      parentSessionPath: "/parent.jsonl",
      agentId: "hana",
      label: "探索",
    });
    store.attachSession("workflow-1::node-1", "/child.jsonl");

    const onDisk = JSON.parse(fs.readFileSync(storePath, "utf8"));
    expect(onDisk.schemaVersion).toBe(SUBAGENT_THREAD_STORE_VERSION);

    const restored = new SubagentThreadStore(storePath);
    expect(restored.get("workflow-1::node-1")).toMatchObject({
      kind: "workflow_node",
      parentTaskId: "workflow-1",
      nodeId: "node-1",
      label: "探索",
      childSessionPath: "/child.jsonl",
    });
  });

  it("removes all threads owned by a parent session", () => {
    const store = new SubagentThreadStore(storePath);
    store.beginRun("a", { kind: "ephemeral", parentSessionPath: "/s/a.jsonl" });
    store.beginRun("b", { kind: "workflow_node", parentSessionPath: "/s/a.jsonl" });
    store.beginRun("c", { kind: "ephemeral", parentSessionPath: "/s/b.jsonl" });

    expect(store.removeBySession("/s/a.jsonl")).toBe(2);
    expect(store.get("a")).toBeNull();
    expect(store.get("b")).toBeNull();
    expect(store.get("c")).toBeTruthy();
  });

  it("rehydrates orphan pending runs as failed without closing reusable threads", () => {
    fs.writeFileSync(storePath, JSON.stringify({
      schemaVersion: SUBAGENT_THREAD_STORE_VERSION,
      threads: {
        "subagent-1": {
          threadId: "subagent-1",
          kind: "ephemeral",
          status: "open",
          lastRunStatus: "pending",
          parentSessionPath: "/s/a.jsonl",
          runCount: 1,
          createdAt: "2026-06-01T00:00:00.000Z",
          lastRunAt: "2026-06-01T00:01:00.000Z",
        },
        "reusable::k": {
          threadId: "reusable::k",
          kind: "reusable",
          status: "open",
          lastRunStatus: "pending",
          parentSessionPath: "/s/a.jsonl",
          runCount: 2,
          createdAt: "2026-06-01T00:00:00.000Z",
          lastRunAt: "2026-06-01T00:02:00.000Z",
        },
      },
    }, null, 2));

    const store = new SubagentThreadStore(storePath);

    expect(store.get("subagent-1")).toMatchObject({
      kind: "ephemeral",
      status: "closed",
      lastRunStatus: "failed",
      closedAt: "2026-06-01T00:01:00.000Z",
    });
    expect(store.get("reusable::k")).toMatchObject({
      kind: "reusable",
      status: "open",
      lastRunStatus: "failed",
      closedAt: null,
    });
  });
});
