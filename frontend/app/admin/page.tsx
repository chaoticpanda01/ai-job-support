"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Home, Plus } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { TagInput } from "@/components/ui/tag-input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useMe } from "@/hooks/useMe";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useConfirm } from "@/components/confirm-dialog-provider";
import { useToast } from "@/hooks/use-toast";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Stats {
  total_users: number;
  active_users: number;
  total_resumes: number;
  total_documents: number;
  total_culture_topics: number;
  total_glossary_entries: number;
}

interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  subscription_tier: string;
  is_active: boolean;
  created_at: string;
}

interface Topic {
  slug: string;
  title: string;
  tags: string[];
  published: boolean;
  published_at: string | null;
}

interface GlossaryEntry {
  id: string;
  term_ja: string;
  reading_romaji: string;
  definition_id: string;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

function useStats() {
  return useQuery<Stats>({
    queryKey: ["admin", "stats"],
    queryFn: () => apiClient.get<Stats>("/admin/stats"),
  });
}

function useUsers() {
  return useQuery<{ items: AdminUser[]; total: number }>({
    queryKey: ["admin", "users"],
    queryFn: () => apiClient.get("/admin/users?limit=100"),
  });
}

function useTopics() {
  return useQuery<Topic[]>({
    queryKey: ["admin", "topics"],
    queryFn: () => apiClient.get("/admin/culture/topics"),
  });
}

function useGlossary() {
  return useQuery<GlossaryEntry[]>({
    queryKey: ["admin", "glossary"],
    queryFn: () => apiClient.get("/admin/culture/glossary"),
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Tab = "stats" | "users" | "culture" | "glossary";

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("stats");
  const { data: me, isLoading: meLoading } = useMe();

  // The backend already enforces this on every /admin route; this only
  // replaces four separate "failed to load" panels with one clear answer.
  if (meLoading) {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="flex min-h-screen items-center justify-center focus:outline-none"
      >
        <Loading />
      </main>
    );
  }

  if (me?.user.role !== "admin") {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 focus:outline-none"
      >
        <PageHeader
          className="mb-0"
          title="Admin access required"
          description="Your account doesn't have permission to view this page."
        />
        <Button asChild variant="secondary">
          <Link href="/dashboard">
            <ArrowLeft aria-hidden="true" />
            Back to app
          </Link>
        </Button>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-muted/40">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link href="/">
                <Home aria-hidden="true" />
                Home
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard">
                <ArrowLeft aria-hidden="true" />
                Back to app
              </Link>
            </Button>
          </div>
          <Badge variant="info">Admin</Badge>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="container py-8 focus:outline-none">
        <PageHeader title="Admin panel" description="Users, culture topics and the glossary." />
        {/* Radix Tabs supplies the tablist/tab/tabpanel roles, aria-selected, and
            arrow-key navigation. Inactive panels render empty, so each tab's
            queries still only run while it is open. */}
        <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
          <TabsList aria-label="Admin sections">
            {(["stats", "users", "culture", "glossary"] as Tab[]).map((section) => (
              <TabsTrigger key={section} value={section} className="capitalize">
                {section}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="stats">
            <StatsTab />
          </TabsContent>
          <TabsContent value="users">
            <UsersTab />
          </TabsContent>
          <TabsContent value="culture">
            <CultureTab />
          </TabsContent>
          <TabsContent value="glossary">
            <GlossaryTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stats tab
// ---------------------------------------------------------------------------

function StatsTab() {
  const { data, isLoading, isFetching, error, errorUpdateCount, refetch } = useStats();

  if (isLoading) return <Loading />;
  if (error)
    return (
      <LoadFailed
        failureCount={errorUpdateCount}
        retrying={isFetching}
        onRetry={() => void refetch()}
      >
        Failed to load stats. Are you an admin?
      </LoadFailed>
    );
  if (!data) return null;

  const cards = [
    { label: "Total users", value: data.total_users },
    { label: "Active users", value: data.active_users },
    { label: "Resumes uploaded", value: data.total_resumes },
    { label: "Documents generated", value: data.total_documents },
    { label: "Culture topics", value: data.total_culture_topics },
    { label: "Glossary entries", value: data.total_glossary_entries },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => (
        <Card key={c.label} className="p-6">
          <p className="text-sm text-muted-foreground">{c.label}</p>
          <p className="mt-1 text-3xl font-bold">{c.value}</p>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Users tab
// ---------------------------------------------------------------------------

function UsersTab() {
  const { data, isLoading, isFetching, error, errorUpdateCount, refetch } = useUsers();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const promoteUser = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      apiClient.patch(`/admin/users/${id}/role`, { role }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
    onError: () => {
      toast({ variant: "destructive", description: "Failed to update role. Please try again." });
    },
  });

  if (isLoading) return <Loading />;
  if (error)
    return (
      <LoadFailed
        failureCount={errorUpdateCount}
        retrying={isFetching}
        onRetry={() => void refetch()}
      >
        Failed to load users.
      </LoadFailed>
    );

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-medium">Users ({data?.total ?? 0})</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Email</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Name</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Role</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Tier</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((user) => (
              <tr key={user.id} className="border-b last:border-0 hover:bg-muted/20">
                <td className="px-4 py-2">{user.email}</td>
                <td className="px-4 py-2 text-muted-foreground">{user.full_name ?? "—"}</td>
                <td className="px-4 py-2">
                  <Badge variant={user.role === "admin" ? "info" : "neutral"}>{user.role}</Badge>
                </td>
                <td className="px-4 py-2 capitalize">{user.subscription_tier}</td>
                <td className="px-4 py-2">
                  <Badge variant={user.is_active ? "success" : "danger"}>
                    {user.is_active ? "Active" : "Inactive"}
                  </Badge>
                </td>
                <td className="px-4 py-2">
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() =>
                      promoteUser.mutate({
                        id: user.id,
                        role: user.role === "admin" ? "user" : "admin",
                      })
                    }
                  >
                    {user.role === "admin" ? "Demote" : "Make admin"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Culture topics tab
// ---------------------------------------------------------------------------

function CultureTab() {
  const { data, isLoading, isFetching, error, errorUpdateCount, refetch } = useTopics();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const confirmDialog = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    slug: "",
    title: "",
    body: "",
    tags: [] as string[],
    published: true,
  });

  const createTopic = useMutation({
    mutationFn: (body: object) => apiClient.post("/admin/culture/topics", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "topics"] });
      setShowForm(false);
      setForm({ slug: "", title: "", body: "", tags: [], published: true });
      toast({ variant: "success", description: "Topic created." });
    },
    onError: () => {
      toast({ variant: "destructive", description: "Failed to create topic. Please try again." });
    },
  });

  const togglePublish = useMutation({
    mutationFn: ({ slug, published }: { slug: string; published: boolean }) =>
      apiClient.patch(`/admin/culture/topics/${slug}`, { published }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "topics"] }),
    onError: () => {
      toast({ variant: "destructive", description: "Failed to update topic. Please try again." });
    },
  });

  const deleteTopic = useMutation({
    mutationFn: (slug: string) => apiClient.delete(`/admin/culture/topics/${slug}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "topics"] });
      toast({ variant: "success", description: "Topic deleted." });
    },
    onError: () => {
      toast({ variant: "destructive", description: "Failed to delete topic. Please try again." });
    },
  });

  async function handleDeleteTopic(slug: string, title: string) {
    const ok = await confirmDialog({
      title: `Delete "${title}"?`,
      variant: "destructive",
      confirmLabel: "Delete",
      // This page is English-only (it has no t() calls at all), unlike the
      // dialog it opens, which is shown in the user's language everywhere else.
      cancelLabel: "Cancel",
    });
    if (ok) deleteTopic.mutate(slug);
  }

  if (isLoading) return <Loading />;
  if (error)
    return (
      <LoadFailed
        failureCount={errorUpdateCount}
        retrying={isFetching}
        onRetry={() => void refetch()}
      >
        Failed to load topics.
      </LoadFailed>
    );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? (
            "Cancel"
          ) : (
            <>
              <Plus aria-hidden="true" />
              New topic
            </>
          )}
        </Button>
      </div>

      {showForm && (
        <Card className="space-y-3 p-6">
          <h3 className="font-medium">New culture topic</h3>
          {(["slug", "title"] as const).map((field) => (
            <Field key={field} label={field === "slug" ? "Slug" : "Title"}>
              <Input
                value={form[field]}
                onChange={(e) => setForm({ ...form, [field]: e.target.value })}
              />
            </Field>
          ))}
          <Field label="Tags">
            <TagInput
              value={form.tags}
              onChange={(tags) => setForm({ ...form, tags })}
              placeholder="Add a tag…"
              removeLabel="Remove {tag}"
            />
          </Field>
          <Field label="Body (Markdown)">
            <Textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              rows={6}
              className="font-mono"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.published}
              onChange={(e) => setForm({ ...form, published: e.target.checked })}
            />
            Publish immediately
          </label>
          <Button onClick={() => createTopic.mutate(form)} loading={createTopic.isPending}>
            {createTopic.isPending ? "Creating…" : "Create topic"}
          </Button>
        </Card>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Title</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Slug</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Tags</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((topic) => (
              <tr key={topic.slug} className="border-b last:border-0 hover:bg-muted/20">
                <td className="px-4 py-2 font-medium">{topic.title}</td>
                <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{topic.slug}</td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1">
                    {topic.tags.map((tag) => (
                      <Badge key={tag}>{tag}</Badge>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2">
                  <Badge variant={topic.published ? "success" : "neutral"}>
                    {topic.published ? "Published" : "Draft"}
                  </Badge>
                </td>
                <td className="flex gap-3 px-4 py-2">
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() =>
                      togglePublish.mutate({ slug: topic.slug, published: !topic.published })
                    }
                  >
                    {topic.published ? "Unpublish" : "Publish"}
                  </Button>
                  <Button
                    variant="link"
                    size="sm"
                    className="text-destructive"
                    onClick={() => void handleDeleteTopic(topic.slug, topic.title)}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Glossary tab
// ---------------------------------------------------------------------------

function GlossaryTab() {
  const { data, isLoading, isFetching, error, errorUpdateCount, refetch } = useGlossary();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const confirmDialog = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ term_ja: "", reading_romaji: "", definition_id: "" });

  const createEntry = useMutation({
    mutationFn: (body: object) => apiClient.post("/admin/culture/glossary", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "glossary"] });
      setShowForm(false);
      setForm({ term_ja: "", reading_romaji: "", definition_id: "" });
      toast({ variant: "success", description: "Entry created." });
    },
    onError: () => {
      toast({ variant: "destructive", description: "Failed to create entry. Please try again." });
    },
  });

  const deleteEntry = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/admin/culture/glossary/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "glossary"] });
      toast({ variant: "success", description: "Entry deleted." });
    },
    onError: () => {
      toast({ variant: "destructive", description: "Failed to delete entry. Please try again." });
    },
  });

  async function handleDeleteEntry(id: string, termJa: string) {
    const ok = await confirmDialog({
      title: `Delete "${termJa}"?`,
      variant: "destructive",
      confirmLabel: "Delete",
      // This page is English-only (it has no t() calls at all), unlike the
      // dialog it opens, which is shown in the user's language everywhere else.
      cancelLabel: "Cancel",
    });
    if (ok) deleteEntry.mutate(id);
  }

  if (isLoading) return <Loading />;
  if (error)
    return (
      <LoadFailed
        failureCount={errorUpdateCount}
        retrying={isFetching}
        onRetry={() => void refetch()}
      >
        Failed to load glossary.
      </LoadFailed>
    );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? (
            "Cancel"
          ) : (
            <>
              <Plus aria-hidden="true" />
              New entry
            </>
          )}
        </Button>
      </div>

      {showForm && (
        <Card className="space-y-3 p-6">
          <h3 className="font-medium">New glossary entry</h3>
          {[
            { key: "term_ja", label: "Japanese term" },
            { key: "reading_romaji", label: "Romaji reading" },
            { key: "definition_id", label: "Definition (Indonesian)" },
          ].map(({ key, label }) => (
            <Field key={key} label={label}>
              <Input
                value={form[key as keyof typeof form]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </Field>
          ))}
          <Button onClick={() => createEntry.mutate(form)} loading={createEntry.isPending}>
            {createEntry.isPending ? "Adding…" : "Add entry"}
          </Button>
        </Card>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Japanese</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Romaji</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Definition</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((entry) => (
              <tr key={entry.id} className="border-b last:border-0 hover:bg-muted/20">
                <td lang="ja" className="px-4 py-2 font-medium">
                  {entry.term_ja}
                </td>
                <td className="px-4 py-2 text-muted-foreground">{entry.reading_romaji}</td>
                <td lang="id" className="max-w-xs truncate px-4 py-2 text-muted-foreground">
                  {entry.definition_id}
                </td>
                <td className="px-4 py-2">
                  <Button
                    variant="link"
                    size="sm"
                    className="text-destructive"
                    onClick={() => void handleDeleteEntry(entry.id, entry.term_ja)}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function Loading() {
  return (
    <div className="space-y-3">
      {/* Skeleton is hidden from assistive tech, so say it in words too. */}
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 rounded-lg" />
    </div>
  );
}

/** English, like the rest of this page, so not the translated RetryButton. */
function LoadFailed({
  failureCount,
  retrying,
  onRetry,
  children,
}: {
  failureCount: number;
  retrying: boolean;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  return (
    <Alert
      announceKey={failureCount}
      action={
        <Button variant="secondary" size="sm" loading={retrying} onClick={onRetry}>
          Try again
        </Button>
      }
    >
      {children}
    </Alert>
  );
}
