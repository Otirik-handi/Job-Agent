import { describe, expect, it } from 'vitest';
import { computeKeywordMatch, findSections } from './keyword-match';

const RESUME = `张伟
前端开发工程师，5 年经验
技能：React、TypeScript、Node.js
工作经历：主导 XX 电商平台前端架构设计，负责组件库建设
教育经历：本科`;

describe('findSections', () => {
  it('按标准区块头切分区块（长词优先不误吞）', () => {
    const sections = findSections(RESUME);
    expect(sections.map((s) => s.label)).toEqual(['技能', '经历', '教育']);
    expect(sections[0].start).toBeLessThan(sections[1].start);
    expect(sections[1].end).toBe(sections[2].start);
  });

  it('无标准区块头时返回空数组', () => {
    expect(findSections('随便一段文本')).toEqual([]);
  });
});

describe('computeKeywordMatch', () => {
  it('命中/缺失/频次/区块统计正确', () => {
    const result = computeKeywordMatch(
      [
        { term: 'React', type: 'hard' },
        { term: '电商', type: 'industry' },
        { term: 'Python', type: 'hard' },
      ],
      RESUME,
    );
    expect(result.keywordTotal).toBe(3);
    expect(result.keywordHitCount).toBe(2);
    expect(result.keywordMatchScore).toBe(67); // 2/3 ≈ 66.67 → 67
    expect(result.keywordResults[0]).toMatchObject({ term: 'React', matched: true, count: 1, locations: ['技能'] });
    expect(result.keywordResults[1]).toMatchObject({ term: '电商', matched: true, count: 1, locations: ['经历'] });
    expect(result.missingKeywords).toEqual([{ term: 'Python', type: 'hard' }]);
  });

  it('英文匹配忽略大小写', () => {
    const result = computeKeywordMatch([{ term: 'react', type: 'hard' }], '技能：React、TypeScript');
    expect(result.keywordResults[0].matched).toBe(true);
    expect(result.keywordResults[0].count).toBe(1);
  });

  it('关键词同时命中多个区块时列出全部区块', () => {
    const result = computeKeywordMatch([{ term: '前端', type: 'hard' }], RESUME);
    expect(result.keywordResults[0].matched).toBe(true);
    expect(result.keywordResults[0].locations).toContain('经历');
  });

  it('空关键词清单：分数为 0 且不报错', () => {
    const result = computeKeywordMatch([], RESUME);
    expect(result.keywordMatchScore).toBe(0);
    expect(result.keywordTotal).toBe(0);
    expect(result.missingKeywords).toEqual([]);
  });

  it('无区块头时 locations 为空数组（不误报区块）', () => {
    const result = computeKeywordMatch([{ term: 'React', type: 'hard' }], '会 React 和 Vue');
    expect(result.keywordResults[0].matched).toBe(true);
    expect(result.keywordResults[0].locations).toEqual([]);
  });
});
