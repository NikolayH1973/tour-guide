/* Посредник «Статус рейса»: телефон → эта функция на Netlify → Aviationstack.

   Зачем посредник, а не запрос прямо из приложения:
   1. Ключ Aviationstack секретный. Всё, что лежит в index.html, видно любому,
      а здесь ключ берётся из переменной окружения AVIATIONSTACK_KEY (Netlify →
      Site configuration → Environment variables) и в коде/на GitHub не появляется.
   2. Бесплатный план — 100 запросов в месяц на ОБА рейса. Поэтому:
      • отвечаем только про наши рейсы (чужие не тратят лимит);
      • спрашиваем Aviationstack только в «окне» от 12 часов до вылета до посадки;
      • ответ кэширует сам Netlify (заголовок Netlify-CDN-Cache-Control):
        30 участников получают один и тот же ответ, а функция и Aviationstack
        вызываются не чаще раза в 30 минут. */

// Наши рейсы. dep — время вылета по расписанию с часовым поясом аэропорта
const FLIGHTS = {
  BA405: { date: "2026-12-03", dep: "2026-12-03T06:20:00+02:00", tz: "Asia/Jerusalem" },   // Тель-Авив → Лондон
  BA404: { date: "2026-12-09", dep: "2026-12-09T20:30:00+00:00", tz: "Europe/London" }     // Лондон → Тель-Авив
};
const HOUR = 3600 * 1000;
// Проверено 23–24.11 на настоящем BA405: в 23:06 рейса в данных ещё не было (за ~7 ч), в 05:00 уже был.
// Похоже, он появляется после полуночи по UTC (02:00 по Израилю). Поэтому окно — 5 ч до вылета:
// раньше сервис всё равно ответил бы «нет данных» и только тратил бы лимит.
const OPEN_BEFORE = 5 * HOUR;    // начинаем спрашивать за 5 ч до вылета
const CLOSE_AFTER = 9 * HOUR;    // и перестаём через 9 ч после вылета (5 ч полёта + запас на задержку)
const FRESH = 30 * 60;           // секунд: как долго Netlify отдаёт сохранённый ответ

// Ответ в JSON + сколько секунд Netlify может отдавать его из кэша без вызова функции
function json(body, cacheSeconds) {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=60",                                         // браузер — 1 минута
      "netlify-cdn-cache-control": `public, durable, s-maxage=${cacheSeconds}`      // Netlify — общий кэш
    }
  });
}

// Из ответа Aviationstack берём только нужное и прощаем отсутствие любых полей
function pick(side = {}) {
  return {
    airport: side.iata || null,
    terminal: side.terminal || null,
    gate: side.gate || null,
    baggage: side.baggage || null,
    delay: Number.isFinite(side.delay) ? side.delay : null,  // минуты
    scheduled: side.scheduled || null,
    estimated: side.estimated || null,
    actual: side.actual || null
  };
}

// Сегодняшняя дата в часовом поясе аэропорта вылета, в виде 2026-11-23 (формат en-CA как раз такой)
const todayIn = tz => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());

export default async (req) => {
  const params = new URL(req.url).searchParams;
  const code = (params.get("f") || "").toUpperCase();
  const cfg = FLIGHTS[code];
  if (!cfg) return json({ state: "unknown" }, 86400);

  // Тестовый режим: тот же рейс, но в другой день (BA405/BA404 летают ежедневно).
  // ?test=today — сегодняшний, ?test=2026-11-24 — конкретная дата. «Окно» не проверяем.
  const test = params.get("test");
  const date = test === null ? cfg.date : /^\d{4}-\d{2}-\d{2}$/.test(test) ? test : todayIn(cfg.tz);
  if (test === null) {
    const now = Date.now(), dep = Date.parse(cfg.dep);
    if (now < dep - OPEN_BEFORE) return json({ state: "early", opensAt: new Date(dep - OPEN_BEFORE).toISOString() }, 600);
    if (now > dep + CLOSE_AFTER) return json({ state: "over" }, 86400);
  }

  const key = process.env.AVIATIONSTACK_KEY;
  if (!key) return json({ state: "nokey" }, 300);

  try {
    const api = `https://api.aviationstack.com/v1/flights?access_key=${encodeURIComponent(key)}&flight_iata=${code}`;
    const res = await fetch(api, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    if (data.error) return json({ state: "error", reason: data.error.code || "api" }, 600);
    // Сервис отдаёт рейсы за несколько дней — берём наш по дате вылета
    const f = (data.data || []).find(x => x.flight_date === date);
    // «Нет данных» держим в кэше только 5 минут: рейс может появиться в любой момент, не ждём полчаса
    if (!f) return json({ state: "notfound", date, fetched: new Date().toISOString() }, 300);
    return json({
      state: "ok",
      flight: code,
      date,
      test: test !== null,
      status: f.flight_status || "unknown",   // scheduled, active, landed, cancelled, incident, diverted
      dep: pick(f.departure),
      arr: pick(f.arrival),
      fetched: new Date().toISOString()
    }, FRESH);
  } catch (e) {
    return json({ state: "error", reason: "network" }, 300);   // сервис не ответил — попробуем через 5 минут
  }
};

// Адрес функции на сайте: https://london03122026.netlify.app/api/flight?f=BA405
export const config = { path: "/api/flight" };
