#!/usr/bin/env node
import { readFileSync } from "node:fs";

const TOKEN =
  process.env.TELEGRAM_BOT_TOKEN ||
  (() => {
    try {
      return readFileSync("/workspace/.grok/telegram.token", "utf8").trim();
    } catch {
      return "";
    }
  })();

const HOOK = process.env.TELEGRAM_HOOK ?? "http://127.0.0.1:8080/api/telegram";
const API = TOKEN ? `https://api.telegram.org/bot${TOKEN}` : "";

async function waitForApp() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch("http://127.0.0.1:8080/", {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) return;
    } catch {
      /* app still booting */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

async function loop() {
  if (!TOKEN) {
    console.error("[telegram] no token");
    return;
  }
  await waitForApp();
  await fetch(`${API}/deleteWebhook`, { method: "POST" }).catch(() => undefined);
  let offset = 0;
  for (;;) {
    try {
      const res = await fetch(
        `${API}/getUpdates?timeout=25&offset=${offset}&allowed_updates=${encodeURIComponent('["message","callback_query"]')}`,
        { signal: AbortSignal.timeout(35_000) },
      );
      const body = await res.json();
      if (!body.ok) {
        console.error("[telegram]", body.description ?? body.error_code);
        await new Promise((r) => setTimeout(r, 8000));
        continue;
      }
      for (const update of body.result ?? []) {
        offset = update.update_id + 1;
        await fetch(HOOK, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Takt-Telegram": TOKEN,
          },
          body: JSON.stringify(update),
          signal: AbortSignal.timeout(60_000),
        });
      }
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name !== "TimeoutError" && name !== "AbortError") {
        console.error("[telegram]", error instanceof Error ? error.message : error);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

loop();
