import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { slugify } from './build.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PAGES_DIR = join(ROOT, 'pages');
const IMAGES_DIR = join(ROOT, 'images');

const errors = [];

function err(file, msg) {
  errors.push(`${file}: ${msg}`);
}

function isString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIsoDate(value) {
  if (!isString(value)) return false;
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(value)) {
    return false;
  }
  return !Number.isNaN(new Date(value).getTime());
}

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

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function getExpectedSlug(filePath) {
  const relativePath = relative(PAGES_DIR, filePath);
  return relativePath
    .slice(0, -extname(relativePath).length)
    .split('/')
    .map((part) => slugify(part.replace(/^\d{2}-/, '')))
    .join('/');
}

async function validatePage(filePath) {
  const file = relative(PAGES_DIR, filePath);
  const raw = await readFile(filePath, 'utf8');
  const { data, content } = matter(raw);

  for (const field of ['title', 'brief', 'slug', 'category', 'categorySlug', 'locale']) {
    if (!isString(data[field])) {
      err(file, `frontmatter.${field} is required and must be a non-empty string`);
    }
  }

  if (data.locale !== 'en') {
    err(file, 'frontmatter.locale must be "en" for the first docs launch');
  }

  if (!Number.isInteger(Number(data.order)) || Number(data.order) < 1) {
    err(file, 'frontmatter.order must be a positive integer');
  }

  if (!isIsoDate(data.updatedAt)) {
    err(file, 'frontmatter.updatedAt must be an ISO date');
  }

  if (isString(data.slug)) {
    const slug = String(data.slug);
    if (slug !== slugify(slug).replaceAll('-', '/') && !/^[a-z0-9-]+\/[a-z0-9-]+$/.test(slug)) {
      err(file, `frontmatter.slug "${slug}" must be lowercase category/page path`);
    }
    const expected = getExpectedSlug(filePath);
    if (slug !== expected) {
      err(file, `frontmatter.slug "${slug}" must match file path "${expected}"`);
    }
  }

  if (isString(data.categorySlug) && data.slug && !String(data.slug).startsWith(`${data.categorySlug}/`)) {
    err(file, 'frontmatter.slug must start with frontmatter.categorySlug');
  }

  if (data.seo !== undefined) {
    if (typeof data.seo !== 'object' || Array.isArray(data.seo)) {
      err(file, 'frontmatter.seo must be an object');
    } else {
      if (data.seo.title !== undefined && data.seo.title !== null && !isString(data.seo.title)) {
        err(file, 'frontmatter.seo.title must be a string');
      }
      if (data.seo.description !== undefined && data.seo.description !== null && !isString(data.seo.description)) {
        err(file, 'frontmatter.seo.description must be a string');
      }
      if (isString(data.seo.title) && data.seo.title.length > 70) {
        err(file, `frontmatter.seo.title is ${data.seo.title.length} chars; keep it under 70`);
      }
      if (isString(data.seo.description) && data.seo.description.length > 200) {
        err(file, `frontmatter.seo.description is ${data.seo.description.length} chars; keep it under 200`);
      }
    }
  }

  const imageLinks = [...content.matchAll(/!\[[^\]]*]\((\/images\/[^)]+)\)/g)];
  for (const match of imageLinks) {
    const imagePath = join(ROOT, match[1].replace(/^\//, ''));
    if (!(await pathExists(imagePath))) {
      err(file, `image "${match[1]}" does not exist`);
    }
  }

  if (!content.trim()) {
    err(file, 'body is empty');
  }

  return String(data.slug || '');
}

async function main() {
  if (!existsSync(PAGES_DIR)) {
    console.error(`pages/ directory not found at ${PAGES_DIR}`);
    process.exit(1);
  }
  if (!existsSync(IMAGES_DIR)) {
    err('images', 'directory is required');
  }

  const files = await listMarkdownFiles();
  for (const file of files) {
    const name = basename(file);
    if (!/^[a-z0-9][a-z0-9-]*\.md$/.test(name)) {
      err(relative(PAGES_DIR, file), 'filename must be lowercase and hyphenated');
    }
  }

  const slugs = [];
  for (const file of files) {
    try {
      slugs.push({ file: relative(PAGES_DIR, file), slug: await validatePage(file) });
    } catch (error) {
      err(relative(PAGES_DIR, file), `failed to parse: ${error.message}`);
    }
  }

  const seen = new Map();
  for (const { file, slug } of slugs) {
    if (!slug) continue;
    if (seen.has(slug)) {
      err(file, `duplicate slug "${slug}" also used by ${seen.get(slug)}`);
    } else {
      seen.set(slug, file);
    }
  }

  if (errors.length > 0) {
    console.error(`\n${errors.length} validation issue(s):\n`);
    for (const error of errors) console.error(`  - ${error}`);
    console.error('');
    process.exit(1);
  }

  console.log(`Validated ${files.length} documentation page(s). All checks passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
