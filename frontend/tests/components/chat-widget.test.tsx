import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderIn } from "../helpers";
import { t, type Language } from "@/lib/i18n";
import { useLang } from "@/lib/language-context";
import { ChatWidget } from "@/components/chat-widget";

vi.mock("@clerk/nextjs", () => ({
  SignedIn: ({ children }: { children: ReactNode }) => <>{children}</>,
  // Rendered as null, not children: the real component shows exactly one of
  // SignedIn/SignedOut. Rendering both children would put the signed-out
  // prompt and the signed-in panel in the DOM at once, which can never
  // happen for a real user and would let assertions pass against a DOM
  // Clerk never produces.
  SignedOut: () => null,
}));

// jsdom doesn't implement scrollIntoView; the widget calls it on every
// message-list update to keep the latest reply in view.
Element.prototype.scrollIntoView = vi.fn();

const LANGS: Language[] = ["en", "id", "ja"];

/** Open the widget in the given language. */
function openWidget(lang: Language) {
  renderIn(lang, <ChatWidget />);
  fireEvent.click(screen.getByRole("button", { name: t("chat", "openChat", lang) }));
}

/** Answer the next fetch with this response, then send a message. */
function answerWith(response: { status: number; body?: unknown; retryAfter?: string | null }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      headers: {
        get: (name: string) => (name === "Retry-After" ? (response.retryAfter ?? null) : null),
      },
      json: async () => {
        if (response.body === undefined) throw new SyntaxError("not JSON");
        return response.body;
      },
    })),
  );
}

/**
 * Renders the chat widget alongside a real `useLang` consumer that can flip
 * the language after mount, so a test can tell "computed from the current
 * language" apart from "captured once at mount" -- the two only disagree once
 * the language actually changes underneath an already-open widget.
 */
function Harness({ switchTo }: { switchTo: Language }) {
  const { setLang } = useLang();
  return (
    <>
      <button onClick={() => setLang(switchTo)}>switch language</button>
      <ChatWidget />
    </>
  );
}

async function send(lang: Language) {
  fireEvent.change(screen.getByRole("textbox", { name: t("chat", "inputLabel", lang) }), {
    target: { value: "hello" },
  });
  fireEvent.click(screen.getByRole("button", { name: t("chat", "send", lang) }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("chat widget rendering", () => {
  it.each(LANGS)("shows its greeting and controls in %s", (lang) => {
    openWidget(lang);

    expect(screen.getByText(t("chat", "greeting", lang))).toBeInTheDocument();
    expect(screen.getByText(t("chat", "title", lang))).toBeInTheDocument();
    expect(screen.getByText(t("chat", "poweredBy", lang))).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: t("chat", "inputLabel", lang) }),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText(t("chat", "placeholder", lang))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t("chat", "send", lang) })).toBeInTheDocument();
    expect(screen.getByRole("log", { name: t("chat", "conversation", lang) })).toBeInTheDocument();
    // Two buttons share this aria-label once the widget is open: the header's
    // own X button (always closeChat) and the floating toggle button (whose
    // label switches from openChat to closeChat while open). getAllByRole
    // rather than getByRole because a single-match query would throw here.
    expect(screen.getAllByRole("button", { name: t("chat", "closeChat", lang) })).toHaveLength(2);
    // "thinking" is not asserted here: it only renders while a send is in
    // flight, which this render (no message sent, no fetch mocked) never
    // reaches. Covered instead by a dedicated test below.
  });

  it.each(LANGS)("shows the thinking indicator while a reply is in flight, in %s", async (lang) => {
    // Unlike the other failure/success tests, this one needs a fetch that
    // does not resolve on its own -- resolving immediately (as answerWith's
    // mock does) would mean the loading state never survives to be asserted.
    let resolveFetch: (value: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise((resolve) => (resolveFetch = resolve))),
    );
    openWidget(lang);
    await send(lang);

    await waitFor(() => {
      expect(screen.getByText(t("chat", "thinking", lang))).toBeInTheDocument();
    });

    // Let the pending request settle so it doesn't leak into the next test.
    resolveFetch({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({}),
    });
  });

  it("renders the greeting from the current language, not the one at mount", () => {
    // It used to live in useState's initial value, so it froze at whatever
    // language was active when the widget mounted. Opening once and reading
    // the mount-time language back can't distinguish that bug from correct
    // behaviour -- both render the same text. Flipping the language on an
    // already-open widget is the one action that tells them apart.
    renderIn("en", <Harness switchTo="ja" />);
    fireEvent.click(screen.getByRole("button", { name: t("chat", "openChat", "en") }));

    fireEvent.click(screen.getByRole("button", { name: "switch language" }));

    expect(screen.getByText(t("chat", "greeting", "ja"))).toBeInTheDocument();
    expect(screen.queryByText(t("chat", "greeting", "en"))).not.toBeInTheDocument();
  });
});

describe("chat widget failures", () => {
  it("uses the chat wording for a rate limit that comes with a countdown", async () => {
    openWidget("ja");
    answerWith({ status: 429, body: {}, retryAfter: "7200" });
    await send("ja");

    await waitFor(() => {
      expect(screen.getByText(t("chat", "limitReached", "ja"))).toBeInTheDocument();
    });
  });

  it("falls back to the shared message when no countdown will render", async () => {
    // Retry-After can legitimately be absent or zero; claiming a countdown
    // then points at something that never appears.
    openWidget("ja");
    answerWith({ status: 429, body: {}, retryAfter: null });
    await send("ja");

    await waitFor(() => {
      expect(screen.getByText(t("common", "errorRateLimited", "ja"))).toBeInTheDocument();
    });
    expect(screen.queryByText(t("chat", "limitReached", "ja"))).not.toBeInTheDocument();
  });

  it("explains a failed AI call by status", async () => {
    openWidget("ja");
    answerWith({ status: 502, body: {} });
    await send("ja");

    await waitFor(() => {
      expect(screen.getByText(t("common", "errorServer", "ja"))).toBeInTheDocument();
    });
  });

  it("does not blame the connection for a reply it could not parse", async () => {
    openWidget("ja");
    answerWith({ status: 200 });
    await send("ja");

    await waitFor(() => {
      expect(screen.getByText(t("common", "error", "ja"))).toBeInTheDocument();
    });
    expect(screen.queryByText(t("common", "errorConnection", "ja"))).not.toBeInTheDocument();
  });

  it("leaves no blank bubble for an empty reply", async () => {
    openWidget("ja");
    answerWith({ status: 200, body: {} });
    await send("ja");

    await waitFor(() => {
      expect(screen.getByText(t("common", "error", "ja"))).toBeInTheDocument();
    });
  });
});
