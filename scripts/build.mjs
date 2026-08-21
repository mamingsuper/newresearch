#!/usr/bin/env node
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await Promise.all([
  cp('src', 'dist/src', { recursive: true }),
  cp('public', 'dist/public', { recursive: true }),
  cp('supabase', 'dist/supabase', { recursive: true }),
  cp('docs', 'dist/docs', { recursive: true }),
]);
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
packageJson.scripts = { start: 'node --env-file-if-exists=.env src/server.mjs' };
await writeFile('dist/package.json', `${JSON.stringify(packageJson, null, 2)}\n`);
await cp('.env.example', 'dist/.env.example');
await cp('README.md', 'dist/README.md');
console.log('Built deployable application in dist/.');
