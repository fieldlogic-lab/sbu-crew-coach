const CACHE='sbu-crew-coach-v3';self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/']))));self.addEventListener('fetch',e=>{if(e.request.method==='GET'&&new URL(e.request.url).origin===location.origin)e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(x=>{let copy=x.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return x})))})

