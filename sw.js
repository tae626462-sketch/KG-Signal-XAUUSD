// KG Signal XAUUSD — Service Worker
// เก็บหน้าแอพไว้ในเครื่องให้เปิดได้เร็ว/ติดตั้งได้ · ราคาและสัญญาณดึงสดจากเน็ตเสมอ (ไม่เก็บแคช)
// รับแจ้งเตือน P-BUY / P-SELL จากเซิร์ฟเวอร์ (Apps Script) แม้ปิดแอพ
const CACHE = "kg-xauusd-v2";
const STATE = "kg-push";   // ค่าที่แอพฝากไว้: ลิงก์เซิร์ฟเวอร์ + สัญญาณที่แสดงไปแล้ว
const SHELL = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== STATE).map(k => caches.delete(k))))
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

// ---------------- แจ้งเตือน (Web Push) ----------------
async function getState(name, def){
  try { const r = await (await caches.open(STATE)).match("./__" + name); return r ? await r.json() : def; }
  catch (e) { return def; }
}
async function putState(name, obj){
  const c = await caches.open(STATE);
  await c.put(new Request("./__" + name), new Response(JSON.stringify(obj), { headers: { "Content-Type": "application/json" } }));
}
const ICON = "icon-192.png";
const show = (title, body, tag) => self.registration.showNotification(title, {
  body, tag, icon: ICON, badge: ICON, renotify: true, vibrate: [200, 100, 200, 100, 300], data: { url: "./" }
});

// push ไม่มีเนื้อหา → ดึงสัญญาณล่าสุดจากเซิร์ฟเวอร์ แล้วแสดงเฉพาะที่ยังไม่เคยแสดง
async function onPush(){
  const cfg = await getState("push_cfg", {});
  let items = [], test = false, fetched = false;
  if (cfg.url){
    try {
      const sub = await self.registration.pushManager.getSubscription();
      const q = new URLSearchParams({ a: "latest", ep: sub ? sub.endpoint : "", _: Date.now() });
      const r = await fetch(cfg.url + (cfg.url.includes("?") ? "&" : "?") + q, { cache: "no-store" });
      const j = await r.json();
      if (j.ok){ items = j.items || []; test = !!j.test; fetched = true; }
    } catch (e) {}
  }
  const seen = await getState("push_seen", []);
  const now = Date.now() / 1000;
  const fresh = items.filter(x => !seen.includes(x.id) && now - x.ts < 3 * 3600);
  const jobs = fresh.map(x => show(x.title, x.body, x.id));
  if (test) jobs.push(show("✅ KG Signal XAUUSD", "ทดสอบแจ้งเตือนสำเร็จ — เครื่องนี้จะได้รับ P-BUY / P-SELL แม้ปิดแอพ", "kg-test"));
  if (!jobs.length) jobs.push(show("KG Signal XAUUSD", fetched ? "มีการอัปเดตสัญญาณ — แตะเพื่อเปิดแอพ" : "มีสัญญาณใหม่ — แตะเพื่อเปิดแอพดูรายละเอียด", "kg-generic"));
  if (fresh.length) await putState("push_seen", seen.concat(fresh.map(x => x.id)).slice(-60));
  await Promise.all(jobs);
}
self.addEventListener("push", e => e.waitUntil(onPush()));

// แตะแจ้งเตือน → เปิดแอพ (ถ้าเปิดอยู่แล้วก็สลับไปหน้านั้น)
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins){ if (w.url.startsWith(self.registration.scope) && "focus" in w) return w.focus(); }
    return self.clients.openWindow(self.registration.scope);
  })());
});

// บริการ push เปลี่ยนที่อยู่เครื่อง → สมัครใหม่ให้อัตโนมัติ
self.addEventListener("pushsubscriptionchange", e => {
  e.waitUntil((async () => {
    const cfg = await getState("push_cfg", {});
    if (!cfg.url || !cfg.key) return;
    const s = cfg.key.replace(/-/g, "+").replace(/_/g, "/"), raw = atob(s + "===".slice((s.length + 3) % 4));
    const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, c => c.charCodeAt(0)) });
    await fetch(cfg.url + (cfg.url.includes("?") ? "&" : "?") + new URLSearchParams({ a: "sub", ep: sub.endpoint }), { cache: "no-store" });
  })());
});
