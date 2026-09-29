import { describe, expect, it } from "vitest";
import {
  DOCUMENT_STATUS_TONE,
  ELIGIBILITY_TONE,
  INTERVIEW_SCORE_BANDS,
  JOB_SCORE_BANDS,
  RESUME_SCORE_BANDS,
  SESSION_STATUS_TONE,
  scoreTone,
  toneFill,
  toneSoft,
  toneText,
  type Tone,
} from "@/lib/tones";

const TONES: Tone[] = ["neutral", "info", "success", "warning", "danger"];

describe("tone class maps", () => {
  it.each([
    ["toneText", toneText],
    ["toneSoft", toneSoft],
    ["toneFill", toneFill],
  ])("%s has a token class for every tone", (_name, map) => {
    for (const tone of TONES) {
      expect(map[tone]).toMatch(/^(text|bg)-[a-z-]+$/);
    }
  });
});

describe("scoreTone", () => {
  it.each([
    [81, "success"],
    [80, "warning"],
    [61, "warning"],
    [60, "danger"],
  ] as const)("reads a resume score of %i as %s", (score, tone) => {
    expect(scoreTone(score, RESUME_SCORE_BANDS)).toBe(tone);
  });

  it.each([
    [70, "success"],
    [69, "warning"],
    [50, "warning"],
    [49, "danger"],
  ] as const)("reads an interview score of %i as %s", (score, tone) => {
    expect(scoreTone(score, INTERVIEW_SCORE_BANDS)).toBe(tone);
  });
});

describe("status tones", () => {
  it("gives every document status its tone", () => {
    expect(DOCUMENT_STATUS_TONE).toEqual({
      pending: "warning",
      processing: "info",
      completed: "success",
      failed: "danger",
    });
  });

  it("gives every interview status its tone", () => {
    expect(SESSION_STATUS_TONE).toEqual({
      active: "success",
      completed: "info",
      abandoned: "neutral",
    });
  });

  it("gives every visa eligibility its tone", () => {
    expect(ELIGIBILITY_TONE).toEqual({
      eligible: "success",
      eligible_with_gaps: "warning",
      not_eligible: "neutral",
    });
  });
});

describe("job score bands", () => {
  it.each([
    [70, "success"],
    [69, "warning"],
    [50, "warning"],
    [49, "danger"],
  ] as const)("calls %i %s", (score, tone) => {
    expect(scoreTone(score, JOB_SCORE_BANDS)).toBe(tone);
  });
});
