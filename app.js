/* Движок путеводителя. Ничего не знает о конкретном туре:
   все данные приходят из trip.json (window.TOUR) — его загружает index.html. */
/* =========================================================
   ДВИЖОК
   ========================================================= */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));

// Безопасное хранилище: в некоторых браузерах localStorage недоступен
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

const MONTHS = [tx("k1"),tx("k2"),tx("k3"),tx("k4"),tx("k5"),tx("k6"),tx("k7"),tx("k8"),tx("k9"),tx("k10"),tx("k11"),tx("k12")];
const WDAYS = [tx("k13"),tx("k14"),tx("k15"),tx("k16"),tx("k17"),tx("k18"),tx("k19")];
const parse = iso => { const [y,m,d] = iso.split("-").map(Number); return new Date(y, m-1, d); };
const fmt = iso => { const d = parse(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const wday = iso => WDAYS[parse(iso).getDay()];
// "Сегодня" по местному времени тура: телефон может ещё жить по домашнему
// Первая буква — заглавная: «в Лондоне» в начале предложения становится «В Лондоне»
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
function tripToday() {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: TOUR.tz }).format(new Date()); }
  catch { const d = new Date(); return d.toISOString().slice(0,10); }
}
const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

let preview = null; // дата для предпросмотра (до поездки)

// Подпись сбора: известное место — как есть; иначе — что гид пришлёт в WhatsApp
const waText = m => `${tx("k20", m.wa)}`;
function placeHtml(m) {
  return m.wa
    ? `<span class="place">📲 ${esc(waText(m))}</span>`
    : `<span class="place">${esc(m.place)}</span>`;
}

/* Сбор в аэропорту Бен-Гурион: время считаем из времени вылета, чтобы при смене рейса поправить одно место */
function airportTime() {
  const [hh, mm] = TOUR.flights.out.dep.split(":").map(Number);
  const t = (hh * 60 + mm - TOUR.airport.hoursBefore * 60 + 1440) % 1440;   // +1440: не уйти в минус до полуночи
  return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0");
}
function airportHtml() {
  const a = TOUR.airport, q = encodeURIComponent(a.q);
  // Иврит внутри русского текста оборачиваем в <bdi>: он пишется справа налево и иначе «перемешает» кавычки
  const where = esc(a.where).replace("נקודת מפגש", '<bdi dir="rtl" lang="he" style="white-space:nowrap">נקודת מפגש</bdi>');
  return `<div class="meet">
      <span class="time">${airportTime()}</span>
      <span class="place">${tx("k21", esc(a.name))}</span>
      <span></span>
      <span class="small">${where}<br><span class="muted">${tx("k22", TOUR.home.dat, a.hoursBefore, TOUR.flights.out.dep)}</span></span>
    </div>
    <div class="btn-row">
      <a class="btn ghost" href="https://waze.com/ul?q=${q}&navigate=yes" target="_blank" rel="noopener">🚗 Waze</a>
      <a class="btn ghost" href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">${tx("k23")}</a>
    </div>`;
}

/* Пункт программы может вести дальше:
   place — в карточку места («›»), opt — в описание опции (вся строка),
   info — короткое пояснение, раскрывается прямо в строке («ⓘ»), link — на другой экран (например, полку). */
const itemOpen = new Set();   // раскрытые пояснения (ключ «дата:номер») — чтобы перерисовка их не сворачивала
function dayItems(day) {
  return `<ul class="items">${day.items.map((i, n) => {
    const text = `${i.eve ? "🌙 " : ""}${esc(i.t)}`;
    const p = i.place && TOUR.places.find(x => x.name === i.place);
    const o = i.opt && TOUR.options.find(x => x.id === i.opt);
    const cls = [i.opt ? "opt" : "", i.plain ? "plain" : ""].join(" ").trim();
    if (o) return `<li class="${cls}"><a class="it-row" href="#program/opt-${o.id}" data-go="program/opt-${o.id}" data-day="${day.date}">
        <span>${text} <span class="pill opt">${tx("k24", optPrice(o) ? " · " + esc(optPrice(o)) : "")}</span></span><span class="chev" aria-hidden="true">›</span></a></li>`;
    if (i.info) {
      const key = `${day.date}:${n}`;
      const btns = [p ? `<a class="btn ghost" href="#places/p/${placeId(p)}" data-go="places/p/${placeId(p)}">${CAT_ICON[p.cat]} ${esc(placeTitle(p))} ›</a>` : "",
                    i.link ? `<a class="btn ghost" href="#${i.link}" data-go="${i.link}">${esc(i.linkLabel)}</a>` : ""].join("");
      return `<li class="${cls}"><details class="it-info" data-key="${key}" ${itemOpen.has(key) ? "open" : ""}>
        <summary><span>${text}</span><span class="it-i" aria-label="${tx("k25")}">ⓘ</span></summary>
        ${i.info.map(t => `<p>${esc(t)}</p>`).join("")}${btns ? `<div class="btn-row">${btns}</div>` : ""}
      </details></li>`;
    }
    if (p) return `<li class="${cls}"><a class="it-row" href="#places/p/${placeId(p)}" data-go="places/p/${placeId(p)}">
        <span>${text}</span><span class="chev" aria-hidden="true">›</span></a></li>`;
    return `<li class="${cls}"><span>${text}</span></li>`;
  }).join("")}</ul>`;
}

/* ===== Опции (экскурсии за доплату) =====
   Каждая — раскрывающаяся карточка: заголовок и «зацепка» гида видны сразу, полный текст — по нажатию.
   Кнопка «Записаться» открывает WhatsApp гида с готовым текстом (wa.me умеет принимать ?text=). */
// Цена: взрослый / ребёнок до 16 лет, в фунтах. Короткая форма — для «пилюли» в программе, длинная — в карточке.
const optPrice = o => o.price ? `${tx("k26", TOUR.currency.symbol, o.price.adult, TOUR.currency.symbol, o.price.child)}` : null;
const optPriceLong = o => o.price ? `${tx("k27", TOUR.currency.symbol, o.price.adult, TOUR.currency.symbol, o.price.child, TOUR.currency.childAge)}` : tx("k28");
const optOpen = new Set();   // какие карточки опций раскрыты (чтобы перерисовка программы их не сворачивала)
const signupBtn = (text, cls) => `<a class="btn ${cls}" href="${TOUR.signupForm}" target="_blank" rel="noopener">${text}</a>`;

function optionsHtml() {
  const g = TOUR.guide;
  const day = iso => `${wday(iso)}, ${fmt(iso)}`;
  return `<article class="card" id="options">
    <h3>${tx("k36")}</h3>
    <p class="small muted">${tx("k37")}</p>
    <p class="small">${tx("k38")}</p>
    ${signupBtn(tx("k29"), "go-btn")}
    <p class="small muted">${tx("k39")}</p>
    ${TOUR.options.map(o => {
      const msg = `${tx("k30", g.name.split(" ")[0], o.title, day(o.date))} `;
      return `<details class="opt-card" id="opt-${o.id}" ${optOpen.has(o.id) ? "open" : ""}>
        <summary>
          <span class="eyebrow">${day(o.date)}</span>
          <b class="opt-t">${esc(o.title)}</b>
          <span class="small muted">${esc(o.hook)}</span>
          ${optPrice(o) ? `<span class="small"><b>${esc(optPrice(o))}</b></span>` : ""}
        </summary>
        ${[].concat(o.text).map(t => `<p>${esc(t)}</p>`).join("")}
        <div class="place-meta">
          <span>💷 ${esc(optPriceLong(o))}</span>
          ${o.includes ? `<span>${tx("k31", esc(o.includes))}</span>` : ""}
        </div>
        ${(o.spots || [["", o.q]]).map(([label, q]) => `<div class="btn-row">
          <a class="btn ghost" href="https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}" target="_blank" rel="noopener">${tx("k33", label ? " · " + esc(label) : "")}</a>
          <a class="btn ghost" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}" target="_blank" rel="noopener">📍 ${label ? esc(label) : tx("k32")}</a>
        </div>`).join("")}
        ${signupBtn(tx("k34"), "go-btn")}
        <a class="btn ghost" href="${waHref(g.phone)}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">${tx("k35")}</a>
      </details>`;
    }).join("")}
  </article>`;
}

/* ===== Погода (Open-Meteo, бесплатно, без ключа) =====
   Один запрос на 16 дней для района отеля. Ответ сохраняем в телефоне:
   без интернета показываем последний прогноз с пометкой, когда он получен. */
// Без координат отеля прогноз не запрашиваем (у нового тура их может ещё не быть)
const WX_URL = !TOUR.hotel.ll ? null : "https://api.open-meteo.com/v1/forecast?latitude=" + TOUR.hotel.ll[0] + "&longitude=" + TOUR.hotel.ll[1] +
  "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunset" +
  "&timezone=" + encodeURIComponent(TOUR.tz) + "&forecast_days=16";
let WX = store.get("wx", null); // { at: время получения, days: { "2026-12-03": {...} } }

// Коды погоды WMO → значок и слово
function wxWord(code) {
  if (code === 0) return ["☀️", tx("k40")];
  if (code <= 2) return ["⛅", tx("k41")];
  if (code === 3) return ["☁️", tx("k42")];
  if (code === 45 || code === 48) return ["🌫️", tx("k43")];
  if (code >= 51 && code <= 57) return ["🌦️", tx("k44")];
  if (code >= 61 && code <= 67) return ["🌧️", tx("k45")];
  if (code >= 71 && code <= 77) return ["🌨️", tx("k46")];
  if (code >= 80 && code <= 82) return ["🌧️", tx("k47")];
  if (code >= 85 && code <= 86) return ["🌨️", tx("k48")];
  if (code >= 95) return ["⛈️", tx("k49")];
  return ["🌡️", ""];
}

