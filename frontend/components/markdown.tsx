import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Wide content scrolls inside its own box so the page never scrolls sideways.
// A scrolling box has to take focus to be scrolled from the keyboard.
const SCROLL_BOX =
  "overflow-x-auto rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

// Each renderer drops react-markdown's `node` prop, which isn't a DOM attribute.
const COMPONENTS: Components = {
  h2: ({ node: _node, ...props }) => (
    <h2 className="pt-2 text-base font-semibold text-foreground" {...props} />
  ),
  h3: ({ node: _node, ...props }) => (
    <h3 className="text-sm font-semibold text-foreground" {...props} />
  ),
  ul: ({ node: _node, ...props }) => <ul className="list-disc space-y-1 pl-5" {...props} />,
  ol: ({ node: _node, ...props }) => <ol className="list-decimal space-y-1 pl-5" {...props} />,
  strong: ({ node: _node, ...props }) => (
    <strong className="font-semibold text-foreground" {...props} />
  ),
  // Links to other sites open in a new tab, so the reader keeps their place.
  a: ({ node: _node, href, ...props }) => (
    <a
      href={href}
      className="rounded font-medium text-indigo underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      {...(href && /^https?:\/\//.test(href)
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
      {...props}
    />
  ),
  code: ({ node: _node, ...props }) => (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]" {...props} />
  ),
  pre: ({ node: _node, ...props }) => (
    <pre
      tabIndex={0}
      className={`${SCROLL_BOX} bg-muted p-4 font-mono text-xs leading-relaxed [&>code]:p-0`}
      {...props}
    />
  ),
  table: ({ node: _node, ...props }) => (
    <div tabIndex={0} className={`${SCROLL_BOX} border`}>
      <table className="w-full border-collapse text-left" {...props} />
    </div>
  ),
  th: ({ node: _node, ...props }) => (
    <th
      className="whitespace-nowrap border-b bg-muted px-3 py-2 font-semibold text-foreground"
      {...props}
    />
  ),
  td: ({ node: _node, ...props }) => (
    <td className="border-b px-3 py-2 align-top [tr:last-child_&]:border-b-0" {...props} />
  ),
};

/** Article Markdown, including GitHub-style tables, styled with the design tokens. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-foreground">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
