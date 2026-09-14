const CACHE='sbu-crew-coach-v9';
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==location.origin)return;
  const pathname=new URL(event.request.url).pathname;

  // API responses contain live/private coach state and must never be served from
  // the PWA cache. Always go to the network so manual Daily Plan pushes appear
  // on the phone immediately after refresh.
  if(pathname.startsWith('/api/')){
    event.respondWith(fetch(event.request));
    return;
  }

  const liveAsset=pathname==='/'||/\/(app|sw|index|console|athlete)\.(js|html|css)$/.test(pathname);
  event.respondWith(liveAsset
    ? fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response}).catch(()=>caches.match(event.request))
    : caches.match(event.request).then(response=>response||fetch(event.request).then(network=>{const copy=network.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return network})));
});
