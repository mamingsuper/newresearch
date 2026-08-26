#!/usr/bin/env node
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const frontendDist = path.join(root, 'frontend', 'dist');
const outputDir = path.join(root, 'pages-dist');
const configToken = '__PUBLIC_SUPABASE_PUBLISHABLE_KEY__';
const publishableKey = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';
const textExtensions = new Set(['.html', '.css', '.js', '.json', '.txt', '.svg']);
const secretPatterns = [
  /OPENAI_API_KEY/i,
  /APODEX_API_KEY/i,
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

if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) {
  throw new Error('PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a non-empty sb_publishable_ value');
}

const configTemplate = await readFile(path.join(publicDir, 'config.template.js'), 'utf8');
if (configTemplate.split(configToken).length !== 2) {
  throw new Error('Public config template must contain exactly one publishable-key token');
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await cp(frontendDist, outputDir, {
  recursive: true,
});
await writeFile(path.join(outputDir, 'config.js'), configTemplate.replace(configToken, publishableKey), 'utf8');
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

for (const required of ['index.html', 'config.js', '.nojekyll']) {
  if (!files.some((file) => path.relative(outputDir, file) === required)) {
    throw new Error(`Pages artifact is missing ${required}`);
  }
}

console.log(JSON.stringify({ command: 'pages:build', output: 'pages-dist', files: files.length }));
