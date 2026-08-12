import type { Scenario } from './types';
import { resumeAnalysisScenario } from './resume-analysis';
import { jdMatchScenario } from './jd-match';
import { interviewPrepScenario } from './interview-prep';
import { offerCompareScenario } from './offer-compare';
import { coverLetterScenario } from './cover-letter';
import { tailoredResumeScenario } from './tailored-resume';
import { applyJobScenario } from './apply-job';
import { planTaskScenario } from './plan-task';
import { recordStatusScenario } from './record-status';
import { midCourseCorrectionScenario } from './mid-course-correction';
import { toolFailureRetryScenario } from './tool-failure-retry';
import { memoryLimitRecoveryScenario } from './memory-limit-recovery';
import { memoryRecallScenario } from './memory-recall';
import { searchMessagesScenario } from './search-messages';
import { companyResearchScenario } from './company-research';

export const scenarios: Scenario[] = [
  resumeAnalysisScenario, jdMatchScenario, interviewPrepScenario, offerCompareScenario, coverLetterScenario,
  tailoredResumeScenario, applyJobScenario, planTaskScenario, recordStatusScenario,
  midCourseCorrectionScenario, toolFailureRetryScenario, memoryLimitRecoveryScenario, memoryRecallScenario,
  searchMessagesScenario,
  // 高频族末尾：web 工具链端到端（依赖 fetch 网络隔离，mock 层由 web-network-stub 接管全局 fetch）
  companyResearchScenario,
];
