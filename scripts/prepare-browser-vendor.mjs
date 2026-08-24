#!/usr/bin/env node
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const expectedVersion = '2.112.3';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = path.join(root, 'node_modules', '@supabase', 'supabase-js');
const packageJson = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));

if (packageJson.version !== expectedVersion) {
  throw new Error(`Expected @supabase/supabase-js ${expectedVersion}, found ${packageJson.version ?? 'unknown'}`);
}

const source = path.resolve(packageRoot, packageJson.unpkg ?? '');
if (!source.startsWith(`${packageRoot}${path.sep}`) || path.relative(packageRoot, source) !== 'dist/umd/supabase.js') {
  throw new Error('Pinned Supabase package does not expose the verified UMD browser bundle');
}

const outputDirectory = path.join(root, 'public', 'vendor');
const output = path.join(outputDirectory, `supabase-${expectedVersion}.js`);
await mkdir(outputDirectory, { recursive: true });
await copyFile(source, output);

console.log(JSON.stringify({ command: 'browser:vendor', version: expectedVersion, output: path.relative(root, output) }));
