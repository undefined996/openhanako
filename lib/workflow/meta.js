import vm from "node:vm";

/**
 * 静态提取并校验 workflow 脚本开头的 `export const meta = {...}` 字面量，
 * 返回 meta 对象与剥离 export 后可在 async function 里执行的 body。
 * meta 必须是纯对象字面量（spec 约束：无变量 / 函数调用 / 模板插值）。
 * @param {string} script
 * @returns {{ meta: { name: string, description: string, phases?: any[] }, body: string }}
 */
export function extractMeta(script) {
  if (typeof script !== "string" || !script.trim()) {
    throw new Error("workflow script 不能为空");
  }
  const marker = /export\s+const\s+meta\s*=/.exec(script);
  if (!marker) {
    throw new Error("workflow script 必须以 export const meta = {...} 开头");
  }
  const braceStart = script.indexOf("{", marker.index + marker[0].length);
  if (braceStart === -1) throw new Error("workflow meta 必须是对象字面量");
  const braceEnd = matchBrace(script, braceStart);
  if (braceEnd === -1) throw new Error("workflow meta 对象字面量未闭合");

  const literal = script.slice(braceStart, braceEnd + 1);
  let meta;
  try {
    meta = vm.runInNewContext("(" + literal + ")", Object.create(null), { timeout: 50 });
  } catch (err) {
    throw new Error("workflow meta 不是合法对象字面量: " + err.message);
  }
  if (!meta || typeof meta !== "object" ||
      typeof meta.name !== "string" || typeof meta.description !== "string") {
    throw new Error("workflow meta 必须含 name 和 description 字符串");
  }

  const body =
    script.slice(0, marker.index) +
    script.slice(marker.index).replace(/export\s+const\s+meta/, "const meta");
  return { meta, body };
}

/**
 * 从 start 处的 `{` 找到配对的 `}`（跳过字符串字面量内的花括号）。
 * @param {string} s
 * @param {number} start
 * @returns {number} 配对 `}` 的下标，未闭合返回 -1
 */
function matchBrace(s, start) {
  let depth = 0;
  let inStr = null;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === "\\") { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return i; }
  }
  return -1;
}
