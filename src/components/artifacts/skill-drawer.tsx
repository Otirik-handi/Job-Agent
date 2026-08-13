'use client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/src/components/ui/sheet';
import { MarkdownText } from '@/src/components/chat/markdown-text';
import { useSkillDetail } from '@/src/lib/use-skills';

/** 剥离 SKILL.md 首部 frontmatter（---\n...\n---），只渲染正文 */
function stripFrontmatter(content: string): string {
  return content.replace(/^---[\s\S]*?---\n?/, '');
}

/** 技能详情抽屉：只读展示 SKILL.md 正文（Markdown 渲染），frontmatter 不显示 */
export function SkillDrawer({ skillName, open, onOpenChange }: {
  skillName: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { detail } = useSkillDetail(open ? skillName : null);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="data-[side=right]:w-[40vw] data-[side=right]:sm:max-w-[40vw] overflow-y-auto p-6">
        <SheetHeader className="p-0">
          <SheetTitle>{detail?.name ?? skillName ?? '技能详情'}</SheetTitle>
        </SheetHeader>
        {!detail && <p className="text-sm text-muted-foreground">加载中…</p>}
        {detail && <MarkdownText className="mt-6" text={stripFrontmatter(detail.content)} />}
      </SheetContent>
    </Sheet>
  );
}
