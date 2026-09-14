'use strict';
// Static public branding only. Authenticated pages, proofs and API data are NEVER cached.
const CACHE='aacharya-static-v7';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/aacharya-app-icon.png'])));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('aacharya-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(event.request.method!=='GET'||u.origin!==self.location.origin||u.pathname!=='/aacharya-app-icon.png')return;event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request)));});
