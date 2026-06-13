import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // SPA mode: prerender a fallback so client-side routing handles every page.
    // Output is plain static assets the existing Node server can serve.
    adapter: adapter({
      fallback: 'index.html',
      pages: 'build',
      assets: 'build',
      precompress: false,
      strict: false,
    }),
    // Served at the site root — this is now the primary dashboard.
    paths: {
      base: '',
    },
  },
};

export default config;
