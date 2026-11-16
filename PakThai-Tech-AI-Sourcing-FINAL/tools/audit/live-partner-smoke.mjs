const base = "https://pakthai-ai-sourcing.pakthaitech.workers.dev";
const checks = [
  ["health", () => fetch(base + "/api/health")],
  ["catalog", () => fetch(base + "/api/catalog")],
  ["storefront", () => fetch("https://pakthai-tech-store.pages.dev/")],
  ["owner_notifications_unauth", () => fetch(base + "/api/notifications")],
  ["owner_gmail_send_unauth", () => fetch(base + "/api/notifications/gmail-send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ notification_id: 1 }) })]
];
for (const [name, run] of checks) {
  try {
    const response = await run();
    let extra = "";
    if (name === "catalog" && response.ok) {
      const data = await response.json();
      extra = " products=" + (data.products || []).length;
    } else if (name === "health" && response.ok) {
      extra = " " + JSON.stringify(await response.json());
    }
    console.log(name + ": HTTP " + response.status + extra);
  } catch (error) {
    console.log(name + ": ERROR " + String(error?.message || error));
    process.exitCode = 1;
  }
}
