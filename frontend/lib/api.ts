const API_URL = process.env.NEXT_PUBLIC_API_URL;
export function getToken(){if(typeof window==='undefined')return '';return localStorage.getItem('token')||''}
export function authHeaders(){const t=getToken();return t?{Authorization:`Bearer ${t}`}:{} as any}
async function parse(r:Response){if(!r.ok)throw new Error(await r.text());return r.json()}
export async function apiGet(path:string){return parse(await fetch(`${API_URL}${path}`,{headers:authHeaders(),cache:'no-store'}))}
export async function apiPost(path:string,body:unknown){return parse(await fetch(`${API_URL}${path}`,{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify(body)}))}
export async function apiPut(path:string,body:unknown){return parse(await fetch(`${API_URL}${path}`,{method:'PUT',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify(body)}))}
export async function apiDelete(path:string){return parse(await fetch(`${API_URL}${path}`,{method:'DELETE',headers:authHeaders()}))}
export async function apiUpload(path:string,file:File){const f=new FormData();f.append('file',file);return parse(await fetch(`${API_URL}${path}`,{method:'POST',headers:authHeaders(),body:f}))}
