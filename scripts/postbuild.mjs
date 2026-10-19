import { execSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dist = process.env.POTATO_DIST || join(root, 'dist');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = process.env.POTATO_VERSION || pkg.version;

function gitSha() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

const sha = gitSha();
writeFileSync(join(dist, 'version.json'), `${JSON.stringify({ version, sha }, null, 2)}\n`);

if (process.env.POTATO_SKIP_SPLASH !== '1') {
  const splash = spawnSync('python3', [join(root, 'scripts/make_splash.py')], { stdio: 'inherit' });
  if (splash.status !== 0) process.exit(splash.status ?? 1);
}

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, files);
    else files.push(path);
  }
  return files;
}

const precache = walk(dist)
  .map((file) => `/${relative(dist, file).split('\\').join('/')}`)
  .filter((file) => !file.endsWith('/sw.js') && !file.endsWith('/version.json') && !file.includes('/splash/'))
  .map((file) => `/potato-region${file}`);

const home = '/potato-region/index.html';
const sw = `const CACHE=${JSON.stringify(`potato-region-v${version}`)};
const ASSETS=${JSON.stringify(precache)};
const HOME=${JSON.stringify(home)};
async function fresh(url){
  const u=new URL(url, self.registration.scope);
  u.searchParams.set('potato', CACHE);
  try {
    return await fetch(u.href,{cache:'reload'});
  } catch (error) {
    return fetch(u.href,{cache:'no-store'});
  }
}
async function precache(){
  const cache=await caches.open(CACHE);
  const queue=ASSETS.slice();
  async function take(){
    while(queue.length){
      const url=queue.shift();
      const response=await fresh(url);
      if(!response.ok) throw new Error(url);
      await cache.put(url, response);
    }
  }
  await Promise.all([take(),take(),take(),take()]);
}
async function cached(request){
  const keys=await caches.keys();
  for(const key of keys){
    const cache=await caches.open(key);
    const hit=await cache.match(request);
    if(hit) return hit;
  }
  return null;
}
function ping(client){
  return new Promise((resolve)=>{
    const channel=new MessageChannel();
    const timer=setTimeout(()=>resolve(false),1500);
    channel.port1.onmessage=()=>{clearTimeout(timer);resolve(true);};
    try { client.postMessage({type:'POTATO_PING'},[channel.port2]); }
    catch (error) { clearTimeout(timer); resolve(false); }
  });
}
self.addEventListener('install',(event)=>{
  event.waitUntil((async()=>{
    await precache();
    const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    let rescue=false;
    for(const client of clients){
      if(!(await ping(client))) rescue=true;
    }
    if(rescue) await self.skipWaiting();
  })());
});
self.addEventListener('message',(event)=>{
  const data=event.data;
  if(data==='SKIP_WAITING'||data==='skip-waiting'||(data&&data.type==='SKIP_WAITING')) self.skipWaiting();
});
self.addEventListener('activate',(event)=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter((key)=>key!==CACHE).map((key)=>caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',(event)=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin) return;
  if(url.pathname.endsWith('/version.json')&&url.searchParams.has('t')) return;
  if(url.pathname.endsWith('/sw.js')||url.pathname.endsWith('/version.json')){
    event.respondWith(fetch(event.request,{cache:'reload'}).catch(()=>fetch(event.request,{cache:'no-store'})));
    return;
  }
  if(event.request.mode==='navigate'){
    event.respondWith((async()=>{
      try{
        const response=await fresh(HOME);
        if(response.ok){
          const cache=await caches.open(CACHE);
          await cache.put(HOME, response.clone());
          const keys=await caches.keys();
          await Promise.all(keys.filter((key)=>key!==CACHE).map((key)=>caches.delete(key)));
          return response;
        }
      }catch(error){}
      const home=await cached(HOME)||await cached(event.request);
      if(home) return home;
      return new Response('Offline',{status:503,headers:{'Content-Type':'text/plain'}});
    })());
    return;
  }
  event.respondWith((async()=>{
    const hit=await cached(event.request);
    if(hit) return hit;
    try{
      const response=await fetch(event.request);
      if(response.ok){
        const cache=await caches.open(CACHE);
        await cache.put(event.request, response.clone());
      }
      return response;
    }catch(error){
      return new Response('Offline',{status:503,headers:{'Content-Type':'text/plain'}});
    }
  })());
});
`;

writeFileSync(join(dist, 'sw.js'), sw);
console.log(`service worker precache ${precache.length} files, v${version}`);
