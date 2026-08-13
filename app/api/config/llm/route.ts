import { getLlmConfigSnapshot } from '@/src/agent/model';

/** GET /api/config/llm：当前 LLM 配置投影（只回传 provider/model，不回传 baseURL/apiKey；
 * 配置缺失不算错误——前端需要渲染红灯而非抛错） */
export function GET() {
  const snapshot = getLlmConfigSnapshot();
  return Response.json({
    configured: snapshot.missing.length === 0,
    provider: snapshot.provider,
    model: snapshot.modelName,
  });
}
