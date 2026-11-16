import { sendTelegramMessage } from "./telegram-notifications.js";

const clean = (value, max = 180) => String(value ?? "")
  .replace(/[\u0000-\u001f\u007f]/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, max);

/**
 * Send a minimal, internal-only Owner alert for a newly saved customer request.
 * Customer contact details are deliberately excluded. Telegram is an optional
 * free notification channel, never the source of truth for the request.
 */
export async function notifyOwnerOfCustomerRequest(env, request) {
  if (!String(env?.TELEGRAM_BOT_TOKEN || "").trim() ||
      !String(env?.TELEGRAM_OWNER_CHAT_ID || "").trim()) {
    return { sent: false, reason: "not_configured" };
  }

  const id = Math.max(0, Math.floor(Number(request?.requestId) || 0));
  if (!id) return { sent: false, reason: "request_id_missing" };

  const product = clean(request?.productTitle || "Product / sourcing request");
  const quantity = Math.max(1, Math.min(1000000, Math.floor(Number(request?.quantity) || 1)));
  const message = [
    "PAKTHAI TECH — New customer request",
    "Request: #" + id,
    "Product: " + product,
    "Quantity: " + quantity,
    "Status: Awaiting Owner review.",
    "Open the AI Sourcing dashboard to review customer details. No quote/order is approved by this alert."
  ].join("\n");

  try {
    const result = await sendTelegramMessage(env, message);
    return { sent: true, message_id: result.message_id };
  } catch (error) {
    return {
      sent: false,
      reason: "send_failed",
      error: String(error?.message || "Telegram Owner alert failed").slice(0, 220)
    };
  }
}
