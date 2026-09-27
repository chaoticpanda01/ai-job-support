"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useCultureTopic } from "@/hooks/useCulture";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Markdown } from "@/components/markdown";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useLang } from "@/lib/language-context";
import { japaneseLangOf, t } from "@/lib/i18n";

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
        <Breadcrumbs items={[{ label: t("culture", "title", lang), href: "/dashboard/culture" }]} />
        <Alert>{t("culture", "notFound", lang)}</Alert>
      </div>
    );
  }

  const date = new Date(topic.published_at).toLocaleDateString(lang, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Breadcrumbs
        items={[
          { label: t("culture", "title", lang), href: "/dashboard/culture" },
          { label: topic.title },
        ]}
      />

      <PageHeader
        className="mb-0"
        title={topic.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{date}</span>
            {topic.tags.map((tag) => (
              <Badge key={tag} lang={japaneseLangOf(tag)}>
                {tag}
              </Badge>
            ))}
          </span>
        }
      />

      <Card className="p-6">
        <Markdown>{topic.body}</Markdown>
      </Card>

      <div className="flex justify-between pt-2">
        <BackLink />
      </div>
    </div>
  );
}

function BackLink() {
  const { lang } = useLang();
  return (
    <Button asChild variant="ghost">
      <Link href="/dashboard/culture">
        <ArrowLeft aria-hidden="true" />
        {t("culture", "backToCulture", lang)}
      </Link>
    </Button>
  );
}

function ArticleSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Skeleton className="h-4 w-24" />
      <div className="space-y-2">
        <Skeleton className="h-7 w-3/4" />
        <Skeleton className="h-3 w-32" />
      </div>
      <Card className="space-y-3 p-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className={`h-3 ${i % 4 === 3 ? "w-2/3" : "w-full"}`} />
        ))}
      </Card>
    </div>
  );
}
