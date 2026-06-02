/**
 * subagent-thread-store.js — subagent 线程生命周期账本
 *
 * Thread 记录一个 child session 的身份与生命周期；Run 记录一次 taskId 执行。
 * 线程可以是：
 * - ephemeral：普通 subagent 未传 instance 的临时线程，完成后关闭
 * - reusable：传 instance 的可复用线程，跨多次 run 保持 open
 * - workflow_node：workflow 里 agent() 派出的临时节点线程，完成后关闭
 */

import fs from "node:fs";
import path from "node:path";
import { atomicWriteSync } from "../shared/safe-fs.js";

export const SUBAGENT_THREAD_STORE_VERSION = 1;

const VALID_KINDS = new Set(["ephemeral", "reusable", "workflow_node"]);
const VALID_THREAD_STATUSES = new Set(["open", "closed"]);
const VALID_RUN_STATUSES = new Set(["pending", "resolved", "failed", "aborted"]);

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function pickString(value) {
  return typeof value === "string" && value.trim() ? value : null;
}

function pickCount(value) {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function normalizeKind(kind, fallback = "ephemeral") {
  return VALID_KINDS.has(kind) ? kind : fallback;
}

function normalizeThreadStatus(status, fallback = "open") {
  return VALID_THREAD_STATUSES.has(status) ? status : fallback;
}

function normalizeRunStatus(status, fallback = "pending") {
  return VALID_RUN_STATUSES.has(status) ? status : fallback;
}

function normalizeThread(threadId, record = {}, existing = null) {
  const timestamp = nowIso();
  const kind = normalizeKind(record.kind, existing?.kind || "ephemeral");
  const status = normalizeThreadStatus(record.status, existing?.status || "open");
  const hasClosedAt = Object.prototype.hasOwnProperty.call(record, "closedAt");
  return {
    ...(existing || {}),
    threadId,
    kind,
    status,
    lastRunStatus: normalizeRunStatus(record.lastRunStatus || record.runStatus, existing?.lastRunStatus || "pending"),
    parentSessionPath: pickString(record.parentSessionPath) || existing?.parentSessionPath || null,
    parentTaskId: pickString(record.parentTaskId) || existing?.parentTaskId || null,
    nodeId: pickString(record.nodeId) || existing?.nodeId || null,
    agentId: pickString(record.agentId) || existing?.agentId || null,
    agentName: pickString(record.agentName) || existing?.agentName || null,
    childSessionPath: pickString(record.childSessionPath) || pickString(record.sessionPath) || existing?.childSessionPath || null,
    instance: pickString(record.instance) || existing?.instance || null,
    reuseKey: pickString(record.reuseKey) || existing?.reuseKey || null,
    label: pickString(record.label) || existing?.label || null,
    summary: pickString(record.summary) || existing?.summary || null,
    runCount: pickCount(record.runCount ?? existing?.runCount),
    createdAt: existing?.createdAt || pickString(record.createdAt) || timestamp,
    lastRunAt: pickString(record.lastRunAt) || existing?.lastRunAt || null,
    closedAt: hasClosedAt ? pickString(record.closedAt) : (existing?.closedAt || null),
    updatedAt: timestamp,
  };
}

export class SubagentThreadStore {
  constructor(persistPath) {
    this._persistPath = persistPath || null;
    this._threads = new Map();
    if (this._persistPath) this._load();
  }

  beginRun(threadId, record = {}) {
    if (!threadId) return null;
    const existing = this._threads.get(threadId) || null;
    const next = normalizeThread(threadId, {
      ...record,
      status: "open",
      lastRunStatus: "pending",
      runCount: (existing?.runCount || 0) + 1,
      lastRunAt: nowIso(),
      closedAt: null,
    }, existing);
    this._threads.set(threadId, next);
    this._save();
    return clone(next);
  }

  attachSession(threadId, childSessionPath, record = {}) {
    if (!threadId) return null;
    const existing = this._threads.get(threadId) || null;
    const next = normalizeThread(threadId, {
      ...record,
      childSessionPath,
      status: existing?.status || "open",
    }, existing);
    this._threads.set(threadId, next);
    this._save();
    return clone(next);
  }

  finishRun(threadId, record = {}) {
    if (!threadId) return null;
    const existing = this._threads.get(threadId) || null;
    if (!existing) return null;
    const close = record.close === true;
    const next = normalizeThread(threadId, {
      ...record,
      status: close ? "closed" : "open",
      lastRunStatus: normalizeRunStatus(record.status || record.lastRunStatus, existing.lastRunStatus),
      closedAt: close ? nowIso() : null,
    }, existing);
    this._threads.set(threadId, next);
    this._save();
    return clone(next);
  }

  upsert(threadId, record = {}) {
    if (!threadId) return null;
    const existing = this._threads.get(threadId) || null;
    const next = normalizeThread(threadId, record, existing);
    this._threads.set(threadId, next);
    this._save();
    return clone(next);
  }

  get(threadId) {
    if (!threadId) return null;
    return clone(this._threads.get(threadId) || null);
  }

  list() {
    return Array.from(this._threads.values()).map(clone);
  }

  remove(threadId) {
    if (!threadId || !this._threads.has(threadId)) return false;
    this._threads.delete(threadId);
    this._save();
    return true;
  }

  removeBySession(parentSessionPath) {
    if (!parentSessionPath) return 0;
    let removed = 0;
    for (const [id, rec] of this._threads) {
      if (rec.parentSessionPath === parentSessionPath) {
        this._threads.delete(id);
        removed += 1;
      }
    }
    if (removed) this._save();
    return removed;
  }

  removeByAgentId(agentId) {
    if (!agentId) return 0;
    let removed = 0;
    for (const [id, rec] of this._threads) {
      if (rec.agentId === agentId) {
        this._threads.delete(id);
        removed += 1;
      }
    }
    if (removed) this._save();
    return removed;
  }

  get size() {
    return this._threads.size;
  }

  _save() {
    if (!this._persistPath) return;
    const data = {
      schemaVersion: SUBAGENT_THREAD_STORE_VERSION,
      threads: Object.fromEntries(this._threads.entries()),
    };
    fs.mkdirSync(path.dirname(this._persistPath), { recursive: true });
    atomicWriteSync(this._persistPath, JSON.stringify(data, null, 2) + "\n");
  }

  _load() {
    if (!this._persistPath || !fs.existsSync(this._persistPath)) return;
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(this._persistPath, "utf-8"));
    } catch {
      return;
    }
    const threads = raw?.threads && typeof raw.threads === "object" ? raw.threads : {};
    let repaired = false;
    for (const [threadId, value] of Object.entries(threads)) {
      if (!threadId || !value || typeof value !== "object") continue;
      const next = normalizeThread(threadId, value);
      if (next.lastRunStatus === "pending") {
        repaired = true;
        next.lastRunStatus = "failed";
        if (next.kind === "reusable") {
          next.status = "open";
          next.closedAt = null;
        } else {
          next.status = "closed";
          next.closedAt = next.closedAt || next.lastRunAt || next.updatedAt || nowIso();
        }
      }
      this._threads.set(threadId, next);
    }
    if (repaired) this._save();
  }
}
