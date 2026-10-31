/** Browser calls only our same-origin API. Supabase tokens never enter localStorage. */
export const cloud = { configured:null, user:null, csrf:null, error:'' };
export async function api(path, {method='GET', body}={}) {
  let response;
  try {response=await fetch(path,{method,credentials:'same-origin',headers:{...(method!=='GET'?{'Content-Type':'application/json','X-CSRF-Token':cloud.csrf||''}: {})},...(body!==undefined?{body:JSON.stringify(body)}:{})});}
  catch {throw new Error('Cannot reach the AlgoVision server. Check the server and retry.');}
  let data;try {data=await response.json();}catch {throw new Error('The backend is unavailable. Run the Node server, then refresh.');}
  if(!response.ok) {if(response.status===401)cloud.user=null;throw new Error(data.error||'Backend request failed.');}
  return data;
}
export async function session() {
  const data=await api('/api/session');Object.assign(cloud,data,{error:''});return data;
}
export function requireCloudUser() {
  if(cloud.configured===null)throw new Error('Backend status is unknown. Refresh before making changes.');
  if(cloud.configured && !cloud.user)throw new Error('Sign in from Account & cloud to use your saved workspace.');
}
