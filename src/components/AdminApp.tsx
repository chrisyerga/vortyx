import { ConvexClientProvider } from "./ConvexClientProvider";
import { AdminLogin } from "./admin/AdminLogin";
import { AdminShell } from "./admin/AdminShell";
import { AdminSitesPage } from "./admin/AdminSitesPage";
import { AdminPostsPage } from "./admin/AdminPostsPage";
import { AdminGeneratePage } from "./admin/AdminGeneratePage";
import { useAdminSession } from "../hooks/useAdminSession";
import type { AdminSection } from "../lib/adminSession";

export function AdminApp({ section }: { section: AdminSection }) {
  return (
    <ConvexClientProvider>
      <AdminAppInner section={section} />
    </ConvexClientProvider>
  );
}

function AdminAppInner({ section }: { section: AdminSection }) {
  const session = useAdminSession();

  if (session.booting) {
    return <div className="min-h-screen" aria-busy="true" />;
  }

  if (!session.token) {
    return (
      <AdminLogin
        error={session.error}
        busy={session.busy}
        onLogin={session.handleLogin}
      />
    );
  }

  return (
    <AdminShell
      section={section}
      error={session.error}
      onLogout={() => void session.handleLogout()}
    >
      {section === "sites" && (
        <AdminSitesPage token={session.token} onError={session.setError} />
      )}
      {section === "posts" && (
        <AdminPostsPage token={session.token} onError={session.setError} />
      )}
      {section === "generate" && (
        <AdminGeneratePage token={session.token} onError={session.setError} />
      )}
    </AdminShell>
  );
}
