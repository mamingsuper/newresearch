#!/usr/bin/env node
import { validateSnapshot } from '../src/corpus/validator.mjs';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const name = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${name}`);
    out[name] = value;
    i += 1;
  }
  return out;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const result = await validateSnapshot({
    source: args.source,
    input: args.input,
    output: args.output,
    report: args.report,
    maxRejections: args['max-rejections'] === undefined ? 0 : Number.parseInt(args['max-rejections'], 10),
  });
  console.log(JSON.stringify({ command: 'corpus:validate', validRecords: result.validRecords, rejectedRecords: result.rejectedRecords, outputSha256: result.outputSha256 }));
} catch (error) {
  console.error(JSON.stringify({ command: 'corpus:validate', errorCode: error?.code ?? 'VALIDATION_FAILED' }));
  process.exitCode = 2;
}
