import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Skill 元数据与读取层（规范见 .agents/specs/03-agent/agent-tooling-conventions.md「Skill 系统」）。
 *
 * - 每个 skill 一个目录：`skills/<skill-name>/SKILL.md`，frontmatter 含 name/description 两键。
 * - 元数据（name + description）常驻 system prompt；正文低频大体积，由 readSkill 按需加载。
 * - 目录不存在 / 无 skill / frontmatter 解析失败一律容错（返回空列表或 null），不抛错。
 */

export type SkillMetadata = {
  /** skill 名：小写连字符，≤64 字符，与目录名一致 */
  name: string;
  /** 用途说明（做什么 + 何时用），注入 system prompt 的 Skill 元数据段 */
  description: string;
};

export type SkillContent = SkillMetadata & {
  /** SKILL.md 全文（含 frontmatter） */
  content: string;
};

/** skill 目录根（默认项目根/skills）；测试可注入临时目录 */
const DEFAULT_SKILLS_DIR = path.resolve(process.cwd(), 'skills');

/** skill 名合法性：仅小写字母/数字/连字符，≤64 字符（防路径穿越的第一道闸，目录名与 name 共用） */
const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
const SKILL_NAME_MAX = 64;

/**
 * 解析 SKILL.md frontmatter（手写轻量解析：`---` 分隔 + `key: value` 键值行）。
 * 仅需 name/description 两键，不引入 YAML 依赖；值首尾引号剥除，行内后续英文冒号保留。
 * 失败（无 frontmatter / 未闭合）返回 null；缺键只缺字段，由调用方决定跳过。
 */
export function parseSkillFrontmatter(content: string): { name?: string; description?: string } | null {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return null;
  const endIndex = lines.slice(1).findIndex((line) => line.trim() === '---');
  if (endIndex === -1) return null;

  const result: { name?: string; description?: string } = {};
  for (const line of lines.slice(1, 1 + endIndex)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const sepIndex = trimmed.indexOf(':');
    if (sepIndex === -1) continue;
    const key = trimmed.slice(0, sepIndex).trim();
    if (key !== 'name' && key !== 'description') continue;
    let value = trimmed.slice(sepIndex + 1).trim();
    // 剥除包裹引号（单/双），行内后续冒号（如 URL）保留在值中
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1).trim();
    }
    if (value) result[key as 'name' | 'description'] = value;
  }
  return result;
}

/**
 * 遍历 `skills/` 目录，解析每个 skill 的 frontmatter，返回元数据列表。
 * - 目录不存在 / 无 skill：返回空列表，不抛错
 * - 单个 skill 解析失败（无 SKILL.md / frontmatter 缺失 name/description / 名称不合法）：跳过并 console.warn
 */
export function listSkillMetadata(skillsDir: string = DEFAULT_SKILLS_DIR): SkillMetadata[] {
  if (!existsSync(skillsDir)) return [];
  let entries;
  try {
    entries = readdirSync(skillsDir, { withFileTypes: true });
  } catch (err) {
    console.warn(`[skills] 读取技能目录失败：${err instanceof Error ? err.message : String(err)}`);
    return [];
  }

  const result: SkillMetadata[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !SKILL_NAME_RE.test(entry.name) || entry.name.length > SKILL_NAME_MAX) {
      continue;
    }
    const skillFilePath = path.join(skillsDir, entry.name, 'SKILL.md');
    if (!existsSync(skillFilePath)) continue;
    let content: string;
    try {
      content = readFileSync(skillFilePath, 'utf-8');
    } catch (err) {
      console.warn(`[skills] 读取技能「${entry.name}」失败：${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    const meta = parseSkillFrontmatter(content);
    if (!meta?.name || !meta.description) {
      console.warn(`[skills] 跳过技能「${entry.name}」：frontmatter 缺失 name/description 或格式非法`);
      continue;
    }
    if (!SKILL_NAME_RE.test(meta.name) || meta.name.length > SKILL_NAME_MAX) {
      console.warn(`[skills] 跳过技能「${entry.name}」：frontmatter name 不合法（仅小写字母/数字/连字符，≤64 字符）`);
      continue;
    }
    if (meta.name !== entry.name) {
      console.warn(`[skills] 跳过技能「${entry.name}」：frontmatter name（${meta.name}）与目录名不一致`);
      continue;
    }
    result.push({ name: meta.name, description: meta.description });
  }
  // 按 name 排序：skill 列表作为 system prompt 常驻内容，顺序确定性便于模型与测试依赖
  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

/**
 * 读取 `skills/<skillName>/SKILL.md` 全文（含 frontmatter），返回 name/description/content。
 * 防路径穿越（三道闸）：名称格式校验（仅小写字母/数字/连字符）→ 已知 skill 白名单 → 解析后路径前缀校验。
 * 未知名称 / 路径穿越 / 读取失败：返回 null，不抛错（错误形态由工具层决定）。
 */
export function readSkillContent(skillName: string, skillsDir: string = DEFAULT_SKILLS_DIR): SkillContent | null {
  if (!SKILL_NAME_RE.test(skillName) || skillName.length > SKILL_NAME_MAX) return null;

  // 白名单：仅在 listSkillMetadata 解析出的已知 skill 内（frontmatter name 为准）
  const known = listSkillMetadata(skillsDir);
  const meta = known.find((skill) => skill.name === skillName);
  if (!meta) return null;

  // 前缀校验：归一化后的路径必须仍在 skills 目录内（纵深防御，即使上面两闸被绕过也不越界）
  const resolvedDir = path.resolve(skillsDir);
  const filePath = path.resolve(resolvedDir, skillName, 'SKILL.md');
  if (!filePath.startsWith(resolvedDir + path.sep)) return null;

  try {
    const content = readFileSync(filePath, 'utf-8');
    return { name: meta.name, description: meta.description, content };
  } catch {
    return null;
  }
}
