/** 消息 embedding：硅基流动 /embeddings 调用（OpenAI 兼容）。
 * 降级语义：embedText 返回 null 而非抛错——未配置/API 失败均视为"无向量"，调用方跳过嵌入。
 * 评测注入：setEmbeddingOverride（与 model override 同模式），mock 层不依赖真实 API。 */
type EmbedFn = (text: string) => Promise<number[] | null>;

let override: EmbedFn | null = null;
export function setEmbeddingOverride(fn: EmbedFn): void { override = fn; }
export function clearEmbeddingOverride(): void { override = null; }

const MAX_EMBED_CHARS = 8000; // bge-m3 上下文 8192，留余量

export async function embedText(text: string): Promise<number[] | null> {
  if (override) return override(text);
  const baseUrl = process.env.EMBEDDING_BASE_URL;
  const apiKey = process.env.EMBEDDING_API_KEY;
  const model = process.env.EMBEDDING_MODEL;
  if (!baseUrl || !apiKey || !model) return null;
  const input = text.length > MAX_EMBED_CHARS ? text.slice(0, MAX_EMBED_CHARS) : text;
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, input: [input] }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: Array<{ embedding?: unknown }> };
    const vec = data.data?.[0]?.embedding;
    return Array.isArray(vec) && vec.every((n) => typeof n === 'number') ? (vec as number[]) : null;
  } catch {
    return null; // 网络/超时/解析失败：降级
  }
}
