// Servidor efêmero de testes: configuração local, sem editar credenciais do projeto.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {spawn} from 'node:child_process';
const root=process.cwd();
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname==='/js/config.js'){res.writeHead(200,{'Content-Type':'text/javascript'});return res.end("export const config={supabaseUrl:'',supabaseAnonKey:''};");}
    const relative=pathname==='/'?'index.html':pathname.slice(1),file=resolve(root,relative);
    if(!file.startsWith(root+sep)||!/^(index\.html|sw\.js|manifest\.webmanifest|style\.css|js\/[^.].*\.js|css\/[^.].*\.css|assets\/[^.].*\.(svg|png|jpg|webp))$/.test(relative)){res.writeHead(404);return res.end();}
    const content=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});res.end(content);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try{
  const defaults=['browser.mjs','browser-finance.mjs','browser-data.mjs','browser-pwa.mjs'];
  const allowed=[...defaults,'browser-feedback.mjs','browser-auth.mjs','browser-cloud.mjs'];
  const suites=process.argv.slice(2).length?process.argv.slice(2):defaults;
  if(suites.some(name=>!allowed.includes(name)))throw new Error('Suíte local não reconhecida.');
  for(const suite of suites){
    const child=spawn(process.execPath,[`tests/${suite}`],{env:{...process.env,TEST_URL:`http://127.0.0.1:${server.address().port}`},stdio:'inherit',windowsHide:true});
    const code=await new Promise((resolve,reject)=>{child.on('exit',resolve);child.on('error',reject);});
    if(code!==0){process.exitCode=1;break;}
  }
}finally{server.close();}
