import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createApi } from '../backend/api.mjs';
import { Supabase } from '../backend/supabase.mjs';
const origin='http://127.0.0.1:4173';
function harness(supabase) {
  let clock=1000000;const handle=createApi({supabase,now:()=>clock});
  return {tick:ms=>clock+=ms,async request(path,{method='GET',cookie,csrf,body,origin:from=origin,raw,contentType='application/json'}={}){
    const req=Readable.from(raw?[raw]:body===undefined?[]:[Buffer.from(JSON.stringify(body))]);
    Object.assign(req,{method,headers:{origin:from,...(cookie?{cookie}:{}),...(csrf?{'x-csrf-token':csrf}:{}),'content-type':contentType},socket:{remoteAddress:'127.0.0.1'}});
    const headers={};let status,data;
    const res={setHeader:(k,v)=>headers[k.toLowerCase()]=v,writeHead:(code,h)=>{status=code;Object.assign(headers,h);},end:text=>{data=JSON.parse(text);}};
    await handle(req,res,path);return{status,data,headers,cookie:headers['set-cookie']?.split(';')[0]};
  }};
}
function mockSupabase() {
  const calls=[];return {calls,async request(path,options={}){
    calls.push({path,...options});
    if(path.startsWith('/auth/v1/token'))return{access_token:'USER-JWT',refresh_token:'REFRESH',expires_in:3600};
    if(path==='/auth/v1/signup')return{user:{id:'USER-A'}};
    if(path==='/auth/v1/user')return{id:'USER-A',email:'a@example.com'};
    if(path.startsWith('/auth/v1/logout'))return null;
    if(path==='/rest/v1/rpc/av_ingest')return{accepted:options.body.p_records.length,duplicates:options.body.p_duplicates,errors:options.body.p_errors,processed:options.body.p_processed,id:'IMPORT-1'};
    if(path==='/rest/v1/rpc/av_reset')return{accepted:12};
    if(path==='/rest/v1/av_runs')return[{id:'RUN-1'}];
    if(path.startsWith('/rest/v1/av_products?'))return null;
    if(path.includes('?select='))return[];
    throw new Error('Unexpected path '+path);
  },async listProducts(){return[{id:'P1',name:'One',category:'Test',price:1,stock:1,priority:1}];}};
}
async function login(h) {
  const s=await h.request('/api/session');const r=await h.request('/api/auth/login',{method:'POST',cookie:s.cookie,csrf:s.data.csrf,body:{email:'a@example.com',password:'password123'}});
  assert.equal(r.status,200);return{cookie:r.cookie,csrf:r.data.csrf};
}
test('unconfigured mode is explicit; data writes cannot pretend to reach cloud',async()=>{
 const h=harness(null),s=await h.request('/api/session');assert.equal(s.data.configured,false);assert.equal(s.headers['Cache-Control'],'no-store');assert.match(s.headers['set-cookie'],/HttpOnly; SameSite=Strict/);const r=await h.request('/api/imports',{method:'POST',cookie:s.cookie,csrf:s.data.csrf,body:{records:[]}});assert.equal(r.status,503);
});
test('all mutation endpoints require same origin and session CSRF token',async()=>{
 const h=harness(mockSupabase()),s=await h.request('/api/session');
 for(const path of ['/api/auth/login','/api/auth/signup','/api/imports','/api/products/reset','/api/allocations','/api/routes','/api/auth/logout']){
  assert.equal((await h.request(path,{method:'POST',cookie:s.cookie,csrf:s.data.csrf,origin:'https://evil.example',body:{}})).status,403);
  assert.equal((await h.request(path,{method:'POST',cookie:s.cookie,body:{}})).status,403);
 }
});
test('unauthenticated reads cannot access cloud data; session rotates at login; tokens stay server-only',async()=>{
 const sb=mockSupabase(),h=harness(sb),s=await h.request('/api/session');assert.equal((await h.request('/api/products',{cookie:s.cookie})).status,401);
 const auth=await login(h);assert.notEqual(auth.cookie,s.cookie);const r=await h.request('/api/products',auth);assert.equal(r.data.records.length,1);
 assert.ok(!JSON.stringify(r).includes('USER-JWT'));assert.equal((await h.request('/api/history',auth)).status,200);
 assert.ok(sb.calls.filter(c=>c.path==='/auth/v1/user').length>=2);
});
test('backend revalidates imports before RPC and returns invalid-row evidence',async()=>{
 const sb=mockSupabase(),h=harness(sb),auth=await login(h);const p={id:'A',name:'One',category:'Test',price:1,stock:1,priority:1};
 const r=await h.request('/api/imports',{...auth,method:'POST',body:{records:[p,p,{...p,id:'B',stock:-1}]}});
 assert.equal(r.status,200);assert.equal(r.data.accepted,1);assert.equal(r.data.duplicates,1);assert.equal(r.data.errors.length,1);
 const rpc=sb.calls.find(c=>c.path.includes('rpc/av_ingest'));assert.equal(rpc.token,'USER-JWT');assert.equal(rpc.body.p_records.length,1);
 assert.equal((await h.request('/api/imports',{...auth,method:'POST',body:{records:'wrong'}})).status,400);
});
test('server computes and persists allocations and routes, ignoring forged results',async()=>{
 const sb=mockSupabase(),h=harness(sb),auth=await login(h),items=[{id:'A',cost:10,value:60},{id:'B',cost:20,value:100},{id:'C',cost:30,value:120}];
 const allocation=await h.request('/api/allocations',{...auth,method:'POST',body:{items,budget:50,exact:{value:999999}}});assert.equal(allocation.data.exact.value,220);assert.equal(allocation.data.greedy.value,160);assert.equal(allocation.data.runId,'RUN-1');
 const route=await h.request('/api/routes',{...auth,method:'POST',body:{source:'Hub',target:'Port',distance:1}});assert.equal(route.data.distance,23);
 const writes=sb.calls.filter(c=>c.path==='/rest/v1/av_runs');assert.equal(writes.length,2);assert.ok(writes.every(w=>w.body.owner_id==='USER-A'&&w.token==='USER-JWT'));
 assert.equal((await h.request('/api/allocations',{...auth,method:'POST',body:{items,budget:10001}})).status,400);
 assert.equal((await h.request('/api/routes',{...auth,method:'POST',body:{source:'bad',target:'Port'}})).status,400);
});
test('input bounds, invalid JSON, wrong content type and unauthenticated signup confirmation',async()=>{
 const h=harness(mockSupabase()),s=await h.request('/api/session'),opts={method:'POST',cookie:s.cookie,csrf:s.data.csrf};
 assert.equal((await h.request('/api/auth/login',{...opts,body:{email:'bad',password:'x'}})).status,400);
 assert.equal((await h.request('/api/auth/login',{...opts,raw:'{'})).status,400);
 assert.equal((await h.request('/api/auth/login',{...opts,body:null})).status,400);
 assert.equal((await h.request('/api/auth/login',{...opts,body:{},contentType:'text/plain'})).status,415);
 assert.equal((await h.request('/api/auth/login',{...opts,raw:'a'.repeat(2000001)})).status,413);
 const r=await h.request('/api/auth/signup',{...opts,body:{email:'a@example.com',password:'password123'}});assert.equal(r.data.confirmationRequired,true);
});
test('expiring JWT refreshes server-side; logout revokes local session',async()=>{
 const sb=mockSupabase(),h=harness(sb),auth=await login(h);h.tick(3600000);assert.equal((await h.request('/api/products',auth)).status,200);
 assert.ok(sb.calls.some(c=>c.path.includes('grant_type=refresh_token')));
 assert.equal((await h.request('/api/auth/logout',{...auth,method:'POST',body:{}})).status,200);assert.equal((await h.request('/api/products',auth)).status,401);
});
test('Supabase adapter paginates beyond default row cap using user JWT',async()=>{
 const calls=[];const sb=new Supabase({url:'https://test.supabase.co',key:'publishable',fetchImpl:async(url,options)=>{
 calls.push({url,options});const offset=Number(new URL(url).searchParams.get('offset'));return new Response(JSON.stringify(Array.from({length:offset<1000?500:123},(_,i)=>({id:`P${offset+i}`}))));}});
 assert.equal((await sb.listProducts('USER')).length,1123);assert.equal(calls.length,3);assert.ok(calls.every(c=>c.options.headers.Authorization==='Bearer USER'&&c.options.headers.apikey==='publishable'));
});
test('adapter redacts upstream diagnostics and differentiates missing schema, auth and offline errors',async()=>{
 for(const [status,data,expected]of [[400,{code:'23514',details:'SECRET'},400],[404,{code:'PGRST205'},503],[401,{message:'SECRET'},401],[500,{message:'SECRET'},503]]){
 const sb=new Supabase({url:'https://test.supabase.co',key:'public',fetchImpl:async()=>new Response(JSON.stringify(data),{status})});await assert.rejects(sb.request('/rest/v1/av_products'),e=>e.status===expected&&!e.message.includes('SECRET'));
 }
 const sb=new Supabase({url:'https://test.supabase.co',key:'public',fetchImpl:async()=>{throw new Error('SECRET');}});await assert.rejects(sb.request('/rest/v1/av_products'),e=>e.status===503&&!e.message.includes('SECRET'));
});
