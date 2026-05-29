import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import { visit } from 'unist-util-visit';

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const PAGES_DIR = join(ROOT, 'pages');
export const IMAGES_DIR = join(ROOT, 'images');
export const DIST_DIR = join(ROOT, 'dist');
export const PUBLIC_BASE_URL =
  process.env.DOCS_PUBLIC_BASE_URL ?? 'https://docs-api.omniforge.online';

export const PUBLICATION = {
  title: 'OmniForge Docs',
  description: 'Clear guides for using OmniForge Desktop.',
  locale: 'en',
};

export function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function calculateReadTime(markdown) {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export function absolutize(maybePath) {
  if (!maybePath) return null;
  if (/^https?:\/\//.test(maybePath)) return maybePath;
  if (maybePath.startsWith('/')) return `${PUBLIC_BASE_URL}${maybePath}`;
  return `${PUBLIC_BASE_URL}/${maybePath}`;
}

export function getPagePath(slug) {
  return `/docs/${slug}`;
}

function remarkDocsUrls() {
  return (tree) => {
    visit(tree, ['image', 'link'], (node) => {
      if (typeof node.url !== 'string') return;
      if (node.url.startsWith('/images/')) {
        node.url = `${PUBLIC_BASE_URL}${node.url}`;
        return;
      }
      if (node.type === 'link' && node.url.startsWith('/docs/')) {
        return;
      }
      if (node.type === 'link' && !/^[a-z]+:|^#|^\//i.test(node.url)) {
        node.url = `/docs/${node.url.replace(/\.md$/, '')}`;
      }
    });
  };
}

function rehypeHeadingIds() {
  return (tree) => {
    visit(tree, 'element', (node) => {
      if (!['h2', 'h3'].includes(node.tagName)) return;
      node.properties ??= {};
      if (node.properties.id) return;
      const text = toText(node);
      node.properties.id = slugify(text);
    });
  };
}

function toText(node) {
  if (!node) return '';
  if (node.type === 'text') return node.value || '';
  if (!Array.isArray(node.children)) return '';
  return node.children.map(toText).join('');
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkDocsUrls)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeHeadingIds)
  .use(rehypeStringify, { allowDangerousHtml: true });

async function listMarkdownFiles(dir = PAGES_DIR) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listMarkdownFiles(path)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(path);
    }
  }

  return files;
}

function requireField(meta, field, file) {
  if (meta[field] === undefined || meta[field] === null || meta[field] === '') {
    throw new Error(`[${file}] missing required frontmatter field: ${field}`);
  }
}

function extractHeadings(html) {
  const headings = [];
  const regex = /<h([23])[^>]*id="([^"]+)"[^>]*>(.*?)<\/h\1>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    headings.push({
      level: Number(match[1]),
      id: match[2],
      text: match[3].replace(/<[^>]+>/g, '').trim(),
    });
  }
  return headings;
}

function stripMarkdown(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function buildPage(path) {
  const file = relative(PAGES_DIR, path);
  const raw = await readFile(path, 'utf8');
  const { data, content } = matter(raw);

  for (const field of [
    'title',
    'slug',
    'brief',
    'category',
    'categorySlug',
    'order',
    'locale',
    'updatedAt',
  ]) {
    requireField(data, field, file);
  }

  const html = String(await processor.process(content));
  const slug = String(data.slug);
  const updatedAt = new Date(data.updatedAt).toISOString();
  const categorySlug = slugify(data.categorySlug);
  const order = Number(data.order);
  const headings = extractHeadings(html);

  const meta = {
    id: slug,
    title: String(data.title),
    navTitle: data.navTitle ? String(data.navTitle) : String(data.title),
    slug,
    path: getPagePath(slug),
    brief: String(data.brief),
    category: String(data.category),
    categorySlug,
    order,
    locale: String(data.locale),
    updatedAt,
    readTimeInMinutes: calculateReadTime(content),
    seo: data.seo
      ? {
          title: data.seo.title ? String(data.seo.title) : null,
          description: data.seo.description ? String(data.seo.description) : null,
        }
      : null,
    headings,
  };

  const full = {
    ...meta,
    content: { html },
  };

  const search = {
    slug,
    path: meta.path,
    title: meta.title,
    brief: meta.brief,
    category: meta.category,
    categorySlug,
    headings: headings.map((heading) => heading.text),
    text: stripMarkdown(content).slice(0, 8000),
  };

  return { meta, full, search };
}

function buildNavigation(pages) {
  const byCategory = new Map();
  for (const page of pages) {
    if (!byCategory.has(page.categorySlug)) {
      byCategory.set(page.categorySlug, {
        title: page.category,
        slug: page.categorySlug,
        order: Number.POSITIVE_INFINITY,
        pages: [],
      });
    }
    const category = byCategory.get(page.categorySlug);
    category.order = Math.min(category.order, page.order);
    category.pages.push({
      title: page.navTitle,
      slug: page.slug,
      path: page.path,
      brief: page.brief,
      order: page.order,
    });
  }

  return [...byCategory.values()]
    .map((category) => ({
      ...category,
      pages: category.pages.sort((a, b) => a.order - b.order),
    }))
    .sort((a, b) => a.order - b.order);
}

async function copyImagesIfPresent() {
  if (!existsSync(IMAGES_DIR)) return;
  await cp(IMAGES_DIR, join(DIST_DIR, 'images'), { recursive: true });
}

export async function buildDocs() {
  if (!existsSync(PAGES_DIR)) {
    throw new Error(`pages/ directory not found at ${PAGES_DIR}`);
  }

  if (existsSync(DIST_DIR)) {
    await rm(DIST_DIR, { recursive: true, force: true });
  }

  const markdownFiles = await listMarkdownFiles();
  const results = [];
  for (const file of markdownFiles) {
    results.push(await buildPage(file));
  }

  results.sort((a, b) => a.meta.order - b.meta.order);

  const seen = new Set();
  for (const result of results) {
    if (seen.has(result.meta.slug)) {
      throw new Error(`Duplicate slug: ${result.meta.slug}`);
    }
    seen.add(result.meta.slug);
  }

  const pages = results.map((result) => result.meta);
  const navigation = buildNavigation(pages);

  await mkdir(join(DIST_DIR, 'pages'), { recursive: true });
  await writeFile(
    join(DIST_DIR, 'index.json'),
    JSON.stringify({ publication: PUBLICATION, navigation, pages }, null, 2),
  );
  await writeFile(
    join(DIST_DIR, 'search.json'),
    JSON.stringify({ records: results.map((result) => result.search) }, null, 2),
  );

  for (const result of results) {
    await writeFile(
      join(DIST_DIR, 'pages', `${result.meta.slug.replaceAll('/', '__')}.json`),
      JSON.stringify(result.full, null, 2),
    );
  }

  const cnamePath = join(ROOT, 'CNAME');
  if (existsSync(cnamePath)) {
    await cp(cnamePath, join(DIST_DIR, 'CNAME'));
  }
  await copyImagesIfPresent();
  await writeFile(join(DIST_DIR, '.nojekyll'), '');

  return results.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildDocs()
    .then((count) => {
      console.log(`Built ${count} page(s) into ${DIST_DIR}`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
