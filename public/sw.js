// Service worker do app mobile (Lúmen) — só cuida de notificações push. Não faz cache de
// assets nem funciona offline (fora do escopo pedido); registrado por
// components/mobile/NotificationPreferences.tsx quando o usuário ativa notificações.

self.addEventListener("push", (event) => {
  let data = { title: "Lúmen", body: "Você tem uma novidade." };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // payload não veio em JSON — mantém o texto padrão acima
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192",
      badge: "/icon-192",
      data: { url: data.url || "/m" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/m";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
