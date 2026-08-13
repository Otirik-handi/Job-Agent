'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiGet } from './api';

/** 技能元数据（与 GET /api/skills 列表投影结构一致） */
export type SkillSummary = { name: string; description: string };

/** 技能详情（与 GET /api/skills/[name] 返回结构一致） */
export type SkillDetail = SkillSummary & { content: string };

/** 技能库列表 hook：挂载拉一次；refreshSignal 递增后刷新（对齐 use-resumes 模式） */
export function useSkills(refreshSignal?: number) {
  const [skills, setSkills] = useState<SkillSummary[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await apiGet<{ skills: SkillSummary[] }>('/api/skills');
      setSkills(res.skills);
    } catch (err) {
      console.error('技能列表加载失败', err);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh, refreshSignal]);

  return { skills, refresh };
}

/** 技能详情 hook：name 为 null 时清空不请求（抽屉关闭态）；加载失败静默降级为 null */
export function useSkillDetail(name: string | null, refreshSignal?: number) {
  const [detail, setDetail] = useState<SkillDetail | null>(null);

  const refresh = useCallback(async () => {
    if (!name) { setDetail(null); return; }
    try {
      setDetail(await apiGet<SkillDetail>(`/api/skills/${encodeURIComponent(name)}`));
    } catch (err) {
      console.error('技能详情加载失败', err);
      setDetail(null);
    }
  }, [name]);

  useEffect(() => { void refresh(); }, [refresh, refreshSignal]);

  return { detail, refresh };
}
