"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, Languages } from "lucide-react";
import { RetryButton } from "@/components/retry-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup } from "@/components/ui/toggle-group";
import { useCultureTopics, useGlossary } from "@/hooks/useCulture";
import { useLang } from "@/lib/language-context";
import { japaneseLangOf, t } from "@/lib/i18n";
import type { CultureTopicSummary, GlossaryEntry } from "@/types/api";

const COMMON_TAGS = ["keigo", "マナー", "報連相", "会議", "残業", "チームワーク"];

export default function CulturePage() {
  const [activeTab, setActiveTab] = useState<"topics" | "glossary">("topics");
  const [selectedTag, setSelectedTag] = useState<string | undefined>(undefined);
  const { lang } = useLang();

  const {
    data: topics,
    isLoading: topicsLoading,
    error: topicsError,
    isFetching: topicsFetching,
    refetch: refetchTopics,
  } = useCultureTopics({ tag: selectedTag });
  const {
    data: glossary,
    isLoading: glossaryLoading,
    error: glossaryError,
    isFetching: glossaryFetching,
    refetch: refetchGlossary,
  } = useGlossary();

  return (
    <>
      <PageHeader
        eyebrow={t("nav", "groupSettleIn", lang)}
        title={t("culture", "title", lang)}
        description={t("culture", "sub", lang)}
      />
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as "topics" | "glossary")}
      >
        <TabsList aria-label={t("culture", "sectionsLabel", lang)}>
          <TabsTrigger value="topics">{t("culture", "topicsTab", lang)}</TabsTrigger>
          <TabsTrigger value="glossary">{t("culture", "glossaryTab", lang)}</TabsTrigger>
        </TabsList>

        <TabsContent value="topics" className="space-y-6">
          <ToggleGroup<string>
            label={t("culture", "tagsLabel", lang)}
            value={selectedTag ?? "all"}
            onChange={(value) =>
              // A second press on the selected tag clears it, as before.
              setSelectedTag(value === "all" || value === selectedTag ? undefined : value)
            }
            options={[
              { value: "all", label: t("culture", "allTags", lang) },
              ...COMMON_TAGS.map((tag) => {
                const tagLang = japaneseLangOf(tag);
                return { value: tag, label: tag, ...(tagLang ? { lang: tagLang } : {}) };
              }),
            ]}
          />
          {topicsLoading && <TopicsSkeleton />}
          {topicsError && (
            <Alert
              action={
                <RetryButton retrying={topicsFetching} onRetry={() => void refetchTopics()} />
              }
            >
              {t("culture", "topicsLoadError", lang)}
            </Alert>
          )}
          {topics && topics.length === 0 && (
            <EmptyState icon={BookOpen} title={t("culture", "noTopics", lang)} />
          )}
          {topics && topics.length > 0 && (
            <ul className="grid gap-4 sm:grid-cols-2">
              {topics.map((topic) => (
                <TopicCard key={topic.id} topic={topic} />
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="glossary" className="space-y-6">
          {glossaryLoading && <GlossarySkeleton />}
          {glossaryError && (
            <Alert
              action={
                <RetryButton retrying={glossaryFetching} onRetry={() => void refetchGlossary()} />
              }
            >
              {t("culture", "glossaryLoadError", lang)}
            </Alert>
          )}
          {glossary && glossary.length === 0 && (
            <EmptyState icon={Languages} title={t("culture", "noGlossary", lang)} />
          )}
          {glossary && glossary.length > 0 && <GlossaryTable entries={glossary} />}
        </TabsContent>
      </Tabs>
    </>
  );
}

// ---------------------------------------------------------------------------
// Topic card
// ---------------------------------------------------------------------------

function TopicCard({ topic: tp }: { topic: CultureTopicSummary }) {
  const { lang } = useLang();
  const date = new Date(tp.published_at).toLocaleDateString(lang, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <li>
      <Link
        href={`/dashboard/culture/${tp.slug}`}
        className="block h-full rounded-lg border bg-card p-5 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <p className="font-medium leading-snug">{tp.title}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tp.tags.map((tag) => (
            <Badge key={tag} lang={japaneseLangOf(tag)}>
              {tag}
            </Badge>
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
      <Input
        type="search"
        aria-label={t("culture", "searchLabel", lang)}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("culture", "searchPlaceholder", lang)}
        className="max-w-sm"
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
                <td lang="ja" className="px-4 py-3 font-medium">
                  {entry.term_ja}
                </td>
                <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                  {entry.reading_romaji ?? "—"}
                </td>
                <td lang="id" className="px-4 py-3 text-muted-foreground">
                  {entry.definition_id}
                </td>
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
    <div className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-36 rounded-lg" />
      ))}
    </div>
  );
}

function GlossarySkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-10" />
      ))}
    </div>
  );
}
