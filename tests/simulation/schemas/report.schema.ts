import type { ValidationResult } from "./validation.schema.ts";

export type TimelineEntry = {
  sequence: number;
  runId: string;
  simulatedAt: string;
  realRecordedAt: string;
  actor: string;
  actionType: string;
  actionId: string;
  intent: string;
  requestSummary: Record<string, unknown>;
  responseSummary: Record<string, unknown>;
  agentDecisionSummary: Record<string, unknown> | null;
  domainActions: string[];
  stateChanges: string[];
  validationResults: ValidationResult[];
  durationMs: number;
  status: "PASS" | "FAIL" | "SKIP" | "ERROR";
  errorCode: string | null;
  testGeneratedContent: boolean;
};

export type Scorecard = {
  clarificationCount: number;
  confirmationCount: number;
  repeatedSuggestionCount: number;
  unnecessaryReplanCount: number;
  failedActionCount: number;
  recoveryCount: number;
  userCorrectionCount: number;
  frictionEvents: number;
  duplicateSuggestionCount: number;
  staleStateCount: number;
};

export type RunSummary = {
  runId: string;
  seed: number;
  gitSha: string;
  environment: string;
  personaId: string;
  scenarioId: string;
  personaVersion: string;
  scenarioVersion: string;
  schemaVersion: number;
  simulatedStart: string;
  simulatedEnd: string;
  realRunTime: string;
  actionCount: number;
  passCount: number;
  failCount: number;
  anomalyCount: number;
  normalizedHash: string;
};
