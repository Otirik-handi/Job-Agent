/** OpenCLI 输出解析与安全处理（纯函数）：
 * 1. 容错 JSON 解析（CLI 输出可能带前后杂讯）
 * 2. security_id 等 token 字段递归剥离（AGENTS.md 红线——实测 Boss 输出含加密 token）
 * 3. 51job 字段错位修复（title/companyName 偶发抓到"APP下载"按钮文案，用 category/companyIntro 交叉校验） */

const SECURITY_FIELDS = new Set(['security_id', 'securityId', 'securityKey', 'encryptToken', 'token']);

export function parseSiteJson(raw: string): Record<string, unknown> | null {
  // 真实 CLI 输出：51job 为数组（detail 单元素 / search 多元素），boss 为对象——取首个 [ 或 { 到末尾配对符
  const arrStart = raw.indexOf('[');
  const objStart = raw.indexOf('{');
  const start = arrStart !== -1 && (objStart === -1 || arrStart < objStart) ? arrStart : objStart;
  const end = raw.lastIndexOf(start === arrStart ? ']' : '}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function stripSecurityFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => stripSecurityFields(v));
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECURITY_FIELDS.has(k)) continue;
      out[k] = stripSecurityFields(v);
    }
    return out;
  }
  return value;
}

/** 51job 字段错位修复：title/companyName 若命中按钮文案（APP下载 等），用 category/companyIntro 替换 */
const BUTTON_NOISE = /APP下载|APP 下载|下载APP/i;

export function fix51jobFields(job: Record<string, unknown>): Record<string, unknown> {
  const out = { ...job };
  if (typeof out.title === 'string' && BUTTON_NOISE.test(out.title) && typeof out.category === 'string' && out.category.trim()) {
    out.title = out.category.trim();
  }
  if (typeof out.companyName === 'string' && BUTTON_NOISE.test(out.companyName) && typeof out.companyIntro === 'string' && out.companyIntro.trim()) {
    out.companyName = out.companyIntro.trim();
  }
  return out;
}
