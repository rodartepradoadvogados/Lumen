"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { chaveParaUint8Array, ehAparelhoIos, situacaoDoAviso, TEXTOS_DO_AVISO, type EntradaDoAviso } from "@/lib/avisoPushDoApp";

// O CARTÃO "Avisos de mensagem nova" da tela Mais, com estado REAL do aparelho e do servidor.
//
// A permissão do navegador só é pedida no TOQUE em "Ativar" (nunca ao abrir a tela, nem ao montar o cartão).
// Nada de conteúdo passa por aqui: o que se guarda no servidor é o endereço técnico do aparelho (lib/inscricaoDePush.ts).
// Ao abrir a tela com o aparelho já inscrito e a permissão dada, a inscrição é renovada em silêncio (é o que refaz o
// registro depois de um Sair em outro aparelho, que apaga as inscrições da pessoa no servidor).

const ESCOPO = "/atendimento-app";
const ENDERECO = "/api/atendimento/push";

async function registro(): Promise<ServiceWorkerRegistration | null> {
  try {
    return (await navigator.serviceWorker.getRegistration(ESCOPO)) ?? (await navigator.serviceWorker.ready);
  } catch {
    return null;
  }
}

async function avisarServidor(sub: PushSubscription): Promise<boolean> {
  try {
    const r = await fetch(ENDERECO, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON() }), cache: "no-store" });
    return r.ok;
  } catch {
    return false;
  }
}

export default function AvisosDeMensagemNova() {
  const [entrada, setEntrada] = useState<EntradaDoAviso>({
    lido: false,
    temServiceWorker: false,
    temPushManager: false,
    temNotification: false,
    ehIos: false,
    instalado: false,
    permissao: "default",
    servidorDisponivel: null,
    inscrito: false,
  });
  const [chave, setChave] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const ler = useCallback(async () => {
    const temServiceWorker = "serviceWorker" in navigator;
    const temPushManager = "PushManager" in window;
    const temNotification = "Notification" in window;
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    const base: EntradaDoAviso = {
      lido: true,
      temServiceWorker,
      temPushManager,
      temNotification,
      ehIos: ehAparelhoIos(navigator.userAgent, navigator.maxTouchPoints ?? 0, navigator.platform ?? ""),
      instalado: Boolean(standalone),
      permissao: temNotification ? Notification.permission : "default",
      servidorDisponivel: null,
      inscrito: false,
    };
    setEntrada(base);
    if (!(temServiceWorker && temPushManager && temNotification)) return;

    let disponivel = false;
    let chavePublica: string | null = null;
    try {
      const r = await fetch(ENDERECO, { cache: "no-store" });
      if (r.ok) {
        const c = (await r.json()) as { disponivel?: boolean; chavePublica?: string | null };
        disponivel = c.disponivel === true && Boolean(c.chavePublica);
        chavePublica = c.chavePublica ?? null;
      }
    } catch {
      /* sem internet ou servidor fora: "indisponível", sem quebrar a tela */
    }
    setChave(chavePublica);

    let inscrito = false;
    try {
      const reg = await registro();
      const sub = await reg?.pushManager.getSubscription();
      inscrito = Boolean(sub);
      // Renova em silêncio quem já tem permissão e inscrição (não pede nada à pessoa).
      if (sub && disponivel && Notification.permission === "granted") void avisarServidor(sub);
    } catch {
      /* segue como não inscrito */
    }
    setEntrada({ ...base, servidorDisponivel: disponivel, inscrito });
  }, []);

  useEffect(() => {
    void ler();
  }, [ler]);

  const situacao = situacaoDoAviso(entrada);
  const texto = TEXTOS_DO_AVISO[situacao];

  async function ativar() {
    if (ocupado || !chave) return;
    setOcupado(true);
    setErro(null);
    try {
      // O pedido de permissão acontece AQUI, dentro do toque, e em nenhum outro lugar.
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setEntrada((e) => ({ ...e, permissao }));
        return;
      }
      const reg = await registro();
      if (!reg) throw new Error("sem-service-worker");
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaUint8Array(chave) as BufferSource }));
      if (!(await avisarServidor(sub))) {
        await sub.unsubscribe().catch(() => false);
        throw new Error("servidor");
      }
      setEntrada((e) => ({ ...e, permissao: "granted", inscrito: true }));
    } catch {
      setErro("Não foi possível ativar os avisos agora. Confira a internet e tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  async function desativar() {
    if (ocupado) return;
    setOcupado(true);
    setErro(null);
    try {
      const reg = await registro();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch(ENDERECO, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }), cache: "no-store" }).catch(() => null);
        await sub.unsubscribe();
      }
      setEntrada((e) => ({ ...e, inscrito: false }));
    } catch {
      setErro("Não foi possível desativar agora. Tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  const Icone = situacao === "ligado" ? BellRing : situacao === "desligado" || situacao === "verificando" ? Bell : BellOff;

  return (
    <div className="rounded-atd-balao bg-atd-pilula p-4" data-avisos-de-mensagem-nova="" data-situacao={situacao}>
      <div className="flex items-start gap-3">
        <Icone size={18} aria-hidden="true" className={`mt-0.5 shrink-0 ${situacao === "ligado" ? "text-atd-texto-ouro" : "text-atd-terciario"}`} />
        <div className="min-w-0 flex-1">
          <p className="text-corpo font-semibold text-tx">{texto.titulo}</p>
          <p className="mt-1 text-app-previa text-atd-previa">{texto.apoio}</p>
          {texto.botao === "ativar" && (
            <button type="button" onClick={ativar} disabled={ocupado || !chave} className="mt-3 inline-flex min-h-11 items-center justify-center rounded-atd-pilula bg-acao px-5 text-corpo font-bold text-acao-tx hover:bg-acao-hover active:opacity-90 disabled:opacity-60">
              {ocupado ? "Ativando…" : "Ativar avisos"}
            </button>
          )}
          {texto.botao === "desativar" && (
            <button type="button" onClick={desativar} disabled={ocupado} className="mt-3 inline-flex min-h-11 items-center justify-center rounded-atd-pilula bg-atd-pilula-2 px-5 text-corpo font-semibold text-tx hover:bg-atd-linha-hover active:opacity-90 disabled:opacity-60">
              {ocupado ? "Desativando…" : "Desativar avisos"}
            </button>
          )}
          {erro && (
            <p role="alert" className="mt-2 text-app-previa font-semibold text-urgente">
              {erro}
            </p>
          )}
        </div>
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        {situacao === "ligado" ? "Avisos ligados" : situacao === "desligado" ? "Avisos desligados" : ""}
      </div>
    </div>
  );
}
