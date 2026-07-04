import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import MarkdownIt from "markdown-it";
import sanitizeHtml from "sanitize-html";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { convexClient } from "../../lib/convexClient";

const md = new MarkdownIt();

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-white/10 opacity-70",
  queued: "bg-sky-500/20 text-sky-300",
  running: "bg-amber-500/20 text-amber-300",
  needs_input: "bg-violet-500/20 text-violet-300",
  complete: "bg-emerald-500/20 text-emerald-300",
  failed: "bg-red-500/20 text-red-300",
  canceled: "bg-white/10 opacity-70",
};

export function AdminGeneratePage({
  token,
  onError,
}: {
  token: string;
  onError: (message: string | null) => void;
}) {
  const sites = useQuery(api.sites.listAll, { token });
  const requests = useQuery(api.generation.listRequests, { token });
  const createRequest = useMutation(api.generation.createRequest);
  const provideInput = useMutation(api.generation.provideInput);
  const acceptDeliverable = useMutation(api.generation.acceptDeliverable);
  const removeRequest = useMutation(api.generation.removeRequest);

  const [siteId, setSiteId] = useState<Id<"sites"> | null>(null);
  const [keywords, setKeywords] = useState("");
  const [objective, setObjective] = useState("");
  const [audience, setAudience] = useState("");
  const [voice, setVoice] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const [review, setReview] = useState<Doc<"generationRequests"> | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const sitesById = useMemo(() => {
    const map = new Map<string, string>();
    for (const site of sites ?? []) map.set(site._id, `${site.name} (${site.key})`);
    return map;
  }, [sites]);

  const reviewHtml = useMemo(
    () =>
      review?.deliverable
        ? sanitizeHtml(md.render(review.deliverable.bodyMarkdown))
        : "",
    [review],
  );

  const effectiveSiteId = siteId ?? sites?.[0]?._id ?? null;

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!effectiveSiteId) return;
    setBusy(true);
    onError(null);
    try {
      await createRequest({
        token,
        siteId: effectiveSiteId,
        brief: {
          keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean),
          objective: objective || undefined,
          audience: audience || undefined,
          voice: voice || undefined,
          notes: notes || undefined,
        },
      });
      setKeywords("");
      setObjective("");
      setNotes("");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to create request");
    } finally {
      setBusy(false);
    }
  };

  const openReview = async (id: Id<"generationRequests">) => {
    onError(null);
    try {
      // One-shot fetch: the full deliverable stays out of reactive queries.
      const full = await convexClient.query(api.generation.getRequest, {
        token,
        id,
      });
      setReview(full);
      setAnswers({});
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to load request");
    }
  };

  const handleAccept = async () => {
    if (!review) return;
    setBusy(true);
    onError(null);
    try {
      await acceptDeliverable({ token, id: review._id });
      setReview(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to accept deliverable");
    } finally {
      setBusy(false);
    }
  };

  const handleProvideInput = async (event: FormEvent) => {
    event.preventDefault();
    if (!review) return;
    setBusy(true);
    onError(null);
    try {
      await provideInput({ token, id: review._id, answers });
      setReview(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to submit answers");
    } finally {
      setBusy(false);
    }
  };

  if (sites === undefined || requests === undefined) {
    return <p className="opacity-70">Loading…</p>;
  }

  if (sites.length === 0) {
    return <p className="opacity-70">Create a site first — generation requests target a site.</p>;
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={(e) => void handleCreate(e)}
        className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-6"
      >
        <h3 className="text-lg font-semibold">New generation request</h3>
        <p className="text-sm opacity-70">
          Kicks off a forge <code>seo_article</code> task. The result comes back
          as a reviewable deliverable you can accept as a draft post.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="admin-label">Site</span>
            <select
              value={effectiveSiteId ?? undefined}
              onChange={(e) => setSiteId(e.target.value as Id<"sites">)}
              className="admin-input"
            >
              {sites.map((site) => (
                <option key={site._id} value={site._id}>
                  {site.name} ({site.key})
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="admin-label">Keywords (comma-separated, required)</span>
            <input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="how to calm dog during fireworks"
              required
              className="admin-input"
            />
          </label>
          <label className="block">
            <span className="admin-label">Audience</span>
            <input
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="US dog owners"
              className="admin-input"
            />
          </label>
          <label className="block">
            <span className="admin-label">Voice</span>
            <input
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              placeholder="friendly, practical"
              className="admin-input"
            />
          </label>
        </div>
        <label className="block">
          <span className="admin-label">Objective</span>
          <input
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            className="admin-input"
          />
        </label>
        <label className="block">
          <span className="admin-label">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="admin-input"
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium hover:bg-violet-500 disabled:opacity-50"
        >
          {busy ? "Submitting…" : "Generate article"}
        </button>
      </form>

      <section>
        <h3 className="mb-3 text-lg font-semibold">Requests</h3>
        <ul className="space-y-2">
          {requests.map((request) => (
            <li
              key={request._id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {request.deliverableTitle ?? request.keywords.join(", ")}
                </p>
                <p className="mt-0.5 text-xs opacity-60">
                  {sitesById.get(request.siteId) ?? "unknown site"}
                  {request.currentStage && <span> · stage: {request.currentStage}</span>}
                  {request.iteration != null && <span> · iteration {request.iteration}</span>}
                </p>
                {request.errorMessage && (
                  <p className="mt-1 text-xs text-red-400">{request.errorMessage}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[request.status] ?? "bg-white/10"}`}
                >
                  {request.status}
                </span>
                {request.postId ? (
                  <a
                    href="/admin/posts/"
                    className="rounded-lg border border-white/15 px-3 py-1 text-sm hover:bg-white/10"
                  >
                    Draft created →
                  </a>
                ) : request.status === "complete" || request.status === "needs_input" ? (
                  <button
                    type="button"
                    onClick={() => void openReview(request._id)}
                    className="rounded-lg border border-emerald-500/40 px-3 py-1 text-sm text-emerald-300 hover:bg-emerald-500/10"
                  >
                    {request.status === "complete" ? "Review" : "Answer questions"}
                  </button>
                ) : null}
                {["failed", "canceled", "complete"].includes(request.status) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Delete this generation request?")) {
                        void removeRequest({ token, id: request._id }).catch(
                          (err) =>
                            onError(
                              err instanceof Error ? err.message : "Delete failed",
                            ),
                        );
                      }
                    }}
                    className="rounded-lg border border-red-500/40 px-3 py-1 text-sm text-red-300 hover:bg-red-500/10"
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
          {requests.length === 0 && (
            <li className="opacity-70">No generation requests yet.</li>
          )}
        </ul>
      </section>

      {review && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-6"
          onClick={() => setReview(null)}
        >
          <div
            className="w-full max-w-3xl rounded-2xl border border-white/10 bg-[#1a1d24] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {review.status === "needs_input" && review.pendingInput ? (
              <form onSubmit={(e) => void handleProvideInput(e)} className="space-y-4">
                <h3 className="text-lg font-semibold">Forge needs input</h3>
                {review.pendingInput.map((item) => (
                  <label key={item.key} className="block">
                    <span className="admin-label">{item.question}</span>
                    <input
                      value={answers[item.key] ?? ""}
                      onChange={(e) =>
                        setAnswers((prev) => ({ ...prev, [item.key]: e.target.value }))
                      }
                      required
                      className="admin-input"
                    />
                  </label>
                ))}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium hover:bg-violet-500 disabled:opacity-50"
                  >
                    Submit answers
                  </button>
                  <button
                    type="button"
                    onClick={() => setReview(null)}
                    className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/10"
                  >
                    Close
                  </button>
                </div>
              </form>
            ) : review.deliverable ? (
              <div className="space-y-4">
                <h3 className="text-xl font-semibold">{review.deliverable.title}</h3>
                <p className="text-sm opacity-70">
                  <span className="font-mono">/{review.deliverable.slug}/</span>
                  {review.deliverable.tags.length > 0 && (
                    <span> · {review.deliverable.tags.join(", ")}</span>
                  )}
                </p>
                <p className="text-sm opacity-80">
                  <strong>Meta:</strong> {review.deliverable.metaDescription}
                </p>
                <div
                  className="prose-vortyx max-h-96 overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-4"
                  dangerouslySetInnerHTML={{ __html: reviewHtml }}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleAccept()}
                    disabled={busy}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {busy ? "Accepting…" : "Accept as draft post"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setReview(null)}
                    className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/10"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <p className="opacity-70">Nothing to review.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
