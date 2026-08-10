'use client';
import { useState } from 'react';
import type { UIMessage } from 'ai';
import { ArrowRight, Check, ClipboardCheck } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { StatusBadge } from '@/src/components/ui/status-badge';

/**
 * recordApplicationStatus 轻量确认（审批分档：可逆操作）：
 * 第一段预览结果（phase=preview）在消息中渲染为确认卡片，用户点击「确认记录」
 * 按钮后以用户确认消息的形式触发第二段（confirmed=true）调用，无需打字确认。
 */

export type RecordStatusPreview = {
  toolCallId: string;
  jobOpportunityId: string;
  currentStatus: string;
  targetStatus: string;
};

/** 从消息的 tool part 中提取 recordApplicationStatus 预览结果（仅 phase=preview 的成功结果） */
export function collectRecordStatusPreviews(message: UIMessage): RecordStatusPreview[] {
  const previews: RecordStatusPreview[] = [];
  for (const part of message.parts) {
    const toolPart =
      part.type === 'tool-recordApplicationStatus' ||
      (part.type === 'dynamic-tool' && part.toolName === 'recordApplicationStatus')
        ? part
        : null;
    if (!toolPart || toolPart.state !== 'output-available') continue;
    const output = toolPart.output;
    if (typeof output !== 'object' || output === null) continue;
    const o = output as Record<string, unknown>;
    if (o.ok !== true || o.phase !== 'preview') continue;
    if (
      typeof o.jobOpportunityId !== 'string' ||
      typeof o.currentStatus !== 'string' ||
      typeof o.targetStatus !== 'string'
    ) {
      continue;
    }
    previews.push({
      toolCallId: toolPart.toolCallId,
      jobOpportunityId: o.jobOpportunityId,
      currentStatus: o.currentStatus,
      targetStatus: o.targetStatus,
    });
  }
  return previews;
}

/** 确认消息文本：携带 jobOpportunityId 与目标状态，模型据此携带 confirmed=true 再次调用 */
export function buildConfirmMessage(preview: RecordStatusPreview): string {
  return `确认记录：将岗位 ${preview.jobOpportunityId} 从 ${preview.currentStatus} 记录为 ${preview.targetStatus}`;
}

export function RecordStatusCard({
  preview,
  onConfirm,
  busy,
}: {
  preview: RecordStatusPreview;
  onConfirm?: (text: string) => void;
  busy: boolean;
}) {
  const [clicked, setClicked] = useState(false);
  const disabled = busy || clicked || !onConfirm;

  return (
    <div className="w-full max-w-md rounded-2xl border border-slate-200/70 bg-white px-4 py-3 shadow-soft">
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-600">
          <ClipboardCheck className="size-4" />
        </span>
        <span className="text-sm font-semibold text-slate-700">记录投递后状态</span>
        <span className="ml-auto rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700">待确认</span>
      </div>
      <div className="mt-3 flex items-center gap-2 text-sm">
        <StatusBadge status={preview.currentStatus} />
        <ArrowRight className="size-4 text-slate-400" />
        <StatusBadge status={preview.targetStatus} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <Button
          size="sm"
          variant="default"
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            setClicked(true);
            onConfirm(buildConfirmMessage(preview));
          }}
        >
          {clicked ? <Check className="size-3.5" /> : null}
          {clicked ? '已发送确认' : '确认记录'}
        </Button>
        <span className="text-xs text-slate-400">如记录有误，可告诉助手纠正</span>
      </div>
    </div>
  );
}
