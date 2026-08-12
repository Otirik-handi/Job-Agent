/** 存量消息向量回填：为所有 embedding_json 为 null 的消息补嵌入（幂等，可重复跑）。
 * 运行：npm run embed-backfill（需配置 EMBEDDING_* 环境变量）。 */
import { eq, isNull } from 'drizzle-orm';
import { db } from '../src/db';
import { messages } from '../src/db/schema';
import { embedText } from '../src/agent/embedding';
import { extractEmbeddingText } from '../src/agent/run-agent';

async function main() {
  const rows = db.select({ id: messages.id, messageJson: messages.messageJson })
    .from(messages).where(isNull(messages.embeddingJson)).all();
  if (rows.length === 0) {
    console.log('无需回填：所有消息均已嵌入');
    return;
  }
  console.log(`开始回填 ${rows.length} 条消息…`);
  let done = 0, skipped = 0, failed = 0;
  for (const row of rows) {
    const text = extractEmbeddingText(row.messageJson);
    if (!text) { skipped += 1; continue; } // 无文本消息（纯工具过程）不嵌入
    const vector = await embedText(text);
    if (!vector) { failed += 1; continue; }
    db.update(messages).set({ embeddingJson: JSON.stringify(vector) }).where(eq(messages.id, row.id)).run();
    done += 1;
    if (done % 50 === 0) console.log(`已回填 ${done}/${rows.length}`);
  }
  console.log(`回填完成：成功 ${done}，跳过（无文本）${skipped}，失败 ${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('回填异常：', err);
  process.exit(1);
});
