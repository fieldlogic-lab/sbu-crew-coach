const { put, list, get } = require('@vercel/blob');
const crypto=require('crypto');
const cookie='coach_console_session';
function sign(v){if(!process.env.CONSOLE_SESSION_SECRET)return '';return crypto.createHmac('sha256',process.env.CONSOLE_SESSION_SECRET).update(v).digest('hex')}
function authorized(req){if(!process.env.CONSOLE_SESSION_SECRET||!process.env.CONSOLE_EMAIL||!process.env.CONSOLE_PASSWORD)return false;const raw=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookie+'='));if(!raw)return false;const [v,s]=decodeURIComponent(raw.slice(cookie.length+1)).split('.');return v&&s===sign(v)&&Number(v.split(':')[1])>Date.now()}
function json(res,status,body,headers={}){res.statusCode=status;Object.entries({'content-type':'application/json',...headers}).forEach(([k,v])=>res.setHeader(k,v));res.end(JSON.stringify(body))}
async function latest(prefix){const x=await list({prefix});return x.blobs?.sort((a,b)=>b.uploadedAt.localeCompare(a.uploadedAt))[0]}
async function readBlob(prefix){const b=await latest(prefix);if(!b)return null;const result=await get(b.url);if(!result||result.statusCode!==200)return null;return new Response(result.stream).json()}
module.exports=async(req,res)=>{try{
 if(req.method==='GET'){if(!authorized(req))return json(res,401,{error:'unauthorized'});const data=await readBlob('coach-content/draft.json');if(data)return json(res,200,data);return json(res,200,{plan:null,content:null,history:[]})}
 let body=req.body||await new Promise((resolve,reject)=>{let s='';req.on('data',c=>s+=c);req.on('end',()=>{try{resolve(JSON.parse(s||'{}'))}catch(e){reject(e)}})});
 if(body.action==='login'){if(body.email===process.env.CONSOLE_EMAIL&&body.password===process.env.CONSOLE_PASSWORD){const v=`${body.email}:${Date.now()+86400000}`;return json(res,200,{ok:true},{'set-cookie':`${cookie}=${encodeURIComponent(v+'.'+sign(v))}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400`})}return json(res,401,{error:'unauthorized'})}
 if(!authorized(req))return json(res,401,{error:'unauthorized'});
 if(body.action==='draft'||body.action==='publish'){const now=new Date().toISOString(),data={plan:body.plan,content:body.content,history:[{label:body.action==='publish'?'Published season':'Saved draft',at:now,kind:body.action},...(body.history||[])].slice(0,20)};await put(`coach-content/${body.action==='publish'?'published':'draft'}.json`,JSON.stringify(data),{access:body.action==='publish'?'public':'private',addRandomSuffix:true});return json(res,200,data)}
 return json(res,400,{error:'unknown action'});
 }catch(e){return json(res,500,{error:'console unavailable'})}}

