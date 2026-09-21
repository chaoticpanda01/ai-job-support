import { Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, type RenderResult } from "@testing-library/react";
import { renderIn } from "../helpers";
import { ApiClientError } from "@/lib/api-client";
import { t } from "@/lib/i18n";
import type * as UseInterview from "@/hooks/useInterview";
import type {
  InterviewEvaluation,
  InterviewMessage,
  InterviewSessionDetail,
  InterviewSummary,
} from "@/types/api";

// jsdom implements no layout, so the page's scroll-to-bottom effect would
// throw on every render without this.
Element.prototype.scrollIntoView = vi.fn();

const sessionQuery = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const interview = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
  sent: [] as Array<[string, string]>,
  ended: [] as string[],
  aborts: 0,
}));
const confirm = vi.hoisted(() => ({ answer: true, calls: [] as Record<string, unknown>[] }));

// react-query is only imported for its types here: the two hooks below are
// replaced, but the module is still loaded for the real streamErrorMessage
// and isMissingSessionError, which the page's error branches depend on.
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({}),
  useQueryClient: () => ({ invalidateQueries: () => {} }),
}));

vi.mock("@/hooks/useInterview", async (importOriginal) => {
  const actual = await importOriginal<typeof UseInterview>();
  return {
    ...actual,
    useInterviewSession: () => sessionQuery.current,
    useInterview: () => interview.current,
  };
});

vi.mock("@/components/confirm-dialog-provider", () => ({
  useConfirm: () => (options: Record<string, unknown>) => {
    confirm.calls.push(options);
    return Promise.resolve(confirm.answer);
  },
}));

const InterviewSessionPage = (await import("@/app/dashboard/interview/[id]/page")).default;

const LANG = "ja";
const iv = (key: Parameters<typeof t>[1]) => t("interview", key, LANG);
const common = (key: Parameters<typeof t>[1]) => t("common", key, LANG);

function message(over: Partial<InterviewMessage> & { id: string }): InterviewMessage {
  return {
    session_id: "s1",
    role: "interviewer",
    content: "Tell me about yourself.",
    language: "en",
    ai_evaluation: null,
    created_at: "2026-09-22T08:24:00Z",
    ...over,
  };
}

const SESSION: InterviewSessionDetail = {
  id: "s1",
  user_id: "u1",
  session_type: "behavioral",
  target_role: "Backend Engineer",
  target_company: "Rakuten",
  language: "en",
  status: "active",
  overall_score: null,
  feedback_summary: null,
  completed_at: null,
  created_at: "2026-09-22T08:20:00Z",
  messages: [
    message({ id: "m1" }),
    message({ id: "m2", role: "user", content: "I fixed an N+1 query." }),
  ],
};

const EVAL: InterviewEvaluation = {
  keigo_score: 90,
  content_relevance: 95,
  specificity_score: 80,
  grammar_issues: [],
  positive_feedback: "Clear STAR structure.",
  improvement_tip: "Add the numbers.",
};

const SUMMARY: InterviewSummary = {
  overall_score: 84,
  feedback_summary: "A strong showing overall.",
  top_strengths: ["Concrete metrics"],
  top_improvements: ["Slow down"],
};

/** The session query with data loaded and nothing wrong. */
function query(over: Record<string, unknown> = {}) {
  return {
    data: SESSION,
    error: null,
    fetchStatus: "idle",
    isFetching: false,
    errorUpdateCount: 0,
    refetch: () => Promise.resolve({ status: "success", data: SESSION }),
    ...over,
  };
}

/** The stream hook with nothing in flight. */
function stream(over: Record<string, unknown> = {}) {
  return {
    state: {
      isStreaming: false,
      streamingText: "",
      lastEval: null,
      summary: null,
      error: null,
      ...((over["state"] as Record<string, unknown>) ?? {}),
    },
    sendMessage: (id: string, content: string) => interview.sent.push([id, content]),
    endSession: (id: string) => interview.ended.push(id),
    abort: () => {
      interview.aborts += 1;
    },
  };
}

/**
 * Render the page and wait for its route params to resolve.
 *
 * `use(params)` suspends even on a resolved promise, and RTL's synchronous
 * act() cannot await the thrown thenable — so the render has to happen
 * inside `await act(async () => ...)` for the retry render to run.
 */
