import { describe, expect, it } from "vitest";
import { extractMeta } from "../lib/workflow/meta.js";

describe("workflow meta extraction", () => {
  it("提取合法 meta 并剥离 export", () => {
    const script = `export const meta = { name: 'demo', description: '演示' }\nreturn 1 + 1`;
    const { meta, body } = extractMeta(script);
    expect(meta.name).toBe("demo");
    expect(meta.description).toBe("演示");
    expect(body).not.toMatch(/export\s+const\s+meta/);
    expect(body).toMatch(/const meta =/);
  });

  it("meta 含 phases 数组也能解析", () => {
    const script = `export const meta = { name: 'a', description: 'b', phases: [{ title: 'X' }] }\nreturn []`;
    const { meta } = extractMeta(script);
    expect(meta.phases).toEqual([{ title: "X" }]);
  });

  it("缺 meta 抛错", () => {
    expect(() => extractMeta(`return 1`)).toThrow(/必须以 export const meta/);
  });

  it("meta 缺 name/description 抛错", () => {
    expect(() => extractMeta(`export const meta = { name: 'x' }\nreturn 1`)).toThrow(/name 和 description/);
  });

  it("空脚本抛错", () => {
    expect(() => extractMeta("")).toThrow(/不能为空/);
  });
});
