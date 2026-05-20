export type IssueKind = "bug" | "tech-debt" | "feature" | "spec-gap";

export interface Issue {
  id: string;
  title: string;
  body: string;
  labels: string[];
  projectId: string;
  milestoneId: string | null;
  url: string;
}

export interface CreateIssueParams {
  title: string;
  body: string;
  labels: string[];
  projectId: string;
  milestoneId: string | null;
}

export type MilestoneKind = "tech-debt" | "named" | "none";

export interface MilestoneProposal {
  kind: MilestoneKind;
  name?: string;
}

export interface SpecProposal {
  stub: boolean;
  slug?: string;
}

export interface ResolvedProject {
  id: string;
  name: string;
}

export interface ResolvedMilestone {
  id: string;
  name: string;
}

export interface IBackendAdapter {
  /** Find the project for a given date (defaults to today). */
  resolveProject(date?: Date): Promise<ResolvedProject | null>;

  /** Find or create the Tech Debt milestone for a project. */
  resolveMilestone(projectId: string, kind: MilestoneKind, name?: string): Promise<ResolvedMilestone | null>;

  /** Create an issue. Returns the new issue ID. */
  createIssue(params: CreateIssueParams): Promise<string>;

  /** List issues labelled needs-triage. */
  listTriageQueue(projectId: string, triageLabel: string): Promise<Issue[]>;

  /** Patch an issue. */
  updateIssue(id: string, patch: Partial<Pick<Issue, "title" | "labels" | "milestoneId">>): Promise<void>;

  /** Add a single label to an issue. */
  addLabel(id: string, label: string): Promise<void>;

  /** Remove a single label from an issue. */
  removeLabel(id: string, label: string): Promise<void>;
}
