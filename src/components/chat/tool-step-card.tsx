'use client';
import { useState } from 'react';
import { isToolUIPart, type UIMessage } from 'ai';
import { Check, ChevronDown, ChevronRight, Loader2, RotateCcw, Wrench, XCircle } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { cn } from '@/src/lib/utils';

/**
 * 工具步骤卡片：把消息流里的工具调用渲染为正式三态步骤卡片（规范见
 * frontend-conventions.md「工具步骤卡片」）：
 * - 运行中：工具名 + 运行中徽章，随流式更新（tool part state 变化即刷新）
 * - 完成：折叠一行（工具名 + ✓ 一句摘要），可展开看输出要点
 * - 失败：红色 + 错误摘要（结构化错误契约 message）+「重试」按钮
 * 卡片数据源为 AI SDK 消息的 tool part（tool-<name> 或 dynamic-tool），随消息落库
 * 持久化，刷新/会话恢复后从 tool part 还原三态。
 * recordApplicationStatus 的预览态（phase=preview）由确认卡（record-status-card）
 * 渲染，本组件排除，避免与确认卡重复。
 */

export type ToolStepState = 'running' | 'completed' | 'failed';

export type ToolStep = {
  toolCallId: string;
  toolName: string;
  state: ToolStepState;
  /** 完成态的工具输出（仅 completed 有意义） */
  output: unknown;
  /** 失败原因（仅 failed 有意义）：业务错误 message 或工具执行错误文本 */
  errorMessage: string | null;
  /** 业务错误 hint（仅业务失败时有值，可选） */
  errorHint: string | null;
};

/** 工具展示名：中文标签；未收录的工具回退原始 toolName */
const TOOL_LABELS: Record<string, string> = {
  importResume: '导入简历',
  listResumes: '查看简历',
  analyzeResume: '分析简历',
  importJobOpportunity: '导入岗位',
  listJobOpportunities: '查看岗位',
  matchJob: '岗位匹配',
  discoverChannels: '渠道发现',
  tailoredResume: '生成专属简历',
  applyJob: '投递管理',
  recordApplicationStatus: '记录投递后状态',
  prepareInterview: '面试准备',
  getMemory: '读取记忆',
  setMemory: '写入记忆',
  readSkill: '读取技能',
  planCreate: '创建计划',
  planUpdate: '更新计划',
  planRead: '读取计划',
  recordLesson: '记录教训',
  searchLessons: '检索教训',
};

export function toolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? toolName;
}

