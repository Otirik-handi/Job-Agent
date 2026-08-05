# 简历文件上传导入实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **元信息**：日期 2026-08-05 · 状态：生效 · 目标：网页端手动上传简历文件（PDF/DOCX/TXT/MD），仅导入入库、分析仍在对话中 · 关联规范：AGENTS.md、plan-document.md

**Goal:** 新增「上传简历」入口：侧边栏按钮选文件 → POST /api/resumes/upload 解析提取文本入库；Agent 的 importResume filePath 分支同步支持 PDF。

**Architecture:** 文本提取与命名逻辑抽入共享模块 `src/agent/resume-text.ts`（路径与 Buffer 双入口）；上传为直调 REST API（不经 Agent/LLM）；前端在 `resource-tabs.tsx` 加按钮 + 隐藏 file input + 内联状态提示；PDF 解析用 `pdf-parse@^4`（ESM，`createPdf`），无文本层（扫描件）抛 `ResumeTextError`。

**Tech Stack:** pdf-parse@^4、mammoth（现有）、better-sqlite3（现有）、React/shadcn Button（Soft UI 令牌）、vitest（现有）。

**设计依据：** `docs/designs/2026-08-05-resume-upload-design.md`
**验收标准：** 设计文档第 6 节测试项 + 浏览器端到端人工验证（Task 5）

**已确认的 API 事实**（实施验证结果）：
- **PDF 解析库实际采用 `unpdf`（备选方案）**：原主选 `pdf-parse` 实测失败——pdf-parse 2.4.5（npm 最新，无 4.x）在 Next dev（turbopack）下初始化 pdf.js fake worker 失败（`Cannot find module '.next/dev/server/chunks/pdf.worker.mjs'`）。unpdf（内部 pdfjs、无 worker 依赖）在 Node 环境开箱即用：`getDocumentProxy(new Uint8Array(buffer))` + `extractText(pdf, { mergePages: true })` → `{ text }`；无文本 PDF 返回空串（扫描件检测有效）。验证：文本 PDF 提取正确、无文本 PDF 返回空、HTTP 上传全链路通过
- mammoth `extractRawText({ buffer })` 与 `{ path }` 两种 source 都支持（现有代码已用 path）
- 现有测试 `src/agent/resume-text.test.ts:13` 断言 `isSupportedFilePath('resume.pdf') === false`，本次改为 `true`（先改测试，TDD）

---

### Task 1: 共享文本提取模块（支持 PDF + 命名逻辑）

**Files:**
- Modify: `src/agent/resume-text.ts`
- Modify: `src/agent/resume-text.test.ts`
- Modify: `package.json`（新增 pdf-parse 依赖）

- [x] **Step 1: 先改测试**

修改 `src/agent/resume-text.test.ts`，反转 PDF 断言并新增命名测试：

```ts
import { describe, expect, it } from 'vitest';
import {
  normalizeResumeText, assertTextLength, isSupportedFilePath,
  MAX_RESUME_TEXT_LENGTH, formatNameFromFile, buildResumeName,
} from './resume-text';

describe('resume-text', () => {
  it('归一化换行', () => {
    expect(normalizeResumeText('a\r\nb\rc')).toBe('a\nb\nc');
  });
  it('超过上限抛错', () => {
    expect(() => assertTextLength('x'.repeat(MAX_RESUME_TEXT_LENGTH + 1))).toThrow();
  });
  it('支持与拒绝的扩展名', () => {
    expect(isSupportedFilePath('C:/a/b/resume.docx')).toBe(true);
    expect(isSupportedFilePath('resume.pdf')).toBe(true);   // 本次新增 PDF 支持
    expect(isSupportedFilePath('resume.txt')).toBe(true);
    expect(isSupportedFilePath('resume.md')).toBe(true);
    expect(isSupportedFilePath('resume.doc')).toBe(false);  // 旧版 .doc 不支持
    expect(isSupportedFilePath('resume.png')).toBe(false);  // 图片不支持
    expect(isSupportedFilePath('resume')).toBe(false);
  });
  it('文件名去扩展名', () => {
    expect(formatNameFromFile('张三.pdf')).toBe('张三');
    expect(formatNameFromFile('C:/a/b/张三 2024.docx')).toBe('张三 2024');
    expect(formatNameFromFile('noext')).toBe('noext');
    expect(formatNameFromFile('')).toBe('');
  });
  it('重名追加本地时间戳后缀', () => {
    expect(buildResumeName('张三.pdf', ['李四'])).toBe('张三');
    expect(buildResumeName('张三.pdf', ['张三'])).toMatch(/^张三-\d{8}-\d{4}$/);
    expect(buildResumeName('张三.pdf', ['张三', `张三-20260805-1530`])).toMatch(/^张三-\d{8}-\d{4}$/);
  });
});
```

