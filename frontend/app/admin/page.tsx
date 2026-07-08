"use client";

import { useState } from "react";
import Link from "next/link";
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

  return (
    <div className="min-h-screen bg-muted/40">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
              🏠 Home
            </Link>
            <Link
              href="/dashboard/resumes"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Back to app
            </Link>
            <span className="font-semibold">Admin Panel</span>
          </div>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            Admin
          </span>
        </div>
      </header>

      <div className="container py-8">
        {/* Tabs */}
        <div className="mb-6 flex gap-2 border-b">
          {(["stats", "users", "culture", "glossary"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize transition-colors ${
                tab === t
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "stats" && <StatsTab />}
        {tab === "users" && <UsersTab />}
        {tab === "culture" && <CultureTab />}
        {tab === "glossary" && <GlossaryTab />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stats tab
// ---------------------------------------------------------------------------

function StatsTab() {
  const { data, isLoading, error } = useStats();

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error)
    return <p className="text-sm text-destructive">Failed to load stats. Are you an admin?</p>;
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
        <div key={c.label} className="rounded-xl border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">{c.label}</p>
          <p className="mt-1 text-3xl font-bold">{c.value}</p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Users tab
// ---------------------------------------------------------------------------

function UsersTab() {
  const { data, isLoading, error } = useUsers();
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

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error) return <p className="text-sm text-destructive">Failed to load users.</p>;

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
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
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      user.role === "admin"
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {user.role}
                  </span>
                </td>
                <td className="px-4 py-2 capitalize">{user.subscription_tier}</td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      user.is_active
                        ? "bg-success/10 text-success"
                        : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {user.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <button
                    onClick={() =>
                      promoteUser.mutate({
                        id: user.id,
                        role: user.role === "admin" ? "user" : "admin",
                      })
                    }
                    className="text-xs text-muted-foreground underline hover:text-foreground"
                  >
                    {user.role === "admin" ? "Demote" : "Make admin"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Culture topics tab
// ---------------------------------------------------------------------------

function CultureTab() {
  const { data, isLoading, error } = useTopics();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const confirmDialog = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ slug: "", title: "", body: "", tags: "", published: true });

  const createTopic = useMutation({
    mutationFn: (body: object) => apiClient.post("/admin/culture/topics", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "topics"] });
      setShowForm(false);
      setForm({ slug: "", title: "", body: "", tags: "", published: true });
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
    });
    if (ok) deleteTopic.mutate(slug);
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error) return <p className="text-sm text-destructive">Failed to load topics.</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {showForm ? "Cancel" : "+ New topic"}
        </button>
      </div>

      {showForm && (
        <div className="space-y-3 rounded-xl border bg-card p-6 shadow-sm">
          <h3 className="font-medium">New culture topic</h3>
          {(["slug", "title"] as const).map((field) => (
            <div key={field}>
              <label
                htmlFor={`topic-${field}`}
                className="text-xs font-medium capitalize text-muted-foreground"
              >
                {field}
              </label>
              <input
                id={`topic-${field}`}
                value={form[field]}
                onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
          ))}
          <div>
            <label htmlFor="topic-tags" className="text-xs font-medium text-muted-foreground">
              Tags (comma-separated)
            </label>
            <input
              id="topic-tags"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="topic-body" className="text-xs font-medium text-muted-foreground">
              Body (Markdown)
            </label>
            <textarea
              id="topic-body"
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              rows={6}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.published}
              onChange={(e) => setForm({ ...form, published: e.target.checked })}
            />
            Publish immediately
          </label>
          <button
            onClick={() =>
              createTopic.mutate({
                ...form,
                tags: form.tags
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
              })
            }
            disabled={createTopic.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {createTopic.isPending ? "Creating…" : "Create topic"}
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
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
                      <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                        {tag}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      topic.published
                        ? "bg-success/10 text-success"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {topic.published ? "Published" : "Draft"}
                  </span>
                </td>
                <td className="flex gap-3 px-4 py-2">
                  <button
                    onClick={() =>
                      togglePublish.mutate({ slug: topic.slug, published: !topic.published })
                    }
                    className="text-xs text-muted-foreground underline hover:text-foreground"
                  >
                    {topic.published ? "Unpublish" : "Publish"}
                  </button>
                  <button
                    onClick={() => handleDeleteTopic(topic.slug, topic.title)}
                    className="text-xs text-destructive underline hover:opacity-80"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Glossary tab
// ---------------------------------------------------------------------------

function GlossaryTab() {
  const { data, isLoading, error } = useGlossary();
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
    });
    if (ok) deleteEntry.mutate(id);
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error) return <p className="text-sm text-destructive">Failed to load glossary.</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {showForm ? "Cancel" : "+ New entry"}
        </button>
      </div>

      {showForm && (
        <div className="space-y-3 rounded-xl border bg-card p-6 shadow-sm">
          <h3 className="font-medium">New glossary entry</h3>
          {[
            { key: "term_ja", label: "Japanese term" },
            { key: "reading_romaji", label: "Romaji reading" },
            { key: "definition_id", label: "Definition (Indonesian)" },
          ].map(({ key, label }) => (
            <div key={key}>
              <label
                htmlFor={`glossary-${key}`}
                className="text-xs font-medium text-muted-foreground"
              >
                {label}
              </label>
              <input
                id={`glossary-${key}`}
                value={form[key as keyof typeof form]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
          ))}
          <button
            onClick={() => createEntry.mutate(form)}
            disabled={createEntry.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {createEntry.isPending ? "Adding…" : "Add entry"}
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
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
                <td className="px-4 py-2 font-medium">{entry.term_ja}</td>
                <td className="px-4 py-2 text-muted-foreground">{entry.reading_romaji}</td>
                <td className="max-w-xs truncate px-4 py-2 text-muted-foreground">
                  {entry.definition_id}
                </td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => handleDeleteEntry(entry.id, entry.term_ja)}
                    className="text-xs text-destructive underline hover:opacity-80"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
