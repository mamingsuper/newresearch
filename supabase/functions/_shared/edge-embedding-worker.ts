type Job={paper_id:string;input_hash:string;model:string;dimensions:number;attempts:number;title:string;abstract:string;conference_name:string;conference_year:number;division?:string;keywords?:string[]};
type WorkerDeps={jobs:Job[];embed(inputs:string[]):Promise<number[][]>;complete(job:Job,vector:number[]):Promise<boolean>;release(job:Job,code:string,terminal:boolean):Promise<boolean>};
function embeddingInput(job:Job){return [`Title: ${job.title}`,`Conference: ${job.conference_name} ${job.conference_year}`,job.division?`Division: ${job.division}`:'',job.keywords?.length?`Keywords: ${job.keywords.join(', ')}`:'',`Abstract: ${job.abstract}`].filter(Boolean).join('\n');}
function validVector(value:unknown):value is number[]{return Array.isArray(value)&&value.length===512&&value.every((item)=>typeof item==='number'&&Number.isFinite(item));}
export async function processBatch({jobs,embed,complete,release}:WorkerDeps){
  if(!Array.isArray(jobs)||jobs.length>25)throw new TypeError('Batch must contain at most 25 jobs.');
  let completed=0,failed=0;
  if(!jobs.length)return{processed:0,completed,failed};
  let vectors:number[][];
  try{vectors=await embed(jobs.map(embeddingInput));}catch{for(const job of jobs){await release(job,'embedding_provider_failed',job.attempts>=5);failed+=1;}return{processed:jobs.length,completed,failed};}
  if(!Array.isArray(vectors)||vectors.length!==jobs.length||vectors.some((vector)=>!validVector(vector))){for(const job of jobs){await release(job,'invalid_embedding_dimensions',true);failed+=1;}return{processed:jobs.length,completed,failed};}
  for(let index=0;index<jobs.length;index+=1){try{if(await complete(jobs[index],vectors[index]))completed+=1;else{await release(jobs[index],'stale_embedding_job',false);failed+=1;}}catch{await release(jobs[index],'embedding_persist_failed',jobs[index].attempts>=5);failed+=1;}}
  return{processed:jobs.length,completed,failed};
}