function wxLine(date, compact) {
  const w = WX && WX.days && WX.days[date];
  if (!w) return compact ? "" : `<p class="wx muted">${tx("k50")}</p>`;
  const [icon, word] = wxWord(w.code);
  const ahead = daysBetween(tripToday(), date);           // сколько дней до этой даты
  const ageH = (Date.now() - WX.at) / 3600000;              // сколько часов прогнозу
  const t = new Date(WX.at), stamp = `${t.getDate()}.${String(t.getMonth() + 1).padStart(2, "0")} ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
  return `<p class="wx">${icon} <b>${Math.round(w.max)}° / ${Math.round(w.min)}°</b> · ${word}` +
    `${w.pop != null && w.pop >= 20 ? ` ${tx("k51", w.pop)}` : ""}` +
    `${!compact && w.sunset ? ` ${tx("k52", w.sunset)}` : ""}` +
    `${ahead > 7 ? ` <span class="muted">${tx("k53")}</span>` : ""}` +
    `${ageH > 6 ? ` <span class="muted">${tx("k54", stamp)}</span>` : ""}</p>`;
}

async function loadWeather() {
  if (!WX_URL) return;
  if (!navigator.onLine) return;                          // нет сети — живём с сохранённым
  if (WX && Date.now() - WX.at < 3 * 3600000) return;     // свежее 3 часов — не дёргаем сервер
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);      // в метро сеть «полуживая» — не ждём вечно
  try {
    const r = await fetch(WX_URL, { signal: ctrl.signal });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    const d = j.daily, days = {};
    d.time.forEach((date, i) => {
      days[date] = {
        code: d.weather_code[i],
        max: d.temperature_2m_max[i],
        min: d.temperature_2m_min[i],
        pop: d.precipitation_probability_max ? d.precipitation_probability_max[i] : null,
        sunset: (d.sunset[i] || "").slice(11, 16)          // "2026-12-06T15:52" → "15:52"
      };
    });
    WX = { at: Date.now(), days };
    store.set("wx", WX);
    renderToday(); renderProgram();
  } catch (e) {
    // Сервис не ответил — молча оставляем старый прогноз (или ничего). Приложение не ломается.
  } finally {
    clearTimeout(timer);
  }
}

/* ===== Статус рейса =====
   Приложение спрашивает наш посредник /api/flight (файл netlify/functions/flight.mjs),
   а уже он — сервис Aviationstack. Последний ответ храним в телефоне: без интернета
   покажем его с подписью «обновлено в …». Окно то же, что у посредника: от 12 ч до вылета до +9 ч. */
let FL = store.get("fl", {});            // { BA405: { at: время получения, data: ответ посредника } }
const FL_OPEN = 5 * 3600e3, FL_CLOSE = 9 * 3600e3;   // то же окно, что у посредника: за 5 ч до вылета — +9 ч
// Тестовый режим — только по ссылке ?flighttest (сегодняшний рейс) или ?flighttest=2026-11-24.
// Результат теста в телефоне не сохраняем, чтобы он не смешался с настоящим статусом в декабре.
const FL_TEST = new URLSearchParams(location.search).get("flighttest");
if (FL_TEST !== null) FL = {};
function flightWindow(f) {
  if (FL_TEST !== null) return "live";
  const dep = Date.parse(f.at), now = Date.now();
  return now < dep - FL_OPEN ? "early" : now > dep + FL_CLOSE ? "over" : "live";
}
// Сегменты направления: рейс с пересадкой хранит их в legs, прямой рейс — сам себе сегмент
const legsOf = dir => dir && dir.legs && dir.legs.length ? dir.legs : (dir ? [dir] : []);
async function loadFlights(force) {
  if (!/^https?:$/.test(location.protocol)) return;       // открыто как файл — посредника нет
  for (const f of [...legsOf(TOUR.flights.out), ...legsOf(TOUR.flights.back)]) {
    if (flightWindow(f) !== "live") continue;              // вне окна не тратим запросы
    if (FL_TEST !== null && f !== legsOf(TOUR.flights.out)[0]) continue; // в тесте карточка только BA405 — второй запрос не нужен
    const last = FL[f.no];
    if (!force && last && Date.now() - last.at < 5 * 60e3) continue;   // не чаще раза в 5 минут
    try {
      const test = FL_TEST === null ? "" : "&test=" + (FL_TEST || "today");
      const res = await fetch("/api/flight?f=" + f.no + test, { signal: AbortSignal.timeout(8000) });
      FL[f.no] = { at: Date.now(), data: await res.json() };
      if (FL_TEST === null) store.set("fl", FL);
    } catch (e) { /* нет связи — остаётся прошлый ответ */ }
  }
  renderToday();
}
// Aviationstack пишет МЕСТНОЕ время аэропорта (хоть и с «+00:00» на конце), поэтому берём часы:минуты как есть
const flHM = s => s ? s.slice(11, 16) : null;
function flightStatusHtml(d) {
  const dep = d.dep || {}, arr = d.arr || {};
  const [icon, label] = {
    scheduled: (dep.delay || 0) >= 15 ? ["🟠", `${tx("k55", dep.delay)}`] : ["🟢", tx("k56")],
    active:    ["✈️", tx("k57")],
    landed:    ["✅", tx("k58")],
    cancelled: ["🔴", tx("k59")],
    diverted:  ["🔴", tx("k60")],
    incident:  ["🔴", tx("k61")]
  }[d.status] || ["⚪", tx("k62")];
  // «06:20 → 06:55»: если ожидаемое/фактическое время отличается от расписания
  const timeLine = s => {
    const sch = flHM(s.scheduled), real = flHM(s.actual) || flHM(s.estimated);
    if (!sch) return "—";
    return real && real !== sch ? `<s class="muted">${sch}</s> → <b>${real}</b>` : `<b>${sch}</b>`;
  };
  const extra = (s, isArr) => [s.terminal && `${tx("k63", esc(s.terminal))}`, s.gate && `${tx("k64", esc(s.gate))}`,
    isArr && s.baggage && `${tx("k65", esc(s.baggage))}`].filter(Boolean).join(" · ");
  return `<p class="flight-st">${icon} ${label}</p>
    <div class="flight-rows small">
      <span class="muted">${tx("k67", dep.airport ? " · " + esc(dep.airport) : "")}</span><span>${timeLine(dep)}${extra(dep) ? `<br><span class="muted">${extra(dep)}</span>` : ""}</span>
      <span class="muted">${tx("k68", arr.airport ? " · " + esc(arr.airport) : "")}</span><span>${timeLine(arr)}${extra(arr, true) ? `<br><span class="muted">${extra(arr, true)}</span>` : ""}</span>
    </div>
    ${d.status === "cancelled" ? `<p class="tip">${tx("k66")}</p>` : ""}`;
}
function flightCard(f) {
  const win = flightWindow(f);
  if (win === "over") return "";
  const saved = FL[f.no], d = saved && saved.data;
  const opens = new Intl.DateTimeFormat("ru-RU", { timeZone: f.tz, day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
    .format(new Date(Date.parse(f.at) - FL_OPEN));
  let body;
  if (win === "early") body = `<p class="small muted">${tx("k69", opens, f.tzName)}</p>`;
  else if (d && d.state === "ok") body = flightStatusHtml(d);
  else if (!d) body = `<p class="small muted">${navigator.onLine ? tx("k70") : tx("k71")}</p>`;
  else if (d.state === "notfound") body = `<p class="small muted">${tx("k72")}</p>`;
  else body = `<p class="small muted">${tx("k73")}</p>`;
  const when = d && d.fetched ? new Date(d.fetched) : null;
  return `<article class="card">
    ${FL_TEST !== null ? `<p class="pill todo">${tx("k75", f.no, d && d.date ? fmt(d.date) : (FL_TEST || tx("k74")))}</p>` : ""}
    <h3>${tx("k78", f.no, f.from, f.to)}</h3>
    ${body}
    ${win === "live" && d && d.state === "ok" ? `<p class="small muted">${tx("k77", String(when.getHours()).padStart(2, "0"), String(when.getMinutes()).padStart(2, "0"), navigator.onLine ? "" : tx("k76"))}</p>` : ""}
    <div class="btn-row">
      <a class="btn ghost" href="https://www.flightradar24.com/data/flights/${f.no.toLowerCase()}" target="_blank" rel="noopener">Flightradar24</a>
      <a class="btn ghost" href="https://www.flightaware.com/live/flight/${encodeURIComponent(f.no)}" target="_blank" rel="noopener">FlightAware</a>
    </div>
  </article>`;
}

function renderToday() {
  const real = tripToday();
  const today = preview || real;
  const idx = TOUR.days.findIndex(d => d.date === today);
  let html = "";

  if (preview && preview !== real) {
    html += `<div class="preview-bar"><span>${tx("k79", fmt(preview))}</span><button type="button" id="pv-exit">${tx("k80")}</button></div>`;
  }

  if (idx >= 0) {
    const d = TOUR.days[idx], prev = TOUR.days[idx - 1], next = TOUR.days[idx + 1];
    html += `<div class="stack">
      <nav class="day-nav" aria-label="${tx("k81")}">
        <button type="button" class="nav-btn" ${prev ? `data-pv="${prev.date}"` : "disabled"} aria-label="${tx("k82")}">←</button>
        <div class="day-dots">${TOUR.days.map((x, i) => `<button type="button" class="dot-btn" data-pv="${x.date}" aria-label="${tx("dayN", i + 1)}" ${i === idx ? 'aria-current="true"' : ""}>${i + 1}</button>`).join("")}</div>
        <button type="button" class="nav-btn" ${next ? `data-pv="${next.date}"` : "disabled"} aria-label="${tx("k83")}">→</button>
      </nav>
      <p class="hint">${tx("k90")}</p>
      ${idx === 0 ? legsOf(TOUR.flights.out).map(flightCard).join("") : idx === TOUR.days.length - 1 ? legsOf(TOUR.flights.back).map(flightCard).join("") : ""}
      <article class="card now">
        <span class="pill gold">${tx("k91", idx + 1, TOUR.days.length, wday(d.date), fmt(d.date))}</span>
        <h2>${esc(d.title)}</h2>
        ${wxLine(d.date)}
        ${idx === 0 ? airportHtml() : ""}
        <div class="meet">
          <span class="time">${d.meeting.time ? esc(d.meeting.time) : tx("k84")}</span>
          ${placeHtml(d.meeting)}
        </div>
        ${dayItems(d)}
        ${d.tip ? `<p class="tip">${esc(d.tip)}</p>` : ""}
      </article>
      ${next ? `<button type="button" class="card next-card" data-pv="${next.date}"><span class="eyebrow">${today === real ? tx("k85") : tx("k83")} · ${fmt(next.date)} →</span><h3>${esc(next.title)}</h3>
        <p class="muted small">${tx("k88", next.meeting.time ? esc(next.meeting.time) : esc(waText(next.meeting).replace(tx("k86"), tx("k87"))))}</p></button>` : ""}
      <div class="btn-row">
        ${TOUR.guide.phone ? `<a class="btn" href="${waHref(TOUR.guide.phone)}" target="_blank" rel="noopener">${tx("k89")}</a>` : ""}
        <a class="btn ghost" href="#help">${tx("k92")}</a>
      </div>
    </div>`;
  } else if (today < TOUR.start) {
    const n = daysBetween(today, TOUR.start);
    const list = TOUR.checklist, done = store.get("checks", []);
    const cnt = list.filter((_, i) => done.includes(i)).length;
    const f = TOUR.flights.out;
    html += `<div class="stack">
      <article class="card now">
        <span class="eyebrow">${tx("k101")}</span>
        <div><span class="big-num">${n}</span> <span class="muted">${plural(n,tx("k93"),tx("k94"),tx("k95"))}</span></div>
        <p>${f.via ? tx("k102via", f.no, f.from, f.dep, f.to, f.arr, wday(TOUR.start), fmt(TOUR.start), f.via) : tx("k102", f.no, f.from, f.dep, f.to, f.arr, wday(TOUR.start), fmt(TOUR.start))}</p>
        ${WX && WX.days && WX.days[TOUR.start] ? `<div><span class="small muted">${tx("k96", TOUR.city.prep)}</span>${wxLine(TOUR.start)}</div>` : `<p class="small muted">${tx("k97")}</p>`}
      </article>
      <article class="card">
        <h3>${tx("k103", wday(TOUR.start), fmt(TOUR.start))}</h3>
        ${airportHtml()}
        <p class="tip">${tx("k104")}</p>
      </article>
      ${legsOf(TOUR.flights.out).map(flightCard).join("")}
      <article class="card">
        <h3>${tx("k105", cnt, list.length)}</h3>
        <div class="progress"><i style="width:${Math.round(cnt / list.length * 100)}%"></i></div>
        ${cnt < list.length ? `<p class="small">${tx("k98", esc(list.find((_, i) => !done.includes(i))))}</p>` : `<p class="small">${tx("k99")}</p>`}
        <a class="btn ghost" href="#tools">${tx("k106")}</a>
      </article>
      <article class="card">
        <h3>${tx("k107")}</h3>
        <div class="chips">${TOUR.days.map((d, i) => `<button type="button" class="chip" data-pv="${d.date}">${tx("k100", i + 1, parse(d.date).getDate())}</button>`).join("")}</div>
      </article>
    </div>`;
  } else {
    html += `<article class="card"><h2>${tx("k108")}</h2><p>${tx("k109", TOUR.city.name)}</p></article>`;
  }
  $("#v-today").innerHTML = html;
}

function renderProgram() {
  const today = preview || tripToday();
  $("#v-program").innerHTML = `<div class="stack">
    ${TOUR.options.length ? `<a class="pill opt" href="#program/options" data-go="program/options">${tx("k117", TOUR.options.length, plural(TOUR.options.length, tx("k110"), tx("k111"), tx("k112")))}</a>` : ""}
    <p class="small muted">${tx("k118")}</p>
    ${TOUR.days.map((d, i) => `
      <article class="card day ${d.date === today ? "today" : ""}">
        <div class="date"><span class="eyebrow">${tx("k115", i + 1, wday(d.date))}</span><b>${fmt(d.date)}</b></div>
        <h3>${esc(d.title)}</h3>
        ${wxLine(d.date, true)}
        ${dayItems(d)}
        ${i === 0 ? `<p class="small muted">${tx("k113", TOUR.home.prep, airportTime(), esc(TOUR.airport.name), TOUR.airport.short ? ", " + esc(TOUR.airport.short) : "")}</p>` : ""}
        <p class="small muted">${i === 0 ? tx("k114", cap(TOUR.city.prep)) : tx("k84")}: ${d.meeting.time ? esc(d.meeting.time) + " · " : ""}${d.meeting.wa ? esc(waText(d.meeting).replace(tx("k86"), tx("k87"))) : esc(d.meeting.place)}</p>
        <button type="button" class="btn ghost" data-pv-go="${d.date}">${tx("k116")}</button>
      </article>`).join("")}
    ${optionsHtml()}
  </div>`;
}

const CATS = TOUR.categories.names;

// Все даты поездки, в которые место открыто (по дням недели)
function tripDatesFor(p) {
  if (!p.days) return null;
  return TOUR.days.map(d => d.date).filter(iso => p.days.includes(parse(iso).getDay()));
}
// Запрос для карт: добавляем "London", если его нет, чтобы карта не нашла одноимённое место в другом городе
const mapQuery = q => q.toLowerCase().includes(TOUR.city.mapSuffix.toLowerCase()) ? q : q + ", " + TOUR.city.mapSuffix;
// Google Maps: универсальная ссылка, на телефоне откроет приложение, если оно установлено
function mapsPlace(q) { return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(mapQuery(q)); }
// Apple Maps: на iPhone/iPad/Mac открывает встроенные «Карты»
function applePlace(q) { return "https://maps.apple.com/?q=" + encodeURIComponent(mapQuery(q)); }
const IS_APPLE = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);

// Citymapper: официальная ссылка на маршрут. Обязательна только конечная точка (endcoord),
// старт — текущее местоположение. Если приложение установлено, откроется оно, иначе сайт.
function cmLink(ll, name) {
  return "https://citymapper.com/directions?endcoord=" + encodeURIComponent(ll[0] + "," + ll[1]) +
         "&endname=" + encodeURIComponent(name);
}

function mapsTransit(q) {
  return "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(mapQuery(q)) + "&travelmode=transit";
}

/* ===== Маршруты на метро ===== */
// Официальные цвета линий метро Лондона
const TUBE = TOUR.transport.colors;
const HOME_ST = TOUR.hotel.tube;
// Станция, с которой начинается маршрут: у H&C своя станция Hammersmith через дорогу
const ALT = TOUR.transport.altHome;   // линия со своей станцией рядом с отелем (может не быть)
const homeOf = line => ALT && line === ALT.line ? HOME_ST + ALT.label : HOME_ST;
// Маршрут места: прописанный вручную (route) или собранный из direct для ветки Piccadilly
function routeOf(p) {
  if (p.route) return p.route;
  if (p.direct === 0) return [["walk", 3]];
  if (p.direct > 0) return [[TOUR.transport.defaultLine, p.direct, p.station.split(" / ")[0]]];
  return null;
}
// Станция линии line, у которой место «рядом» (одна поездка без пересадок, дальше только пешком)
function nearStation(p, line) {
  const r = routeOf(p); if (!r) return null;
  const tube = r.filter(l => l[0] !== "walk");
  if (!tube.length) return line === TOUR.transport.defaultLine ? HOME_ST : null;
  return tube.length === 1 && tube[0][0] === line ? tube[0][2] : null;
}
// Станция линии line, где делается пересадка к месту
function changeAt(p, line) {
  const tube = (routeOf(p) || []).filter(l => l[0] !== "walk");
  return tube.length > 1 && tube[0][0] === line ? tube[0][2] : null;
}
const sameSt = (a, b) => a && b && a.replace(/\./g, "") === b.replace(/\./g, "");
const stopsWord = n => n + " " + plural(n, tx("k119"), tx("k120"), tx("k121"));

function routeHtml(p) {
  const r = routeOf(p); if (!r) return "";
  const tubeLegs = r.filter(l => l[0] !== "walk").length;
  let html = `<div class="route" aria-label="${tx("k122")}">
    <div class="r-st"><i></i><span>${esc(homeOf((r.find(l => l[0] !== "walk") || [])[0]))} <span class="muted">· ${ALT && r[0][0] === ALT.line ? ALT.note : r[0][0] === "walk" ? tx("k123") : tx("k124")}</span></span></div>`;
  r.forEach((leg, i) => {
    if (leg[0] === "walk") {
      html += `<div class="r-walk">${tx("k125", leg[1], leg[2] ? " · " + esc(leg[2]) : "")}</div>`;
      return;
    }
    const [line, n, to, note] = leg, c = TUBE[line] || { bg: "#666", fg: "#fff" };
    const isChange = i < r.length - 1 && r.slice(i + 1).some(l => l[0] !== "walk");
    html += `<div class="r-leg" style="--lc:${c.bg}"><span class="r-line" style="background:${c.bg};color:${c.fg}">${line}</span>
        <span class="small">${stopsWord(n)}${note ? " · " + esc(note) : ""}</span></div>
      <div class="r-st"><i></i><span><b>${esc(to)}</b>${isChange ? ` <span class="r-chg">${tx("k126")}</span>` : ""}</span></div>`;
  });
  html += `</div>`;
  if (tubeLegs > 1) html += `<p class="small muted">${tx("k127")}</p>`;
  return html;
}

/* ===== «Рядом со мной» =====
   Координаты мест хранятся в приложении (ll), GPS работает и без интернета.
   Расстояние считаем по прямой (формула гаверсинуса) и умножаем на 1,25 —
   по улицам путь всегда длиннее, чем «как летит птица». */
let near = null;        // { lat, lng, at } — где пользователь, или null
let nearState = "";     // "", "loading", "denied", "error", "far"
function haversine(a, b) {
  const R = 6371000, toR = d => d * Math.PI / 180;
  const dLat = toR(b[0] - a[0]), dLng = toR(b[1] - a[1]);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a[0])) * Math.cos(toR(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
const walkM = p => near && p.ll ? haversine([near.lat, near.lng], p.ll) * 1.25 : null;
function fmtDist(m) {
  if (m < 60) return tx("k128");
  const min = Math.max(1, Math.round(m / 75)); // ~4,5 км/ч — спокойный шаг
  const dist = m < 950 ? Math.round(m / 50) * 50 + tx("k129") : (m / 1000).toFixed(1).replace(".", ",") + tx("k130");
  return min <= 40 ? `${tx("k131", dist, min)}` : `${tx("k132", dist)}`;
}
function locate(demo) {
  if (demo) { near = { lat: TOUR.hotel.ll[0], lng: TOUR.hotel.ll[1], at: new Date(), demo: true }; nearState = ""; renderPlaces(); return; }
  if (!("geolocation" in navigator)) { nearState = "error"; renderPlaces(); return; }
  nearState = "loading"; renderPlaces();
  navigator.geolocation.getCurrentPosition(pos => {
    near = { lat: pos.coords.latitude, lng: pos.coords.longitude, at: new Date() };
    nearState = haversine([near.lat, near.lng], TOUR.hotel.ll) > 50000 ? "far" : "";
    renderPlaces();
  }, err => {
    nearState = err.code === 1 ? "denied" : "error";
    renderPlaces();
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
}

function nearHelp() {
  return `<details class="near-help"><summary>${tx("k133")}</summary>
    <ul class="items small">
      <li><span>${tx("k134")}</span></li>
      <li><span>${tx("k135")}</span></li>
      <li><span>${tx("k136")}</span></li>
      <li><span>${tx("k137")}</span></li>
      <li><span>${tx("k138")}</span></li>
      <li><span>${tx("k139")}</span></li>
    </ul>
  </details>`;
}

function nearPanel() {
  const hhmm2 = d => String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  if (nearState === "loading") return `<div class="near-panel">${tx("k140")}</div>`;
  if (nearState === "denied") return `<div class="near-panel warn">
      ${tx("k143", IS_APPLE
        ? `<p class="small">${tx("k141")}</p>`
        : `<p class="small">${tx("k142")}</p>`)}
      <button type="button" class="btn ghost" data-near="go">${tx("k144")}</button></div>`;
  if (nearState === "error") return `<div class="near-panel warn">${tx("k145")}
      <button type="button" class="btn ghost" data-near="go">${tx("k144")}</button></div>`;
  if (nearState === "far") {
    const km = Math.round(haversine([near.lat, near.lng], TOUR.hotel.ll) / 1000).toLocaleString("ru-RU");
    return `<div class="near-panel">${tx("k146", TOUR.city.gen, km, cap(TOUR.city.prep))}
      <button type="button" class="btn ghost" data-near="demo">${tx("k147")}</button></div>`;
  }
  if (near) return `<div class="near-panel ok">
      <div>📍 <b>${near.demo ? tx("k148") : tx("k149")}</b> <span class="small muted">· ${near.demo ? esc(TOUR.hotel.name) : tx("k150") + hhmm2(near.at)}</span></div>
      <p class="small muted">${tx("k151")}</p>
      <button type="button" class="btn ghost" data-near="go">${tx("k152")}</button></div>`;
  return `<div class="near-panel"><button type="button" class="btn go-btn" data-near="go">${tx("k153")}</button></div>`;
}

/* ===== Экран «Места» =====
   Один раздел — несколько «под-экранов». Какой показать, решает адрес после #:
     #places             главный: две плитки, полки, категории
     #places/cat/pub     список одной категории
     #places/shelf/eve   полка целиком
     #places/p/12        карточка места (12 — номер места в TOUR.places)
     #places/metro       схема ветки Piccadilly
     #places/near        что рядом со мной
   Адрес после # попадает в историю браузера, поэтому системная кнопка «назад»
   на Android и свайп назад на iPhone работают сами, без дополнительного кода. */
let placeRoute = [];      // части адреса после "places/", например ["cat", "pub"]
let moreCats = false;     // раскрыта ли строка «ещё 3»
const MAIN_CATS = TOUR.categories.main;   // кнопки на виду
const MORE_CATS = TOUR.categories.more;                    // кнопки под «ещё»
const CAT_ICON = TOUR.categories.icons;
const SVG_BACK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>`;
const SVG_NEAR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>`;
const SVG_TUBE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 10h14M8 21l2-4M16 21l-2-4"/></svg>`;

// "Lore of the Land — паб Гая Ричи" → название "Lore of the Land" и подпись "паб Гая Ричи"
const placeTitle = p => p.name.split(" — ")[0];
const placeTag = p => p.name.split(" — ")[1] || "";
const placeId = p => TOUR.places.indexOf(p);
const placesWord = n => n + " " + plural(n, tx("k154"), tx("k155"), tx("k156"));

// Примерное время в пути от отеля, мин: пешком + ~2 мин на остановку + 3 мин на вход в метро + 5 мин на пересадку.
// Нужно только для сортировки «что ближе» — сами эти минуты нигде не показываем.
function tripMin(p) {
  const r = routeOf(p); if (!r) return 99;
  let min = 0, tube = 0;
  r.forEach(l => { if (l[0] === "walk") min += l[1]; else { min += l[1] * 2 + 3; tube++; } });
  return min + Math.max(0, tube - 1) * 5;
}
// Пешком от отеля, мин: из маршрута, если он только пешком, иначе — по прямой × 1,25 (как в «Рядом со мной»)
function hotelWalk(p) {
  const r = routeOf(p);
  if (r && r.every(l => l[0] === "walk")) return r.reduce((s, l) => s + l[1], 0);
  return p.ll ? haversine(TOUR.hotel.ll, p.ll) * 1.25 / 75 : 99;
}
// Знаем ли мы, где человек, «прямо сейчас»: не дольше 15 минут назад и не пример у отеля
const nearFresh = () => !!near && !near.demo && nearState === "" && Date.now() - near.at < 15 * 60000;

// Короткая подпись «как далеко»: от человека (если знаем), иначе — от отеля по маршруту
function howFar(p, useNear) {
  if (useNear && p.ll) return `<span class="t-near">${fmtDist(walkM(p))}</span>`;
  const r = routeOf(p); if (!r) return "";
  const tube = r.filter(l => l[0] !== "walk");
  const walk = r.filter(l => l[0] === "walk").reduce((s, l) => s + l[1], 0);
  if (!tube.length) return `${tx("k157", walk)}`;
  if (tube.length > 1) return tx("k158");
  return stopsWord(tube[0][1]) + (walk ? ` ${tx("k159", walk)}` : "");
}
// Только в дни поездки: место сегодня закрыто (по дням недели)?
// «Места» всегда живут по НАСТОЯЩЕЙ дате, а не по дате просмотра дня: иначе после «Открыть день подробно»
// на 8 декабря места 4–7 декабря показывались бы как «✅ были», хотя поездка ещё не началась.
function closedToday(p) {
  const today = tripToday();
  return today >= TOUR.start && today <= TOUR.end && !!p.days && !p.days.includes(parse(today).getDay());
}

// Строка списка: иконка · название и подпись «что это · как далеко» · стрелка
function placeRow(p, useNear) {
  const meta = [placeTag(p) ? esc(placeTag(p)) : "", howFar(p, useNear),
                closedToday(p) ? `<span class="t-closed">${tx("k160")}</span>` : ""].filter(Boolean).join(" · ");
  return `<a class="prow" href="#places/p/${placeId(p)}" data-go="places/p/${placeId(p)}">
    <span class="ico pill cat-${p.cat}" aria-hidden="true">${CAT_ICON[p.cat]}</span>
    <span class="prow-t"><b>${esc(placeTitle(p))}</b>${meta ? `<small>${meta}</small>` : ""}</span>
    <span class="chev" aria-hidden="true">›</span></a>`;
}
// Плитка на полке
// Коротко для плитки: «пт, 4 дек»
const shortDay = iso => { const d = parse(iso); return [tx("k161"),tx("k162"),tx("k163"),tx("k164"),tx("k165"),tx("k166"),tx("k167")][d.getDay()] + ", " + d.getDate() + " " + MONTHS[d.getMonth()].slice(0, 3); };
// Пометка дня программы: прошёл — ✅ «были», сегодня — 📌 «сегодня», впереди — 📌 дата
function progMark(iso, short, guide) {
  const today = tripToday();
  // На вечерней полке без дня недели: «🌙 с гидом · 5 дек» должно уместиться в одну строку плитки
  const day = guide ? shortDay(iso).split(", ")[1] : short ? shortDay(iso) : `${wday(iso)}, ${fmt(iso)}`;
  const mark = guide ? tx("k168") : "📌";
  return iso < today ? `<small class="t-day done" data-when="past">${tx("k169", esc(day))}</small>`
    : iso === today ? `<small class="t-day" data-when="today">${tx("k170", mark)}</small>`
    : `<small class="t-day">${mark}${guide ? " ·" : ""} ${esc(day)}</small>`;
}
function placeTile(p, shelfId) {
  const showDay = shelfId === "prog" || (shelfId === "eve" && p.eveGuide);
  return `<a class="tile" href="#places/p/${placeId(p)}" data-go="places/p/${placeId(p)}">
    <span class="ico pill cat-${p.cat}" aria-hidden="true">${CAT_ICON[p.cat]}</span>
    ${showDay ? progMark(p.program, true, shelfId === "eve") : ""}
    ${closedToday(p) ? `<small class="t-closed">${tx("k160")}</small>` : ""}
    <b>${esc(placeTitle(p))}</b>
    ${placeTag(p) ? `<small>${esc(placeTag(p))}</small>` : ""}
    <small>${howFar(p)}</small></a>`;
}
// Заголовок под-экрана: стрелка «назад» + название (+ мелкая подпись справа)
function subHeader(title, extra) {
  return `<div class="sub-h"><button type="button" class="back" data-back aria-label="${tx("k171")}">${SVG_BACK}</button>
    <h2>${esc(title)}</h2>${extra ? `<span class="small muted">${extra}</span>` : ""}</div>`;
}

/* Полки главного экрана. Порядок и состав постоянные — человек запоминает, где что лежит.
   По дням меняются только пометки на плитках (✅ были, 📌 сегодня, сегодня закрыто) — по настоящей дате. */
function shelves() {
  const today = tripToday();
  const before = today < TOUR.start, inTrip = today >= TOUR.start && today <= TOUR.end;
  const byTrip = (a, b) => tripMin(a) - tripMin(b);
  const SH = TOUR.shelves;
  const evening = p => p.eve || SH.eveningCats.includes(p.cat);
  // Полки не меняются по дням: те же названия, тот же состав, тот же порядок — человек запоминает, где что.
  // Что изменилось «сегодня», показывают только пометки на плитках (✅ были, 📌 сегодня, сегодня закрыто).
  // Сезонная полка (ярмарки, пляжи, …) — первой, если она задана в trip.json
  const S = SH.season ? [{ id: SH.season.cat, title: SH.season.title, sub: SH.season.sub,
               list: TOUR.places.filter(p => p.cat === SH.season.cat).sort(byTrip) }] : [];
  // «Места программы»: где группа будет с гидом, по дням; полка сама прокручивается к сегодняшнему дню.
  S.push({ id: "prog", title: tx("k172"), sub: tx("k173"),
    list: TOUR.places.filter(p => p.program).sort((a, b) => a.program.localeCompare(b.program) || byTrip(a, b)) });
  // «Куда пойти вечером»: сначала вечерние прогулки с гидом (по датам), потом остальное — от ближнего к дальнему.
  S.push({ id: "eve", title: tx("k174"), sub: SH.eveningSub,
    list: TOUR.places.filter(evening).sort((a, b) => (a.eveGuide ? 0 : 1) - (b.eveGuide ? 0 : 1)
      || (a.eveGuide && b.eveGuide ? a.program.localeCompare(b.program) : 0) || byTrip(a, b)) });
  S.push({ id: "hotel", title: tx("k175"), sub: tx("k176"),
    list: TOUR.places.filter(p => hotelWalk(p) <= 20).sort((a, b) => hotelWalk(a) - hotelWalk(b)) });
  S.push({ id: "free", title: tx("k177"), sub: tx("k178"),
    list: TOUR.places.filter(p => p.free && (p.cat === "museum" || p.cat === "view")).sort(byTrip) });
  return S.filter(s => s.list.length);
}

/* Под-экран 1: главный */
function placesHome() {
  if (!TOUR.places.length) return `<div class="stack"><article class="card"><p>${tx("noPlaces")}</p></article></div>`;
  const chip = k => `<a class="chip" href="#places/cat/${k}" data-go="places/cat/${k}">${CAT_ICON[k]} ${esc(CATS[k])}</a>`;
  return `<div class="stack">
    <div class="tools2">
      <a class="tool" href="#places/near" data-go="places/near">${SVG_NEAR}<span>${tx("k183")}<small>${tx("k184")}</small></span></a>
      ${TOUR.lines.length ? `<a class="tool" href="#places/metro" data-go="places/metro">${SVG_TUBE}<span>${tx("k185")}<small>${tx("k186")}</small></span></a>` : ""}
    </div>
    ${shelves().map(s => `<section aria-label="${esc(s.title)}">
      <div class="shelf-h"><div><h2>${esc(s.title)}</h2><p class="small muted">${esc(s.sub)}</p></div>
        <a href="#places/shelf/${s.id}" data-go="places/shelf/${s.id}">${tx("k179", s.list.length)}</a></div>
      <div class="rail"${s.id === "prog" ? ' data-rail="prog"' : ""}>${(s.id === "prog" ? s.list : s.list.slice(0, 8)).map(p => placeTile(p, s.id)).join("")}</div>
    </section>${s.id === "prog" && TOUR.walks.length ? walkShelf() : ""}`).join("")}
    <section aria-label="${tx("k180")}">
      <div class="shelf-h"><h2>${tx("k180")}</h2></div>
      <div class="chips" style="margin-top:8px">${MAIN_CATS.map(chip).join("")}
        <button type="button" class="chip" data-more-cats aria-expanded="${moreCats}">${moreCats ? tx("k181") : `${tx("k182", MORE_CATS.length)}`}</button></div>
      ${moreCats ? `<div class="chips cats-more" style="margin-top:8px">${MORE_CATS.map(chip).join("")}</div>` : ""}
      <a class="maplink" style="padding-left:0" href="#places/cat/all" data-go="places/cat/all">${tx("k187", TOUR.places.length)}</a>
    </section>
  </div>`;
}

/* ===== Пешие прогулки ===== */
const walkPlace = name => TOUR.places.find(p => p.name === name);
function walkTile(w) {
  return `<a class="tile" href="#places/walk/${w.id}" data-go="places/walk/${w.id}">
    <span class="ico pill" style="background:var(--bg)" aria-hidden="true">${w.icon}</span>
    <b>${esc(w.title)}</b>
    <small class="muted">${tx("k188", esc(w.when), esc(w.km), w.legs.filter(l => l.place).length)}</small>
  </a>`;
}
function walkShelf() {
  return `<section aria-label="${tx("k189")}">
    <div class="shelf-h"><div><h2>${tx("k189")}</h2><p class="small muted">${tx("k190")}</p></div></div>
    <div class="rail">${TOUR.walks.map(walkTile).join("")}</div>
  </section>`;
}
// Ссылка на пеший маршрут в Google Картах: старт → точки → финиш (координаты, чтобы не искать по названию)
function walkMapUrl(w) {
  const ll = a => a.join(",");
  // точка на карте: своя координата у шага (l.ll) важнее координаты места
  const raw = w.legs.filter(l => l.place).map(l => l.ll || (walkPlace(l.place) || {}).ll).filter(Boolean);
  // Google не строит маршрут, если соседние точки совпадают (< ~40 м) — такие пропускаем
  const near = (a, b) => Math.abs(a[0] - b[0]) < 0.0004 && Math.abs(a[1] - b[1]) < 0.0006;
  const pts = [];
  raw.forEach(p => { const prev = pts.length ? pts[pts.length - 1] : w.start.ll; if (!near(prev, p)) pts.push(p); });
  if (pts.length && near(pts[pts.length - 1], w.finish.ll)) pts.pop();
  return "https://www.google.com/maps/dir/?api=1&travelmode=walking&origin=" + ll(w.start.ll) +
    "&destination=" + ll(w.finish.ll) + "&waypoints=" + encodeURIComponent(pts.map(ll).join("|"));
}
function walkPage(w) {
  const chip = line => `<span class="r-line" style="background:${TUBE[line].bg};color:${TUBE[line].fg}">${esc(line)}</span>`;
  const items = w.legs.map(l => {
    if (l.walk != null) return `<li class="w-leg"><span></span><span>${tx("k191", l.walk, l.via ? " — " + esc(l.via) : "")}</span></li>`;
    const p = walkPlace(l.place); if (!p) return "";
    return `<li class="w-pt"><span class="dot"><i></i></span>
      <a class="it-row" href="#places/p/${placeId(p)}" data-go="places/p/${placeId(p)}">
        <span><b>${esc(placeTitle(p))}</b>${l.food ? ` <span class="w-food">${tx("k192")}</span>` : ""}${l.note ? `<br><span class="small muted">${esc(l.note)}</span>` : ""}</span>
        <span class="chev" aria-hidden="true">›</span></a></li>`;
  }).join("");
  return `<div class="stack">
    ${subHeader(w.icon + " " + w.title)}
    <p class="small muted" style="margin:0">${tx("k193", esc(w.when), esc(w.km), esc(w.dur), esc(w.best))}</p>
    ${w.warn ? `<div class="note-warn">⚠️ ${esc(w.warn)}</div>` : ""}
    <article class="card">
      <ol class="walk">
        <li class="w-st"><span class="dot"><i></i></span><span><b>🚇 ${esc(w.start.st)}</b><br><span class="small">${tx("k194", chip(w.start.line), stopsWord(w.start.stops))}</span></span></li>
        ${items}
        <li class="w-st"><span class="dot"><i></i></span><span><b>🚇 ${esc(w.finish.st)}</b><br><span class="small">${tx("k195", chip(w.finish.line))}</span></span></li>
      </ol>
    </article>
    <a class="btn go-btn" href="${walkMapUrl(w)}" target="_blank" rel="noopener">${tx("k196")}</a>
    <p class="small muted" style="margin:0">${tx("k197")}</p>
  </div>`;
}

/* Полка «По программе» целиком: места, сгруппированные по дням программы */
function progList(shelf) {
  const dates = [...new Set(shelf.list.map(p => p.program))];
  return `<div class="stack">
    ${subHeader(shelf.title, placesWord(shelf.list.length))}
    <p class="small muted">${tx("k200")}</p>
    ${dates.map(d => { const i = TOUR.days.findIndex(x => x.date === d), day = TOUR.days[i], today = tripToday();
      return `<section>
        <h3 style="margin:8px 0 6px">${tx("k199", d < today ? "✅ " : d === today ? tx("k198") : "", i + 1, esc(wday(d)), esc(fmt(d)), day ? `<br><span class="small muted" style="font-weight:400">${esc(day.title)}</span>` : "")}</h3>
        <div class="plist">${shelf.list.filter(p => p.program === d).map(p => placeRow(p, false)).join("")}</div>
      </section>`; }).join("")}
  </div>`;
}

/* Под-экран 2: список (категория или целая полка) */
function placesList(title, list, top) {
  const nf = nearFresh();
  if (nf) list = list.slice().sort((a, b) => walkM(a) - walkM(b));
  return `<div class="stack">
    ${subHeader(title, placesWord(list.length))}
    ${nf ? `<p class="small t-near">${tx("k201")}</p>` : ""}
    ${top || ""}
    <div class="plist">${list.map(p => placeRow(p, nf)).join("")}</div>
    <p class="small muted">${tx("k204", nf ? tx("k202") : tx("k203"))}</p>
  </div>`;
}

const PHOTO_LIGHT = `<article class="card now">
      <h3>${tx("k205")}</h3>
      <ul class="items small">
        <li><span>${tx("k206")}</span></li>
        <li><span>${tx("k207")}</span></li>
        <li><span>${tx("k208")}</span></li>
        <li><span>${tx("k209")}</span></li>
      </ul>
      <p class="small muted">${tx("k210")}</p>
    </article>`;

/* Под-экран 3: карточка места. Сверху — решение и действие, ниже — подробности */
function placePage(p) {
  const today = tripToday();
  const inTrip = today >= TOUR.start && today <= TOUR.end;
  const dates = tripDatesFor(p);
  const nf = nearFresh();
  return `<div class="stack">
    <div class="sub-h"><button type="button" class="back" data-back aria-label="${tx("k171")}">${SVG_BACK}</button>
      <div class="chips" style="gap:6px">
        <span class="pill cat-${p.cat}">${CAT_ICON[p.cat]} ${CATS[p.cat]}</span>
        ${p.free && p.cat !== "museum" ? `<span class="pill free">${tx("k177")}</span>` : ""}
        ${p.book ? `<span class="pill todo">${tx("k211")}</span>` : ""}
        ${inTrip ? (closedToday(p) ? `<span class="pill closed">${tx("k212")}</span>` : `<span class="pill ok">${tx("k213")}</span>`) : ""}
      </div></div>
    <article class="card">
      <div>
        <h2 style="margin:0">${esc(placeTitle(p))}</h2>
        ${placeTag(p) ? `<p class="muted" style="margin:2px 0 0">${esc(placeTag(p))}</p>` : ""}
        <p class="small" style="margin:6px 0 0">${nf ? howFar(p, true) : howFar(p)}</p>
      </div>
      <div class="btn-row">
        <a class="btn ghost" href="${mapsPlace(p.q)}" target="_blank" rel="noopener">${tx("k220")}</a>
        <a class="btn go-btn" href="${mapsTransit(p.q)}" target="_blank" rel="noopener">${tx("k221")}</a>
      </div>
      ${p.site ? `<a class="btn ticket-btn" href="${p.site}" target="_blank" rel="noopener">🎟 ${esc(p.siteLabel)}</a>` : ""}
      <p>${esc(p.text)}</p>
      ${p.photo ? `<p class="photo-tip">${tx("k214", esc(p.photo))}</p>` : ""}
      <a class="btn ghost" href="https://www.google.com/search?tbm=isch&q=${encodeURIComponent(p.q)}" target="_blank" rel="noopener">${tx("k222")}</a>
      <div class="place-meta">
        ${p.program ? `<span>${tx("k215", wday(p.program), fmt(p.program))}</span>` : ""}
        <span>🕒 ${esc(p.hours)}</span>
        ${dates ? `<span>${tx("k217", dates.length ? dates.map(d => [tx("k161"),tx("k162"),tx("k163"),tx("k164"),tx("k165"),tx("k166"),tx("k167")][parse(d).getDay()] + " " + fmt(d)).join(", ") : tx("k216"))}</span>` : ""}
        <span>🚇 ${esc(p.station)}</span>
      </div>
      ${routeHtml(p)}
      <div class="alt-links">
        ${p.ll ? `<a class="maplink" href="${cmLink(p.ll, p.q)}" target="_blank" rel="noopener">${tx("k218")}</a>` : ""}
        ${IS_APPLE ? `<a class="maplink" href="${applePlace(p.q)}" target="_blank" rel="noopener">${tx("k219")}</a>` : ""}
      </div>
    </article>
    <p class="small muted">${tx("k223")}</p>
  </div>`;
}

/* Под-экран 4: схема ветки. Нажатие на станцию раскрывает места рядом, нажатие на место — его карточка */
function placesMetro() {
  const item = p => `<li><a class="prow" style="min-height:48px;padding:6px 0" href="#places/p/${placeId(p)}" data-go="places/p/${placeId(p)}">
      <span class="ico pill cat-${p.cat}" style="width:2rem;height:2rem;font-size:1rem" aria-hidden="true">${CAT_ICON[p.cat]}</span>
      <span class="prow-t"><b style="font-size:.95rem">${esc(placeTitle(p))}</b></span><span class="chev" aria-hidden="true">›</span></a></li>`;
  const lineCard = L => `<article class="card" style="--tube:var(--l-${L.color.replace("&", "").toLowerCase()})">
      <h3><span class="r-line" style="background:${TUBE[L.name].bg};color:${TUBE[L.name].fg}">${esc(L.name)}</span></h3>
      <p class="small muted">${esc(L.intro)}</p>
      <ol class="line">
        ${L.stations.map(s => {
          const here = TOUR.places.filter(p => sameSt(nearStation(p, L.name), s.n));
          const chg = TOUR.places.filter(p => sameSt(changeAt(p, L.name), s.n));
          const body = (here.length || chg.length) ? `<details class="st-more">
              <summary>${here.length ? `${tx("k224", placesWord(here.length))}` : ""}${here.length && chg.length ? " · " : ""}${chg.length ? `${tx("k225", chg.length)}` : ""}</summary>
              ${here.length ? `<ul class="st-list">${here.map(item).join("")}</ul>` : ""}
              ${chg.length ? `<p class="small muted" style="margin-top:6px">${tx("k226")}</p><ul class="st-list">${chg.map(item).join("")}</ul>` : ""}
            </details>` : "";
          return `<li class="${s.home ? "home" : ""}">
          <span class="dot"><i></i></span>
          <div><div class="st">${esc(s.n)}</div><div class="near">${esc(s.near)}</div>${body}</div>
          <span class="stops">${s.home ? tx("k227") : s.s ? s.s + tx("k228") : ""}</span>
        </li>`;}).join("")}
      </ol>
    </article>`;
  return `<div class="stack">
    ${subHeader(tx("k229"))}
    <p class="small muted">${tx("k230")}</p>
    ${TOUR.lines.map(lineCard).join("")}
  </div>`;
}

/* Под-экран 5: «Что рядом со мной». В первый раз — объяснение до запроса геолокации:
   человек понимает, зачем телефон спросит разрешение, и реже нажимает «Запретить». */
function placesNear() {
  const head = subHeader(tx("k231"));
  if (!store.get("nearSeen", false) && !near && nearState === "") return `<div class="stack">${head}
    <div style="text-align:center;padding:8px 0">
      <div style="display:inline-grid;place-items:center;width:4.5rem;height:4.5rem;border-radius:50%;background:var(--surface);border:1px solid var(--line);color:var(--tube)">
        <span style="width:2.2rem;height:2.2rem;display:block">${SVG_NEAR}</span></div>
      <h3 style="margin:12px 0 4px">${tx("k232")}</h3>
      <p class="small muted">${tx("k233")}</p>
    </div>
    <ol class="steps">
      <li><span class="n">1</span><span>${tx("k234")}<span class="small muted">${tx("k235")}</span></span></li>
      <li><span class="n">2</span><span>${tx("k236")}<span class="small muted">${tx("k237")}</span></span></li>
      <li><span class="n">3</span><span>${tx("k238")}<span class="small muted">${tx("k239")}</span></span></li>
    </ol>
    <button type="button" class="btn go-btn" data-near="go">${tx("k153")}</button>
    <p class="small muted" style="text-align:center">${tx("k240")}</p>
  </div>`;
  const list = near && nearState !== "far" && nearState !== "loading" ? TOUR.places.filter(p => p.ll).sort((a, b) => walkM(a) - walkM(b)) : [];
  return `<div class="stack">${head}
    ${nearPanel()}
    ${list.length ? `<div class="plist">${list.map(p => placeRow(p, true)).join("")}</div>` : ""}
    ${nearHelp()}
  </div>`;
}

// Вызывается при входе на «Что рядом со мной»: если объяснение уже видели — сразу ищем, где человек
function autoLocate() {
  if (!store.get("nearSeen", false) || nearState === "loading") return;
  if (near && !near.demo && Date.now() - near.at < 2 * 60000) return; // свежие данные — не дёргаем GPS лишний раз
  locate();
}

function renderPlaces() {
  const [kind, arg] = placeRoute;
  const shelf = kind === "shelf" ? shelves().find(s => s.id === arg) : null;
  let html;
  if (kind === "cat" && CATS[arg]) html = placesList(CATS[arg],
      TOUR.places.filter(p => arg === "all" || (arg === "photo" ? p.photo : p.cat === arg)), arg === "photo" ? PHOTO_LIGHT : "");
  else if (shelf && shelf.id === "prog") html = progList(shelf);
  else if (shelf) html = placesList(shelf.title, shelf.list);
  else if (kind === "p" && TOUR.places[Number(arg)]) html = placePage(TOUR.places[Number(arg)]);
  else if (kind === "metro") html = placesMetro();
  else if (kind === "walk" && TOUR.walks.find(w => w.id === arg)) html = walkPage(TOUR.walks.find(w => w.id === arg));
  else if (kind === "near") html = placesNear();
  else html = placesHome();     // неизвестный адрес — показываем главный, а не пустой экран
  $("#v-places").innerHTML = html;
  // Полка «Места программы» открывается на сегодняшнем (или ближайшем следующем) дне; прошедшие — левее
  const rail = $("#v-places [data-rail=prog]");
  if (rail) {
    const first = rail.querySelector('.tile:not(:has([data-when="past"]))');
    const past = rail.querySelector('[data-when="past"]');
    if (first && past) rail.scrollLeft = first.offsetLeft - rail.offsetLeft - 16;
  }
}

/* ===== Разговорник ===== */
let phraseTheme = "all";
const CAN_SPEAK = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
let gbVoice = null;
// Ищем британский голос: на iPhone это обычно Daniel или Serena
function pickVoice() {
  try {
    const vs = speechSynthesis.getVoices();
    const L = TOUR.lang.code, pref = new RegExp(TOUR.lang.voices || "^$", "i");
    gbVoice = vs.find(v => v.lang === L && pref.test(v.name))
           || vs.find(v => v.lang === L)
           || vs.find(v => v.lang.startsWith(L.split("-")[0])) || null;
  } catch {}
}
if (CAN_SPEAK) { pickVoice(); speechSynthesis.addEventListener?.("voiceschanged", pickVoice); }

function speak(text, rate, btn) {
  if (!CAN_SPEAK) return;
  speechSynthesis.cancel(); // останавливаем предыдущую фразу
  document.querySelectorAll("[data-say][aria-pressed='true']").forEach(b => b.setAttribute("aria-pressed", "false"));
  const u = new SpeechSynthesisUtterance(text);
  u.lang = TOUR.lang.code;
  if (gbVoice) u.voice = gbVoice;
  u.rate = rate;
  if (btn) { btn.setAttribute("aria-pressed", "true"); u.onend = u.onerror = () => btn.setAttribute("aria-pressed", "false"); }
  speechSynthesis.speak(u);
}

function renderPhrases() {
  const themes = TOUR.phrases;
  const shown = themes.filter(t => phraseTheme === "all" || t.id === phraseTheme);
  const total = themes.reduce((n, t) => n + t.items.length, 0);
  $("#v-phrases").innerHTML = `<div class="stack">
    ${toolsHeader(tx("k241"))}
    <div><p class="small muted" style="margin:0">${tx("k248", total, TOUR.lang.manner)}</p></div>
    ${CAN_SPEAK ? "" : `<p class="tip">${tx("k242")}</p>`}
    <div class="chips" role="group" aria-label="${tx("k243")}">
      <button type="button" class="chip" data-theme="all" aria-pressed="${phraseTheme === "all"}">${tx("k249")}</button>
      ${themes.map(t => `<button type="button" class="chip" data-theme="${t.id}" aria-pressed="${t.id === phraseTheme}">${t.icon} ${t.title}</button>`).join("")}
    </div>
    ${phraseTheme === "all" ? `<article class="card">
      <h3>${tx("k244")}</h3>
      <div class="basics">${TOUR.phrasesBasics.map(b => `<div><b>${esc(b.en)}</b><span class="small muted">${esc(b.ru)}</span></div>`).join("")}</div>
    </article>` : ""}
    ${shown.map(t => `
      <h3 style="margin-top:6px">${t.icon} ${esc(t.title)}</h3>
      ${t.items.map(ph => `<article class="card phrase">
        <p class="en" lang="${TOUR.lang.code}">${esc(ph.en)}</p>
        <p class="tr">${esc(ph.tr)}</p>
        <p class="ru">${esc(ph.ru)}</p>
        ${ph.tip ? `<p class="tip">${esc(ph.tip)}</p>` : ""}
        <div class="speak-row">
          ${CAN_SPEAK ? `<button type="button" class="btn" data-say="${esc(ph.en)}" data-rate="0.9" aria-pressed="false">${tx("k245")}</button>
          <button type="button" class="btn ghost" data-say="${esc(ph.en)}" data-rate="0.6" aria-pressed="false">${tx("k246")}</button>` : ""}
          <button type="button" class="btn ghost" data-big-en="${esc(ph.en)}" data-big-ru="${esc(ph.ru)}" style="${CAN_SPEAK ? "" : "grid-column: 1 / -1"}">${tx("k247")}</button>
        </div>
      </article>`).join("")}`).join("")}
  </div>`;
}

/* ===== Викторина «Знаешь ли ты Лондон?» =====
   40 вопросов о местах нашей программы и британских привычках. В одном раунде — 10 случайных,
   сначала те, что человек ещё не видел. Порядок ответов перемешивается каждый раз.
   ok — номер правильного ответа в массиве a (с нуля), f — интересный факт после ответа, place — карточка места. */
const QUIZ = TOUR.quiz.questions;
// Заголовок экранов, открытых из «Полезного»: стрелка всегда ведёт в «Полезное» (как у под-экранов «Мест»)
const toolsHeader = title => `<div class="sub-h"><a class="back" href="#tools" aria-label="${tx("k250")}">${SVG_BACK}</a><h2>${esc(title)}</h2></div>`;
const QUIZ_N = 10; // вопросов в одном раунде
// Темы раунда: t у вопроса. «Все» — вопросы из всех тем вперемешку
const QUIZ_THEMES = TOUR.quiz.themes;
const quizIds = theme => QUIZ.map((q, i) => i).filter(i => theme === "all" || QUIZ[i].t === theme);
const QUIZ_RANKS = TOUR.quiz.ranks;
const quizRank = s => QUIZ_RANKS.find(r => s >= r[0])[1];
const shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* Текущий раунд храним в localStorage: если человек ушёл в карточку места и вернулся — продолжит с того же вопроса.
   run = { qs:[номера вопросов], ord:[[порядок ответов]…], i:текущий, picks:[выбранный номер ответа…] } */
function quizNew() {
  const theme = store.get("quizTheme", "all"), ids = quizIds(theme);
  let seen = store.get("quizSeen", []);
  let fresh = ids.filter(i => !seen.includes(i));
  // Невиденных в теме меньше раунда — начинаем круг этой темы заново (отметки других тем не трогаем)
  // но сначала берём оставшиеся невиденные, а недостающие добираем из уже виденных
  let qs = shuffle(fresh).slice(0, QUIZ_N);
  if (qs.length < QUIZ_N) {
    seen = seen.filter(i => !ids.includes(i));
    qs = shuffle(qs.concat(shuffle(ids.filter(i => !qs.includes(i))).slice(0, QUIZ_N - qs.length)));
  }
  store.set("quizSeen", seen.concat(qs));
  store.set("quizRun", { qs, ord: qs.map(() => shuffle([0, 1, 2, 3])), i: 0, picks: [] });
}
function quizPlaceLink(name, label) {
  const p = name && walkPlace(name);
  return p ? `<a class="it-row quiz-place" href="#places/p/${placeId(p)}" data-go="places/p/${placeId(p)}"><span>${esc(label || placeTitle(p))}</span><span class="chev" aria-hidden="true">›</span></a>` : "";
}
function renderQuiz() {
  const run = store.get("quizRun", null);
  const best = store.get("quizBest", null);
  const head = toolsHeader("🧠 " + TOUR.quiz.title);
  let html;
  if (!run) {
    const theme = store.get("quizTheme", "all"), ids = quizIds(theme);
    const seenAll = store.get("quizSeen", []);
    const seen = ids.filter(i => seenAll.includes(i)).length;
    html = `${head}
      <div>
      <p class="small muted" style="margin:0">${tx("k257", QUIZ.length, plural(QUIZ.length, tx("k251"), tx("k252"), tx("k253")), TOUR.quiz.about, QUIZ_N)}</p></div>
      <article class="card">
        <p class="small" style="margin:0">${best != null ? `${tx("k254", best, QUIZ_N, quizRank(best))}` : tx("k255")}</p>
      </article>
      <article class="card">
        <h3>${tx("k256")}</h3>
        <div class="quiz-themes" role="radiogroup" aria-label="${tx("k256")}">
          ${QUIZ_THEMES.map(t => `<button type="button" class="quiz-theme" role="radio" aria-checked="${t.id === theme}" data-quiz-theme="${t.id}">
            <span>${esc(t.title)}</span><span class="small muted">${quizIds(t.id).length}</span></button>`).join("")}
        </div>
        <p class="small muted" style="margin:0">${tx("k258", seen, ids.length)}</p>
        <button type="button" class="btn" data-quiz="start">${tx("k259")}</button>
      </article>
      <article class="card"><h3>${tx("k260")}</h3>
        <div class="small quiz-ranks">${QUIZ_RANKS.slice().reverse().map((r, k, a) => `<div><span>${r[1]}</span><span class="muted">${(hi => hi === r[0] ? r[0] : r[0] + "–" + hi)(k < a.length - 1 ? a[k + 1][0] - 1 : QUIZ_N)}</span></div>`).join("")}</div>
      </article>`;
  } else if (run.i >= run.qs.length) {
    const score = run.qs.filter((qi, k) => run.picks[k] === QUIZ[qi].ok).length;
    const wrong = run.qs.filter((qi, k) => run.picks[k] !== QUIZ[qi].ok);
    html = `${head}
      <article class="card quiz-result">
        <div class="quiz-score">${tx("k267", score, run.qs.length)}</div>
        <h3 style="margin:0">${quizRank(score)}</h3>
        <p class="small muted" style="margin:0">${run.newBest ? (run.prevBest != null ? `${tx("k261", run.prevBest)}` : tx("k262")) : best != null ? `${tx("k263", best)}` : ""}</p>
      </article>
      ${wrong.length ? `<article class="card"><h3>${tx("k265")}</h3>
        ${wrong.map(qi => { const q = QUIZ[qi]; return `<div class="quiz-miss"><p class="small" style="margin:0"><b>${esc(q.q)}</b><br>✓ ${esc(q.a[q.ok])}</p>${quizPlaceLink(q.place, tx("k264"))}</div>`; }).join("")}
      </article>` : `<p class="tip">${tx("k266")}</p>`}
      <button type="button" class="btn" data-quiz="start">${tx("k268", esc(QUIZ_THEMES.find(t => t.id === store.get("quizTheme", "all")).title))}</button>
      <button type="button" class="btn ghost" data-quiz="quit">${tx("k269")}</button>
      <a class="btn ghost" href="#cards">${tx("k270")}</a>`;
  } else {
    const qi = run.qs[run.i], q = QUIZ[qi], ord = run.ord[run.i];
    const picked = run.picks[run.i];
    const done = picked != null;
    const score = run.qs.slice(0, run.i).filter((x, k) => run.picks[k] === QUIZ[x].ok).length + (done && picked === q.ok ? 1 : 0);
    html = `${head}
      <p class="small muted" style="margin:0">${tx("k280", run.i + 1, run.qs.length, score)}</p>
      <div class="quiz-bar"><i style="width:${(run.i + (done ? 1 : 0)) / run.qs.length * 100}%"></i></div>
      <article class="card">
        <span class="small muted">${esc(q.c)}</span>
        <h3 style="margin:0">${esc(q.q)}</h3>
        <div class="quiz-opts">
          ${ord.map((ai, k) => {
            const cls = !done ? "" : ai === q.ok ? " ok" : ai === picked ? " bad" : " dim";
            const mark = !done ? "" : ai === q.ok ? `<em>${ai === picked ? tx("k271") : tx("k272")}</em>` : ai === picked ? tx("k273") : "";
            return `<button type="button" class="quiz-opt${cls}" data-quiz-pick="${ai}" ${done ? "disabled" : ""}><b>${tx("k274")[k]}</b><span>${esc(q.a[ai])}${mark}</span></button>`;
          }).join("")}
        </div>
        ${done ? `<p class="tip"><b>${picked === q.ok ? tx("k275") : tx("k276")}</b> ${esc(q.f)}</p>${quizPlaceLink(q.place, tx("k264"))}` : `<p class="small muted" style="margin:0">${tx("k277")}</p>`}
      </article>
      ${done ? `<button type="button" class="btn" data-quiz="next">${run.i + 1 < run.qs.length ? tx("k278") : tx("k279")}</button>` : ""}
      <button type="button" class="quiz-quit small muted" data-quiz="quit">${tx("k281")}</button>`;
  }
  $("#v-quiz").innerHTML = `<div class="stack">${html}</div>`;
}
function quizAction(act, pick) {
  const run = store.get("quizRun", null);
  if (act === "start") { quizNew(); }
  else if (act === "quit") { store.set("quizRun", null); }
  else if (act === "pick" && run && run.picks[run.i] == null) { run.picks[run.i] = pick; store.set("quizRun", run); }
  else if (act === "next" && run) {
    run.i++;
    if (run.i >= run.qs.length) {   // раунд закончен — считаем рекорд
      const score = run.qs.filter((qi, k) => run.picks[k] === QUIZ[qi].ok).length;
      const prev = store.get("quizBest", null);
      run.prevBest = prev; run.newBest = prev == null || score > prev;
      if (run.newBest) store.set("quizBest", score);
      if (STATS) STATS.track("act:quiz");
    }
    store.set("quizRun", run);
  }
  renderQuiz(); renderTools();
  if (act !== "pick") window.scrollTo(0, 0);
}

/* ===== Тренажёр фраз: карточки из разговорника =====
   Лицо — фраза по-русски, вспоминаем английскую и переворачиваем.
   «Знаю ✓» — фраза уходит в выученные (хранится на телефоне), «Не помню ↻» — в конец колоды. */
let cardTheme = "all", cardDeck = null, cardFlip = false;
const phraseKey = ph => ph.en;
function cardPool(theme) { return TOUR.phrases.filter(t => theme === "all" || t.id === theme).flatMap(t => t.items.map(ph => ({ ...ph, theme: t.id }))); }
function cardDeckBuild() {
  const known = store.get("cardsKnown", []);
  cardDeck = shuffle(cardPool(cardTheme).filter(ph => !known.includes(phraseKey(ph))));
  cardFlip = false;
}
function renderCards() {
  if (!cardDeck) cardDeckBuild();
  const known = store.get("cardsKnown", []);
  const pool = cardPool(cardTheme);
  const k = pool.filter(ph => known.includes(phraseKey(ph))).length;
  const ph = cardDeck[0];
  const themeTitle = cardTheme === "all" ? tx("k282") : TOUR.phrases.find(t => t.id === cardTheme).title;
  $("#v-cards").innerHTML = `<div class="stack">
    ${toolsHeader(tx("k283"))}
    <div><p class="small muted" style="margin:0">${tx("k301", k, pool.length, cardTheme === "all" ? "" : tx("k284"))}</p></div>
    <div class="chips rail" role="group" aria-label="${tx("k243")}">
      <button type="button" class="chip" data-card-theme="all" aria-pressed="${cardTheme === "all"}">${tx("k249")}</button>
      ${TOUR.phrases.map(t => `<button type="button" class="chip" data-card-theme="${t.id}" aria-pressed="${t.id === cardTheme}">${t.icon} ${esc(t.title)}</button>`).join("")}
    </div>
    ${ph ? `
      <button type="button" class="card flash${cardFlip ? " flipped" : ""}" data-card="flip" aria-label="${cardFlip ? tx("k285") : tx("k286")}">
        <span class="small muted">${cardFlip ? tx("k287") : tx("k288")}</span>
        <span class="flash-ru">${esc(ph.ru)}</span>
        ${cardFlip ? `<span class="flash-en" lang="${TOUR.lang.code}">${esc(ph.en)}</span><span class="tr">${esc(ph.tr)}</span>`
          : `<span class="small muted">${tx("k289")}</span>`}
      </button>
      ${cardFlip ? `
        ${CAN_SPEAK ? `<div class="speak-row" style="grid-template-columns:1fr 1fr">
          <button type="button" class="btn ghost" data-say="${esc(ph.en)}" data-rate="0.9" aria-pressed="false">${tx("k290")}</button>
          <button type="button" class="btn ghost" data-say="${esc(ph.en)}" data-rate="0.6" aria-pressed="false">${tx("k246")}</button></div>` : ""}
        ${ph.tip ? `<p class="tip">${esc(ph.tip)}</p>` : ""}
        <div class="card-acts">
          <button type="button" class="btn ghost" data-card="later">${tx("k291")}</button>
          <button type="button" class="btn" data-card="know">${tx("k292")}</button>
        </div>` : `<button type="button" class="btn" data-card="flip">${tx("k293")}</button>`}
      <p class="small muted" style="margin:0;text-align:center">${tx("k294", esc(themeTitle), cardDeck.length)}</p>`
    : `<article class="card"><h3>${tx("k298", cardTheme === "all" ? "" : tx("k295"))}</h3>
        <p class="small muted" style="margin:0">${tx("k299", cardTheme === "all" ? tx("k296") : tx("k297"))}</p>
        <button type="button" class="btn" data-card="reset">${tx("k300")}</button></article>`}
    <a class="small" href="#phrases">${tx("k302")}</a>
  </div>`;
}
function cardAction(act) {
  if (act === "flip") cardFlip = !cardFlip;
  else if (act === "know" && cardDeck[0]) {
    const known = store.get("cardsKnown", []);
    store.set("cardsKnown", known.concat(phraseKey(cardDeck.shift())));
    cardFlip = false;
  } else if (act === "later" && cardDeck[0]) { cardDeck.push(cardDeck.shift()); cardFlip = false; }
  else if (act === "reset") {
    const pool = cardPool(cardTheme).map(phraseKey);
    store.set("cardsKnown", store.get("cardsKnown", []).filter(k => !pool.includes(k)));
    cardDeckBuild();
  }
  if (act !== "flip" && CAN_SPEAK) speechSynthesis.cancel();
  renderCards(); renderTools();
}

/* Крупная карточка на весь экран (таксисту, официанту, продавцу) */
function showBig(a, b, c, d) {
  $("#big-1").textContent = a || ""; $("#big-2").textContent = b || "";
  $("#big-3").textContent = c || ""; $("#big-4").textContent = d || "";
  $("#taxi").classList.add("open"); $("#taxi-close").focus();
  if (STATS) STATS.track("act:big:" + (a || "").slice(0, 40));
}

/* ===== Установка на экран: iPhone и Android ===== */
const IS_ANDROID = /Android/i.test(navigator.userAgent);
let installOS = IS_ANDROID ? "android" : "iphone"; // по умолчанию — платформа этого телефона
let installPrompt = null; // событие Chrome «можно установить», сохраняем для кнопки

// Chrome на Android сообщает, что сайт можно установить как приложение
window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();          // не показываем стандартную плашку Chrome
  installPrompt = e;           // покажем свою кнопку «Установить»
  renderTools();
});
window.addEventListener("appinstalled", () => { installPrompt = null; renderTools(); });

