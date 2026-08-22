#!/usr/bin/env node
import { SupabaseCorpusClient } from '../src/supabase/corpus-client.mjs';
const key=process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
try {
  if(!process.env.SUPABASE_URL || !key) { const e=new Error('credentials required'); e.code='SERVICE_NOT_CONFIGURED'; throw e; }
  const store=new SupabaseCorpusClient({url:process.env.SUPABASE_URL,apiKey:key});
  console.log(JSON.stringify(await store.getCorpusStats(),null,process.argv.includes('--json')?0:2));
} catch(error) { console.error(JSON.stringify({command:'corpus:stats',errorCode:error?.code ?? 'STATS_FAILED'})); process.exitCode=error?.code==='SERVICE_NOT_CONFIGURED'?3:5; }
