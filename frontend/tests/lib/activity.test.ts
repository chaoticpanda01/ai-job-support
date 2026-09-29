import { describe, expect, it } from "vitest";
import { formatRelative, recentActivity } from "@/lib/activity";
import type { JourneyInput } from "@/lib/journey";
import type {
  Document,
  InterviewSession,
  JobApplication,
  Resume,
  ResumeAnalysis,
  VisaConsultationListItem,
} from "@/types/api";

const EMPTY: JourneyInput = {
  me: undefined,
  resumes: [],
  primaryAnalysis: null,
  documents: [],
  applications: [],
  interviewSessions: [],
  visaConsultations: [],
};

const day = (d: number) => `2026-09-${String(d).padStart(2, "0")}T09:00:00+00:00`;

describe("recentActivity", () => {
  it("merges every source, newest first", () => {
    const items = recentActivity({
      ...EMPTY,
      resumes: [{ id: "r1", file_name: "cv.pdf", created_at: day(1), is_primary: true } as Resume],
      primaryAnalysis: { id: "a1", created_at: day(3) } as ResumeAnalysis,
      documents: [
        {
          id: "d1",
          document_type: "rirekisho",
          status: "completed",
          completed_at: day(5),
          created_at: day(4),
        },
      ] as Document[],
      applications: [{ id: "app1", job_title: "SRE", created_at: day(2) }] as JobApplication[],
      visaConsultations: [{ id: "v1", created_at: day(6) } as VisaConsultationListItem],
    });
    expect(items.map((i) => i.kind)).toEqual([
      "visa",
      "rirekisho",
      "resumeAnalysed",
      "application",
      "resumeUploaded",
    ]);
    expect(items[0]?.href).toBe("/dashboard/visa/v1");
    expect(items[1]?.href).toBe("/dashboard/documents/d1");
    expect(items[2]?.href).toBe("/dashboard/resumes/r1");
    expect(items[3]).toMatchObject({ href: "/dashboard/jobs/applications", name: "SRE" });
    expect(items[4]).toMatchObject({ href: "/dashboard/resumes/r1", name: "cv.pdf" });
  });

  it("keeps only the newest five", () => {
    const resumes = [1, 2, 3, 4, 5, 6, 7].map(
      (d) => ({ id: `r${d}`, file_name: `${d}.pdf`, created_at: day(d) }) as Resume,
    );
    const items = recentActivity({ ...EMPTY, resumes });
    expect(items.map((i) => i.name)).toEqual(["7.pdf", "6.pdf", "5.pdf", "4.pdf", "3.pdf"]);
  });

  it("lists only finished documents and interviews", () => {
    const items = recentActivity({
      ...EMPTY,
      documents: [
        {
          id: "d1",
          document_type: "shokumukeirekisho",
          status: "failed",
          completed_at: null,
          created_at: day(2),
        },
        {
          id: "d2",
          document_type: "shokumukeirekisho",
          status: "completed",
          completed_at: null,
          created_at: day(3),
        },
      ] as Document[],
      interviewSessions: [
        { id: "s1", status: "abandoned", completed_at: null, created_at: day(4) },
        { id: "s2", status: "completed", completed_at: day(6), created_at: day(5) },
      ] as InterviewSession[],
    });
    expect(items.map((i) => [i.kind, i.at])).toEqual([
      ["interview", day(6)],
      ["shokumu", day(3)],
    ]);
  });

  it("skips sources that failed to load", () => {
    expect(recentActivity({ ...EMPTY, resumes: undefined, documents: undefined })).toEqual([]);
  });
});

describe("formatRelative", () => {
  const now = Date.parse("2026-09-26T12:00:00+00:00");

  it("says days ago in the chosen language", () => {
    expect(formatRelative("2026-09-24T12:00:00+00:00", "en", now)).toBe("2 days ago");
    expect(formatRelative("2026-09-24T12:00:00+00:00", "ja", now)).toBe("一昨日");
  });

  it("uses the largest whole unit", () => {
    expect(formatRelative("2026-09-26T09:00:00+00:00", "en", now)).toBe("3 hours ago");
  });

  it("says now for the last few seconds", () => {
    expect(formatRelative("2026-09-26T11:59:58+00:00", "en", now)).toBe("now");
  });
});