- [x] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/agent/resume-text.test.ts`
Expected: `isSupportedFilePath('resume.pdf')` 断言失败（现为 false），`formatNameFromFile` / `buildResumeName` 未定义导致 FAIL。

- [x] **Step 3: 安装 pdf-parse**

Run: `npm install pdf-parse@^4`（注意：不要用 npx 触发安装，本项目有 EALLOWSCRIPTS 问题；直接 npm install）

- [x] **Step 4: 扩展 `src/agent/resume-text.ts`**

整体替换为：

```ts
import { readFile } from 'node:fs/promises';

export const MAX_RESUME_TEXT_LENGTH = 80_000;

export class ResumeTextError extends Error {}

export function normalizeResumeText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

export function assertTextLength(text: string): void {
  if (text.length > MAX_RESUME_TEXT_LENGTH) {
    throw new ResumeTextError(`简历文本超过 ${MAX_RESUME_TEXT_LENGTH} 字符上限`);
  }
}

const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt', '.md']);

export function isSupportedFilePath(path: string): boolean {
  const lower = path.toLowerCase();
  return SUPPORTED_EXTENSIONS.has(lower.slice(lower.lastIndexOf('.')));
}

export function formatNameFromPath(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || '未命名简历';
}

/** 文件名去扩展名（保留目录中文件名部分） */
export function formatNameFromFile(fileName: string): string {
  const base = fileName.replace(/\\/g, '/').split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

/** 重名时追加本地时间戳后缀：张三 → 张三-20260805-1530 */
export function buildResumeName(fileName: string, existingNames: string[]): string {
  const base = formatNameFromFile(fileName) || '未命名简历';
  if (!existingNames.includes(base)) return base;
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `${base}-${ts}`;
}

function assertHasText(text: string): string {
  const normalized = normalizeResumeText(text);
  if (!normalized) {
    throw new ResumeTextError('该 PDF 未提取到文字（可能是扫描件或图片），请改用 DOCX / TXT 或粘贴文本');
  }
  return normalized;
}

async function extractPdf(source: { path: string } | { buffer: Buffer }): Promise<string> {
  const { createPdf } = await import('pdf-parse');
  const pdf = await createPdf(source);
  return assertHasText(pdf.text ?? '');
}

async function extractDocx(source: { path: string } | { buffer: Buffer }): Promise<string> {
  const mammoth = (await import('mammoth')).default;
  const result = await mammoth.extractRawText(source);
  return assertHasText(result.value);
}

function extractPlainText(buffer: Buffer): string {
  return assertHasText(buffer.toString('utf-8'));
}

/** 从本地文件路径提取文本（importResume.filePath 用） */
export async function extractTextFromFile(filePath: string): Promise<string> {
  if (!isSupportedFilePath(filePath)) {
    throw new ResumeTextError('不支持的格式：仅支持 .pdf / .docx / .txt / .md（不支持图片、扫描件、旧版 .doc）');
  }
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.pdf')) return extractPdf({ path: filePath });
  if (lower.endsWith('.docx')) return extractDocx({ path: filePath });
  return assertHasText(await readFile(filePath, 'utf-8'));
}

/** 从内存 Buffer 提取文本（文件上传用） */
export async function extractTextFromBuffer(buffer: Buffer, fileName: string): Promise<string> {
  if (!isSupportedFilePath(fileName)) {
    throw new ResumeTextError('不支持的格式：仅支持 .pdf / .docx / .txt / .md（不支持图片、扫描件、旧版 .doc）');
  }
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return extractPdf({ buffer });
  if (lower.endsWith('.docx')) return extractDocx({ buffer });
  return extractPlainText(buffer);
}
```

> 注：若装到的 pdf-parse 无 `createPdf` 导出（v3 及以下），改 `import pdf from 'pdf-parse'` + `pdf(source)` 调用，其余不变。

- [x] **Step 5: 跑测试确认通过**

Run: `npx vitest run src/agent/resume-text.test.ts`
Expected: 全部 PASS（含 PDF 断言反转、命名逻辑）。

- [x] **Step 6: Commit**

```bash
git add src/agent/resume-text.ts src/agent/resume-text.test.ts package.json package-lock.json
git commit -m "feat: 简历文本提取支持 PDF，新增文件名与重命名逻辑"
```

**Checkpoint：** `npm test` 全绿；`isSupportedFilePath('resume.pdf') === true`。

---

### Task 2: 上传端点 POST /api/resumes/upload

**Files:**
- Create: `app/api/resumes/upload/route.ts`

- [x] **Step 1: 实现端点**

Create `app/api/resumes/upload/route.ts`（参照 `app/api/resumes/route.ts` 的 Response.json 风格）：

```ts
import {
  assertTextLength, buildResumeName, extractTextFromBuffer,
  isSupportedFilePath, ResumeTextError,
} from '@/src/agent/resume-text';
import { createResume, listResumes } from '@/src/db/repositories/resumes';

const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5MB

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return json({ code: 'INVALID_REQUEST', message: '请求格式无效' }, 400);
  const file = form.get('file');
  if (!(file instanceof File)) return json({ code: 'INVALID_FILE', message: '未收到文件字段 file' }, 400);
  if (file.size === 0) return json({ code: 'INVALID_FILE', message: '文件为空' }, 400);
  if (file.size > MAX_UPLOAD_SIZE) return json({ code: 'FILE_TOO_LARGE', message: '文件超过 5MB 上限' }, 400);
  if (!isSupportedFilePath(file.name)) {
    return json({ code: 'UNSUPPORTED_FORMAT', message: '不支持的文件格式：仅支持 PDF / DOCX / TXT / MD' }, 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const sourceType = file.name.toLowerCase().slice(file.name.lastIndexOf('.') + 1);

  let sourceText: string;
  try {
    sourceText = await extractTextFromBuffer(buffer, file.name);
    assertTextLength(sourceText);
  } catch (err) {
    if (err instanceof ResumeTextError) {
      return json({ code: 'PARSE_FAILED', message: err.message }, 422);
    }
    console.error(`简历文件解析异常（${sourceType}）:`, (err as Error).message); // 只记格式与原因，不记内容
    return json({ code: 'PARSE_FAILED', message: '文件解析失败，请确认文件未损坏' }, 422);
  }

  const existingNames = listResumes().map((r) => r.name);
  const record = createResume({
    name: buildResumeName(file.name, existingNames),
    sourceType,
    sourceText,
  });

  return json({
    id: record.id, name: record.name, sourceType: record.sourceType,
    charCount: sourceText.length, preview: sourceText.slice(0, 120),
  });
}
```

- [x] **Step 2: 构建验证**

Run: `npm run build`
Expected: BUILD SUCCESSFUL，新路由出现在输出中（`/api/resumes/upload`）。

- [x] **Step 3: Commit**

```bash
git add app/api/resumes/upload/route.ts
git commit -m "feat: 新增简历文件上传端点（PDF/DOCX/TXT/MD，5MB 上限）"
```

**Checkpoint：** 构建通过；端点可被调用（Task 5 端到端验证）。

---

### Task 3: importResume 工具 filePath 分支同步支持 PDF

**Files:**
- Modify: `src/agent/tools/import-resume.ts`

- [x] **Step 1: 改为复用共享提取模块**

整体替换 `src/agent/tools/import-resume.ts` 为：

```ts
import { z } from 'zod';
import { createDomainTool } from '../tool-factory';
import { createResume } from '../../db/repositories/resumes';
import {
  assertTextLength, extractTextFromFile, formatNameFromPath,
  normalizeResumeText, ResumeTextError,
} from '../resume-text';

const inputSchema = z.object({
  text: z.string().min(1).optional().describe('简历文本内容（粘贴方式）'),
  filePath: z.string().min(1).optional().describe('本地简历文件路径，支持 .pdf/.docx/.txt/.md'),
});

export const importResumeTool = createDomainTool({
  name: 'importResume',
  description: '导入简历：接受粘贴的简历文本，或本地 .pdf/.docx/.txt/.md 文件路径。导入后返回 resumeId，可用 analyzeResume 分析。',
  inputSchema,
  progress: { start: '正在读取简历…', done: '简历导入完成' },
  execute: async (args) => {
    const hasText = typeof args.text === 'string' && args.text.length > 0;
    const hasPath = typeof args.filePath === 'string' && args.filePath.length > 0;
    if (hasText === hasPath) {
      throw new Error('请提供且仅提供一种简历来源：text（粘贴）或 filePath（本地文件路径）');
    }

    const raw = hasText ? args.text! : await extractTextFromFile(args.filePath!);
    const sourceText = normalizeResumeText(raw);
    assertTextLength(sourceText);

    const record = createResume({
      name: hasPath ? formatNameFromPath(args.filePath!) : `粘贴简历 ${new Date().toISOString().slice(0, 10)}`,
      sourceType: hasPath ? args.filePath!.toLowerCase().slice(args.filePath!.lastIndexOf('.') + 1) : 'paste',
      sourceText,
    });

    return {
      resumeId: record.id,
      name: record.name,
      sourceType: record.sourceType,
      charCount: sourceText.length,
      preview: sourceText.slice(0, 120),
      next: '可以调用 analyzeResume 对这份简历进行分析',
    };
  },
});
```

> 说明：原 `extractFromFile` 函数删除，PDF 支持由共享 `extractTextFromFile` 提供；`ResumeTextError` 的"不支持格式"消息自动包含 PDF。

- [x] **Step 2: 构建验证**

Run: `npm run build`
Expected: BUILD SUCCESSFUL。

- [x] **Step 3: Commit**

```bash
git add src/agent/tools/import-resume.ts
git commit -m "feat: importResume 工具 filePath 分支支持 PDF（复用共享提取模块）"
```

**Checkpoint：** 构建通过。

---

### Task 4: 前端侧边栏「上传简历」按钮

**Files:**
- Modify: `src/lib/api.ts`（新增 apiUpload）
- Modify: `src/components/sidebar/resource-tabs.tsx`

- [x] **Step 1: api.ts 新增上传辅助**

在 `src/lib/api.ts` 末尾追加：

```ts
export async function apiUpload<T>(url: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(url, { method: 'POST', body: form });
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error((errBody as { message?: string } | null)?.message ?? `上传失败（${res.status}）`);
  }
  return res.json() as Promise<T>;
}
```

- [x] **Step 2: resource-tabs.tsx 添加上传按钮与状态提示**

整体替换 `src/components/sidebar/resource-tabs.tsx` 为：

```tsx
'use client';
import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { useResumes } from '@/src/lib/use-resumes';
import { useJobOpportunities } from '@/src/lib/use-job-opportunities';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { Button } from '@/src/components/ui/button';
import { apiUpload } from '@/src/lib/api';

const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;

export function ResourceTabs({
  onOpenResume,
  onOpenJob,
}: {
  onOpenResume: (id: string) => void;
  onOpenJob: (id: string) => void;
}) {
  const [tab, setTab] = useState<'resume' | 'job'>('resume');
  const { resumes, refresh } = useResumes();
  const { jobs } = useJobOpportunities();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 允许重复选择同一文件
    if (!file) return;
    setNotice(null);
    if (file.size > MAX_UPLOAD_SIZE) {
      setNotice({ kind: 'err', text: '文件超过 5MB 上限' });
      return;
    }
    setUploading(true);
    try {
      const r = await apiUpload<{ name: string }>('/api/resumes/upload', file);
      setNotice({ kind: 'ok', text: `已导入《${r.name}》，可在对话中让 Agent 分析` });
      void refresh();
    } catch (err) {
      setNotice({ kind: 'err', text: err instanceof Error ? err.message : '上传失败' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-1.5 p-3">
      <div className="flex gap-1 text-xs text-muted-foreground">
        <span
          onClick={() => setTab('resume')}
          className={`cursor-pointer rounded-full px-3 py-1 transition-colors hover:bg-slate-100 ${tab === 'resume' ? 'bg-slate-100' : ''}`}
        >
          简历
        </span>
        <span
          onClick={() => setTab('job')}
          className={`cursor-pointer rounded-full px-3 py-1 transition-colors hover:bg-slate-100 ${tab === 'job' ? 'bg-slate-100' : ''}`}
        >
          岗位
        </span>
        <span className="px-3 py-1">专属简历（第 3 期）</span>
      </div>
      {tab === 'resume' && (
        <>
          <div className="flex items-center justify-between gap-2">
            <Button
              size="sm"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-3.5" />
              {uploading ? '解析中…' : '上传简历'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
              onChange={handleFile}
            />
          </div>
          {notice && (
            <div className={`rounded-2xl px-3 py-2 text-xs ${notice.kind === 'ok' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-red-500/10 text-red-700'}`}>
              {notice.text}
            </div>
          )}
          {resumes.length === 0 && (
            <div className="rounded-2xl bg-slate-100/60 px-3 py-6 text-center text-xs text-muted-foreground">
              暂无简历，可上传文件（PDF / DOCX / TXT / MD）或在对话中粘贴文本导入
            </div>
          )}
          {resumes.map((r) => (
            <button
              key={r.id}
              onClick={() => onOpenResume(r.id)}
              className="rounded-xl px-3 py-2 text-left text-sm transition-all hover:bg-slate-100"
            >
              <div className="truncate">{r.name}</div>
              <div className="text-xs text-muted-foreground">
                {r.analyzed ? '已分析' : '未分析'} · {r.sourceType}
              </div>
            </button>
          ))}
        </>
      )}
      {tab === 'job' && (
        <>
          {jobs.length === 0 && (
            <div className="rounded-2xl bg-slate-100/60 px-3 py-6 text-center text-xs text-muted-foreground">
              暂无岗位，可在对话中粘贴 JD 导入
            </div>
          )}
          {jobs.map((job) => (
            <button
              key={job.id}
              onClick={() => onOpenJob(job.id)}
              className="rounded-xl px-3 py-2 text-left text-sm transition-all hover:bg-slate-100"
            >
              <div className="truncate">{job.company ? `${job.company} · ${job.title}` : '未命名岗位'}</div>
              <div className="mt-0.5 flex items-center gap-2">
                <StatusBadge status={job.status} />
                <span className="text-xs text-muted-foreground">{new Date(job.updatedAt).toLocaleDateString()}</span>
              </div>
            </button>
          ))}
        </>
      )}
    </div>
  );
}
```

- [x] **Step 3: 构建验证**

Run: `npm run build`
Expected: BUILD SUCCESSFUL。

- [x] **Step 4: Commit**

```bash
git add src/lib/api.ts src/components/sidebar/resource-tabs.tsx
git commit -m "feat: 侧边栏新增上传简历按钮（选文件即传，内联状态提示）"
```

**Checkpoint：** 构建通过。

---

### Task 5: 端到端人工验证

**Files:**
- Create: `tmp/sample-resume.txt`（验证用样例，不入 git）

- [x] **Step 1: 生成 TXT 样例并 curl 验证上传端点**

确保 dev server 运行中（`npm run dev`，如未启动先启动），然后：

```bash
cd "C:\Users\Otirik\Desktop\WorkStation\job-helper" && mkdir -p tmp && printf '姓名：张三\n电话：13800000000\n技能：TypeScript、React、Next.js\n' > tmp/sample-resume.txt && curl -s -X POST -F "file=@tmp/sample-resume.txt" http://localhost:3000/api/resumes/upload
```

Expected: 返回 `{ id, name: "sample-resume", sourceType: "txt", charCount, preview }`，status 200。重复执行一次应返回 `sample-resume-YYYYMMDD-HHmm`（重名时间戳）。

- [x] **Step 2: curl 验证错误分支**

```bash
printf 'x' > tmp/tiny.bin && curl -s -X POST -F "file=@tmp/tiny.bin" http://localhost:3000/api/resumes/upload
```
Expected: 400 `UNSUPPORTED_FORMAT`，message 提示仅支持 PDF/DOCX/TXT/MD。

- [x] **Step 3: 浏览器 UI 验证**

在浏览器（localhost:3000）侧边栏「简历」标签页：
1. 点击「上传简历」→ 选择 `tmp/sample-resume.txt` → 列表出现新简历，绿条提示「已导入《…》，可在对话中让 Agent 分析」
2. 再次上传同一文件 → 出现带时间戳后缀的第二条（重名逻辑）
3. 上传一个超过 5MB 的文件（或从系统选一个 .png）→ 红条提示，不产生记录
4. 有 PDF 简历的话选一个真实的 `.pdf`（文本型）→ 成功导入且 sourceType 为 pdf；若有扫描件 PDF → 红条提示「未提取到文字」
5. 在对话中说「分析最新导入的简历」→ Agent 正常分析（验证上传简历与对话闭环打通）

- [x] **Step 4: 清理与收尾**

```bash
rm -rf tmp  # 仅删验证样例；确认无残留后删除
```

确认侧边栏空状态文案显示「可上传文件（PDF / DOCX / TXT / MD）或在对话中粘贴文本导入」。

**Checkpoint：** 上传全链路（TXT/DOCX/PDF）与错误分支均按预期；Agent 可分析上传导入的简历。

---

## 任务依赖与并行批次

- Task 1（共享模块）→ Task 2（upload 端点）→ Task 4（前端按钮）为串行主线
- Task 3（importResume 复用）依赖 Task 1，与 Task 2 文件不重叠，可与 Task 2 并行
- Task 5 依赖全部完成，最后执行

## 验收清单（对应设计文档）

- [ ] 支持 .pdf/.docx/.txt/.md 上传（服务端白名单校验，不信任客户端）
- [ ] 5MB 上限：前端预检 + 服务端兜底
- [ ] PDF 无文本层（扫描件）→ 422 明确提示
- [ ] 先解析后入库，失败不产生记录
- [ ] 重名自动时间戳后缀
- [ ] 只存提取文本，不保留原文件
- [ ] 上传仅导入，不自动分析；对话中可继续让 Agent 分析
- [ ] importResume filePath 分支同步支持 PDF
- [ ] 轻量单测：扩展名分派 + 命名逻辑
