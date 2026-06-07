"use client";

import { use } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { useCultureTopic } from "@/hooks/useCulture";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";

interface Props {
  params: Promise<{ slug: string }>;
}

export default function CultureTopicPage({ params }: Props) {
  const { slug } = use(params);
  const { data: topic, isLoading, error } = useCultureTopic(slug);
  const { lang } = useLang();

  if (isLoading) return <ArticleSkeleton />;

  if (error || !topic) {
    return (
      <div className="space-y-4">
        <BackLink />
        <p className="text-sm text-destructive">{t("culture", "notFound", lang)}</p>
      </div>
    );
  }

  const date = new Date(topic.published_at).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackLink />

      <div className="space-y-3">
        <h1 className="text-2xl font-semibold leading-tight">{topic.title}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground">{date}</span>
          {topic.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <div className="prose prose-sm max-w-none dark:prose-invert">
          <ReactMarkdown>{topic.body}</ReactMarkdown>
        </div>
      </div>

      <div className="flex justify-between pt-2">
        <BackLink />
      </div>
    </div>
  );
}

function BackLink() {
  const { lang } = useLang();
  return (
    <Link
      href="/dashboard/culture"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      {t("culture", "backToCulture", lang)}
    </Link>
  );
}

function ArticleSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="h-4 w-24 animate-pulse rounded bg-muted" />
      <div className="space-y-2">
        <div className="h-7 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-3 w-32 animate-pulse rounded bg-muted" />
      </div>
      <div className="space-y-3 rounded-lg border bg-card p-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className={`h-3 animate-pulse rounded bg-muted ${i % 4 === 3 ? "w-2/3" : "w-full"}`}
          />
        ))}
      </div>
    </div>
  );
}
