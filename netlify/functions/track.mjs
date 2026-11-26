/* Приём статистики: телефон присылает пачку событий → складываем в Netlify Blobs.
   Подробно о том, что и как храним, — в netlify/lib/stats-core.mjs. */
import { getStore } from "@netlify/blobs";
import { cleanBatch, saveBatch } from "../lib/stats-core.mjs";

export default async req => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  let body;
  try { body = await req.json(); } catch { return new Response("bad json", { status: 400 }); }
  const batch = cleanBatch(body);
  if (!batch) return new Response("bad batch", { status: 400 });
  if (batch.events.length) await saveBatch(getStore({ name: "stats", consistency: "strong" }), batch);
  // 200 — телефон удалит отправленные события из своей очереди
  return new Response(JSON.stringify({ ok: true, n: batch.events.length }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
};

export const config = { path: "/api/track" };
