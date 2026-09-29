import type { Route } from "next";
import type {
  Document,
  DocumentType,
  InterviewSession,
  JobApplication,
  MeResponse,
  Resume,
  ResumeAnalysis,
  VisaConsultationListItem,
} from "@/types/api";
import { hasApplied } from "@/lib/pipeline";

/**
 * The user's move to Japan as eight steps in three stages. Pure: no React, no
 * fetching. hooks/useJourney.ts feeds it; the sidebar and Home render it.
 */

export type StageId = "prepare" | "apply" | "settleIn";
export type StepId =
  | "profile"
  | "resumeUploaded"
  | "resumeAnalysed"
  | "rirekisho"
  | "shokumu"
  | "application"
  | "interview"
  | "visa";
/** "unknown": the data behind the step couldn't be loaded. */
export type StepState = "done" | "todo" | "unknown";

export interface JourneyStep {
  id: StepId;
  stage: StageId;
  state: StepState;
  href: Route;
}

export interface JourneyStage {
  id: StageId;
  steps: JourneyStep[];
  done: number;
  total: number;
  complete: boolean;
  /** Any step unknown: the stage's count would be wrong, so it isn't shown. */
  hasUnknown: boolean;
}

export interface Journey {
  stages: JourneyStage[];
  doneCount: number;
  total: number;
  next: JourneyStep | null;
  allDone: boolean;
}

/**
 * Each field is undefined when its source couldn't be loaded. primaryAnalysis
 * is null when the primary resume has no analysis yet.
 */
export interface JourneyInput {
  me: MeResponse | undefined;
  resumes: Resume[] | undefined;
  primaryAnalysis: ResumeAnalysis | null | undefined;
  documents: Document[] | undefined;
  applications: JobApplication[] | undefined;
  interviewSessions: InterviewSession[] | undefined;
  visaConsultations: VisaConsultationListItem[] | undefined;
}

const STAGE_ORDER: StageId[] = ["prepare", "apply", "settleIn"];

/** The resume marked primary, else the newest: the one the analysis step is about. */
export function pickPrimaryResume(resumes: Resume[]): Resume | undefined {
  return (
    resumes.find((r) => r.is_primary) ??
    [...resumes].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0]
  );
}

function stateOf(known: boolean, done: boolean): StepState {
  if (!known) return "unknown";
  return done ? "done" : "todo";
}

function analysisState(
  resumes: Resume[] | undefined,
  primary: Resume | undefined,
  primaryAnalysis: ResumeAnalysis | null | undefined,
): StepState {
  if (resumes === undefined) return "unknown";
  // With no resume there is nothing to analyse yet: "to do", not unknown.
  if (primary === undefined) return "todo";
  if (primaryAnalysis === undefined) return "unknown";
  return primaryAnalysis === null ? "todo" : "done";
}

// Only a finished generation counts: a pending or failed one is not a document yet.
function hasCompleted(documents: Document[], type: DocumentType): boolean {
  return documents.some((d) => d.document_type === type && d.status === "completed");
}

export function computeJourney(input: JourneyInput): Journey {
  const { me, resumes, documents, applications, interviewSessions, visaConsultations } = input;
  const primary = resumes ? pickPrimaryResume(resumes) : undefined;

  // Order is the journey order, and also the dependency order: next is the
  // first "todo", so an analysis is never suggested before an upload.
  const steps: JourneyStep[] = [
    {
      id: "profile",
      stage: "prepare",
      href: "/dashboard/settings",
      state: stateOf(me !== undefined, me?.rirekisho_ready === true),
    },
    {
      id: "resumeUploaded",
      stage: "prepare",
      href: "/dashboard/resumes",
      state: stateOf(resumes !== undefined, (resumes?.length ?? 0) > 0),
    },
    {
      id: "resumeAnalysed",
      stage: "prepare",
      // Typed routes can't check a path built from a runtime id; hence the cast.
      href: primary ? (`/dashboard/resumes/${primary.id}` as Route) : "/dashboard/resumes",
      state: analysisState(resumes, primary, input.primaryAnalysis),
    },
    {
      id: "rirekisho",
      stage: "prepare",
      href: "/dashboard/documents/rirekisho/new",
      state: stateOf(documents !== undefined, !!documents && hasCompleted(documents, "rirekisho")),
    },
    {
      id: "shokumu",
      stage: "prepare",
      href: "/dashboard/documents/shokumu/new",
      state: stateOf(
        documents !== undefined,
        !!documents && hasCompleted(documents, "shokumukeirekisho"),
      ),
    },
    {
      id: "application",
      stage: "apply",
      href: "/dashboard/jobs",
      // Saving or preparing a job is not applying; any job applied for counts,
      // including one closed afterwards.
      state: stateOf(applications !== undefined, applications?.some(hasApplied) ?? false),
    },
    {
      id: "interview",
      stage: "apply",
      href: "/dashboard/interview/new",
      state: stateOf(
        interviewSessions !== undefined,
        interviewSessions?.some((s) => s.status === "completed") ?? false,
      ),
    },
    {
      id: "visa",
      stage: "settleIn",
      href: "/dashboard/visa",
      state: stateOf(visaConsultations !== undefined, (visaConsultations?.length ?? 0) > 0),
    },
  ];

  const stages = STAGE_ORDER.map((id): JourneyStage => {
    const own = steps.filter((s) => s.stage === id);
    const done = own.filter((s) => s.state === "done").length;
    return {
      id,
      steps: own,
      done,
      total: own.length,
      complete: done === own.length,
      hasUnknown: own.some((s) => s.state === "unknown"),
    };
  });

  const doneCount = steps.filter((s) => s.state === "done").length;
  return {
    stages,
    doneCount,
    total: steps.length,
    next: steps.find((s) => s.state === "todo") ?? null,
    allDone: doneCount === steps.length,
  };
}
