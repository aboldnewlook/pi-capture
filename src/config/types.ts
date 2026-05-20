export interface LinearLabels {
  bug: string;
  techDebt: string;
  feature: string;
  specGap: string;
  triage: string;
  ownerReview: string;
}

export interface LinearConfig {
  initiative: string;
  projectPattern: string;
  projectPrefix?: string;
  techDebtMilestone: string;
  labels: LinearLabels;
}

export interface CapturePolicies {
  asyncMayCreateMilestone: boolean;
  asyncMayStubSpec: boolean;
  asyncMayCreateLabels: boolean;
}

export interface CaptureConfig {
  backend: "linear-cli";
  linear: LinearConfig;
  prompts: string[];
  policies: CapturePolicies;
}

export const DEFAULT_LABELS: LinearLabels = {
  bug: "bug",
  techDebt: "tech-debt",
  feature: "feature",
  specGap: "spec-gap",
  triage: "needs-triage",
  ownerReview: "owner-review",
};

export const DEFAULT_POLICIES: CapturePolicies = {
  asyncMayCreateMilestone: false,
  asyncMayStubSpec: false,
  asyncMayCreateLabels: false,
};
