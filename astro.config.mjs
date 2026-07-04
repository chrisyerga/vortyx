// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://vortyx.dev',
  integrations: [
    react(),
    sitemap({
      // /admin is private; /sites/* pages are served on subdomains, so their
      // vortyx.dev/sites/... URLs would be wrong hosts. Per-subdomain sitemaps
      // are a follow-up.
      filter: (page) => !page.includes('/admin') && !page.includes('/sites/'),
    }),
  ],

  vite: {
    plugins: [tailwindcss()],
  },
});