async function renderPage(
  queryOver: Record<string, unknown> = query(),
  streamOver: Record<string, unknown> = stream(),
): Promise<RenderResult> {
  sessionQuery.current = queryOver;
  interview.current = streamOver;
  let view: RenderResult | null = null;
  await act(async () => {
    view = renderIn(
      LANG,
      <Suspense fallback={null}>
        <InterviewSessionPage params={Promise.resolve({ id: "s1" })} />
      </Suspense>,
    );
  });
  if (view === null) throw new Error("the page never rendered");
  return view as RenderResult;
}

beforeEach(() => {
  interview.sent = [];
  interview.ended = [];
  interview.aborts = 0;
  confirm.answer = true;
  confirm.calls = [];
});

describe("interview session page, with nothing to show yet", () => {
  const NO_DATA = { data: undefined };

  it("shows a skeleton while the session loads", async () => {
    const { container } = await renderPage(query(NO_DATA));

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says the session could not be found, with nothing to retry", async () => {
    await renderPage(query({ ...NO_DATA, error: new ApiClientError(404, "gone") }));

    expect(screen.getByRole("alert")).toHaveTextContent(iv("sessionNotFound"));
    expect(screen.queryByRole("button", { name: common("tryAgain") })).not.toBeInTheDocument();
  });

  it("offers a retry when the session cannot be verified", async () => {
    // Clerk briefly failing to mint a token looks like this, and a retry
    // often works, so this one is not a dead end.
    await renderPage(query({ ...NO_DATA, error: new ApiClientError(401, "no token") }));

    expect(screen.getByRole("alert")).toHaveTextContent(iv("sessionSignedOut"));
    expect(screen.getByRole("button", { name: common("tryAgain") })).toBeInTheDocument();
  });

  it("offers a retry for any other failure", async () => {
    await renderPage(query({ ...NO_DATA, error: new ApiClientError(500, "boom") }));

    expect(screen.getByRole("alert")).toHaveTextContent(iv("sessionLoadError"));
    expect(screen.getByRole("button", { name: common("tryAgain") })).toBeInTheDocument();
  });

  it("states an offline pause calmly, and does not offer a retry that cannot help", async () => {
    // A paused fetch carries no error and resumes by itself, so it is a
    // status rather than an alert.
    await renderPage(query({ ...NO_DATA, fetchStatus: "paused" }));

    expect(screen.getByRole("status")).toHaveTextContent(iv("sessionOffline"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: common("tryAgain") })).not.toBeInTheDocument();
  });

  it("keeps the notice up while a retry runs rather than dropping to the skeleton", async () => {
    // A retry with no data puts the query back to pending. Swapping the
    // notice for the skeleton would move focus off the button being pressed.
    let settle = () => {};
    const pending = new Promise((resolve) => {
      settle = () => resolve({ status: "error" });
    });
    await renderPage(
      query({ ...NO_DATA, error: new ApiClientError(500, "boom"), refetch: () => pending }),
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: common("tryAgain") }));
    });

    const button = screen.getByRole("button", { name: common("retrying") });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(iv("sessionLoadError"));
    await act(async () => {
      settle();
    });
  });
});

describe("interview session page, retrying a failed load", () => {
  it("keeps the notice through a retry that empties the query", async () => {
    // A retry with no data puts the query back to pending: error cleared,
    // data still undefined. Without the remembered problem the page would
    // fall through to the skeleton and take the focused button with it.
    const pendingAgain = {
      data: undefined,
      error: null,
      fetchStatus: "fetching",
      isFetching: true,
      errorUpdateCount: 1,
      refetch: () => new Promise(() => {}),
    };
    await renderPage(
      query({
        data: undefined,
        error: new ApiClientError(500, "boom"),
        refetch: () => {
          sessionQuery.current = pendingAgain;
          return new Promise(() => {});
        },
      }),
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: common("tryAgain") }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent(iv("sessionLoadError"));
    expect(screen.getByRole("button", { name: common("retrying") })).toBeInTheDocument();
  });
});

