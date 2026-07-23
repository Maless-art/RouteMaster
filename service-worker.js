const CACHE_NAME = "routemaster-v1.0.0";
const ASSETS = [
  "./","./index.html","./style.css?v=1.0.0","./storage.js?v=1.0.0","./firebase.js?v=1.0.0","./app.js?v=1.0.0","./manifest.json","./logo.svg","./icono-192.png","./icono-512.png"
];
self.addEventListener("install",event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS)))});
self.addEventListener("activate",event=>event.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key))))])));
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET"||event.request.url.includes("googleapis.com")||event.request.url.includes("gstatic.com"))return;
  event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));return response}).catch(()=>caches.match(event.request).then(cached=>cached||caches.match("./index.html"))))
});
