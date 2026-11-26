/* Отчёт статистики для страницы /stats.html. Отдаёт данные только с правильным ключом:
   ?key=… должен совпасть с переменной окружения STATS_KEY (Netlify → Site configuration →
   Environment variables). Ключа нет в коде и на GitHub. */
import { getStore } from "@netlify/blobs";
import { buildReport } from "../lib/stats-core.mjs";

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" }
});

export default async req => {
  const secret = process.env.STATS_KEY;
  if (!secret) return json({ error: "nokey" }, 503);                    // ключ ещё не задан в Netlify
  if (new URL(req.url).searchParams.get("key") !== secret) return json({ error: "denied" }, 403);
  const store = getStore({ name: "stats", consistency: "strong" });
  // «Обнулить»: удаляем все файлы статистики (кнопка на странице отчёта, тоже только с ключом)
  if (req.method === "DELETE") {
    const { blobs } = await store.list({ prefix: "d/" });
    await Promise.all(blobs.map(b => store.delete(b.key)));
    return json({ ok: true, deleted: blobs.length });
  }
  return json(await buildReport(store));
};

export const config = { path: "/api/stats" };
