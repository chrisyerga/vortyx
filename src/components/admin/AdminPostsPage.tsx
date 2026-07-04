import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import MarkdownIt from "markdown-it";
import sanitizeHtml from "sanitize-html";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { convexClient } from "../../lib/convexClient";

const md = new MarkdownIt();

function renderPreview(markdown: string): string {
  return sanitizeHtml(md.render(markdown), {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
  });
}

type PostFormState = {
  id: Id<"posts"> | null;
  title: string;
  slug: string;
  excerpt: string;
  tags: string; // comma-separated in the form
  metaDescription: string;
  body: string;
};

const EMPTY_POST: PostFormState = {
  id: null,
  title: "",
  slug: "",
  excerpt: "",
  tags: "",
  metaDescription: "",
  body: "",
};

function parseTags(value: string): string[] | undefined {
  const tags = value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return tags.length > 0 ? tags : undefined;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs ${
        status === "published"
          ? "bg-emerald-500/20 text-emerald-300"
          : "bg-white/10 opacity-70"
      }`}
    >
      {status}
    </span>
  );
}

export function AdminPostsPage({
  token,
  onError,
}: {
  token: string;
  onError: (message: string | null) => void;
}) {
  const sites = useQuery(api.sites.listAll, { token });
  const [siteId, setSiteId] = useState<Id<"sites"> | null>(null);

  const effectiveSiteId = siteId ?? sites?.[0]?._id ?? null;
  const posts = useQuery(
    api.posts.listBySite,
    effectiveSiteId ? { token, siteId: effectiveSiteId } : "skip",
  );

  const createPost = useMutation(api.posts.create);
  const updatePost = useMutation(api.posts.update);
  const publishPost = useMutation(api.posts.publish);
  const unpublishPost = useMutation(api.posts.unpublish);
  const removePost = useMutation(api.posts.remove);

  const [form, setForm] = useState<PostFormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const previewHtml = useMemo(
    () => (form && showPreview ? renderPreview(form.body) : ""),
    [form?.body, showPreview],
  );

  const startCreate = () => setForm(EMPTY_POST);

  const startEdit = async (postId: Id<"posts">) => {
    onError(null);
    try {
      // One-shot fetch: full bodies stay out of reactive queries.
      const post = await convexClient.query(api.posts.get, {
        token,
        id: postId,
      });
      setForm({
        id: post._id,
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        tags: (post.tags ?? []).join(", "),
        metaDescription: post.seo.metaDescription,
        body: post.body,
      });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to load post");
    }
  };

  const set = (field: keyof PostFormState) => (value: string) =>
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!form || !effectiveSiteId) return;
    setBusy(true);
    onError(null);
    try {
      if (form.id) {
        await updatePost({
          token,
          id: form.id,
          title: form.title,
          slug: form.slug,
          body: form.body,
          excerpt: form.excerpt,
          tags: parseTags(form.tags),
          seo: { metaDescription: form.metaDescription },
        });
      } else {
        await createPost({
          token,
          siteId: effectiveSiteId,
          title: form.title,
          slug: form.slug,
          body: form.body,
          excerpt: form.excerpt,
          tags: parseTags(form.tags),
          status: "draft",
          source: "manual",
          seo: { metaDescription: form.metaDescription },
        });
      }
      setForm(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to save post");
    } finally {
      setBusy(false);
    }
  };

  const withErrorHandling = async (fn: () => Promise<unknown>) => {
    onError(null);
    try {
      await fn();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Operation failed");
    }
  };

  if (sites === undefined) {
    return <p className="opacity-70">Loading…</p>;
  }

  if (sites.length === 0) {
    return (
      <p className="opacity-70">
        Create a site first — posts belong to a site.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2">
          <span className="text-sm opacity-70">Site</span>
          <select
            value={effectiveSiteId ?? undefined}
            onChange={(e) => {
              setSiteId(e.target.value as Id<"sites">);
              setForm(null);
            }}
            className="admin-input"
          >
            {sites.map((site) => (
              <option key={site._id} value={site._id}>
                {site.name} ({site.key})
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={startCreate}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium hover:bg-violet-500"
        >
          New post
        </button>
      </div>

      {posts === undefined ? (
        <p className="opacity-70">Loading posts…</p>
      ) : (
        <ul className="space-y-2">
          {posts.map((post) => (
            <li
              key={post._id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{post.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs opacity-60">
                  <span className="font-mono">/{post.slug}/</span>
                  <span>· {post.source}</span>
                  {post.deployStatus && <span>· deploy: {post.deployStatus}</span>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={post.status} />
                <button
                  type="button"
                  onClick={() => void startEdit(post._id)}
                  className="rounded-lg border border-white/15 px-3 py-1 text-sm hover:bg-white/10"
                >
                  Edit
                </button>
                {post.status === "draft" ? (
                  <button
                    type="button"
                    onClick={() =>
                      void withErrorHandling(() =>
                        publishPost({ token, id: post._id }),
                      )
                    }
                    className="rounded-lg border border-emerald-500/40 px-3 py-1 text-sm text-emerald-300 hover:bg-emerald-500/10"
                  >
                    Publish
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      void withErrorHandling(() =>
                        unpublishPost({ token, id: post._id }),
                      )
                    }
                    className="rounded-lg border border-white/15 px-3 py-1 text-sm hover:bg-white/10"
                  >
                    Unpublish
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Delete post "${post.title}"?`)) {
                      void withErrorHandling(() =>
                        removePost({ token, id: post._id }),
                      );
                    }
                  }}
                  className="rounded-lg border border-red-500/40 px-3 py-1 text-sm text-red-300 hover:bg-red-500/10"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
          {posts.length === 0 && (
            <li className="opacity-70">No posts on this site yet.</li>
          )}
        </ul>
      )}

      {form && (
        <form
          onSubmit={(e) => void handleSave(e)}
          className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-6"
        >
          <h3 className="text-lg font-semibold">
            {form.id ? "Edit post" : "New post (saved as draft)"}
          </h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="admin-label">Title</span>
              <input
                value={form.title}
                onChange={(e) => set("title")(e.target.value)}
                required
                className="admin-input"
              />
            </label>
            <label className="block">
              <span className="admin-label">Slug</span>
              <input
                value={form.slug}
                onChange={(e) => set("slug")(e.target.value)}
                required
                className="admin-input"
              />
            </label>
            <label className="block">
              <span className="admin-label">Tags (comma-separated)</span>
              <input
                value={form.tags}
                onChange={(e) => set("tags")(e.target.value)}
                className="admin-input"
              />
            </label>
            <label className="block">
              <span className="admin-label">Excerpt</span>
              <input
                value={form.excerpt}
                onChange={(e) => set("excerpt")(e.target.value)}
                required
                className="admin-input"
              />
            </label>
          </div>

          <label className="block">
            <span className="admin-label">Meta description (SEO)</span>
            <textarea
              value={form.metaDescription}
              onChange={(e) => set("metaDescription")(e.target.value)}
              required
              rows={2}
              className="admin-input"
            />
          </label>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="admin-label">Body (markdown)</span>
              <button
                type="button"
                onClick={() => setShowPreview((p) => !p)}
                className="text-xs underline opacity-70 hover:opacity-100"
              >
                {showPreview ? "Hide preview" : "Show preview"}
              </button>
            </div>
            <textarea
              value={form.body}
              onChange={(e) => set("body")(e.target.value)}
              required
              rows={16}
              className="admin-input font-mono text-sm"
            />
            {showPreview && (
              <div
                className="prose-vortyx mt-4 rounded-lg border border-white/10 bg-black/20 p-4"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium hover:bg-violet-500 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setForm(null)}
              className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
