import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi } from './backend/api.mjs';
import { Supabase } from './backend/supabase.mjs';
const root=dirname(fileURLToPath(import.meta.url));
// Simple literal KEY=value parser. .env is never served or included in the submission ZIP.
try {
  const env=await readFile(resolve(root,'.env'),'utf8');
  for(const line of env.split(/\r?\n/)) {
    const match=/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if(match && process.env[match[1]]===undefined) process.env[match[1]]=match[2].replace(/^(['"])(.*)\1$/,'$2');
  }
} catch(error) {if(error.code!=='ENOENT')throw error;}
const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY;
if (!!url!==!!key) throw new Error('Set both SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in .env.');
if(url) {
  const parsed=new URL(url);
  if(parsed.protocol!=='https:' || parsed.username || parsed.password || parsed.search || parsed.hash || !['','/'].includes(parsed.pathname)) throw new Error('SUPABASE_URL must be the HTTPS project origin.');
  let legacyRole='';try {legacyRole=JSON.parse(Buffer.from(key.split('.')[1]||'','base64url').toString()).role;}catch{}
  if(key.startsWith('sb_secret_')||legacyRole==='service_role') throw new Error('Use a publishable/anon key, never a secret/service_role key.');
}
const port=Number(process.env.PORT||4173);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid PORT.');
const api=createApi({supabase:url?new Supabase({url,key}):null,port,secure:process.env.COOKIE_SECURE==='true'});
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png'};
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname.startsWith('/api/')){await api(req,res,pathname);return;}
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    // An allowlist prevents accidental disclosure of backend source, .env, SQL and tests.
    if(!(pathname==='/'||pathname==='/index.html'||/^\/src\/[a-z-]+\.(js|css)$/.test(pathname)||/^\/sample-[a-z-]+\.json$/.test(pathname)||/^\/screenshots\/[a-z-]+\.png$/.test(pathname))){res.writeHead(403);res.end('Forbidden');return;}
    const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
    const data=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)],'Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:data);
  } catch {res.writeHead(404);res.end('Not found');}
});
server.requestTimeout=30000;server.headersTimeout=15000;
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'Port is already in use. Stop the old server or choose PORT.':`Server failed: ${error.code}`);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`AlgoVision 2.0: http://127.0.0.1:${port}\nSupabase: ${url?'configured':'not configured — demo mode'}`));
