export interface CiStep {
  name?: string;
  started_at?: string | null;
  completed_at?: string | null;
  conclusion?: string | null;
}

export interface CiJob {
  name?: string;
  started_at?: string | null;
  completed_at?: string | null;
  conclusion?: string | null;
  steps?: CiStep[];
}

export interface CiRun {
  databaseId?: number;
  headBranch?: string;
  event?: string;
  createdAt?: string;
  status?: string;
  conclusion?: string;
}

export interface CiStats {
  min: number;
  avg: number;
  median: number;
  p95: number;
  max: number;
}

export interface AnalyzedRun {
  id?: number;
  branch?: string;
  event?: string;
  createdAt?: string;
  conclusion?: string;
  isSharded: boolean;
  checkConclusion: string;
  totalDuration: number | null;
  lintDuration: number | null;
  buildJobDuration: number | null;
  testJobs?: Record<string, number | null>;
  test1Duration: number | null;
  test2Duration: number | null;
  test3Duration: number | null;
  checkSummaryDuration: number | null;
  checkDuration: number | null;
  checkoutDuration: number | null;
  setupNodeDuration: number | null;
  npmCiDuration: number | null;
  typecheckDuration: number | null;
  lintStepDuration: number | null;
  formatDuration: number | null;
  testStepConclusion: string;
  testDuration: number | null;
  buildStepDuration: number | null;
}

export function getStepDuration(
  steps: CiStep[] | undefined,
  matchFn: (step: CiStep) => boolean,
): number | null;

export function getJobDuration(job: CiJob | undefined): number | null;

export function stats(arr: number[]): CiStats;

export function analyzeRunJobs(run: CiRun, jobs?: CiJob[]): AnalyzedRun;
