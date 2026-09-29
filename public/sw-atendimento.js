// Service worker do app de Atendimento (Lúmen Atendimento) — só cuida de notificações push. Não faz cache de
// assets nem funciona offline (fora do escopo pedido); registrado por
// AtendimentoAppShell e pela tela de entrada (app/atendimento-app/entrar).

// Handler de fetch vazio (não intercepta nada, a rede responde normalmente): o Chrome mais antigo só
// considera o app instalável se o service worker tiver um listener de "fetch".
self.addEventListener("fetch", () => {});

self.addEventListener("push", (event) => {
  let data = { title: "Lúmen", body: "Você tem uma novidade." };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // payload não veio em JSON — mantém o texto padrão acima
  }

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(data.title, {
        body: data.body,
        icon: "/icons-atendimento/icon-192.png",
        badge: "/icons-atendimento/icon-192.png",
        data: { url: data.url || "/atendimento-app" },
      });

      // Se o payload já veio com a contagem total de alertas (ver lib/push.ts), atualiza o
      // badge do ícone na hora, sem esperar o push chegar até um client aberto. Sempre avisa
      // os clients abertos também (postMessage), pra AppBadgeSync reconsultar imediatamente
      // em vez de só no polling de 60s — cobre o caso de o payload não trazer `count`, ou de
      // ter ficado desatualizado entre o envio do push e o momento em que ele chega.
      if (typeof data.count === "number" && "setAppBadge" in self.registration) {
        if (data.count > 0) await self.registration.setAppBadge(data.count).catch(() => {});
        else await self.registration.clearAppBadge().catch(() => {});
      }

      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientsList) client.postMessage({ type: "lumen-refresh-badge" });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/atendimento-app";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
