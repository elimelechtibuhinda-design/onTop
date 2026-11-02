// Imported into the generated service worker. Handles the "Still on task?" focus-ping
// notification buttons and hands the answer to the open onTop tab.
self.addEventListener("notificationclick", (event) => {
  const n = event.notification;
  if (n.tag !== "ontop-ping") return;
  n.close();
  const answer = event.action === "yes" ? "yes" : event.action === "no" ? "no" : "open";
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of clients) c.postMessage({ type: "ontop-ping", answer });
    // Tapping the notification body (not a button) brings onTop to the front.
    if (answer === "open" && clients[0]) await clients[0].focus();
  })());
});
