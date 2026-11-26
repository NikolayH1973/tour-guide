/* Общая логика статистики — без зависимостей от Netlify, чтобы её можно было проверить тестом.

   Что храним (Netlify Blobs, хранилище «stats»):
     ключ  d/<день по Лондону>/<номер устройства>
     значение { mode, plat, first, last, opens, ev: { "view:program": 3, "place:Тауэр": 1, ... } }

   Почему «один файл на устройство в день», а не общий счётчик:
   у Blobs нет атомарного «прибавить 1». Если два телефона одновременно прочитают общий счётчик
   и запишут +1, одно нажатие потеряется. А в свой файл пишет только сам телефон — конфликтов нет.

   Имён, телефонов и IP не храним: номер устройства — случайная строка, которую телефон
   придумал сам при первом открытии. */

export const MAX_EVENTS = 300;         // событий в одной пачке — больше не принимаем
const ID_RE = /^[a-z0-9-]{8,40}$/;     // номер устройства: только безопасные символы
const EV_RE = /^[a-z]+(:[^\u0000-\u001f]{1,80})?$/;   // «view:program», «place:Тауэр», «open»
const DAY = 24 * 3600 * 1000;

// День по лондонскому времени: события поездки считаем по местным суткам
export function londonDay(ts) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(ts));
}

// Проверяем пачку от телефона. Всё подозрительное молча отбрасываем — это статистика, не банк.
export function cleanBatch(body, now = Date.now()) {
  if (!body || typeof body !== "object") return null;
  const { d, m, p, e } = body;
  if (!ID_RE.test(String(d)) || !Array.isArray(e)) return null;
  const events = e.slice(0, MAX_EVENTS).filter(x =>
    Array.isArray(x) && Number.isFinite(x[0]) && x[0] > now - 60 * DAY && x[0] < now + DAY && EV_RE.test(String(x[1])));
  return { d: String(d), mode: m === "app" ? "app" : "web", plat: ["ios", "android", "desktop"].includes(p) ? p : "other", events };
}

// Раскладываем события по дням → { "2026-12-04": [[ts, "view:program"], ...] }
export function byDay(events) {
  const out = {};
  for (const ev of events) (out[londonDay(ev[0])] ||= []).push(ev);
  return out;
}

// Прибавляем события дня к тому, что уже лежит в файле устройства за этот день
export function mergeDay(old, batch, events) {
  const rec = old || { mode: batch.mode, plat: batch.plat, first: events[0][0], last: 0, opens: 0, opensApp: 0, ev: {} };
  rec.opensApp ||= 0;                                  // поле появилось позже — в старых записях его нет
  if (batch.mode === "app") rec.mode = "app";           // хоть раз открыли установленное — считаем установившим
  rec.plat = batch.plat;
  for (const [ts, name] of events) {
    rec.first = Math.min(rec.first, ts);
    rec.last = Math.max(rec.last, ts);
    if (name === "open") { rec.opens++; if (batch.mode === "app") rec.opensApp++; }   // открытия в установленном приложении — отдельно
    rec.ev[name] = (rec.ev[name] || 0) + 1;
  }
  return rec;
}

// Записать пачку в хранилище (store — Netlify Blobs или заглушка в тесте)
export async function saveBatch(store, batch) {
  const days = byDay(batch.events);
  for (const [day, events] of Object.entries(days)) {
    const key = `d/${day}/${batch.d}`;
    const old = await store.get(key, { type: "json" });
    await store.setJSON(key, mergeDay(old, batch, events));
  }
  return Object.keys(days).length;
}

// Собрать отчёт из всех файлов: по дням, по устройствам и топы событий
export async function buildReport(store) {
  const { blobs } = await store.list({ prefix: "d/" });
  const recs = await Promise.all(blobs.map(async b => {
    const [, day, id] = b.key.split("/");
    return { day, id, rec: await store.get(b.key, { type: "json" }) };
  }));
  const devices = {}, days = {}, events = {};
  for (const { day, id, rec } of recs) {
    if (!rec) continue;
    const dev = devices[id] ||= { mode: "web", plat: rec.plat, days: 0, opens: 0, opensApp: 0 };
    if (rec.mode === "app") dev.mode = "app";
    dev.plat = rec.plat; dev.days++; dev.opens += rec.opens; dev.opensApp += rec.opensApp || 0;
    const d = days[day] ||= { devices: 0, opens: 0, opensApp: 0, events: 0 };
    d.devices++; d.opens += rec.opens; d.opensApp += rec.opensApp || 0;
    for (const [name, n] of Object.entries(rec.ev)) { d.events += n; events[name] = (events[name] || 0) + n; }
  }
  const list = Object.values(devices);
  const count = f => list.filter(f).length;
  return {
    totals: {
      devices: list.length,
      installed: count(x => x.mode === "app"),
      ios: count(x => x.plat === "ios"), android: count(x => x.plat === "android"), desktop: count(x => x.plat === "desktop"),
      opens: list.reduce((s, x) => s + x.opens, 0),
      opensApp: list.reduce((s, x) => s + x.opensApp, 0),
      returning: count(x => x.days > 1)        // открывали больше чем в один день
    },
    days: Object.entries(days).sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({ day, ...v })),
    events
  };
}
