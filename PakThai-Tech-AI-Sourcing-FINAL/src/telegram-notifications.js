import { getSession } from "./auth-session.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

function safeTelegramErrorDescription(result, token) {
  const description = String(result?.description || "").trim();
  if (!description) return "";
  // Telegram descriptions are diagnostic text; redact credentials and bound the response.
  return description
    .replaceAll(String(token || ""), "[redacted]")
    .replace(/bot\d{5,}:[A-Za-z0-9_-]{10,}/g, "[redacted]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 180);
}

export async function sendTelegramMessage(env, message) {
  const token = String(env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(env.TELEGRAM_OWNER_CHAT_ID || "").trim();
  const text = String(message || "").trim();
  if (!token || !chatId) throw new Error("Telegram bot token and Owner chat ID are not configured.");
  if (!text || text.length > 3500) throw new Error("Telegram message must contain 1–3500 characters.");
  const response = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok !== true || !result.result?.message_id) {
    const description = safeTelegramErrorDescription(result, token);
    const ownerChatHelp = /chat not found/i.test(description) ? " The configured Owner chat is not reachable. Open the bot in Telegram, press Start or send /start, then update TELEGRAM_OWNER_CHAT_ID with the numeric private chat ID. No message was sent." : "";
    throw new Error("Telegram send failed (HTTP " + response.status + ")" + (description ? ": " + description : ".") + ownerChatHelp);
  }
  return { message_id: String(result.result.message_id), chat_id: String(result.result.chat?.id || chatId) };
}

export async function handleTelegramNotifications(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!["/api/notifications/telegram-status", "/api/notifications/telegram-send"].includes(path)) return null;
  const owner = await getSession(request, env);
  if (owner?.role !== "owner" || !owner?.nonce) {
    return Response.json({ ok: false, error: "Owner login required." }, { status: 401, headers: JSON_HEADERS });
  }

  if (path === "/api/notifications/telegram-status" && request.method === "GET") {
    return Response.json({
      ok: true,
      provider: "telegram",
      bot_token_configured: Boolean(String(env.TELEGRAM_BOT_TOKEN || "").trim()),
      owner_chat_id_configured: Boolean(String(env.TELEGRAM_OWNER_CHAT_ID || "").trim()),
      ready: Boolean(String(env.TELEGRAM_BOT_TOKEN || "").trim() && String(env.TELEGRAM_OWNER_CHAT_ID || "").trim())
    }, { headers: JSON_HEADERS });
  }
  if (path !== "/api/notifications/telegram-send" || request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed." }, { status: 405, headers: JSON_HEADERS });
  }
  let body = {};
  try { body = await request.json(); } catch {}
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length > 3500) {
    return Response.json({ ok: false, error: "Provide a message of 1–3500 characters." }, { status: 400, headers: JSON_HEADERS });
  }
  if (!String(env.TELEGRAM_BOT_TOKEN || "").trim() || !String(env.TELEGRAM_OWNER_CHAT_ID || "").trim()) {
    return Response.json({ ok: false, error: "Telegram bot token and Owner chat ID are not configured." }, { status: 503, headers: JSON_HEADERS });
  }
  try {
    const sent = await sendTelegramMessage(env, message);
    return Response.json({ ok: true, accepted: true, message_id: sent.message_id }, { headers: JSON_HEADERS });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Telegram send failed." }, { status: 502, headers: JSON_HEADERS });
  }
}