function installHtml() {
  const tab = (id, label) => `<button type="button" class="chip" data-os="${id}" aria-pressed="${installOS === id}">${label}</button>`;
  const iphone = `
    <ol class="install-steps small">
      <li>${tx("k303")}</li>
      <li>${tx("k304")}</li>
      <li>${tx("k305")}</li>
      <li>${tx("k306")}</li>
    </ol>`;
  const android = `
    ${installPrompt ? `<button type="button" class="btn" id="install-btn">${tx("k307")}</button>
      <p class="small muted">${tx("k308")}</p>` : ""}
    <p class="small">${tx("k309")}</p>
    <ol class="install-steps small">
      <li>${tx("k310")}</li>
      <li>${tx("k311")}</li>
      <li>${tx("k312")}</li>
    </ol>
    <p class="small">${tx("k313")}</p>
    <ol class="install-steps small">
      <li>${tx("k314")}</li>
      <li>${tx("k315")}</li>
    </ol>`;
  return `<div class="chips" role="group" aria-label="${tx("k316")}">${tab("iphone", "📱 iPhone")}${tab("android", "🤖 Android")}</div>
    ${installOS === "iphone" ? iphone : android}`;
}

function telHref(p) { return "tel:" + String(p || "").replace(/[^\d+]/g, ""); }
function waHref(p) { return "https://wa.me/" + String(p || "").replace(/\D/g, ""); }

