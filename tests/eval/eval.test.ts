import { describe, expect, it } from 'vitest';
import { createScriptedModel } from './mock-model';
import { runScenario } from './runner';
import { scenarios } from './scenarios';

describe.each(scenarios.map((s) => [s.id, s] as const))('评测场景 %s', (_id, scenario) => {
  it(scenario.description, async () => {
    const result = await runScenario(scenario, { model: createScriptedModel(scenario.mockScript) });
    expect(result.ok, result.ok ? '' : `失败：${result.error}\n（若为 unexpected LLM call，需补 mockScript；若为断言失败，见场景 assertFinalState）`).toBe(true);
  }, 60_000);
});
