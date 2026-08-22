#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

function parseArgs(argv) {
  const out={};
  for(let i=0;i<argv.length;i+=2){ const token=argv[i]; const value=argv[i+1]; if(!token?.startsWith('--')||!value) throw new Error('Expected --source, --input, --work-dir, and --source-label'); out[token.slice(2)]=value; }
  return out;
}
function run(args) {
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,args,{stdio:'inherit',env:process.env});
    child.once('error',reject);
    child.once('exit',(code)=>code===0?resolve():reject(Object.assign(new Error(`stage failed with exit ${code}`),{code:'REFRESH_STAGE_FAILED'})));
  });
}
try {
  const a=parseArgs(process.argv.slice(2));
  if(!a.source||!a.input||!a['work-dir']||!a['source-label']) throw new Error('Missing required refresh arguments');
  await mkdir(a['work-dir'],{recursive:true});
  const ndjson=path.join(a['work-dir'],'papers.ndjson');
  const report=path.join(a['work-dir'],'validation.json');
  await run(['scripts/corpus-validate.mjs','--source',a.source,'--input',a.input,'--output',ndjson,'--report',report,'--max-rejections',a['max-rejections'] ?? '0']);
  await run(['scripts/corpus-load.mjs','--input',ndjson,'--report',report,'--source-label',a['source-label']]);
  await run(['scripts/corpus-embed.mjs','--until-empty']);
  await run(['scripts/corpus-stats.mjs','--json']);
} catch(error) {
  console.error(JSON.stringify({command:'corpus:refresh',errorCode:error?.code ?? 'REFRESH_FAILED'}));
  process.exitCode=2;
}
