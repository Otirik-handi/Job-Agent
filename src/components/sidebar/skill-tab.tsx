'use client';
import { BookOpen } from 'lucide-react';
import { EmptyState } from '@/src/components/ui/empty-state';
import { useSkills } from '@/src/lib/use-skills';

/** 技能库只读列表（侧边栏「技能」Tab）：名称 + 描述两行截断，点击打开详情抽屉 */
export function SkillTab({ refreshSignal, onOpenSkill }: {
  refreshSignal?: number;
  onOpenSkill: (name: string) => void;
}) {
  const { skills } = useSkills(refreshSignal);
  return (
    <div className="flex h-full flex-col gap-1.5 overflow-y-auto p-3">
      <p className="px-1 pb-1 text-xs text-muted-foreground">Agent 技能库（{skills.length} 个）</p>
      {skills.length === 0 && (
        <EmptyState
          compact
          icon={BookOpen}
          title="暂无技能"
          description="技能库为空或目录不可读"
          className="rounded-2xl bg-slate-100/60 px-3 py-6"
        />
      )}
      {skills.map((s) => (
        <div key={s.name} className="group rounded-xl transition-all hover:bg-slate-100">
          <button
            onClick={() => onOpenSkill(s.name)}
            className="w-full cursor-pointer px-3 py-2 text-left text-sm"
          >
            <div className="flex items-center gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-500/10">
                <BookOpen className="size-3.5 text-amber-600" />
              </span>
              <span className="truncate font-medium">{s.name}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{s.description}</p>
          </button>
        </div>
      ))}
    </div>
  );
}
