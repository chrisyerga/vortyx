export const ROOT_DOMAIN = "vortyx.dev";

/**
 * Site pages are BUILT under /sites/<key>/ but SERVED at <key>.vortyx.dev/
 * (the container's Caddy rewrites Host → path prefix). Every internal link on
 * a site page must go through this helper: prefixed in `astro dev`,
 * subdomain-root-relative in production builds.
 */
export function siteHref(siteKey: string, path = "/"): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return import.meta.env.DEV ? `/sites/${siteKey}${p}` : p;
}

/** Canonical/OG URLs always use the real subdomain, in every environment. */
export function siteAbsoluteUrl(siteKey: string, path = "/"): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `https://${siteKey}.${ROOT_DOMAIN}${p}`;
}
