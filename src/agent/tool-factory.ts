import { tool } from 'ai';
import type { Tool } from 'ai';
import type { ZodType, z } from 'zod';

export type ToolContext = {
  /** 结构化 LLM 调用（工具内部再调模型） */
  callStructured: typeof import('./llm-call').callStructured;
  /** 日志（敏感信息过滤后写入，见 AGENTS.md 硬约束） */
  log: (level: 'info' | 'warn' | 'error', message: string) => void;
};

export type DomainToolOptions<INPUT extends ZodType, OUTPUT> = {
  name: string;
  description: string;
  inputSchema: INPUT;
  progress: { start: string; done: string };
  execute: (args: z.infer<INPUT>, ctx: ToolContext) => Promise<OUTPUT>;
};

/** 等价于 ai v7 内部 ExecutableTool（execute 必须存在，可注册进 ToolSet） */
export type ExecutableDomainTool<INPUT extends ZodType, OUTPUT> = Tool<
  z.infer<INPUT>,
  OUTPUT,
  ToolContext
> & { execute: NonNullable<Tool<z.infer<INPUT>, OUTPUT, ToolContext>['execute']> };

export function createDomainTool<INPUT extends ZodType, OUTPUT>(
  options: DomainToolOptions<INPUT, OUTPUT>,
) {
  const { name, description, inputSchema, progress, execute } = options;
  // ai v7 的 tool() 无法在泛型参数下推断 INPUT/OUTPUT（FlexibleSchema 为
  // zod v3 兼容 | zod v4 core.$ZodType 联合；NeverOptional<OUTPUT> 在 OUTPUT
  // 为未解析类型参数时会坍缩到 never 分支，导致 execute/outputSchema 全部变成
  // undefined 类型而报错）。因此：
  // 1) 显式指定 tool 泛型 INPUT = z.infer<INPUT>，OUTPUT 用 any 桥接（成员检查
  //    仍生效：inputSchema 需可赋值给 FlexibleSchema、execute 返回需兼容）；
  // 2) 结果再断言回 ExecutableDomainTool，使 createDomainTool 返回值在调用处
  //    （具体 schema）保有准确的输入/输出类型，且可注册进 ToolSet。
  return tool<z.infer<INPUT>, any, ToolContext>({
    description,
    inputSchema: inputSchema as z.ZodType<z.infer<INPUT>, any>,
    execute: async (args) => {
      const startedAt = Date.now();
      try {
        const result = await execute(args as z.infer<INPUT>, {
          callStructured: (await import('./llm-call')).callStructured,
          log: (level, message) => {
            console.log(`[tool:${name}] ${level} ${message} ${Date.now() - startedAt}ms`);
          },
        });
        console.log(`[tool:${name}] info completed ${Date.now() - startedAt}ms`);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`[tool:${name}] error failed ${Date.now() - startedAt}ms: ${message}`);
        throw new Error(JSON.stringify({ code: 'TOOL_FAILED', message }));
      }
    },
  }) as unknown as ExecutableDomainTool<INPUT, OUTPUT>;
}