describe("interview session page, an active session", () => {
  it("shows the interview, its target role and its messages", async () => {
    await renderPage();

    expect(screen.getByText("Backend Engineer")).toBeInTheDocument();
    expect(screen.getByText("Tell me about yourself.")).toBeInTheDocument();
    expect(screen.getByText("I fixed an N+1 query.")).toBeInTheDocument();
    expect(screen.getByText(iv("statusActive"))).toBeInTheDocument();
  });

  it("tags the interviewer's language, but not the candidate's", async () => {
    // The interviewer is told to speak the session language; an answer can be
    // in any language, so tagging it would tell a screen reader the wrong one.
    await renderPage();

    expect(screen.getByText("Tell me about yourself.")).toHaveAttribute("lang", "en");
    expect(screen.getByText("I fixed an N+1 query.")).not.toHaveAttribute("lang");
  });

  it("sends an answer on Enter and clears the box", async () => {
    await renderPage();
    const box = screen.getByLabelText(iv("answerLabel"));

    fireEvent.change(box, { target: { value: "  My answer  " } });
    fireEvent.keyDown(box, { key: "Enter" });

    expect(interview.sent).toEqual([["s1", "My answer"]]);
    expect(box).toHaveValue("");
  });

  it("keeps Shift+Enter for a new line", async () => {
    await renderPage();
    const box = screen.getByLabelText(iv("answerLabel"));

    fireEvent.change(box, { target: { value: "first line" } });
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });

    expect(interview.sent).toEqual([]);
    expect(box).toHaveValue("first line");
  });

  it("shows the answer straight away, before the server has saved it", async () => {
    await renderPage();
    const box = screen.getByLabelText(iv("answerLabel"));

    fireEvent.change(box, { target: { value: "My answer" } });
    fireEvent.click(screen.getByRole("button", { name: iv("send") }));

    expect(screen.getByText("My answer")).toBeInTheDocument();
  });

  it("will not send an empty answer", async () => {
    await renderPage();

    fireEvent.change(screen.getByLabelText(iv("answerLabel")), { target: { value: "   " } });

    expect(screen.getByRole("button", { name: iv("send") })).toBeDisabled();
  });

  it("caps the answer at the length the backend accepts", async () => {
    await renderPage();

    expect(screen.getByLabelText(iv("answerLabel"))).toHaveAttribute("maxlength", "4000");
  });

  it("asks before ending the session", async () => {
    confirm.answer = false;
    await renderPage();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: iv("endSession") }));
    });

    expect(confirm.calls[0]).toMatchObject({ title: iv("endConfirm") });
    expect(interview.ended).toEqual([]);
  });

  it("ends the session once that is confirmed", async () => {
    await renderPage();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: iv("endSession") }));
    });

    expect(interview.ended).toEqual(["s1"]);
  });
});

describe("interview session page, a Japanese interview", () => {
  // The product's main case: the interview itself is conducted in Japanese.
  // Every other fixture here runs an English session, so this is what proves
  // the session's own language reaches the markup instead of a constant.
  const JA_QUESTION = "\u81ea\u5df1\u7d39\u4ecb\u3092\u304a\u9858\u3044\u3057\u307e\u3059\u3002";
  const JA_ANSWER =
    "\u306f\u3044\u3001\u30d0\u30c3\u30af\u30a8\u30f3\u30c9\u30a8\u30f3\u30b8\u30cb\u30a2\u3068\u3057\u3066\u4e94\u5e74\u9593\u50cd\u3044\u3066\u304a\u308a\u307e\u3059\u3002";

  const JA_SESSION: InterviewSessionDetail = {
    ...SESSION,
    language: "ja",
    messages: [
      message({ id: "j1", content: JA_QUESTION, language: "ja" }),
      message({ id: "j2", role: "user", content: JA_ANSWER, language: "ja" }),
    ],
  };

  const jaQuery = (over: Record<string, unknown> = {}) => query({ data: JA_SESSION, ...over });

  it("marks the interviewer's Japanese as Japanese", async () => {
    // Without the session's own language here a screen reader reads Japanese
    // with an English voice, which is unintelligible rather than merely wrong.
    await renderPage(jaQuery());

    expect(screen.getByText(JA_QUESTION)).toHaveAttribute("lang", "ja");
  });

  it("marks the streaming reply too, while it is still arriving", async () => {
    const nextQuestion = "\u3067\u306f\u3001\u6b21\u306e\u8cea\u554f\u3067\u3059\u3002";
    await renderPage(
      jaQuery(),
      stream({ state: { isStreaming: true, streamingText: nextQuestion } }),
    );

    expect(screen.getByText(new RegExp(nextQuestion))).toHaveAttribute("lang", "ja");
  });

  it("leaves the candidate's answer untagged, whatever language it is in", async () => {
    // A Japanese interview does not oblige a Japanese answer, and claiming
    // one is Japanese when it is English is the same failure in reverse.
    await renderPage(
      jaQuery({
        data: {
          ...JA_SESSION,
          messages: [
            message({ id: "j1", content: JA_QUESTION, language: "ja" }),
            message({ id: "j2", role: "user", content: "I worked on backend systems." }),
          ],
        },
      }),
    );

    expect(screen.getByText(JA_QUESTION)).toHaveAttribute("lang", "ja");
    expect(screen.getByText("I worked on backend systems.")).not.toHaveAttribute("lang");
  });

  it("scores the keigo it was actually able to judge", async () => {
    // keigo_score means honorific Japanese only in a Japanese session; the
    // backend scores general formality otherwise.
    await renderPage(jaQuery(), stream({ state: { lastEval: EVAL } }));

    expect(screen.getByText(iv("keigo"))).toBeInTheDocument();
    expect(screen.getByText("90")).toBeInTheDocument();
  });

  it("shows grammar notes written in Japanese", async () => {
    const issue = "\u300c\u306f\u300d\u3068\u300c\u304c\u300d\u306e\u4f7f\u3044\u5206\u3051";
    await renderPage(
      jaQuery(),
      stream({ state: { lastEval: { ...EVAL, grammar_issues: [issue] } } }),
    );

    expect(screen.getByText(iv("grammarNotes"))).toBeInTheDocument();
    expect(screen.getByText(issue)).toBeInTheDocument();
  });

  it("carries the session through its Japanese chrome as well", async () => {
    await renderPage(jaQuery());

    expect(screen.getByText(iv("statusActive"))).toBeInTheDocument();
    expect(screen.getByLabelText(iv("answerLabel"))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: iv("endSession") })).toBeInTheDocument();
  });
});

