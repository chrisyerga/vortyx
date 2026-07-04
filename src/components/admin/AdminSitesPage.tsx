import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

type SiteFormState = {
  key: string;
  name: string;
  topic: string;
  description: string;
  accentColor: string;
  heroEmoji: string;
  forgeProjectId: string;
  metaDescription: string;
};

const EMPTY_FORM: SiteFormState = {
  key: "",
  name: "",
  topic: "",
  description: "",
  accentColor: "#6d28d9",
  heroEmoji: "",
  forgeProjectId: "",
  metaDescription: "",
};

function formFromSite(site: Doc<"sites">): SiteFormState {
  return {
    key: site.key,
    name: site.name,
    topic: site.topic,
    description: site.description,
    accentColor: site.theme.accentColor,
    heroEmoji: site.theme.heroEmoji ?? "",
    forgeProjectId: site.forgeProjectId ?? "",
    metaDescription: site.seo.metaDescription,
  };
}

function DeployBadge({
  status,
  error,
}: {
  status: string | null | undefined;
  error?: string | null;
}) {
  if (!status) return null;
  const styles: Record<string, string> = {
    pending: "bg-amber-500/20 text-amber-300",
    triggered: "bg-emerald-500/20 text-emerald-300",
    failed: "bg-red-500/20 text-red-300",
  };
  return (
    <span
      title={error ?? undefined}
      className={`rounded-full px-2 py-0.5 text-xs ${styles[status] ?? "bg-white/10"}`}
    >
      deploy: {status}
    </span>
  );
}

export function AdminSitesPage({
  token,
  onError,
}: {
  token: string;
  onError: (message: string | null) => void;
}) {
  const sites = useQuery(api.sites.listAll, { token });
  const createSite = useMutation(api.sites.create);
  const updateSite = useMutation(api.sites.update);
  const setStatus = useMutation(api.sites.setStatus);
  const removeSite = useMutation(api.sites.remove);

  const [editingId, setEditingId] = useState<Id<"sites"> | "new" | null>(null);
  const [form, setForm] = useState<SiteFormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const startCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId("new");
    setNotice(null);
  };

  const startEdit = (site: Doc<"sites">) => {
    setForm(formFromSite(site));
    setEditingId(site._id);
    setNotice(null);
  };

  const set = (field: keyof SiteFormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    onError(null);
    try {
      const shared = {
        token,
        name: form.name,
        topic: form.topic,
        description: form.description,
        theme: {
          accentColor: form.accentColor,
          heroEmoji: form.heroEmoji || undefined,
        },
        forgeProjectId: form.forgeProjectId || undefined,
        seo: { metaDescription: form.metaDescription },
      };
      if (editingId === "new") {
        await createSite({ ...shared, key: form.key });
        setNotice(
          "Site created — a deploy has been triggered. DNS + TLS for the new subdomain may take a minute or two after it finishes.",
        );
      } else if (editingId) {
        await updateSite({ ...shared, id: editingId });
        setNotice("Site updated.");
      }
      setEditingId(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to save site");
    } finally {
      setBusy(false);
    }
  };

  const handleToggle = async (site: Doc<"sites">) => {
    onError(null);
    try {
      await setStatus({
        token,
        id: site._id,
        status: site.status === "enabled" ? "disabled" : "enabled",
      });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  const handleRemove = async (site: Doc<"sites">) => {
    if (!confirm(`Delete site "${site.name}" (${site.key}.vortyx.dev)?`)) return;
    onError(null);
    try {
      await removeSite({ token, id: site._id });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to delete site");
    }
  };

  if (sites === undefined) {
    return <p className="opacity-70">Loading sites…</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Sites</h2>
        <button
          type="button"
          onClick={startCreate}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium hover:bg-violet-500"
        >
          New site
        </button>
      </div>

      {notice && (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {notice}
        </p>
      )}

      <ul className="space-y-3">
        {sites.map((site) => (
          <li
            key={site._id}
            className="rounded-xl border border-white/10 bg-white/5 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">
                  {site.theme.heroEmoji && <span>{site.theme.heroEmoji} </span>}
                  {site.name}
                  <span className="ml-2 font-mono text-xs opacity-60">
                    {site.key}.vortyx.dev
                  </span>
                </p>
                <p className="mt-1 text-sm opacity-70">{site.description}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    site.status === "enabled"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-white/10 opacity-70"
                  }`}
                >
                  {site.status}
                </span>
                <DeployBadge status={site.deployStatus} error={site.deployError} />
                <button
                  type="button"
                  onClick={() => startEdit(site)}
                  className="rounded-lg border border-white/15 px-3 py-1 text-sm hover:bg-white/10"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void handleToggle(site)}
                  className="rounded-lg border border-white/15 px-3 py-1 text-sm hover:bg-white/10"
                >
                  {site.status === "enabled" ? "Disable" : "Enable"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleRemove(site)}
                  className="rounded-lg border border-red-500/40 px-3 py-1 text-sm text-red-300 hover:bg-red-500/10"
                >
                  Delete
                </button>
              </div>
            </div>
          </li>
        ))}
        {sites.length === 0 && (
          <li className="opacity-70">No sites yet — create the first one.</li>
        )}
      </ul>

      {editingId !== null && (
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-6"
        >
          <h3 className="text-lg font-semibold">
            {editingId === "new" ? "New site" : "Edit site"}
          </h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Subdomain key"
              hint={editingId === "new" ? "lowercase, digits, hyphens — becomes <key>.vortyx.dev" : "cannot be changed"}
            >
              <input
                value={form.key}
                onChange={(e) => set("key")(e.target.value)}
                disabled={editingId !== "new"}
                required
                pattern="[a-z0-9][a-z0-9-]*"
                className="admin-input"
              />
            </Field>
            <Field label="Name">
              <input
                value={form.name}
                onChange={(e) => set("name")(e.target.value)}
                required
                className="admin-input"
              />
            </Field>
            <Field label="Topic">
              <input
                value={form.topic}
                onChange={(e) => set("topic")(e.target.value)}
                required
                className="admin-input"
              />
            </Field>
            <Field label="Accent color">
              <div className="flex gap-2">
                <input
                  type="color"
                  value={form.accentColor}
                  onChange={(e) => set("accentColor")(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border border-white/15 bg-transparent"
                />
                <input
                  value={form.accentColor}
                  onChange={(e) => set("accentColor")(e.target.value)}
                  className="admin-input flex-1"
                />
              </div>
            </Field>
            <Field label="Hero emoji" hint="optional">
              <input
                value={form.heroEmoji}
                onChange={(e) => set("heroEmoji")(e.target.value)}
                className="admin-input"
              />
            </Field>
            <Field
              label="Forge project id"
              hint="create a project in forge.lindale.tech and paste its id"
            >
              <input
                value={form.forgeProjectId}
                onChange={(e) => set("forgeProjectId")(e.target.value)}
                className="admin-input"
              />
            </Field>
          </div>

          <Field label="Description">
            <textarea
              value={form.description}
              onChange={(e) => set("description")(e.target.value)}
              required
              rows={2}
              className="admin-input"
            />
          </Field>
          <Field label="Meta description (SEO)">
            <textarea
              value={form.metaDescription}
              onChange={(e) => set("metaDescription")(e.target.value)}
              required
              rows={2}
              className="admin-input"
            />
          </Field>

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
              onClick={() => setEditingId(null)}
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

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wider opacity-70">
        {label}
        {hint && <span className="ml-2 normal-case opacity-60">({hint})</span>}
      </span>
      {children}
    </label>
  );
}
