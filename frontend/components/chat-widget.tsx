"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import { SIGN_IN_ROUTE } from "@/lib/routes";
import { extractDetail } from "@/lib/api-client";

// Backend limit for ChatRequest.message and for each history item's content,
// counted in characters (code points). Longer values get a 422.
const MAX_MESSAGE_LENGTH = 8000;
const GENERIC_ERROR = "Sorry, something went wrong. Please try again.";

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

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hi! I'm your Japan Job Support assistant. Ask me anything about working in Japan, visas, Japanese workplace culture, or resume tips! 🇯🇵",
    },
  ]);
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
      const body = (await response.json()) as { reply?: string; detail?: unknown };

      if (!response.ok) {
        if (response.status === 429) {
          const retryAfterSeconds = Number(response.headers.get("Retry-After"));
          if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
            const nowMs = Date.now();
            setNow(nowMs);
            setRetryAt(nowMs + retryAfterSeconds * 1000);
          }
        }
        const fallback =
          response.status === 401
            ? "Please sign in to chat with the assistant."
            : response.status === 429
              ? "You've reached the chat limit — try again in a few hours."
              : GENERIC_ERROR;
        // A 422's detail is an array of objects, which React cannot render.
        setMessages([
          ...newMessages,
          { role: "assistant", content: extractDetail(body.detail, fallback) },
        ]);
        return;
      }

      // An empty reply would leave a blank bubble with nothing to read.
      setMessages([...newMessages, { role: "assistant", content: body.reply || GENERIC_ERROR }]);
    } catch {
      setMessages([...newMessages, { role: "assistant", content: GENERIC_ERROR }]);
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
            <p className="text-sm text-muted-foreground">
              Sign in first before chatting with the Japan Job Assistant.
            </p>
            <Link
              href={SIGN_IN_ROUTE}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Sign in
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
                    Japan Job Assistant
                  </p>
                  <p className="text-xs text-primary-foreground/70">Powered by Gemini AI</p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                className="text-lg leading-none text-primary-foreground/70 hover:text-primary-foreground"
              >
                ✕
              </button>
            </div>

            {/* Messages */}
            <div
              role="log"
              aria-label="Conversation"
              className="flex-1 space-y-3 overflow-y-auto p-4"
            >
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
                    Thinking…
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="border-t p-3">
              {rateLimited && (
                <p className="mb-2 text-xs text-muted-foreground">
                  Chat limit reached — you can send another message in{" "}
                  <span className="font-mono font-medium">{formatCountdown(retryRemainingMs)}</span>
                </p>
              )}
              <div className="flex gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  aria-label="Message the assistant"
                  maxLength={MAX_MESSAGE_LENGTH}
                  placeholder={rateLimited ? "Chat limit reached…" : "Ask me anything…"}
                  rows={1}
                  disabled={rateLimited}
                  className="flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                />
                <button
                  onClick={sendMessage}
                  disabled={loading || !input.trim() || rateLimited}
                  className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  Send
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
        aria-label={open ? "Close chat" : "Open chat"}
        aria-expanded={open}
      >
        {open ? "✕" : "💬"}
      </button>
    </div>
  );
}