describe("interview session page, while a reply is streaming", () => {
  const STREAMING = stream({ state: { isStreaming: true, streamingText: "Could you tell me" } });

  it("shows the reply as it arrives and marks the list busy", async () => {
    const { container } = await renderPage(query(), STREAMING);

    expect(screen.getByText(/Could you tell me/)).toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it("offers Stop instead of End while it runs", async () => {
    await renderPage(query(), STREAMING);

    expect(screen.getByRole("button", { name: iv("stop") })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: iv("endSession") })).not.toBeInTheDocument();
  });

  it("stops the stream when asked", async () => {
    await renderPage(query(), STREAMING);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: iv("stop") }));
    });

    expect(interview.aborts).toBe(1);
  });

  it("does not take a second answer while one is in flight", async () => {
    await renderPage(query(), STREAMING);

    expect(screen.getByLabelText(iv("answerLabel"))).toBeDisabled();
  });

  it("says nothing until the reply is finished", async () => {
    // Announcing each token would read the answer out word by word.
    await renderPage(query(), STREAMING);

    expect(screen.getByRole("status")).toHaveTextContent("");
  });
});

describe("interview session page, the feedback on an answer", () => {
  const WITH_EVAL = stream({ state: { lastEval: EVAL } });

  it("shows each score and both notes", async () => {
    await renderPage(query(), WITH_EVAL);

    expect(screen.getByText(iv("answerFeedback"))).toBeInTheDocument();
    const bars: Array<[string, string]> = [
      [iv("keigo"), "90"],
      [iv("relevance"), "95"],
      [iv("specificity"), "80"],
    ];
    for (const [label, score] of bars) {
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.getByText(score)).toBeInTheDocument();
    }
    expect(screen.getByText(EVAL.positive_feedback)).toBeInTheDocument();
    expect(screen.getByText(EVAL.improvement_tip)).toBeInTheDocument();
  });

  it("holds the card back until the reply it belongs to has finished", async () => {
    // The evaluation arrives mid-stream, before the next question. Showing it
    // then would push the reply being typed off the screen.
    await renderPage(
      query(),
      stream({ state: { lastEval: EVAL, isStreaming: true, streamingText: "Next question" } }),
    );

    expect(screen.queryByText(iv("answerFeedback"))).not.toBeInTheDocument();
    expect(screen.getByText(/Next question/)).toBeInTheDocument();
  });

  it("leaves out the grammar notes when there are none", async () => {
    await renderPage(query(), WITH_EVAL);

    expect(screen.queryByText(iv("grammarNotes"))).not.toBeInTheDocument();
  });

  it("lists the grammar notes when there are some", async () => {
    await renderPage(
      query(),
      stream({ state: { lastEval: { ...EVAL, grammar_issues: ["は vs が"] } } }),
    );

    expect(screen.getByText(iv("grammarNotes"))).toBeInTheDocument();
    expect(screen.getByText("は vs が")).toBeInTheDocument();
  });

  it("reads out that feedback has arrived", async () => {
    await renderPage(query(), WITH_EVAL);

    expect(screen.getByRole("status")).toHaveTextContent(iv("feedbackReady"));
  });
});

