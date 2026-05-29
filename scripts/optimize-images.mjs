#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const IMAGES_DIR = join(ROOT, 'images');
const PAGES_DIR = join(ROOT, 'pages');

const SOURCE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);
export const CANONICAL_IMAGE_WIDTH = 1600;
export const WEBP_QUALITY = 82;

export function isOptimizableImagePath(path) {
  const ext = extname(path).toLowerCase();
  return SOURCE_EXTENSIONS.has(ext);
}

export function getCanonicalWidth(originalWidth) {
  return Math.min(originalWidth, CANONICAL_IMAGE_WIDTH);
}

function getCanonicalRelativePath(relativePath) {
  const ext = extname(relativePath);
  return `${relativePath.slice(0, -ext.length)}.webp`;
}

function toPublicImagePath(relativePath) {
  return `/images/${relativePath.split('/').join('/')}`;
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

async function writeCanonicalImage(sourcePath, outputPath, width) {
  await mkdir(dirname(outputPath), { recursive: true });
  await sharp(sourcePath)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY, effort: 6 })
    .toFile(outputPath);
}

async function optimizeImage(sourcePath) {
  const relativePath = relative(IMAGES_DIR, sourcePath);
  const metadata = await sharp(sourcePath).metadata();
  if (!metadata.width) {
    throw new Error(`Could not read image width for ${relativePath}`);
  }

  const width = getCanonicalWidth(metadata.width);
  const canonicalRelativePath = getCanonicalRelativePath(relativePath);
  await writeCanonicalImage(
    sourcePath,
    join(IMAGES_DIR, canonicalRelativePath),
    width,
  );

  return {
    source: toPublicImagePath(relativePath),
    canonical: toPublicImagePath(canonicalRelativePath),
    width,
    format: 'webp',
  };
}

async function updateMarkdownImageReferences(replacements) {
  if (!existsSync(PAGES_DIR) || replacements.size === 0) return 0;
  const files = (await listFiles(PAGES_DIR)).filter((file) => file.endsWith('.md'));
  let changed = 0;

  for (const file of files) {
    const original = await readFile(file, 'utf8');
    let next = original;
    for (const [source, canonical] of replacements) {
      next = next.replaceAll(`](${source})`, `](${canonical})`);
    }
    if (next !== original) {
      await writeFile(file, next);
      changed += 1;
    }
  }

  return changed;
}

export async function optimizeImages() {
  if (!existsSync(IMAGES_DIR)) return { images: [], updatedPages: 0 };

  const files = await listFiles(IMAGES_DIR);
  const sources = files.filter((file) => isOptimizableImagePath(relative(IMAGES_DIR, file)));
  const replacements = new Map();
  const images = [];

  for (const source of sources) {
    const result = await optimizeImage(source);
    images.push(result);
    replacements.set(result.source, result.canonical);
  }

  const updatedPages = await updateMarkdownImageReferences(replacements);
  return { images, updatedPages };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  optimizeImages()
    .then(({ images, updatedPages }) => {
      for (const image of images) {
        console.log(`${image.source} -> ${image.canonical} (${image.width}px webp)`);
      }
      console.log(`Optimized ${images.length} image(s); updated ${updatedPages} page(s).`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
