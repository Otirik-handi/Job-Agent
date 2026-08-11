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

export const scenarios: Scenario[] = [
  resumeAnalysisScenario, jdMatchScenario, interviewPrepScenario, offerCompareScenario, coverLetterScenario,
  tailoredResumeScenario, applyJobScenario, planTaskScenario, recordStatusScenario,
];
