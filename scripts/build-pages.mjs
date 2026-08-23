#!/usr/bin/env node
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const outputDir = path.join(root, 'pages-dist');
const textExtensions = new Set(['.html', '.css', '.js', '.json', '.txt', '.svg']);
const secretPatterns = [
  /OPENAI_API_KEY/i,
  /SUPABASE_(?:SECRET|SERVICE_ROLE)_KEY/i,
  /RATE_LIMIT_HMAC_KEY/i,
  /sb_secret_[A-Za-z0-9_-]+/i,
  /sk-[A-Za-z0-9_-]{20,}/i,
];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await cp(publicDir, outputDir, { recursive: true });
await writeFile(path.join(outputDir, '.nojekyll'), '', 'utf8');

const files = await walk(outputDir);
for (const file of files) {
  const extension = path.extname(file).toLowerCase();
  if (!textExtensions.has(extension)) continue;
  const content = await readFile(file, 'utf8');
  const relative = path.relative(outputDir, file);

  if (extension === '.html' && /(?:href|src)=["']\/(?!\/)/i.test(content)) {
    throw new Error(`root-absolute asset reference is not Pages-safe: ${relative}`);
  }
  for (const pattern of secretPatterns) {
    if (pattern.test(content)) {
      throw new Error(`secret-shaped content detected in Pages artifact: ${relative}`);
    }
  }
}

for (const required of ['index.html', 'styles.css', 'config.js', 'app.js', '.nojekyll']) {
  if (!files.some((file) => path.relative(outputDir, file) === required) && required !== '.nojekyll') {
    throw new Error(`Pages artifact is missing ${required}`);
  }
}

console.log(JSON.stringify({ command: 'pages:build', output: 'pages-dist', files: files.length + 1 }));
