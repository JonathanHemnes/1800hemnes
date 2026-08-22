# 1800hemnes.com

Personal site for Jonathan Hemnes. Astro, static, deployed to GitHub Pages.

## Editing the site

All copy lives in **`src/data/site.ts`**. Change it there — the components read
from it and lay themselves out. The content mirrors `resume.json`; when a role
or certification changes, update both.

```
src/
  data/site.ts        every word on the page
  pages/index.astro   page composition + section styles
  components/         Rail (status bar), Hero (lockup), Section (ext wrapper)
  layouts/Layout.astro  head, fonts, meta tags
  styles/global.css   color, type, and spacing tokens
public/               CNAME, robots.txt, favicons — copied verbatim
```

## Running it

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # static output in dist/
npm run preview  # serve the built output
```

## Deploying

Pushing to `master` builds and publishes via `.github/workflows/deploy.yml`.

One-time setup: **Settings → Pages → Build and deployment → Source: GitHub
Actions**. The custom domain comes from `public/CNAME`.
