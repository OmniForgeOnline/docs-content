---
title: "Understand sync and indexing status"
slug: "knowledge-base/understand-sync-and-indexing-status"
brief: "Know what each file status means and when a file is searchable."
category: "Knowledge Base"
categorySlug: "knowledge-base"
order: 130
locale: "en"
updatedAt: "2026-05-26"
seo:
  title: "Understand OmniForge indexing status"
  description: "Learn how to read file indexing statuses in the OmniForge Knowledge page."
---

The Knowledge page shows whether files are searchable. A file is useful to the Assistant only after indexing succeeds.

## File statuses

- **Queued** means OmniForge has seen the file but has not started processing it.
- **Processing** means OmniForge is reading and indexing the file.
- **In AI Knowledge** means the file can be used by the Assistant.
- **Failed** means OmniForge could not process the file.
- **Duplicate** means the file already exists in the workspace.
- **Unsupported** means the file type is not supported.

## What to do while files process

Keep OmniForge open. Large files and large batches can take longer. If search services are still starting, the page may show a setup message.

Do not delete a file while it is processing unless you want to remove it from the workspace.

## When indexing fails

Check three things:

1. The file type is supported.
2. The file opens normally outside OmniForge.
3. The file is not password-protected or corrupted.

Then retry the file from the Knowledge page.
