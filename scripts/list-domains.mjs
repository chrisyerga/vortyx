// Prints the space-separated domain list for `porch service register --domain`,
// canonical domain first. The list is dynamic: every enabled site in Convex
// contributes its subdomain. Used by .github/workflows/deploy.yml.
import { ConvexHttpClient } from "convex/browser";

const url = process.env.PUBLIC_CONVEX_URL;
if (!url) {
  console.error("PUBLIC_CONVEX_URL is required");
  process.exit(1);
}

const client = new ConvexHttpClient(url);
const domains = await client.query("sites:listDomains", {});

if (!Array.isArray(domains) || domains.length === 0) {
  console.error("sites:listDomains returned no domains");
  process.exit(1);
}

console.log(domains.join(" "));
