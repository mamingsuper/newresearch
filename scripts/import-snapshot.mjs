#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeApsaPaper, normalizeIcaPaper } from '../src/ingestion/normalizers.mjs';

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const [rawName, inlineValue] = token.slice(2).split('=', 2);
    const value = inlineValue ?? argv[index + 1];
    if (inlineValue === undefined) index += 1;
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${rawName}`);
    args[rawName] = value;
  }
  return args;
}

function recordsFromSnapshot(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && Array.isArray(value.papers)) return value.papers;
  throw new Error('Snapshot must be a JSON array or an object with a papers array.');
}

function adapterFor(source) {
  if (source === 'apsa') return normalizeApsaPaper;
  if (source === 'ica') return normalizeIcaPaper;
  throw new Error(`Unsupported source adapter: ${source}`);
}

export async function importSnapshot({ source, input, output }) {
  if (!source || !input || !output) {
    throw new Error('Required arguments: --source <apsa|ica> --input <file.json> --output <file.ndjson>');
  }
  const normalize = adapterFor(source.toLowerCase());
  const snapshot = JSON.parse(await readFile(input, 'utf8'));
  const records = recordsFromSnapshot(snapshot);
  const retrievedAt = new Date().toISOString();
  const normalized = records.map((record) => normalize(record, { retrievedAt }));
  await mkdir(path.dirname(path.resolve(output)), { recursive: true });
  const body = normalized.map((paper) => JSON.stringify(paper)).join('\n');
  await writeFile(output, body ? `${body}\n` : '', 'utf8');
  return { count: normalized.length, source: source.toUpperCase(), output };
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = await importSnapshot(args);
    const noun = result.count === 1 ? 'record' : 'records';
    console.log(`Imported ${result.count} ${result.source} ${noun} to ${result.output}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main();
}
