#!/usr/bin/env node
import { loadCorpus } from '../src/corpus/loader.mjs';
import { SupabaseCorpusClient } from '../src/supabase/corpus-client.mjs';
import { readValidatedCorpus } from '../src/corpus/snapshot-reader.mjs';

function args(argv) { const o={}; for(let i=0;i<argv.length;i+=2){ if(!argv[i]?.startsWith('--')) throw new Error('invalid arguments'); o[argv[i].slice(2)]=argv[i+1]; } return o; }
function key() { return process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(); }

try {
  const a=args(process.argv.slice(2));
  if(!a.input || !a.report || !a['source-label']) throw new Error('--input, --report and --source-label are required');
  if(!process.env.SUPABASE_URL || !key()) { const e=new Error('Supabase credentials are required'); e.code='SERVICE_NOT_CONFIGURED'; throw e; }
  const { records, validation, inputSha256 }=await readValidatedCorpus({input:a.input,report:a.report});
  const store=new SupabaseCorpusClient({url:process.env.SUPABASE_URL,apiKey:key()});
  const result=await loadCorpus({records,rejections:validation.rejections ?? [],store,sourceLabel:a['source-label'],inputSha256,sourceAdapter:validation.sourceAdapter ?? 'canonical'});
  console.log(JSON.stringify({command:'corpus:load',...result}));
} catch(error) {
  console.error(JSON.stringify({command:'corpus:load',errorCode:error?.code ?? 'LOAD_FAILED'}));
  process.exitCode=error?.code==='SERVICE_NOT_CONFIGURED'?3:5;
}
