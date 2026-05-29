# OmniForge Docs Content

Source of truth for end-user documentation published at `https://omniforge.online/docs`.

## How it works

1. Pages live as Markdown files under `pages/`, images under `images/`.
2. On every push to `main`, GitHub Actions runs `scripts/build.mjs` which:
   - Parses YAML frontmatter
   - Converts Markdown to HTML
   - Rewrites relative links and images to public URLs
   - Emits `dist/index.json`, `dist/search.json`, and `dist/pages/<slug>.json`
   - Copies `images/` into `dist/images/`
3. The output is published to GitHub Pages at `https://docs-api.omniforge.online`.
4. The product site fetches that domain server-side via Next.js ISR.

## Frontmatter schema

```yaml
---
title: "Add your first files"
slug: "start-here/add-your-first-files"
brief: "Learn the safest ways to add files to OmniForge."
category: "Start Here"
categorySlug: "start-here"
order: 4
locale: "en"
updatedAt: "2026-05-26"
seo:
  title: "Add files to OmniForge"
  description: "Learn how to add files to OmniForge safely."
---
```

Required fields: `title`, `slug`, `brief`, `category`, `categorySlug`, `order`, `locale`, `updatedAt`.

## Authoring conventions

- Keep pages task-focused and plain-language.
- Use numbered steps for procedures.
- Use screenshots only when they help users locate UI or confirm a result.
- Review screenshots manually before publishing.
- Keep screenshot references in Markdown as the source of truth; `npm run validate` checks that referenced image files exist.
