/** 向量检索纯函数：余弦相似度 + topK 排序（自算余弦，数据量小无需原生索引）。 */

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error('向量维度不一致');
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export type VectorRow<T> = T & { vector: number[] };

/** 按余弦相似度降序取 topK；score 保留 4 位小数 */
export function searchVectors<T extends { id: string }>(
  queryVec: number[],
  rows: VectorRow<T>[],
  topK: number,
): Array<{ id: string; score: number; row: T }> {
  return rows
    .map((row) => ({ row, score: cosineSimilarity(queryVec, row.vector) }))
    .sort((x, y) => y.score - x.score)
    .slice(0, topK)
    .map(({ row, score }) => ({ id: row.id, score: Math.round(score * 10000) / 10000, row }));
}
