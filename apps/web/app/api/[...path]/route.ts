import {NextRequest} from 'next/server';
const allowed=new Set(['config','health','challenge','accounts','account','prepare','simulate','submit','operation','rpc']);
async function proxy(request:NextRequest,context:{params:Promise<{path:string[]}>}){
 const {path}=await context.params;if(path.length!==1||!allowed.has(path[0]))return Response.json({error:'Not found'},{status:404});
 const origin=request.headers.get('origin');
 if(request.method==='POST'&&!['http://localhost:3155','http://127.0.0.1:3155'].includes(origin??''))return Response.json({error:'Untrusted origin'},{status:403});
 try{
  const response=await fetch(`http://127.0.0.1:4355/${path[0]}${request.nextUrl.search}`,{method:request.method,headers:{'Content-Type':'application/json',...(origin?{origin}:{})},body:request.method==='POST'?await request.text():undefined,signal:AbortSignal.timeout(30000),cache:'no-store'});
  return new Response(await response.text(),{status:response.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Local service unavailable; check service and chain'},{status:503});}
}
export const GET=proxy;export const POST=proxy;
