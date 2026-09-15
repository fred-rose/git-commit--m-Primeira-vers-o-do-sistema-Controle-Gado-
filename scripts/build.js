import { build } from 'esbuild';
import { readdir,readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
await build({stdin:{contents:"export { createClient } from '@supabase/supabase-js';",resolveDir:process.cwd()},outfile:'js/vendor/supabase.js',bundle:true,format:'esm',platform:'browser',target:['es2022'],minify:true,legalComments:'eof'});
async function files(dir){const result=[];for(const e of await readdir(dir,{withFileTypes:true})){const path=`${dir}/${e.name}`;if(e.isDirectory())result.push(...await files(path));else result.push(path);}return result;}
const scripts=(await files('js')).filter(f=>f.endsWith('.js'));
for(const file of [...scripts,...(await files('scripts')).filter(f=>f.endsWith('.js'))]){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8',windowsHide:true});if(result.status)throw new Error(result.stderr);}
for(const file of scripts){const source=await readFile(file,'utf8');for(const match of source.matchAll(/(?:from\s*|import\s*\()(['"])(\.[^'"]+)\1/g)){await readFile(new URL(match[2],pathToFileURL(resolve(file))));}}
const shell=['./','index.html','style.css','manifest.webmanifest',...(await files('css')),...(await files('assets')),...scripts].filter(f=>!f.endsWith('.map')).map(f=>f==='./'?f:`./${f}`);
const hash=createHash('sha256');for(const file of shell.filter(f=>f!=='./'))hash.update(await readFile(file));
const version=`controle-gado-shell-${hash.digest('hex').slice(0,16)}`;
await writeFile('sw.js',`// Gerado por npm run build. Cache apenas de arquivos públicos do app.\nconst CACHE=${JSON.stringify(version)};\nconst SHELL=${JSON.stringify(shell)};\nself.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));\nself.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('controle-gado-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));\nself.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(event.request.method!=='GET'||u.origin!==self.location.origin||u.search||!SHELL.some(p=>new URL(p,self.location).pathname===u.pathname))return;event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put(event.request,copy));}return response;}).catch(()=>caches.match(event.request).then(r=>r||Response.error())));});\n`);
process.stdout.write(`Build validado. ${scripts.length} módulos; cache ${version}.\n`);
