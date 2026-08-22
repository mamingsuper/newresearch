import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateSnapshot } from '../src/corpus/validator.mjs';
import { readValidatedCorpus } from '../src/corpus/snapshot-reader.mjs';
test('reads canonical NDJSON only when the validation report hash matches', async () => { const dir=await mkdtemp(path.join(os.tmpdir(),'validated-corpus-')); const input=path.join(dir,'raw.json'); const output=path.join(dir,'papers.ndjson'); const report=path.join(dir,'report.json'); await writeFile(input,JSON.stringify([{id:'p1',title:'Paper',abstract:'A sufficiently long abstract for corpus validation.',authors:['A'],directUrl:'https://example.org/p1'}])); await validateSnapshot({source:'apsa',input,output,report}); const result=await readValidatedCorpus({input:output,report}); assert.equal(result.records.length,1); assert.equal(result.validation.schemaVersion,1); });
test('rejects NDJSON modified after validation', async () => { const dir=await mkdtemp(path.join(os.tmpdir(),'validated-corpus-')); const input=path.join(dir,'raw.json'); const output=path.join(dir,'papers.ndjson'); const report=path.join(dir,'report.json'); await writeFile(input,JSON.stringify([{id:'p1',title:'Paper',abstract:'A sufficiently long abstract for corpus validation.',authors:['A'],directUrl:'https://example.org/p1'}])); await validateSnapshot({source:'apsa',input,output,report}); await writeFile(output,(await readFile(output,'utf8'))+'{}\n'); await assert.rejects(readValidatedCorpus({input:output,report}),/hash mismatch/i); });
