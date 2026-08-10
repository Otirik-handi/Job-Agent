import { tool } from 'ai';
import type { Tool } from 'ai';
import type { ZodType, z } from 'zod';

export type ToolContext = {
  /** 结构化 LLM 调用（工具内部再调模型） */
  callStructured: typeof import('./llm-call').callStructured;
  /** 日志（敏感信息过滤后写入，见 AGENTS.md 硬约束） */
  log: (level: 'info' | 'warn' | 'error', message: string) => void;
};

/** 结构化错误（规范见 .agents/specs/03-agent/agent-tooling-conventions.md「结构化错误契约」）：
 *  - code：稳定机器码，大写蛇形（如 JOB_MATCH_REQUIRED），供上层分支与测试断言，不承载人读文案
 *  - message：人读文案，展示给用户
 *  - hint：给模型的下一步建议，格式"发生了什么 + 下一步试什么" */
export type ToolError = { code: string; message: string; hint: string };

/** 结构化业务错误：工具内业务失败（前置条件不满足 / 数据不存在 / 超限等）优先作为
 *  { ok:false, error } 结果返回；需要跨层传递时也可抛出本错误，工厂透传为结果回到模型。
 *  仅未知/意外异常才允许以普通 Error 抛出，由工厂兜底为 TOOL_FAILED。 */
export class ToolExecutionError extends Error {
  readonly code: string;
  readonly hint: string;

  constructor(error: ToolError) {
    super(error.message);
    this.name = 'ToolExecutionError';
    this.code = error.code;
    this.hint = error.hint;
  }

  /** 结果形态的结构化错误（保持 code/message/hint 三字段） */
  toResult(): { ok: false; error: ToolError } {
    return { ok: false, error: { code: this.code, message: this.message, hint: this.hint } };
  }
}

/** 未知异常兜底错误码：仅工厂 catch 兜底分支使用（禁止工具层直接包装为 TOOL_FAILED） */
export const TOOL_FAILED_CODE = 'TOOL_FAILED';

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
  const { name, description, inputSchema, execute } = options;
  // ai v7 的 tool() 无法在泛型参数下推断 INPUT/OUTPUT（FlexibleSchema 为
  // zod v3 兼容 | zod v4 core.$ZodType 联合；NeverOptional<OUTPUT> 在 OUTPUT
  // 为未解析类型参数时会坍缩到 never 分支，导致 execute/outputSchema 全部变成
  // undefined 类型而报错）。因此：
  // 1) 显式指定 tool 泛型 INPUT = z.infer<INPUT>，OUTPUT 用 any 桥接（成员检查
  //    仍生效：inputSchema 需可赋值给 FlexibleSchema、execute 返回需兼容）；
  // 2) 结果再断言回 ExecutableDomainTool，使 createDomainTool 返回值在调用处
  //    （具体 schema）保有准确的输入/输出类型，且可注册进 ToolSet。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ai v7 泛型桥接，见上方注释
  return tool<z.infer<INPUT>, any, ToolContext>({
    description,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- zod v3/v4 联合类型桥接，见上方注释
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
        // 结构化错误（业务失败）：透传 code/message/hint 作为工具结果返回，
        // 错误即结果（对齐 MCP isError 语义），必须回到模型进入对话上下文
        if (err instanceof ToolExecutionError) {
          return err.toResult() as unknown as OUTPUT;
        }
        // 未知/意外异常：工厂兜底为 TOOL_FAILED，保留原始 message 便于排查；
        // catch 只做兜底，禁止剥掉工具抛出的结构化错误
        const message = err instanceof Error ? err.message : String(err);
        console.log(`[tool:${name}] error failed ${Date.now() - startedAt}ms: ${message}`);
        return {
          ok: false,
          error: {
            code: TOOL_FAILED_CODE,
            message,
            hint: '工具执行遇到未知异常。请稍后重试；若持续失败，请检查系统配置或联系维护者。',
          },
        } as unknown as OUTPUT;
      }
    },
  }) as unknown as ExecutableDomainTool<INPUT, OUTPUT>;
}
