const { get } = require('@vercel/blob');

async function readBlob(pathname){
  const result=await get(pathname,{access:'private'});
  if(!result||!result.stream)return null;
  return new Response(result.stream).json();
}

module.exports=async(req,res)=>{
  res.setHeader('content-type','application/json');
  res.setHeader('cache-control','no-store');
  if(req.method!=='GET'){res.statusCode=405;return res.end(JSON.stringify({error:'method not allowed'}));}
  try{
    const data=await readBlob('coach-content/draft.json');
    const sessions=data?.teamOps?.trainingPlan?.sessions;
    res.statusCode=200;
    return res.end(JSON.stringify({draftFound:!!data,trainingPlanFound:Array.isArray(sessions),sessionCount:Array.isArray(sessions)?sessions.length:0,firstDate:Array.isArray(sessions)&&sessions[0]?sessions[0].date:null,lastDate:Array.isArray(sessions)&&sessions.length?sessions[sessions.length-1].date:null}));
  }catch(e){res.statusCode=500;return res.end(JSON.stringify({error:'diagnostic failed'}));}
};