/** 投递/结果状态的中文标签（applyJob / recordApplicationStatus 摘要与详情用） */
const STATUS_LABELS: Record<string, string> = {
  applying: '投递中',
  applied: '已投递',
  skipped: '已跳过',
  interview: '面试',
  offer: 'Offer',
  hired: '已入职',
  rejected: '已拒绝',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * 从消息的 tool part 提取步骤卡片列表（三态判定 + recordApplicationStatus 预览态排除）：
 * - state=output-available：完成（ok!==false）或业务失败（{ok:false,error}）
 * - state=output-error：执行失败（errorText）
 * - state=input-streaming/input-available：运行中
 * - 其余 state（SDK approval 流程）本项目不使用，跳过不渲染
 */
export function collectToolSteps(message: UIMessage): ToolStep[] {
  const steps: ToolStep[] = [];
  for (const part of message.parts) {
    if (!isToolUIPart(part)) continue;
    const toolName = part.type === 'dynamic-tool' ? part.toolName : part.type.slice('tool-'.length);

    if (part.state === 'output-available') {
      const output = part.output;
      // recordApplicationStatus 预览态（phase=preview）走确认卡，步骤卡不渲染
      if (
        toolName === 'recordApplicationStatus' &&
        isRecord(output) &&
        output.ok === true &&
        output.phase === 'preview'
      ) {
        continue;
      }
      if (isRecord(output) && output.ok === false) {
        const err = isRecord(output.error) ? output.error : null;
        steps.push({
          toolCallId: part.toolCallId,
          toolName,
          state: 'failed',
          output,
          errorMessage: typeof err?.message === 'string' ? err.message : '工具执行失败',
          errorHint: typeof err?.hint === 'string' ? err.hint : null,
        });
      } else {
        steps.push({
          toolCallId: part.toolCallId,
          toolName,
          state: 'completed',
          output,
          errorMessage: null,
          errorHint: null,
        });
      }
      continue;
    }
    if (part.state === 'output-error') {
      steps.push({
        toolCallId: part.toolCallId,
        toolName,
        state: 'failed',
        output: undefined,
        errorMessage: part.errorText ?? '工具执行失败',
        errorHint: null,
      });
      continue;
    }
    if (part.state === 'input-streaming' || part.state === 'input-available') {
      steps.push({
        toolCallId: part.toolCallId,
        toolName,
        state: 'running',
        output: undefined,
        errorMessage: null,
        errorHint: null,
      });
    }
  }
  return steps;
}

/** 完成态一句摘要：从输出提取关键字段（count/评分/关键标识等）；无法提取返回 null（调用方兜底「完成」） */
export function extractSuccessSummary(toolName: string, output: unknown): string | null {
  if (!isRecord(output)) return null;
  switch (toolName) {
    case 'listResumes':
      return typeof output.count === 'number' ? `共 ${output.count} 份简历` : null;
    case 'listJobOpportunities':
      return typeof output.count === 'number' ? `共 ${output.count} 个岗位` : null;
    case 'analyzeResume':
      return typeof output.overallScore === 'number' ? `综合评分 ${output.overallScore}` : null;
    case 'matchJob':
      return typeof output.overallScore === 'number' ? `匹配分 ${output.overallScore}` : null;
    case 'discoverChannels':
      return typeof output.channelsCount === 'number' ? `发现 ${output.channelsCount} 个渠道` : null;
    case 'importResume':
      return typeof output.name === 'string' ? `已导入「${output.name}」` : null;
    case 'importJobOpportunity':
      return '已保存岗位';
    case 'applyJob':
      if (output.phase === 'preview') return '已生成投递摘要';
      return typeof output.status === 'string'
        ? `已推进为${STATUS_LABELS[output.status] ?? output.status}`
        : null;
    case 'recordApplicationStatus':
      return typeof output.status === 'string'
        ? `已记录为${STATUS_LABELS[output.status] ?? output.status}`
        : null;
    case 'prepareInterview': {
      const summary = isRecord(output.summary) ? output.summary : null;
      return summary && typeof summary.questionsCount === 'number'
        ? `已生成 ${summary.questionsCount} 道面试题`
        : null;
    }
    case 'getMemory':
      return typeof output.count === 'number' ? `已读取 ${output.count} 块记忆` : null;
    case 'setMemory':
      return typeof output.label === 'string' ? `已更新记忆「${output.label}」` : null;
    case 'readSkill':
      return typeof output.name === 'string' ? `已加载技能「${output.name}」` : null;
    case 'planCreate':
      return typeof output.taskId === 'string' ? `已创建计划（${output.taskId}）` : null;
    case 'planUpdate': {
      const summary = isRecord(output.planSummary) ? output.planSummary : null;
      return summary && typeof summary.currentStepTitle === 'string'
        ? `已推进至「${summary.currentStepTitle}」`
        : null;
    }
    case 'planRead':
      return typeof output.taskId === 'string' ? `已读取计划（${output.taskId}）` : null;
    case 'recordLesson':
      return '教训已沉淀';
    case 'searchLessons':
      return typeof output.count === 'number' ? `找到 ${output.count} 条教训` : null;
    default:
      return null;
  }
}

/** 详情排除字段：嵌套对象/大文本/面向模型的辅助字段不进输出要点 */
const DETAIL_EXCLUDE_KEYS = new Set([
  'ok',
  'hint',
  'next',
  'preview',
  'planMarkdown',
  'content',
  'value',
  'summary',
  'planSummary',
  'byType',
  'lesson',
  'resumes',
  'jobOpportunities',
  'channels',
  'lessons',
  'blocks',
]);

/** 详情键的中文展示名（未收录的键保留原始字段名） */
const DETAIL_KEY_LABELS: Record<string, string> = {
  count: '数量',
  charCount: '字符数',
  overallScore: '综合评分',
  channelsCount: '渠道数',
  phase: '阶段',
  status: '状态',
  name: '名称',
  label: '记忆块',
  taskId: '任务',
  resumeId: '简历',
  jobOpportunityId: '岗位',
  sourceType: '来源',
  currentStatus: '当前状态',
  targetStatus: '目标状态',
};

const DETAIL_VALUE_MAX = 40;

/** 完成态输出要点：顶层标量字段（排除大字段），最多 4 行，长值截断 */
export function extractSuccessDetails(
  toolName: string,
  output: unknown,
): Array<{ key: string; value: string }> {
  if (!isRecord(output)) return [];
  const lines: Array<{ key: string; value: string }> = [];
  for (const [rawKey, value] of Object.entries(output)) {
    if (lines.length >= 4) break;
    if (DETAIL_EXCLUDE_KEYS.has(rawKey)) continue;
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') continue;
    const raw = typeof value === 'string' ? value : String(value);
    const mapped =
      rawKey === 'status' || rawKey === 'targetStatus' || rawKey === 'currentStatus'
        ? STATUS_LABELS[raw] ?? raw
        : raw;
    lines.push({
      key: DETAIL_KEY_LABELS[rawKey] ?? rawKey,
      value: mapped.length > DETAIL_VALUE_MAX ? `${mapped.slice(0, DETAIL_VALUE_MAX)}…` : mapped,
    });
  }
  return lines;
}

/** 重试消息文本：以用户消息触发模型重跑失败的工具（复用会话 id 发送，同确认消息通道） */
export function buildRetryMessage(toolName: string): string {
  return `请重试刚才失败的「${toolLabel(toolName)}」操作`;
}

export function ToolStepCard({
  step,
  onRetry,
  busy,
}: {
  step: ToolStep;
  onRetry?: (text: string) => void;
  busy: boolean;
}) {
  const [clicked, setClicked] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const disabled = busy || clicked || !onRetry;
  const label = toolLabel(step.toolName);
  const detailLines =
    step.state === 'completed' ? extractSuccessDetails(step.toolName, step.output) : [];

  const stateLabel = step.state === 'running' ? '运行中' : step.state === 'failed' ? '失败' : '已完成';

  return (
    <div
      role="status"
      aria-label={`工具步骤：${label}（${stateLabel}）`}
      className={cn(
        'w-full max-w-md rounded-2xl border px-4 py-3 shadow-soft',
        step.state === 'failed' ? 'border-red-200/70 bg-red-500/[0.04]' : 'border-slate-200/70 bg-white',
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-full',
            step.state === 'failed'
              ? 'bg-red-500/10 text-red-600'
              : step.state === 'running'
                ? 'bg-indigo-500/10 text-indigo-600'
                : 'bg-emerald-500/10 text-emerald-600',
          )}
        >
          {step.state === 'running' ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : step.state === 'failed' ? (
            <XCircle className="size-4" aria-hidden />
          ) : (
            <Wrench className="size-4" aria-hidden />
          )}
        </span>
        <span className="truncate text-sm font-semibold text-slate-700">{label}</span>

        {step.state === 'running' && (
          <span className="ml-auto shrink-0 rounded-full bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-700">
            运行中
          </span>
        )}
        {step.state === 'completed' && (
          <span className="ml-auto flex min-w-0 items-center gap-1 text-sm text-slate-600">
            <Check className="size-3.5 shrink-0 text-emerald-600" aria-hidden />
            <span className="truncate">{extractSuccessSummary(step.toolName, step.output) ?? '完成'}</span>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-label={expanded ? '收起详情' : '展开详情'}
              className="ml-1 shrink-0 rounded-md p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
          </span>
        )}
      </div>

      {step.state === 'completed' && expanded && (
        <div className="mt-2.5 space-y-1 border-t border-slate-100 pt-2">
          {detailLines.map((line) => (
            <div key={line.key} className="flex items-baseline gap-2 text-xs">
              <span className="shrink-0 text-slate-400">{line.key}</span>
              <span className="min-w-0 break-all text-slate-600">{line.value}</span>
            </div>
          ))}
          {detailLines.length === 0 && <p className="text-xs text-slate-400">无更多输出要点</p>}
        </div>
      )}

      {step.state === 'failed' && (
        <div className="mt-2.5">
          <p className="text-sm font-medium text-red-600">{step.errorMessage}</p>
          {step.errorHint && <p className="mt-1 text-xs text-slate-500">{step.errorHint}</p>}
          <Button
            size="sm"
            variant="destructive"
            disabled={disabled}
            className="mt-2.5"
            onClick={() => {
              if (disabled) return;
              setClicked(true);
              onRetry(buildRetryMessage(step.toolName));
            }}
          >
            <RotateCcw className="size-3.5" aria-hidden />
            {clicked ? '已发送重试' : '重试'}
          </Button>
        </div>
      )}
    </div>
  );
}
