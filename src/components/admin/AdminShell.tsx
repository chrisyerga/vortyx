import type { ReactNode } from "react";
import { ADMIN_SECTIONS, type AdminSection } from "../../lib/adminSession";

export function AdminShell({
  section,
  error,
  onLogout,
  children,
}: {
  section: AdminSection;
  error: string | null;
  onLogout: () => void;
  children: ReactNode;
}) {
  const active = ADMIN_SECTIONS.find((item) => item.id === section);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#12141a]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-2xl font-bold">Vortyx Admin</h1>
            {active && <p className="mt-0.5 text-sm opacity-70">{active.label}</p>}
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/10"
          >
            Sign out
          </button>
        </div>
        <nav
          className="mx-auto flex max-w-5xl gap-1 px-6 pb-0"
          aria-label="Admin sections"
        >
          {ADMIN_SECTIONS.map((item) => (
            <a
              key={item.id}
              href={item.href}
              className={`rounded-t-lg px-4 py-2 text-sm ${
                section === item.id
                  ? "bg-white/10 font-semibold"
                  : "opacity-70 hover:bg-white/5 hover:opacity-100"
              }`}
              aria-current={section === item.id ? "page" : undefined}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>

      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        {error && <p className="mb-6 text-sm text-red-400">{error}</p>}
        {children}
      </div>
    </div>
  );
}
