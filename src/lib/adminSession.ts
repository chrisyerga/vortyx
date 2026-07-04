export const ADMIN_SESSION_KEY = "adminSessionToken";

export function getStoredAdminToken(): string | null {
  return localStorage.getItem(ADMIN_SESSION_KEY);
}

export function setStoredAdminToken(token: string): void {
  localStorage.setItem(ADMIN_SESSION_KEY, token);
}

export function clearStoredAdminToken(): void {
  localStorage.removeItem(ADMIN_SESSION_KEY);
}

export type AdminSection = "sites" | "posts" | "generate";

export const ADMIN_SECTIONS: Array<{ id: AdminSection; label: string; href: string }> = [
  { id: "sites", label: "Sites", href: "/admin/sites/" },
  { id: "posts", label: "Posts", href: "/admin/posts/" },
  { id: "generate", label: "Generate", href: "/admin/generate/" },
];
