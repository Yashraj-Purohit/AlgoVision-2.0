import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Catalog, knapsack, greedyAllocation, Graph } from '../src/algorithms.js';
import { products, nodes, edges } from '../src/sample-data.js';
import { ApiError } from './supabase.mjs';
const SESSION_MS = 12 * 60 * 60 * 1000;
export function createApi({ supabase, port = 4173, secure = false, now = Date.now }) {
  const sessions = new Map(), limits = new Map();
  const graph = new Graph(nodes,edges);
  function send(res,status,data) { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data)); }
  function session(req,res) {
    for (const [id,s] of sessions) if (s.deadline < now()) sessions.delete(id);
    const id = /(?:^|;\s*)av_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];
    if (id && sessions.has(id)) return sessions.get(id);
    if (sessions.size >= 1000) throw new ApiError(503,'Session capacity reached. Try again later.');
    const sid = randomBytes(32).toString('hex');
    const s = { id:sid,csrf:randomBytes(32).toString('hex'),deadline:now()+SESSION_MS };
    sessions.set(sid,s); res.setHeader('Set-Cookie',`av_session=${sid}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${secure?'; Secure':''}`); return s;
  }
  function throttle(req, auth) {
    for (const [key,entry] of limits) if (entry.until < now()) limits.delete(key);
    const key = (req.socket.remoteAddress||'local') + (auth?':auth':':api');
    const entry = limits.get(key)||{count:0,until:now()+(auth?600000:60000)};
    limits.set(key,entry);
    if (++entry.count > (auth?20:300)) throw new ApiError(429,'Too many requests. Wait before retrying.');
  }
  async function body(req) {
    if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) throw new ApiError(415,'Use application/json.');
    const chunks=[];let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 2000000) throw new ApiError(413,'Request exceeds 2 MB.');
      chunks.push(Buffer.from(chunk));
    }
    try {const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!data||typeof data!=='object'||Array.isArray(data))throw new Error();return data;} catch { throw new ApiError(400,'Use a valid JSON object.'); }
  }
  async function verify(s) {
    if (!s.access) throw new ApiError(401,'Sign in to use your cloud workspace.');
    if (s.expires < now()+30000) {
      if (!s.refreshing) s.refreshing = supabase.request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:s.refresh}}).then(data=>assign(s,data)).finally(()=>{s.refreshing=null;});
      await s.refreshing;
    }
    try { const user = await supabase.request('/auth/v1/user',{token:s.access});s.user={id:user.id,email:user.email};return s.user; }
    catch(e) { if(e.status===401){delete s.access;delete s.refresh;delete s.user;}throw e; }
  }
  function assign(s,data) {
    if (!data?.access_token || !data?.refresh_token) throw new ApiError(502,'Authentication session was not returned.');
    s.access=data.access_token;s.refresh=data.refresh_token;s.expires=now()+(data.expires_in||3600)*1000;
  }
  return async function handle(req,res,path) {
    try {
      if(!['GET','POST','DELETE'].includes(req.method)) throw new ApiError(405,'Method not allowed.');
      const mutation=req.method!=='GET';
      // Exact same-origin checks, not caller-controlled Host or forwarded headers.
      if (mutation && ![`http://127.0.0.1:${port}`,`http://localhost:${port}`,...(secure?[`https://127.0.0.1:${port}`,`https://localhost:${port}`]:[])].includes(req.headers.origin)) throw new ApiError(403,'Same-origin request required.');
      throttle(req,path.startsWith('/api/auth/'));
      const s=session(req,res);
      if (mutation && req.headers['x-csrf-token']!==s.csrf) throw new ApiError(403,'Reload the page before retrying this request.');
      if(path==='/api/session' && req.method==='GET') {
        if(supabase && s.access) await verify(s);
        return send(res,200,{configured:!!supabase,user:s.user||null,csrf:s.csrf});
      }
      if (!supabase) throw new ApiError(503,'Supabase is not configured. Add .env and apply the database migration.');
      if (path==='/api/auth/logout' && req.method==='POST') {
        if(s.access) { try {await supabase.request('/auth/v1/logout?scope=local',{token:s.access,method:'POST'});}catch{/* Local session is still revoked. */} }
        sessions.delete(s.id);res.setHeader('Set-Cookie',`av_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure?'; Secure':''}`);return send(res,200,{ok:true});
      }
      if (['/api/auth/login','/api/auth/signup'].includes(path) && req.method==='POST') {
        const data=await body(req);
        if(typeof data?.email!=='string'||data.email.length>254||!/^\S+@\S+\.\S+$/.test(data.email)||typeof data.password!=='string'||data.password.length<8||data.password.length>128) throw new ApiError(400,'Enter a valid email and an 8–128 character password.');
        const result=await supabase.request(path.endsWith('signup')?'/auth/v1/signup':'/auth/v1/token?grant_type=password',{method:'POST',body:{email:data.email.trim(),password:data.password}});
        if(!result?.access_token) return send(res,200,{confirmationRequired:true,message:'Check your email to confirm your account, then sign in here.'});
        // Rotate the session ID after authentication to prevent session fixation.
        sessions.delete(s.id);const fresh=session({headers:{}},res);assign(fresh,result);await verify(fresh);
        return send(res,200,{user:fresh.user,csrf:fresh.csrf});
      }
      const user=await verify(s),token=s.access;
      if(path==='/api/products' && req.method==='GET') return send(res,200,{records:await supabase.listProducts(token)});
      if(path==='/api/imports' && req.method==='POST') {
        const data=await body(req),start=performance.now();
        const c=new Catalog();let report;
        try {report=c.ingest(data?.records);}catch(error){throw new ApiError(400,error.message);}
        const result=await supabase.request('/rest/v1/rpc/av_ingest',{token,method:'POST',body:{p_records:c.records,p_processed:report.processed,p_duplicates:report.duplicates,p_errors:report.errors}});
        return send(res,200,{...result,ms:performance.now()-start});
      }
      if(path==='/api/products/reset' && req.method==='POST') {
        await body(req);const result=await supabase.request('/rest/v1/rpc/av_reset',{token,method:'POST',body:{p_records:products}});return send(res,200,result);
      }
      if(path.startsWith('/api/products/') && req.method==='DELETE') {
        const id=decodeURIComponent(path.slice('/api/products/'.length));
        if(!/^[A-Za-z0-9_-]{1,32}$/.test(id)) throw new ApiError(400,'Invalid product ID.');
        await supabase.request(`/rest/v1/av_products?id=eq.${encodeURIComponent(id)}`,{token,method:'DELETE'});return send(res,200,{ok:true});
      }
      if(path==='/api/allocations' && req.method==='POST') {
        const {items,budget}=await body(req);let payload;
        try {
          const start=performance.now(),exact=knapsack(items,budget),dpMs=performance.now()-start;
          const gs=performance.now(),greedy=greedyAllocation(items,budget),greedyMs=performance.now()-gs;
          payload={items,budget,exact,greedy,upper:greedyAllocation(items,budget,true),dpMs,greedyMs};
        } catch(error) {throw new ApiError(400,error.message);}
        const saved=await supabase.request('/rest/v1/av_runs',{token,method:'POST',body:{owner_id:user.id,kind:'allocation',payload},headers:{Prefer:'return=representation'}});
        return send(res,200,{...payload,runId:saved[0].id});
      }
      if(path==='/api/routes' && req.method==='POST') {
        const {source,target}=await body(req);let payload;
        try {const start=performance.now();payload={source,target,...graph.shortestPath(source,target),ms:performance.now()-start};}catch(error){throw new ApiError(400,error.message);}
        const saved=await supabase.request('/rest/v1/av_runs',{token,method:'POST',body:{owner_id:user.id,kind:'route',payload},headers:{Prefer:'return=representation'}});
        return send(res,200,{...payload,runId:saved[0].id});
      }
      if(path==='/api/history' && req.method==='GET') {
        const [imports,runs]=await Promise.all([
          supabase.request('/rest/v1/av_imports?select=*&order=created_at.desc,id.desc&limit=20',{token}),
          supabase.request('/rest/v1/av_runs?select=*&order=created_at.desc,id.desc&limit=20',{token})
        ]);return send(res,200,{imports,runs});
      }
      throw new ApiError(404,'Unknown API route.');
    } catch(error) { send(res,error instanceof ApiError?error.status:500,{error:error instanceof ApiError?error.message:'The server could not complete this request.'}); }
  };
}
