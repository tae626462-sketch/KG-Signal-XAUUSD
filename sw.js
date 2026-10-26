// KG Signal XAUUSD — Service Worker
// เก็บหน้าแอพไว้ในเครื่องให้เปิดได้เร็ว/ติดตั้งได้ · ราคาและสัญญาณดึงสดจากเน็ตเสมอ (ไม่เก็บแคช)
const CACHE = "kg-xauusd-v1";
const SHELL = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // ราคา/กราฟ/ฟอนต์ภายนอก → ไปเน็ตตรง

  // หน้าแอพ: ใช้ของใหม่จากเน็ตก่อน ถ้าออฟไลน์ค่อยใช้ที่เก็บไว้
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match("./index.html")))
  );
});