describe("interview session page, the end-of-session summary", () => {
  const WITH_SUMMARY = stream({ state: { summary: SUMMARY } });

  it("shows the score and the written feedback", async () => {
    await renderPage(query(), WITH_SUMMARY);

    expect(screen.getByText("84")).toBeInTheDocument();
    expect(screen.getByText(SUMMARY.feedback_summary)).toBeInTheDocument();
    for (const item of [...SUMMARY.top_strengths, ...SUMMARY.top_improvements]) {
      expect(screen.getByText(item)).toBeInTheDocument();
    }
  });

  it.each([
    [80, "readiness80"],
    [79, "readiness60"],
    [75, "readiness60"],
    [60, "readiness60"],
    [59, "readiness40"],
    [40, "readiness40"],
    [39, "readiness0"],
  ] as Array<[number, Parameters<typeof iv>[0]]>)("calls a score of %i %s", async (score, key) => {
    await renderPage(query(), stream({ state: { summary: { ...SUMMARY, overall_score: score } } }));

    expect(screen.getByText(iv(key))).toBeInTheDocument();
  });

  it("offers the way back once the session is over", async () => {
    await renderPage(query(), WITH_SUMMARY);

    // The header keeps its back arrow throughout; the summary adds a second
    // way out at the bottom, so a reader who has scrolled through the
    // feedback doesn't have to scroll back up to leave.
    expect(screen.getAllByRole("link", { name: iv("backToSessions") })).toHaveLength(2);
  });

  it("treats the session as finished even before the refetch says so", async () => {
    // The fetched session still says active until the list is invalidated.
    await renderPage(query(), WITH_SUMMARY);

    expect(screen.getByText(iv("statusCompleted"))).toBeInTheDocument();
    expect(screen.queryByLabelText(iv("answerLabel"))).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: iv("endSession") })).not.toBeInTheDocument();
  });

  it("reads out that the summary is ready", async () => {
    await renderPage(query(), WITH_SUMMARY);

    expect(screen.getByRole("status")).toHaveTextContent(iv("summaryReady"));
  });

  it("keeps the input while an end request is still failing", async () => {
    // A failed end has to be retryable, so the session stays usable.
    await renderPage(
      query(),
      stream({ state: { error: { kind: "stream", code: "summary_failed" } } }),
    );

    expect(screen.getByLabelText(iv("answerLabel"))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: iv("endSession") })).toBeInTheDocument();
  });
});

describe("interview session page, a stream that failed", () => {
  it("explains the failure in the reader's language", async () => {
    await renderPage(
      query(),
      stream({ state: { error: { kind: "stream", code: "answer_not_saved" } } }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(iv("streamAnswerNotSaved"));
  });

  it("explains a refusal by its status rather than the server's words", async () => {
    await renderPage(
      query(),
      stream({ state: { error: { kind: "http", status: 502, retryAfterSeconds: null } } }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(common("errorServer"));
  });

  it("says nothing over the alert", async () => {
    await renderPage(query(), stream({ state: { error: { kind: "connection" } } }));

    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("stays silent even when feedback arrived before the failure", async () => {
    // The evaluation can land before the turn fails. Reading "feedback ready"
    // while an alert says the answer was not saved tells two opposite stories.
    await renderPage(
      query(),
      stream({
        state: { lastEval: EVAL, error: { kind: "stream", code: "answer_not_saved" } },
      }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(iv("streamAnswerNotSaved"));
    expect(screen.getByRole("status")).toHaveTextContent("");
  });
});

describe("interview session page, a refresh that failed", () => {
  it("says why the next question is missing", async () => {
    // The question arrives only through the refetch after the stream ends.
    await renderPage(query({ error: new ApiClientError(500, "boom") }));

    expect(screen.getByRole("alert")).toHaveTextContent(iv("sessionRefreshError"));
    expect(screen.getByText("Tell me about yourself.")).toBeInTheDocument();
  });

  it("stays quiet about a refresh while a stream error is already showing", async () => {
    // After a failed turn the refetch only checks whether it was saved
    // anyway; two error messages for one failure would be worse than one.
    await renderPage(
      query({ error: new ApiClientError(500, "boom") }),
      stream({ state: { error: { kind: "connection" } } }),
    );

    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent(iv("connectionLost"));
  });
});
