#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const root = new URL('../pages-dist/', import.meta.url);
async function walk(url) {
  const entries = await readdir(url, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), url);
    if (entry.isDirectory()) files.push(...await walk(child)); else files.push(child);
  }
  return files;
}
const files = await walk(root);
let js = 0, css = 0;
for (const file of files) {
  const extension = path.extname(file.pathname).toLowerCase();
  if (!['.js', '.css', '.html'].includes(extension)) continue;
  const bytes = await readFile(file);
  if (extension === '.js') js += gzipSync(bytes).byteLength;
  if (extension === '.css') css += gzipSync(bytes).byteLength;
  if (extension === '.html' && /<script[^>]+src=["']https?:\/\//i.test(bytes.toString('utf8'))) throw new Error('Runtime third-party script origins are not allowed.');
}
if (js > 350 * 1024) throw new Error(`Initial JavaScript budget exceeded: ${js} bytes gzip.`);
if (css > 90 * 1024) throw new Error(`CSS budget exceeded: ${css} bytes gzip.`);
console.log(JSON.stringify({ command: 'pages:budget', javascriptGzipBytes: js, cssGzipBytes: css }));
