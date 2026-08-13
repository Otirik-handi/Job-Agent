'use client';
import { useEffect, useState } from 'react';
import { apiGet } from './api';

/** LLM 配置投影（与 GET /api/config/llm 返回结构一致） */
export type LlmConfigInfo = {
  configured: boolean;
  provider: string | null;
  model: string | null;
};

/**
 * 模型指示灯数据 hook：挂载时拉取一次（env 变更需重启 dev server，无需刷新机制）。
 * 加载失败静默降级——info 保持 null，指示灯显示灰色，不阻塞对话主流程。
 */
export function useLlmConfig() {
  const [info, setInfo] = useState<LlmConfigInfo | null>(null);

  useEffect(() => {
    void apiGet<LlmConfigInfo>('/api/config/llm')
      .then(setInfo)
      .catch((err) => {
        console.error('模型配置加载失败', err);
      });
  }, []);

  return { info };
}
