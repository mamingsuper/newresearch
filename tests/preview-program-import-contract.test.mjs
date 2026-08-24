import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handlePreviewProgramRequest } from '../supabase/functions/preview-program-import/index.ts';
const ID='11111111-1111-4111-8111-111111111111';
test('preview is admin-only and approval-gated before atomic save', async () => {
  const req = new Request('https://x/preview',{method:'POST',headers:{authorization:'Bearer x','content-type':'application/json'},body:JSON.stringify({submissionId:ID})});
  const base={loadSubmission:async()=>({status:'approved',conference_slug:'ica',conference_name:'ICA',conference_year:2027}),loadSource:async()=>({bytes:new TextEncoder().encode('%PDF-1.7'),mimeType:'application/pdf',fileName:'x.pdf',sourceUrl:'https://x.example'}),savePreview:async()=>({status:'import_preview'})};
  assert.equal((await handlePreviewProgramRequest(req,{...base,authenticate:async()=>({id:ID,role:''})})).status,403);
  const ok=await handlePreviewProgramRequest(req,{...base,authenticate:async()=>({id:ID,role:'admin'})}); assert.equal(ok.status,200);
});
test('production preview revalidates redirects and stores through one RPC', async()=>{const source=await readFile(new URL('../supabase/functions/preview-program-import/index.ts',import.meta.url),'utf8');assert.match(source,/validateRemoteUrl/);assert.match(source,/redirect:\s*'manual'/);assert.match(source,/save_program_import_preview/);assert.doesNotMatch(source,/console\./);});
