/* Service Worker: делает приложение доступным без интернета.
   Стратегия «сначала сеть, потом кэш»: при наличии интернета всегда свежая версия,
   без интернета — последняя сохранённая. */

// Меняйте версию, если меняется список файлов ниже
const CACHE = "tour-guide-v10";
const FILES = ["/", "/index.html", "/app.js", "/trip.json", "/i18n/ru.json", "/manifest.json", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];
const NETWORK_TIMEOUT = 3000; // мс: в метро сеть бывает «полуживой», долго не ждём

// 1. Установка: сохраняем файлы приложения в кэш
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
  self.skipWaiting(); // новая версия SW включается сразу, без перезапуска браузера
});

// 2. Активация: удаляем кэши старых версий
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Запрос в сеть с ограничением по времени
function fetchWithTimeout(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), NETWORK_TIMEOUT);
    fetch(request).then(
      res => { clearTimeout(timer); resolve(res); },
      err => { clearTimeout(timer); reject(err); }
    );
  });
}

// 3. Каждый запрос
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Шрифты Google: берём из кэша, если есть (они не меняются), иначе качаем и сохраняем
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      }))
    );
    return;
  }

  // Чужие сайты (карты, WhatsApp) не трогаем
  if (url.origin !== self.location.origin) return;

  // Статус рейса (/api/…) — всегда напрямую. Из кэша его брать нельзя: кэш ниже игнорирует «?f=…»
  // и мог бы отдать ответ про другой рейс. Последний статус приложение хранит само.
  if (url.pathname.startsWith("/api/")) return;

  // Наши файлы: сначала сеть (с таймаутом), при успехе обновляем кэш; иначе — кэш
  event.respondWith(
    fetchWithTimeout(req)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true })
          .then(hit => hit || (req.mode === "navigate" ? caches.match("/index.html") : undefined))
          .then(hit => hit || Response.error())
      )
  );
});
