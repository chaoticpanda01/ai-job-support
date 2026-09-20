"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import { SIGN_IN_ROUTE } from "@/lib/routes";
import { ApiClientError } from "@/lib/api-client";
import { apiErrorMessage } from "@/lib/api-error";
import { useLang } from "@/lib/language-context";
import { t, type translations } from "@/lib/i18n";

// Backend limit for ChatRequest.message and for each history item's content,
// counted in characters (code points). Longer values get a 422.
const MAX_MESSAGE_LENGTH = 8000;

interface Message {
  role: "user" | "assistant";
  content: string;
}

/**
 * Recent messages to send as context, each trimmed to the backend limit. Replies
 * are capped well below it today, but one that exceeded it would get every
 * later message rejected. Trims by code point so an emoji is never split.
 */
function recentHistory(messages: Message[]): Message[] {
  return messages.slice(-10).map((m) => ({
    ...m,
    content: Array.from(m.content).slice(0, MAX_MESSAGE_LENGTH).join(""),
  }));
}

type ChatMessageKey = keyof (typeof translations)["chat"];

export function ChatWidget() {
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  // The greeting is rendered from the current language rather than stored as a
  // message: a stored one would stay in whichever language was active when the
  // widget mounted, and it is not part of the conversation the backend needs.
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open]);

  useEffect(() => {
    if (retryAt === null) return;
    const interval = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= retryAt) {
        clearInterval(interval);
        setRetryAt(null);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [retryAt]);

  const retryRemainingMs = retryAt !== null ? retryAt - now : 0;
  const rateLimited = retryRemainingMs > 0;

  // Annotated so a renamed key fails to compile rather than rendering itself.
  const placeholderKey: ChatMessageKey = rateLimited ? "placeholderLimited" : "placeholder";
  const toggleLabelKey: ChatMessageKey = open ? "closeChat" : "openChat";

  // Split rather than interpolated, so the timer keeps its own styling while
  // each language puts it where its grammar wants it.
  const [countdownBefore = "", countdownAfter = ""] = t("chat", "limitCountdown", lang).split(
    "{n}",
  );

  function formatCountdown(ms: number): string {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0)
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading || rateLimited) return;

    const userMessage: Message = { role: "user", content: text };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/v1/chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: recentHistory(messages) }),
      });
      if (!response.ok) {
        // The body holds the backend's English detail, which is never shown.
        // The status and Retry-After are what the reader can be told.
        const retryAfterSeconds = Number(response.headers.get("Retry-After"));
        const retryAfter =
          Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds : null;
        if (response.status === 429 && retryAfter !== null) {
          const nowMs = Date.now();
          setNow(nowMs);
          setRetryAt(nowMs + retryAfter * 1000);
        }
        setMessages([
          ...newMessages,
          {
            role: "assistant",
            content: apiErrorMessage(
              new ApiClientError(response.status, "", retryAfter),
              lang,
              // Only when a countdown will actually render: without Retry-After
              // there is no timer, and the shared "try again later" is then the
              // only honest thing to say. The chat wording avoids a duration of
              // its own so it can't contradict the timer ticking below it.
              retryAfter !== null ? { 429: t("chat", "limitReached", lang) } : undefined,
            ),
          },
        ]);
        return;
      }

      // A reply that won't parse means the server answered with something
      // unexpected, which is not the same as not reaching it at all.
      let reply = "";
      try {
        reply = ((await response.json()) as { reply?: string }).reply ?? "";
      } catch {
        reply = "";
      }
      // An empty reply would leave a blank bubble with nothing to read.
      setMessages([
        ...newMessages,
        { role: "assistant", content: reply || t("common", "error", lang) },
      ]);
    } catch (err) {
      // Never reached the server, or came back as something other than JSON.
      setMessages([...newMessages, { role: "assistant", content: apiErrorMessage(err, lang) }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Chat window */}
      {open && (
        <SignedOut>
          <div className="flex h-[500px] w-80 flex-col items-center justify-center gap-4 rounded-2xl border bg-background p-6 text-center shadow-xl sm:w-96">
            <span aria-hidden="true" className="text-3xl">
              🤖
            </span>
            <p className="text-sm text-muted-foreground">{t("chat", "signedOutPrompt", lang)}</p>
            <Link
              href={SIGN_IN_ROUTE}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              {t("nav", "signIn", lang)}
            </Link>
          </div>
        </SignedOut>
      )}
      {open && (
        <SignedIn>
          <div className="flex h-[500px] w-80 flex-col overflow-hidden rounded-2xl border bg-background shadow-xl sm:w-96">
            {/* Header */}
            <div className="flex items-center justify-between bg-primary px-4 py-3">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="text-lg">
                  🤖
                </span>
                <div>
                  <p className="text-sm font-semibold text-primary-foreground">
                    {t("chat", "title", lang)}
                  </p>
                  <p className="text-xs text-primary-foreground/70">
                    {t("chat", "poweredBy", lang)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label={t("chat", "closeChat", lang)}
                className="text-lg leading-none text-primary-foreground/70 hover:text-primary-foreground"
              >
                ✕
              </button>
            </div>

            {/* Messages */}
            <div
              role="log"
              aria-label={t("chat", "conversation", lang)}
              className="flex-1 space-y-3 overflow-y-auto p-4"
            >
              <div className="flex justify-start">
                <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm text-foreground">
                  {t("chat", "greeting", lang)}
                </div>
              </div>
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                      msg.role === "user"
                        ? "rounded-br-sm bg-primary text-primary-foreground"
                        : "rounded-bl-sm bg-muted text-foreground"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm text-muted-foreground">
                    {t("chat", "thinking", lang)}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="border-t p-3">
              {rateLimited && (
                <p className="mb-2 text-xs text-muted-foreground">
                  {countdownBefore}
                  <span className="font-mono font-medium">{formatCountdown(retryRemainingMs)}</span>
                  {countdownAfter}
                </p>
              )}
              <div className="flex gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  aria-label={t("chat", "inputLabel", lang)}
                  maxLength={MAX_MESSAGE_LENGTH}
                  placeholder={t("chat", placeholderKey, lang)}
                  rows={1}
                  disabled={rateLimited}
                  className="flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                />
                <button
                  onClick={sendMessage}
                  disabled={loading || !input.trim() || rateLimited}
                  className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {t("chat", "send", lang)}
                </button>
              </div>
            </div>
          </div>
        </SignedIn>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen(!open)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-2xl shadow-lg transition-opacity hover:opacity-90"
        aria-label={t("chat", toggleLabelKey, lang)}
        aria-expanded={open}
      >
        {open ? "✕" : "💬"}
      </button>
    </div>
  );
}
