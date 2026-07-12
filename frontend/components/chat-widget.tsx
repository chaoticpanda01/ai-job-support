"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
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
        body: JSON.stringify({ message: text, history: messages.slice(-10) }),
      });
      const body = (await response.json()) as { reply?: string; detail?: string };

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
              : "Sorry, something went wrong. Please try again.";
        setMessages([...newMessages, { role: "assistant", content: body.detail ?? fallback }]);
        return;
      }

      setMessages([...newMessages, { role: "assistant", content: body.reply ?? "" }]);
    } catch {
      setMessages([
        ...newMessages,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
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
        <div className="flex h-[500px] w-80 flex-col overflow-hidden rounded-2xl border bg-background shadow-xl sm:w-96">
          {/* Header */}
          <div className="flex items-center justify-between bg-primary px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🤖</span>
              <div>
                <p className="text-sm font-semibold text-primary-foreground">Japan Job Assistant</p>
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
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
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
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen(!open)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-2xl shadow-lg transition-opacity hover:opacity-90"
        aria-label="Open chat"
      >
        {open ? "✕" : "💬"}
      </button>
    </div>
  );
}
