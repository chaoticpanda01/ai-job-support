"use client";

import { useState } from "react";
import Link from "next/link";
import { useCultureTopics, useGlossary } from "@/hooks/useCulture";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { CultureTopicSummary, GlossaryEntry } from "@/types/api";

const COMMON_TAGS = ["keigo", "マナー", "報連相", "会議", "残業", "チームワーク"];

export default function CulturePage() {
  const [activeTab, setActiveTab] = useState<"topics" | "glossary">("topics");
  const [selectedTag, setSelectedTag] = useState<string | undefined>(undefined);
  const { lang } = useLang();

  const { data: topics, isLoading: topicsLoading } = useCultureTopics({ tag: selectedTag });
  const { data: glossary, isLoading: glossaryLoading } = useGlossary();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{t("culture", "title", lang)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("culture", "sub", lang)}</p>
      </div>

      {/* Tabs */}
      <div className="flex w-fit gap-1 rounded-lg border bg-muted p-1">
        {(["topics", "glossary"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "topics" ? t("culture", "topicsTab", lang) : t("culture", "glossaryTab", lang)}
          </button>
        ))}
      </div>

      {activeTab === "topics" && (
        <>
          {/* Tag filter chips */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedTag(undefined)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                selectedTag === undefined
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("culture", "allTags", lang)}
            </button>
            {COMMON_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(selectedTag === tag ? undefined : tag)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  selectedTag === tag
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>

          {topicsLoading && <TopicsSkeleton />}

          {topics && topics.length === 0 && !topicsLoading && (
            <div className="rounded-lg border border-dashed p-10 text-center">
              <p className="text-sm text-muted-foreground">{t("culture", "noTopics", lang)}</p>
            </div>
          )}

          {topics && topics.length > 0 && (
            <ul className="grid gap-4 sm:grid-cols-2">
              {topics.map((topic) => (
                <TopicCard key={topic.id} topic={topic} />
              ))}
            </ul>
          )}
        </>
      )}

      {activeTab === "glossary" && (
        <>
          {glossaryLoading && <GlossarySkeleton />}

          {glossary && glossary.length === 0 && !glossaryLoading && (
            <div className="rounded-lg border border-dashed p-10 text-center">
              <p className="text-sm text-muted-foreground">{t("culture", "noGlossary", lang)}</p>
            </div>
          )}

          {glossary && glossary.length > 0 && <GlossaryTable entries={glossary} />}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Topic card
// ---------------------------------------------------------------------------

function TopicCard({ topic: tp }: { topic: CultureTopicSummary }) {
  const date = new Date(tp.published_at).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <li>
      <Link
        href={`/dashboard/culture/${tp.slug}`}
        className="block h-full rounded-lg border bg-card p-5 transition-colors hover:bg-accent"
      >
        <p className="font-medium leading-snug">{tp.title}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tp.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{date}</p>
      </Link>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Glossary table
// ---------------------------------------------------------------------------

function GlossaryTable({ entries }: { entries: GlossaryEntry[] }) {
  const [search, setSearch] = useState("");
  const { lang } = useLang();

  const filtered = search
    ? entries.filter(
        (e) =>
          e.term_ja.includes(search) ||
          e.reading_romaji?.toLowerCase().includes(search.toLowerCase()) ||
          e.definition_id.toLowerCase().includes(search.toLowerCase()),
      )
    : entries;

  return (
    <div className="space-y-4">
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("culture", "searchPlaceholder", lang)}
        className="w-full max-w-sm rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
      />
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                {t("culture", "colTerm", lang)}
              </th>
              <th className="hidden px-4 py-2.5 text-left font-medium text-muted-foreground sm:table-cell">
                {t("culture", "colReading", lang)}
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                {t("culture", "colDefinition", lang)}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((entry) => (
              <tr key={entry.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{entry.term_ja}</td>
                <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                  {entry.reading_romaji ?? "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{entry.definition_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            {t("culture", "noMatch", lang)}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeletons
// ---------------------------------------------------------------------------

function TopicsSkeleton() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="h-36 animate-pulse rounded-lg bg-muted" />
      ))}
    </ul>
  );
}

function GlossarySkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded bg-muted" />
      ))}
    </div>
  );
}