function renderHelp() {
  const h = TOUR.hotel, g = TOUR.guide;
  $("#v-help").innerHTML = `<div class="stack">
    <article class="card now">
      <span class="eyebrow">${tx("k322")}</span>
      <h2>${esc(h.name)}</h2>
      <p class="address">${esc(h.address)}</p>
      ${h.tube ? `<span class="roundel"><i aria-hidden="true">${tx("k323", esc(h.tube), esc(h.line), h.walk)}</span>` : ""}
      ${h.note ? `<p class="small muted">${esc(h.note)}</p>` : ""}
      <div class="btn-row">
        <button type="button" class="btn" id="taxi-open">${tx("k324")}</button>
        ${h.maps ? `<a class="btn ghost" href="${h.maps}" target="_blank" rel="noopener">${tx("k325")}</a>` : ""}
      </div>
      <p class="hint">${tx("k326")}</p>
      <div class="alt-links">
        ${h.ll ? `<a class="maplink" href="${cmLink(h.ll, h.name)}" target="_blank" rel="noopener">${tx("k327")}</a>` : ""}
        ${IS_APPLE ? `<a class="maplink" href="${applePlace(h.name + ", " + h.address)}" target="_blank" rel="noopener">${tx("k317")}</a>` : ""}
      </div>
    </article>
    <article class="card">
      <h3>${tx("k328")}</h3>
      <div>
        <div class="contact">
          <div><div>${tx("k329", esc(g.name))}</div><div class="num">${g.phone ? esc(g.phone) : tx("k318")}</div></div>
          ${g.phone ? `<a class="call wa" href="${waHref(g.phone)}" target="_blank" rel="noopener" aria-label="${tx("k319")}">WA</a>` : `<span class="call off" style="min-width:52px;min-height:52px;display:grid;place-items:center;border-radius:50%">…</span>`}
        </div>
        ${h.phone ? `<div class="contact">
          <div><div>${tx("k330")}</div><div class="num">${esc(h.phone)}</div></div>
          <a class="call" href="${telHref(h.phone)}" aria-label="${tx("k320")}">☎</a>
        </div>` : ""}
        ${TOUR.contacts.map(c => `
        <div class="contact">
          <div><div>${esc(c.label)}</div><div class="num">${esc(c.phone)}${c.note ? " · " + esc(c.note) : ""}</div></div>
          ${c.wa ? `<a class="call wa" href="${waHref(c.phone)}" target="_blank" rel="noopener" aria-label="WhatsApp">WA</a>`
                 : `<a class="call" href="${telHref(c.phone)}" aria-label="${tx("k321")}">☎</a>`}
        </div>`).join("")}
      </div>
    </article>
    <article class="card">
      <h3>${tx("k331")}</h3>
      <ul class="items">
        <li><span>${tx("k332")}</span></li>
        <li><span>${esc(TOUR.help.backToHotel)}</span></li>
        <li><span>${tx("k333", TOUR.city.prep)}</span></li>
      </ul>
      <a class="btn ghost" href="#phrases" data-theme-link="street">${tx("k334")}</a>
      <a class="btn ghost" href="#phrases" data-theme-link="health">${tx("k335")}</a>
    </article>
    ${TOUR.help.theft.length ? `<article class="card">
      <h3>${tx("k336")}</h3>
      <ul class="items">
        ${TOUR.help.theft.map(t => `<li><span>${t}</span></li>`).join("")}
      </ul>
      <p class="hint">${tx("k337")}</p>
      ${TOUR.help.links.map(l => `<a class="btn ghost" href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join("")}
      
      
      <a class="btn ghost" href="#phrases" data-theme-link="theft">${tx("k338")}</a>
    </article>` : ""}
  </div>`;
}

// Сколько фраз в разговорнике (0 — разделы разговорника не показываем)
const PHRASES_N = TOUR.phrases.reduce((n, t) => n + t.items.length, 0);
function renderTools() {
  const c = TOUR.currency;
  const rate = store.get("rate", c.rate);
  const list = TOUR.checklist, done = store.get("checks", []);
  const standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  $("#v-tools").innerHTML = `<div class="stack">
    ${standalone
      // Приложение уже установлено: инструкция свёрнута — она нужна, чтобы помочь соседу
      ? `<details class="card"><summary>${tx("k339")} <span class="small muted">${tx("k340")}</span></summary>${installHtml()}</details>`
      : `<article class="card now">
          <h3>${tx("k341")}</h3>
          <p class="small">${tx("k342")}</p>
          ${installHtml()}
        </article>`}
    <details class="card guide">
      <summary>${tx("k345")} <span class="small muted">${tx("k346")}</span></summary>
      <ul class="items small">
        <li><span>${tx("k347")}</span></li>
        <li><span>${tx("k348", TOUR.days.length, plural(TOUR.days.length, tx("k93"), tx("k94"), tx("k95")))}</span></li>
        <li><span>${tx("k349")}</span></li>
        <li><span>${tx("k350")}</span></li>
        <li><span>${tx("k351")}</span></li>
        <li><span>${tx("k352")}</span></li>
        <li><span>${tx("k353")}</span></li>
        <li><span>${tx("k354")}</span></li>
        <li><span>${tx("k355")}</span></li>
        <li><span>${tx("k356", TOUR.city.prep, TOUR.home.prep)}</span></li>
        <li><span>${tx("k357")}</span></li>
      </ul>
    </details>
    ${QUIZ.length || PHRASES_N ? `<article class="card">
      <h3>${tx("k358")}</h3>
      <p class="small muted" style="margin:0">${tx("k359", TOUR.flights.durationText, TOUR.city.dat)}</p>
      ${toolsPlay()}
    </article>` : ""}
    ${PHRASES_N ? `<a class="card" href="#phrases" style="text-decoration:none;color:inherit">
      <h3>${tx("k360")}</h3>
      <p class="small muted">${tx("k361", TOUR.lang.accent)}</p>
      <span class="btn">${tx("k362")}</span>
    </a>` : ""}
    ${TOUR.apps.length ? `<article class="card">
      <h3>${tx("k363")}</h3>
      <p class="hint">${tx("k364")}</p>
      ${TOUR.apps.map(a => `<div class="app-row">
        <div><b>${esc(a.name)}</b><p class="small muted">${esc(a.text)}</p></div>
        <a class="btn ghost" href="${IS_APPLE ? a.ios : a.web}" target="_blank" rel="noopener">${IS_APPLE ? " App Store" : tx("k343")}</a>
      </div>`).join("")}
      ${IS_APPLE ? "" : `<p class="hint">${tx("k344")}</p>`}
    </article>` : ""}
    <article class="card">
      <h3>${tx("k365")}</h3>
      <p class="hint">${tx("k366")}</p>
      <div class="conv">
        <div class="field"><label for="in-gbp">${tx("k367")}</label><div class="inp"><span>${c.symbol}</span><input id="in-gbp" inputmode="decimal" placeholder="0" autocomplete="off"></div></div>
        <div class="field"><label for="in-ils">${tx("k368")}</label><div class="inp"><span>${c.homeSymbol}</span><input id="in-ils" inputmode="decimal" placeholder="0" autocomplete="off"></div></div>
      </div>
      <div class="quick" id="quick"></div>
      <div class="rate-row"><label for="in-rate">${tx("k369", c.symbol)}</label><input id="in-rate" inputmode="decimal" value="${rate}"> ${c.homeSymbol} <span>${tx("k370")}</span></div>
    </article>
    <article class="card">
      <h3>${tx("k371")}</h3>
      <div>${list.map((t, i) => `<label class="check"><input type="checkbox" data-ck="${i}" ${done.includes(i) ? "checked" : ""}><span>${esc(t)}</span></label>`).join("")}</div>
      <p class="small muted">${tx("k372")}</p>
    </article>
    <div class="tips">
      ${TOUR.tips.map(t => `<article class="card"><h3>${esc(t.h)}</h3><p>${esc(t.p)}</p></article>`).join("")}
    </div>
  </div>`;
  wireConverter();
}

// Две строки «В дорогу»: викторина и тренажёр, с личным прогрессом
function toolsPlay() {
  const best = store.get("quizBest", null), run = store.get("quizRun", null);
  const known = store.get("cardsKnown", []).length, total = TOUR.phrases.reduce((n, t) => n + t.items.length, 0);
  const quizSub = run && run.i < run.qs.length ? `${tx("k373", run.i + 1, run.qs.length)}` : `${QUIZ.length} ${plural(QUIZ.length, tx("k251"), tx("k252"), tx("k253"))}${best != null ? ` ${tx("k374", best, QUIZ_N)}` : ""}`;
  return `${QUIZ.length ? `<a class="it-row play-row" href="#quiz"><span>${tx("k378", TOUR.quiz.title)}<span class="small muted">${quizSub}</span></span><span class="chev" aria-hidden="true">›</span></a>` : ""}
    ${total ? `<a class="it-row play-row" href="#cards"><span>${tx("k379")}<span class="small muted">${tx("k380", total, plural(total, tx("k375"), tx("k376"), tx("k377")), Math.min(known, total))}</span></span><span class="chev" aria-hidden="true">›</span></a>` : ""}`;
}

function wireConverter() {
  const g = $("#in-gbp"), s = $("#in-ils"), r = $("#in-rate");
  const num = v => parseFloat(String(v).replace(",", "."));
  const round = v => (Math.round(v * 100) / 100).toString();
  const rate = () => { const v = num(r.value); return v > 0 ? v : TOUR.currency.rate; };
  const quick = () => {
    $("#quick").innerHTML = [5, 10, 20, 50].map(v => `<div>${TOUR.currency.symbol}${v} ≈ ${Math.round(v * rate())}${TOUR.currency.homeSymbol}</div>`).join("");
  };
  g.addEventListener("input", () => { const v = num(g.value); s.value = isNaN(v) ? "" : round(v * rate()); });
  s.addEventListener("input", () => { const v = num(s.value); g.value = isNaN(v) ? "" : round(v / rate()); });
  r.addEventListener("input", () => { if (num(r.value) > 0) store.set("rate", num(r.value)); quick(); g.dispatchEvent(new Event("input")); });
  quick();
}

/* Навигация по вкладкам через #hash */
const VIEWS = ["today", "program", "places", "help", "tools", "phrases", "quiz", "cards"];
const TAB_FOR = { phrases: "tools", quiz: "tools", cards: "tools" }; // какую вкладку подсвечивать для экранов без своей вкладки
/* Навигация. Адрес после # — «где мы»: "places", "places/p/12" и т. д.
   Первая часть до "/" выбирает вкладку, остальное — под-экран внутри неё. */
const scrollMem = {};   // прокрутка на каждом адресе — чтобы «назад» вернул на то же место списка
const backStack = [];   // адреса, с которых ушли вперёд по ссылке (для стрелки «назад» в приложении)
let navKind = "back";   // как попали на текущий адрес: "go" — вперёд по ссылке, "back" — назад или из истории
function show() {
  // Опции раньше жили в «Полезном»: старые ссылки #tools/opt-… и #tools/options ведём на «Программу»
  if (/^#tools\/opt/.test(location.hash)) { location.replace("#program/" + location.hash.split("/")[1]); return; }
  const parts = location.hash.slice(1).split("/");
  const v = VIEWS.includes(parts[0]) ? parts[0] : "today";
  if (STATS) STATS.track(STATS.screen([v, ...parts.slice(1)]));
  VIEWS.forEach(n => $("#v-" + n).classList.toggle("active", n === v));
  const tab = TAB_FOR[v] || v;
  document.querySelectorAll("nav.tabs a").forEach(a => { if (a.dataset.v === tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  if (v === "places") {
    placeRoute = parts.slice(1);
    renderPlaces();
    if (placeRoute[0] === "near") autoLocate();
  }
  if (v !== "phrases" && v !== "cards" && CAN_SPEAK) speechSynthesis.cancel();
  // Адрес вида #program/opt-tower: открыть вкладку и прокрутить к элементу с этим id (раскрыв, если он сворачивается)
  const target = v !== "places" && parts[1] ? $("#v-" + v).querySelector("#" + CSS.escape(parts[1])) : null;
  updateBackFab(target);
  if (target) { target.open = true; navKind = "back"; requestAnimationFrame(() => target.scrollIntoView({ block: "start" })); return; }
  if (navKind === "go") window.scrollTo(0, 0);           // новый экран — с начала
  else {                                                  // вернулись — туда же, где были
    if (backStack[backStack.length - 1] === location.hash) backStack.pop();
    window.scrollTo(0, scrollMem[location.hash] || 0);
  }
  navKind = "back";
}
// Кнопка «Назад» видна, только если мы прыгнули к элементу (#program/opt-…) по ссылке изнутри приложения.
// Подпись говорит, куда вернёмся; нажатие — тот же goBack(), он вернёт и прокрутку.
let fabDay = null;   // из какого дня программы нажали на опцию — для подписи «← Назад к 8 декабря»
// pointerdown, а не click: переход срабатывает на pointerup, раньше click
document.addEventListener("pointerdown", e => { const a = e.target.closest && e.target.closest("[data-go]"); if (a) fabDay = a.dataset.day || null; }, true);
function updateBackFab(target) {
  const fab = $("#backfab"), from = backStack[backStack.length - 1] || "";
  const where = { "#today": tx("k381"), "#program": fabDay ? `${tx("k382", fmt(fabDay))}` : tx("k383") }[from.split("/")[0]] || (from.startsWith("#places") ? tx("k384") : tx("k171"));
  fab.hidden = !(target && backStack.length);
  fab.textContent = "← " + where;
}
// Перейти вперёд по ссылке внутри приложения
function go(h) {
  if (location.hash === "#" + h) return;
  scrollMem[location.hash] = window.scrollY;
  backStack.push(location.hash);
  navKind = "go";
  location.hash = h;            // show() вызовет обработчик hashchange
}
// Стрелка «назад»: если пришли по ссылке — шаг назад по истории, иначе — на главный экран «Мест»
function goBack() {
  if (backStack.length) history.back();
  else { navKind = "go"; location.hash = "places"; }
}

function renderAll() { renderToday(); renderProgram(); renderPlaces(); renderHelp(); renderTools(); renderPhrases(); renderQuiz(); renderCards(); }

/* Один общий обработчик кликов (event delegation) */
/* Надёжное нажатие на ссылки внутри приложения — тот же приём, что у нижнего меню:
   на некоторых Android «призрачное» второе касание глушит click, поэтому переходим уже по pointerup.
   Если палец сдвинулся больше чем на 10 px — это прокрутка (например, полки вбок), а не нажатие. */
let tapDown = null, lastTapNav = 0;
document.addEventListener("pointerdown", e => { tapDown = { x: e.clientX, y: e.clientY }; }, { passive: true });
document.addEventListener("pointerup", e => {
  if (e.pointerType === "mouse" || !tapDown) return;
  const moved = Math.hypot(e.clientX - tapDown.x, e.clientY - tapDown.y) > 10;
  tapDown = null;
  if (moved) return;
  const el = e.target.closest("[data-go], [data-back]");
  if (!el) return;
  lastTapNav = Date.now();
  if (el.hasAttribute("data-back")) goBack(); else go(el.dataset.go);
});

document.addEventListener("click", e => {
  const nv = e.target.closest("[data-go], [data-back]");
  if (nv) {
    e.preventDefault();                                   // сами решаем, куда идти
    if (Date.now() - lastTapNav < 800) return;            // уже перешли по pointerup
    if (nv.hasAttribute("data-back")) goBack(); else go(nv.dataset.go);
    return;
  }
  // «Призрачный» click сразу после перехода по pointerup может попасть в кнопку нового экрана — гасим его
  if (Date.now() - lastTapNav < 350) { e.preventDefault(); return; }
  if (e.target.closest("[data-more-cats]")) { moreCats = !moreCats; renderPlaces(); return; }
  const pv = e.target.closest("[data-pv]");
  if (pv) { preview = pv.dataset.pv; renderToday(); renderProgram(); renderPlaces(); window.scrollTo(0, 0); return; }
  if (e.target.closest("#pv-exit")) { preview = null; renderToday(); renderProgram(); renderPlaces(); return; }
  const pvGo = e.target.closest("[data-pv-go]");   // не «go»: так уже называется функция перехода, имя её бы «затенило»
  if (pvGo) { preview = pvGo.dataset.pvGo; renderToday(); renderProgram(); renderPlaces(); location.hash = "today"; return; }
  const nb = e.target.closest("[data-near]");
  if (nb) {
    const a = nb.dataset.near;
    store.set("nearSeen", true);   // объяснение «Что рядом со мной» больше не показываем
    if (a === "off") { near = null; nearState = ""; renderPlaces(); }
    else locate(a === "demo");
    return;
  }
  if (e.target.closest("#taxi-open")) { showBig("Please take me to:", TOUR.hotel.name, TOUR.hotel.address, `Near ${TOUR.hotel.tube} station`); return; }
  const say = e.target.closest("[data-say]");
  if (say) { speak(say.dataset.say, Number(say.dataset.rate), say); return; }
  const big = e.target.closest("[data-big-en]");
  if (big) { showBig("", big.dataset.bigEn, "", big.dataset.bigRu); return; }
  const tl = e.target.closest("[data-theme-link]");
  if (tl) { phraseTheme = tl.dataset.themeLink; renderPhrases(); } // переход по href выполнится сам
  const os = e.target.closest("[data-os]");
  if (os) { installOS = os.dataset.os; renderTools(); if (os.closest("details")) $("#v-tools details").open = true; return; }
  if (e.target.closest("#install-btn") && installPrompt) {
    installPrompt.prompt();
    installPrompt.userChoice.finally(() => { installPrompt = null; renderTools(); });
    return;
  }
  const qt = e.target.closest("[data-quiz-theme]");
  if (qt) { store.set("quizTheme", qt.dataset.quizTheme); renderQuiz(); return; }
  const qz = e.target.closest("[data-quiz], [data-quiz-pick]");
  if (qz) { if (qz.dataset.quizPick != null) quizAction("pick", Number(qz.dataset.quizPick)); else quizAction(qz.dataset.quiz); return; }
  const cd = e.target.closest("[data-card]");
  if (cd) { cardAction(cd.dataset.card); return; }
  const ct = e.target.closest("[data-card-theme]");
  if (ct) { cardTheme = ct.dataset.cardTheme; cardDeckBuild(); renderCards(); return; }
  const th = e.target.closest("[data-theme]");
  if (th) { phraseTheme = th.dataset.theme; renderPhrases(); return; }
  if (e.target.closest("#taxi-close")) { $("#taxi").classList.remove("open"); return; }
});
document.addEventListener("change", e => {
  const ck = e.target.closest("[data-ck]");
  if (!ck) return;
  const i = Number(ck.dataset.ck);
  let done = store.get("checks", []);
  done = ck.checked ? [...new Set([...done, i])] : done.filter(x => x !== i);
  store.set("checks", done);
  renderToday();
});
// Запоминаем раскрытые карточки опций: событие toggle не всплывает, поэтому слушаем на этапе погружения (true)
document.addEventListener("toggle", e => {
  const d = e.target;
  if (d.classList && d.classList.contains("opt-card")) d.open ? optOpen.add(d.id.slice(4)) : optOpen.delete(d.id.slice(4));
  if (d.classList && d.classList.contains("it-info")) {
    d.open ? itemOpen.add(d.dataset.key) : itemOpen.delete(d.dataset.key);
    if (d.open && STATS) STATS.track("info:" + d.querySelector("summary").textContent.trim().slice(0, 60));
  }
}, true);
document.addEventListener("keydown", e => { if (e.key === "Escape") $("#taxi").classList.remove("open"); });

/* Свайп влево/вправо на экране «Сегодня» листает дни */
(() => {
  let x0 = null, y0 = null;
  const v = $("#v-today");
  v.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  v.addEventListener("touchend", e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) < 60 || Math.abs(dy) > 40) return; // это не свайп, а прокрутка
    const cur = TOUR.days.findIndex(d => d.date === (preview || tripToday()));
    if (cur < 0) return;
    const target = TOUR.days[cur + (dx < 0 ? 1 : -1)];
    if (target) { preview = target.date; renderToday(); renderProgram(); renderPlaces(); }
  });
})();



/* ===== Анонимная статистика =====
   Что считаем: открытия приложения, экраны, места, опции и ключевые кнопки. Чего НЕ считаем: имён, телефонов,
   местоположения. Устройство помечено случайным номером, который телефон придумал сам.
   Без интернета ничего не теряется: события копятся в localStorage и уходят пачкой, когда появится связь.
   Свои устройства исключаем ссылкой …/?nostats (вернуть — ?nostats=off). Отчёт — /stats.html?key=… */
var STATS = (() => {   // var, а не const: show() может спросить STATS до этой строки — получит undefined, а не ошибку
  const params = new URLSearchParams(location.search);
  if (params.has("nostats")) {
    const off = params.get("nostats") !== "off";
    store.set("noStats", off); if (off) store.set("statsQ", []);
    history.replaceState(null, "", location.pathname + location.hash);   // убираем ?nostats из адреса
    setTimeout(() => toast(off ? tx("k385") : tx("k386")), 600);
  }
  const enabled = () => !store.get("noStats", false) && (location.protocol === "https:" || location.hostname === "localhost");
  let id = store.get("did", "");
  if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)).toLowerCase(); store.set("did", id); }
  const ua = navigator.userAgent;
  const plat = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? "ios" : /Android/.test(ua) ? "android" : "desktop";
  const mode = () => (matchMedia("(display-mode: standalone)").matches || navigator.standalone) ? "app" : "web";
  const MAX_Q = 1000;
  let busy = false, last = "";

  function track(name) {
    if (!enabled()) return;
    name = String(name).slice(0, 90);
    if (name === last && !name.startsWith("act:") && name !== "open") return;   // одно и то же подряд не дублируем
    last = name;
    const q = store.get("statsQ", []);
    q.push([Date.now(), name]);
    store.set("statsQ", q.slice(-MAX_Q));
  }
  // Отправляем пачку; удаляем из очереди только то, что сервер подтвердил (ответ 200)
  async function flush() {
    if (busy || !enabled() || !navigator.onLine) return;
    const part = store.get("statsQ", []).slice(0, 300);
    if (!part.length) return;
    busy = true;
    let ok = false;
    try {
      const r = await fetch("/api/track", { method: "POST", keepalive: true, headers: { "content-type": "application/json" },
        body: JSON.stringify({ d: id, m: mode(), p: plat, e: part }) });
      ok = r.ok;
      if (ok) store.set("statsQ", store.get("statsQ", []).slice(part.length));   // новые события дописывались в конец
    } catch {}
    busy = false;
    if (ok && store.get("statsQ", []).length) setTimeout(flush, 1000);
  }
  // Экран → имя события: «view:program», «place:Тауэр», «opt:tower», «shelf:eve», «places:metro»
  function screen(parts) {
    const v = parts[0] || "today";
    if (v === "places") {
      const r = parts.slice(1);
      if (r[0] === "p") { const p = TOUR.places[+r[1]]; return p ? "place:" + placeTitle(p) : "view:places"; }
      if (r[0] === "cat" || r[0] === "shelf" || r[0] === "walk") return r[0] + ":" + (r[1] || "");
      return r[0] ? "places:" + r[0] : "view:places";
    }
    if (parts[1] && parts[1].startsWith("opt-")) return "opt:" + parts[1].slice(4);
    return "view:" + (parts[1] === "options" ? "options" : v);
  }
  // Кнопки, которые уводят из приложения или открывают крупную карточку
  document.addEventListener("click", e => {
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    const h = a.getAttribute("href");
    const act = h.startsWith("https://docs.google.com/forms") ? "signup" : a.classList.contains("go-btn") ? "route"
      : h.includes("waze.com") ? "waze" : h.includes("tbm=isch") ? "photos" : h.startsWith("https://wa.me") ? "whatsapp"
      : h.startsWith("tel:") ? "call" : null;
    if (act) { track("act:" + act); flush(); }
  }, true);
  // Открытие: при запуске и при возвращении в приложение после 30+ минут
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { hiddenAt = Date.now(); flush(); }
    else if (hiddenAt && Date.now() - hiddenAt > 30 * 60e3) { last = ""; track("open"); flush(); }
  });
  window.addEventListener("online", flush);
  setInterval(flush, 2 * 60e3);
  track("open");
  setTimeout(flush, 3000);
  return { track, flush, screen };
})();

// Короткое уведомление сверху на пару секунд (вместо alert, который блокирует приложение)
function toast(text) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = text; document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

renderAll();
show();
loadWeather();
window.addEventListener("online", loadWeather);
loadFlights();
window.addEventListener("online", () => loadFlights(true));
document.addEventListener("visibilitychange", () => { if (!document.hidden) loadFlights(); });
setInterval(loadFlights, 5 * 60e3);

/* Двойные часы: Лондон / Израиль.
   Часовые пояса задаём названиями (IANA), а не «+2 часа»:
   браузер сам учтёт переход на летнее/зимнее время в обеих странах. */
const ZONES = { trip: TOUR.tz, home: TOUR.home.tz };
function partsIn(tz, d) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const get = t => Number(p.find(x => x.type === t).value);
  return { h: get("hour"), m: get("minute") };
}
const hhmm = ({ h, m }) => String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
function renderClocks() {
  try {
    const now = new Date();
    const L = partsIn(ZONES.trip, now), H = partsIn(ZONES.home, now);
    // Разница в часах между поясами (в декабре Израиль впереди на 2 часа)
    let diff = ((H.h * 60 + H.m) - (L.h * 60 + L.m)) / 60;
    if (diff > 12) diff -= 24;
    if (diff < -12) diff += 24;
    const night = H.h >= 23 || H.h < 7; // дома ночь — лучше не звонить
    $("#clocks").innerHTML = `
      <div class="clock"><span class="lbl">${TOUR.city.flag} ${TOUR.city.name}</span><span class="t">${hhmm(L)}</span><span class="note">${tx("k389")}</span></div>
      <div class="clock"><span class="lbl">${TOUR.home.flag} ${TOUR.home.name}</span><span class="t">${hhmm(H)}</span>
        <span class="note ${night ? "night" : ""}">${night ? tx("k387") : (diff > 0 ? "+" : "") + diff + tx("k388") + TOUR.city.gen}</span></div>`;
  } catch { $("#clocks").hidden = true; }
}
renderClocks();
// Обновляем ровно в начале каждой минуты, а дальше — каждые 60 секунд
setTimeout(() => { renderClocks(); setInterval(renderClocks, 60000); }, 60000 - Date.now() % 60000);

/* Диагностика для удалённой отладки: 5 быстрых касаний по заголовку «Лондон на Рождество».
   Показывает, какой элемент реально лежит под центром каждой кнопки меню. */
(() => {
  let taps = 0, timer = null;
  $("#hdr-title").addEventListener("click", () => {
    taps++; clearTimeout(timer); timer = setTimeout(() => taps = 0, 1500);
    if (taps < 5) return;
    taps = 0;
    const d = $("#diag");
    const desc = el => {
      if (!el) return tx("k390");
      const a = el.closest && el.closest("nav.tabs a");
      if (a) return tx("k391") + a.dataset.v;
      const cls = typeof el.className === "string" ? el.className : (el.className && el.className.baseVal) || "";
      return tx("k392") + el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (cls ? "." + cls.trim().replace(/\s+/g, ".") : "") + ">";
    };
    const rows = [...document.querySelectorAll("nav.tabs a")].map(a => {
      const r = a.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      return `${a.dataset.v.padEnd(8)} x=${Math.round(x)} y=${Math.round(y)} w=${Math.round(r.width)}  ${desc(document.elementFromPoint(x, y))}`;
    });
    const nav = document.querySelector("nav.tabs").getBoundingClientRect();
    d.textContent = [
      tx("k393"),
      "",
      tx("k394") + innerWidth + "×" + innerHeight + "  dpr=" + devicePixelRatio,
      tx("k395") + getComputedStyle(document.body).fontSize + tx("k396"),
      tx("k397") + (matchMedia("(display-mode: standalone)").matches ? tx("k398") : tx("k399")),
      tx("k400") + Math.round(nav.top) + " bottom=" + Math.round(nav.bottom),
      "SW: " + (navigator.serviceWorker && navigator.serviceWorker.controller ? tx("k401") : tx("k402")),
      "",
      ...rows,
      "",
      navigator.userAgent,
      "",
      tx("k403") + (DIAG_ERRORS.length ? "\n  " + DIAG_ERRORS.slice(-6).join("\n  ") : tx("k402")),
    ].join("\n");
    const btns = document.createElement("div");
    btns.style.cssText = "display:flex;gap:8px;margin-top:14px;flex-wrap:wrap";
    btns.innerHTML = `<button type="button" id="diag-test" style="padding:10px 14px;font:inherit;border:2px solid #000;border-radius:8px;background:#ffd300">${tx("k406")}</button>
      <button type="button" id="diag-stats" style="padding:10px 14px;font:inherit;border:2px solid #000;border-radius:8px;background:#fff">${tx("k407", store.get("noStats", false) ? tx("k404") : tx("k405"))}</button>
      <button type="button" id="diag-close" style="padding:10px 14px;font:inherit;border:2px solid #000;border-radius:8px;background:#fff">${tx("k408")}</button>`;
    d.appendChild(btns);
    d.hidden = false;
  });
  $("#diag").addEventListener("click", e => {
    if (e.target.id === "diag-close") $("#diag").hidden = true;
    if (e.target.id === "diag-test") { $("#diag").hidden = true; startTapLog(); }
    // Своё устройство — не считать. Нужно для установленного приложения на iPhone: у него своё хранилище,
    // отдельное от Safari, поэтому ссылка ?nostats, открытая в Safari, на него не действует.
    if (e.target.id === "diag-stats") {
      const off = !store.get("noStats", false);
      store.set("noStats", off); if (off) store.set("statsQ", []);
      $("#diag").hidden = true; toast(off ? tx("k385") : tx("k386"));
    }
  });

  /* Тест касаний: 30 секунд записываем, что происходит при каждом нажатии */
  function startTapLog() {
    const box = document.createElement("div");
    box.id = "taplog";
    box.style.cssText = "position:fixed;left:8px;right:8px;top:8px;z-index:70;max-height:45vh;overflow:hidden;background:rgba(255,255,255,.96);color:#000;border:2px solid #c8102e;border-radius:10px;padding:8px;font:11px/1.35 ui-monospace,monospace;white-space:pre-wrap;pointer-events:none";
    document.body.appendChild(box);
    const lines = [tx("k409")];
    const draw = () => box.textContent = lines.slice(-14).join("\n");
    const short = el => {
      if (!el || !el.tagName) return "?";
      const a = el.closest && el.closest("a");
      const cls = typeof el.className === "string" ? el.className : (el.className && el.className.baseVal) || "";
      return el.tagName.toLowerCase() + (cls ? "." + cls.trim().split(/\s+/)[0] : "") + (a && a.dataset.v ? tx("k410") + a.dataset.v + "]" : "");
    };
    const t0 = Date.now(), ts = () => ((Date.now() - t0) / 1000).toFixed(1) + tx("k411");
    const log = e => {
      const p = e.changedTouches && e.changedTouches[0] || e;
      const fingers = e.touches ? ` ${tx("k412", e.touches.length)}` : "";
      lines.push(`${ts()} ${e.type} → ${short(e.target)} (${Math.round(p.clientX)},${Math.round(p.clientY)})${fingers}${e.defaultPrevented ? " prevented" : ""}`);
      if (e.type === "click") setTimeout(() => {
        lines.push(`   ${tx("k413", (document.querySelector(".view.active") || {}).id, location.hash)}`);
        draw();
      }, 400);
      draw();
    };
    const types = ["touchstart", "touchend", "pointerup", "click"];
    types.forEach(t => window.addEventListener(t, log, { capture: true, passive: true }));
    const onHash = () => { lines.push(`${ts()} hashchange → ${location.hash}`); draw(); };
    window.addEventListener("hashchange", onHash);
    const errCount = DIAG_ERRORS.length;
    const tick = setInterval(() => {
      if (DIAG_ERRORS.length > errCount) { lines.push(tx("k414") + DIAG_ERRORS[DIAG_ERRORS.length - 1]); draw(); }
    }, 300);
    draw();
    setTimeout(() => {
      types.forEach(t => window.removeEventListener(t, log, { capture: true }));
      window.removeEventListener("hashchange", onHash);
      clearInterval(tick);
      lines.push(tx("k415")); draw();
      setTimeout(() => box.remove(), 20000);
    }, 30000);
  }
})();

/* Навигация по меню.
   Обычно экран переключается по событию click. Но если телефон видит два касания
   одновременно (на некоторых устройствах бывает «фантомное» касание), браузер считает это
   жестом и click не присылает. Событие pointerup при этом приходит правильно,
   поэтому переключаем экран по pointerup, а click оставляем для мыши и клавиатуры. */
function navTo(v) {
  scrollMem[location.hash] = window.scrollY;
  delete scrollMem["#" + v];       // вкладку из нижнего меню всегда открываем с начала
  backStack.length = 0;            // новая вкладка — новая «цепочка» переходов
  navKind = "go";
  if (location.hash !== "#" + v) location.hash = v; // запись в историю: «назад» вернёт на прошлую вкладку
  show();
}
document.querySelectorAll("nav.tabs a").forEach(a => {
  let lastPointer = 0;
  a.addEventListener("pointerup", e => {
    if (e.pointerType === "mouse") return;    // мышью — обычный click
    lastPointer = Date.now();
    navTo(a.dataset.v);
  });
  a.addEventListener("click", e => {
    e.preventDefault();
    if (Date.now() - lastPointer < 800) return; // уже переключили по pointerup, второй раз не нужно
    navTo(a.dataset.v);
  });
});

/* Кнопка «А+»: обычный → крупный → очень крупный → обычный */
const FS_NAMES = [tx("k416"), tx("k417"), tx("k418")];
function renderFsBtn() {
  const lvl = Number(document.documentElement.dataset.fs || 0);
  const b = $("#fs-btn");
  b.innerHTML = `<span class="a">${lvl === 2 ? tx("k419") : tx("k420")}</span><span class="dots">${[0, 1, 2].map(i => `<i class="${i <= lvl ? "on" : ""}"></i>`).join("")}</span>`;
  b.setAttribute("aria-label", `${tx("k423", FS_NAMES[lvl], lvl === 2 ? tx("k421") : tx("k422"))}`);
  b.title = `${tx("k424", FS_NAMES[lvl])}`;
}
$("#backfab").addEventListener("click", goBack);
$("#fs-btn").addEventListener("click", () => {
  const next = (Number(document.documentElement.dataset.fs || 0) + 1) % 3;
  if (next) document.documentElement.dataset.fs = String(next); else delete document.documentElement.dataset.fs;
  store.set("fontSize", String(next));
  renderFsBtn();
});
renderFsBtn();

/* Плашка «Нет интернета» */
function updateOnline() { $("#offline-bar").hidden = navigator.onLine; }
window.addEventListener("online", updateOnline);
window.addEventListener("offline", updateOnline);
updateOnline();
window.addEventListener("hashchange", show);
