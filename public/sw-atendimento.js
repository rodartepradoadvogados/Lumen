// Service worker do app de Atendimento (Lúmen Atendimento). Faz DUAS coisas e só elas:
//
//  1. AVISO DE MENSAGEM NOVA (Web Push): mostra "Nova mensagem no Atendimento" e, ao tocar, abre/foca a conversa.
//  2. TELA "SEM CONEXÃO": se o app é aberto sem rede, mostra uma página estática em vez do erro do navegador.
//
// SIGILO PRIMEIRO — o que este arquivo NUNCA faz (travado por lib/testes/atendimentoAppOffline.teste.ts):
//  - NÃO guarda página, JSON, lista, conversa, mídia nem resposta de API. O ÚNICO cache é `atd-casca-v1`, preenchido
//    SÓ na instalação com a lista fixa ATIVOS_DA_CASCA (a tela "Sem conexão" e o ícone). Nada é acrescentado ao cache
//    durante a navegação: não existe `cache.put` de resposta de rede aqui, e é isso que impede uma conversa de ir
//    parar no aparelho (quem usasse o aparelho depois do Sair a leria).
//  - NÃO responde por conta própria nada além da navegação de tela sob /atendimento-app que FALHOU por falta de rede;
//    para essa falha entrega a tela "Sem conexão". Chamada de API, mídia e qualquer outra coisa seguem direto pela rede.
//  - O texto do aviso é FIXO. Qualquer `body`/`title` que chegue na carga é ignorado: nem o nome do cliente nem o
//    texto da mensagem podem aparecer na tela bloqueada, mesmo que um dia o servidor os mande por engano.
//
// O Chrome mais antigo só considera o app instalável se houver um listener de "fetch": o abaixo cumpre isso.

const CACHE_DA_CASCA = "atd-casca-v1";
const PAGINA_SEM_CONEXAO = "/atendimento-offline.html";
const ATIVOS_DA_CASCA = [PAGINA_SEM_CONEXAO, "/icons-atendimento/icon-192.png"];
const BASE_DO_APP = "/atendimento-app";
const TITULO_DO_AVISO = "Lúmen Atendimento";
const CORPO_DO_AVISO = "Nova mensagem no Atendimento";

self.addEventListener("install", (event) => {
  // Tolerante: se a tela offline não puder ser guardada agora, o aviso de mensagem continua funcionando.
  event.waitUntil(
    caches
      .open(CACHE_DA_CASCA)
      .then((cache) => cache.addAll(ATIVOS_DA_CASCA))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  // Apaga qualquer cache de versão anterior (só a casca atual sobrevive) e assume as abas abertas.
  event.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE_DA_CASCA).map((n) => caches.delete(n))))
      .catch(() => {})
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const pedido = event.request;
  if (pedido.method !== "GET" || pedido.mode !== "navigate") return;
  let url;
  try {
    url = new URL(pedido.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin || (url.pathname !== BASE_DO_APP && !url.pathname.startsWith(BASE_DO_APP + "/"))) return;
  // Só a FALHA DE REDE cai na tela "Sem conexão". Resposta do servidor (mesmo 401, 404 ou 500) passa intacta.
  event.respondWith(
    fetch(pedido).catch(() =>
      caches.open(CACHE_DA_CASCA).then((cache) => cache.match(PAGINA_SEM_CONEXAO)).then((tela) => tela || Response.error()),
    ),
  );
});

// O endereço que o toque abre: só dentro do app, e sem "//" (nada de sair para outro site).
function enderecoSeguro(url) {
  if (typeof url === "string" && url.startsWith(BASE_DO_APP) && !url.includes("//") && !url.includes("\\")) return url;
  return BASE_DO_APP;
}

self.addEventListener("push", (event) => {
  let carga = {};
  try {
    if (event.data) carga = event.data.json() || {};
  } catch {
    // carga ilegível: mostra o aviso neutro mesmo assim
  }
  const url = enderecoSeguro(carga.url);
  // `tag` agrupa por conversa: um aviso novo da mesma conversa SUBSTITUI o anterior em vez de empilhar.
  const tag = typeof carga.tag === "string" && /^atd-[A-Za-z0-9_-]{1,64}$/.test(carga.tag) ? carga.tag : "atd-geral";
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(TITULO_DO_AVISO, {
        body: CORPO_DO_AVISO,
        tag,
        renotify: true,
        icon: "/icons-atendimento/icon-192.png",
        badge: "/icons-atendimento/icon-192.png",
        data: { url },
      });
      // Avisa as abas abertas para buscarem já (o aviso e a conversa andam juntos).
      const abertas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const aba of abertas) aba.postMessage({ type: "lumen-refresh-badge" });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const alvo = enderecoSeguro(event.notification.data && event.notification.data.url);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (abas) => {
      const doApp = abas.filter((aba) => {
        try {
          return new URL(aba.url).pathname.startsWith(BASE_DO_APP);
        } catch {
          return false;
        }
      });
      // A aba já está na conversa: só traz para a frente.
      for (const aba of doApp) {
        try {
          if (new URL(aba.url).pathname === alvo && "focus" in aba) return aba.focus();
        } catch {
          /* segue */
        }
      }
      // Outra tela do app aberta: leva para a conversa.
      for (const aba of doApp) {
        if ("navigate" in aba) {
          try {
            const naConversa = await aba.navigate(alvo);
            if (naConversa && "focus" in naConversa) return naConversa.focus();
          } catch {
            /* tenta abrir uma janela nova */
          }
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(alvo);
    }),
  );
});
