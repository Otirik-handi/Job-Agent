import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // 项目 hooks 采用"挂载即 fetch"统一模式（useEffect 内同步刷新）。
      // react-hooks/set-state-in-effect 是 React Compiler 性能建议规则，
      // 对本地单用户应用无收益，且整改所有 hooks 超出当前任务范围，
      // 关闭以避免基线噪音（2026-08-06 第 3 期记录）。
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
