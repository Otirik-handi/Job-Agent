import { describe, expect, it } from 'vitest';
import { cosineSimilarity, searchVectors } from './vector-search';

describe('cosineSimilarity（余弦相似度）', () => {
  it('相同向量 = 1，正交 = 0，反向 = -1', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 5);
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0, 5);
    expect(cosineSimilarity([1, 0, 0], [-1, 0, 0])).toBeCloseTo(-1, 5);
  });
  it('长度不同抛错', () => {
    expect(() => cosineSimilarity([1, 0], [1, 0, 0])).toThrow();
  });
  it('零向量不除零（返回 0）', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe('searchVectors（topK 排序）', () => {
  it('按相似度降序返回 topK，score 保留 4 位小数', () => {
    const rows = [
      { id: 'a', vector: [1, 0, 0] },
      { id: 'b', vector: [0, 1, 0] },
      { id: 'c', vector: [0.5, 0.5, 0] }, // 与 [1,0,0] 余弦 ≈ 0.7071
    ];
    const result = searchVectors([1, 0, 0], rows, 2);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('a');
    expect(result[0].score).toBeCloseTo(1, 4);
    expect(result[1].id).toBe('c');
    expect(result[1].score).toBeCloseTo(0.7071, 4);
  });
  it('空数组返回空', () => {
    expect(searchVectors([1, 0], [], 5)).toEqual([]);
  });
});
