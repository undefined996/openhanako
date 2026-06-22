import { describe, expect, it, vi } from "vitest";
import { ResourceIO } from "../lib/resource-io/resource-io.ts";

describe("ResourceIO audit", () => {
  it("records expected-version conflicts without emitting changed events", async () => {
    const audit = { record: vi.fn() };
    const changed = vi.fn();
    const provider = {
      id: "local_fs" as const,
      capabilities: () => ({ writeExpectedVersion: true }),
      writeExpectedVersion: vi.fn(async () => ({
        ok: false as const,
        conflict: true as const,
        resourceKey: "local_fs:/repo/a.md",
        resource: { kind: "local-file" as const, path: "/repo/a.md", provider: "local_fs" },
        version: { mtimeMs: 2, size: 10 },
      })),
    };
    const resourceIO = new ResourceIO({
      providers: { local_fs: provider },
      eventBus: { changed } as any,
      audit,
    });

    const result = await resourceIO.writeExpectedVersion(
      { kind: "local-file", path: "/repo/a.md" },
      "next",
      { mtimeMs: 1, size: 10 },
      {
        reason: "route_write",
        principal: { kind: "api", requestId: "req_1" },
      },
    );

    expect(result).toMatchObject({ ok: false, conflict: true });
    expect(changed).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "conflict",
      operation: "writeExpectedVersion",
      reason: "route_write",
      resourceKey: "local_fs:/repo/a.md",
      principal: { kind: "api", requestId: "req_1" },
    }));
  });
});
