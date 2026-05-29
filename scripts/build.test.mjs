import assert from 'node:assert/strict';
import { test } from 'node:test';
import { absolutize, calculateReadTime, getPagePath, slugify } from './build.mjs';
import { getCanonicalWidth, isOptimizableImagePath } from './optimize-images.mjs';

test('slugify normalizes titles into stable URL fragments', () => {
  assert.equal(slugify('Ask Your First Question!'), 'ask-your-first-question');
  assert.equal(slugify('  Menu Bar, Tray & Login  '), 'menu-bar-tray-login');
});

test('getPagePath maps docs slugs to product-site routes', () => {
  assert.equal(
    getPagePath('start-here/add-your-first-files'),
    '/docs/start-here/add-your-first-files',
  );
});

test('absolutize maps docs image paths to the public docs API host', () => {
  assert.equal(
    absolutize('/images/screenshots/app.png'),
    'https://docs-api.omniforge.online/images/screenshots/app.png',
  );
});

test('calculateReadTime never returns less than one minute', () => {
  assert.equal(calculateReadTime('Short page.'), 1);
});

test('image optimizer skips generated variants', () => {
  assert.equal(isOptimizableImagePath('screenshots/file.png'), true);
  assert.equal(isOptimizableImagePath('screenshots/file.webp'), false);
  assert.equal(isOptimizableImagePath('screenshots/file-1280.webp'), false);
});

test('canonical image width is capped without upscaling', () => {
  assert.equal(getCanonicalWidth(1200), 1200);
  assert.equal(getCanonicalWidth(2400), 1600);
});
