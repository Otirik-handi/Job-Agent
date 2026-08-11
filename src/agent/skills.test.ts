import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { listSkillMetadata, parseSkillFrontmatter, readSkillContent } from './skills';

/** 每个用例独立临时技能目录，测完即删；不依赖仓库真实 skills/ 目录内容 */
let skillsDir: string;

function writeSkill(dirName: string, content: string) {
  const dir = path.join(skillsDir, dirName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'SKILL.md'), content, 'utf-8');
}

beforeEach(() => {
  skillsDir = mkdtempSync(path.join(tmpdir(), 'jh-skills-'));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  rmSync(skillsDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('parseSkillFrontmatter（手写轻量解析）', () => {
  it('解析 name/description 两键', () => {
    const result = parseSkillFrontmatter(`---
name: resume-analysis
description: 简历评分卡技能：按四维打分。
---

正文`);
    expect(result).toEqual({ name: 'resume-analysis', description: '简历评分卡技能：按四维打分。' });
  });

  it('值含包裹引号时剥除引号；行内后续英文冒号（如 URL）保留', () => {
    const result = parseSkillFrontmatter(`---
name: "jd-analysis"
description: '解析 JD，参考 https://example.com/schema 执行'
---`);
    expect(result).toEqual({ name: 'jd-analysis', description: '解析 JD，参考 https://example.com/schema 执行' });
  });

  it('缺键时只返回存在的字段', () => {
    expect(parseSkillFrontmatter('---\nname: resume-analysis\n---')).toEqual({ name: 'resume-analysis' });
  });

  it('无 frontmatter（首行非 ---）返回 null', () => {
    expect(parseSkillFrontmatter('# 没有 frontmatter\n正文')).toBeNull();
  });

  it('frontmatter 未闭合（无第二个 ---）返回 null', () => {
    expect(parseSkillFrontmatter('---\nname: resume-analysis\n正文')).toBeNull();
  });
});

describe('listSkillMetadata（目录遍历 + 容错）', () => {
  it('目录不存在返回空列表，不抛错', () => {
    expect(listSkillMetadata(path.join(skillsDir, 'not-exists'))).toEqual([]);
  });

  it('发现正常 skill 并解析元数据', () => {
    writeSkill('resume-analysis', `---
name: resume-analysis
description: 简历评分卡
---

正文`);
    writeSkill('jd-analysis', `---
name: jd-analysis
description: JD 解析规则
---

正文`);
    const result = listSkillMetadata(skillsDir);
    expect(result).toEqual([
      { name: 'jd-analysis', description: 'JD 解析规则' },
      { name: 'resume-analysis', description: '简历评分卡' },
    ]);
  });

  it('frontmatter 解析失败的 skill 跳过并 console.warn，不整体失败', () => {
    writeSkill('broken', '# 没有 frontmatter\n正文');
    writeSkill('missing-desc', '---\nname: missing-desc\n---\n正文');
    writeSkill('good', `---
name: good
description: 好 skill
---

正文`);
    const result = listSkillMetadata(skillsDir);
    expect(result).toEqual([{ name: 'good', description: '好 skill' }]);
    expect(console.warn).toHaveBeenCalled();
  });

  it('无 SKILL.md 的目录与非法目录名（大写/点号）被忽略', () => {
    mkdirSync(path.join(skillsDir, 'empty-dir'), { recursive: true });
    writeSkill('BAD-NAME', '---\nname: BAD-NAME\ndescription: x\n---\n');
    writeSkill('dot.dir', '---\nname: dot.dir\ndescription: x\n---\n');
    expect(listSkillMetadata(skillsDir)).toEqual([]);
  });
});

describe('readSkillContent（读取 + 路径防护）', () => {
  it('读取已知 skill 全文（含 frontmatter）并返回元数据', () => {
    writeSkill('resume-analysis', `---
name: resume-analysis
description: 简历评分卡
---

# 正文规则`);
    const result = readSkillContent('resume-analysis', skillsDir);
    expect(result).toEqual({
      name: 'resume-analysis',
      description: '简历评分卡',
      content: `---
name: resume-analysis
description: 简历评分卡
---

# 正文规则`,
    });
  });

  it('未知名称返回 null（不抛错）', () => {
    writeSkill('resume-analysis', '---\nname: resume-analysis\ndescription: x\n---\n');
    expect(readSkillContent('no-such-skill', skillsDir)).toBeNull();
  });

  it('路径穿越一律拒绝返回 null：../、绝对路径、嵌套路径、空串', () => {
    writeSkill('resume-analysis', '---\nname: resume-analysis\ndescription: x\n---\n');
    // 防御性创建目录外目标文件，验证确实读不到
    const outside = path.join(tmpdir(), 'jh-skills-outside-agent.txt');
    writeFileSync(outside, 'should not be readable', 'utf-8');
    try {
      for (const evil of ['../agent', '..', '../agent.ts', 'resume-analysis/../../agent', 'a/b', '', '.', 'resume-analysis/..']) {
        expect(readSkillContent(evil, skillsDir)).toBeNull();
      }
    } finally {
      rmSync(outside, { force: true });
    }
  });

  it('目录名与 frontmatter name 不一致的 skill 被跳过（白名单按一致后的 name 建立）', () => {
    writeSkill('dir-a', '---\nname: meta-a\ndescription: x\n---\n正文a');
    writeSkill('dir-b', '---\nname: meta-b\ndescription: x\n---\n正文b');
    expect(listSkillMetadata(skillsDir)).toEqual([]);
    expect(readSkillContent('meta-b', skillsDir)).toBeNull();
    expect(readSkillContent('dir-b', skillsDir)).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });
});
