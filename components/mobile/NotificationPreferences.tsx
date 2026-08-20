"use client";

import { useEffect, useState } from "react";
import {
  getNotificationSettings,
  getPushPublicKey,
  savePushSubscription,
  deletePushSubscription,
  updateNotificationPrefs,
  type NotificationPrefs,
} from "@/lib/actions/push";
import { Bell, BellOff } from "lucide-react";

const TYPE_OPTIONS: { key: keyof NotificationPrefs; label: string }[] = [
  { key: "notifyAndamentos", label: "Andamentos processuais" },
  { key: "notifyPublicacoes", label: "Publicações" },
  { key: "notifyTarefasDelegadas", label: "Tarefas delegadas a mim" },
  { key: "notifyAgendaDia", label: "Agenda do dia" },
  { key: "notifyMencoes", label: "Quando alguém te mencionar em um comentário" },
];

// Converte a chave pública VAPID (base64url) pro formato Uint8Array exigido pelo
// PushManager.subscribe — conversão padrão recomendada pela documentação do Web Push.
function urlBase64ToUint8Array(base64String: string) {
  // Remove QUALQUER espaço/quebra de linha (não só nas pontas) e aspas — não só o valor
  // salvo na Vercel já vem saneado pelo servidor (ver lib/actions/push.ts), como fica essa
  // segunda camada aqui, já que é literalmente onde o atob() joga o erro se sobrar lixo.
  const sanitized = base64String.replace(/["'\s]/g, "");
  const padding = "=".repeat((4 - (sanitized.length % 4)) % 4);
  const base64 = (sanitized + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export default function NotificationPreferences() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [error, setError] = useState("");
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setSupported(false);
      setLoading(false);
      return;
    }
    (async () => {
      const settings = await getNotificationSettings();
      setPrefs(settings.prefs);
      // A fonte de verdade de "está inscrito" é o próprio navegador, não só o banco —
      // evita mostrar "ativado" quando o usuário limpou os dados do site/navegador.
      const registration = await navigator.serviceWorker.getRegistration();
      const sub = await registration?.pushManager.getSubscription();
      setSubscribed(Boolean(sub));
      setLoading(false);
    })();
  }, []);

  async function handleEnable() {
    setError("");
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError("Permissão de notificação negada. Ative nas configurações do navegador/celular.");
        setBusy(false);
        return;
      }
      const { publicKey, diagnostic } = await getPushPublicKey();
      if (!publicKey) {
        setError(diagnostic || "Notificações push ainda não configuradas no servidor.");
        setBusy(false);
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = subscription.toJSON();
      await savePushSubscription({ endpoint: json.endpoint!, keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth } });
      setSubscribed(true);
    } catch (e) {
      // Mostra o motivo real (nome do erro do navegador) em vez de um texto genérico — o
      // caso mais comum é "InvalidAccessError" quando a chave VAPID cadastrada na Vercel
      // tem espaço/quebra de linha a mais colada junto (já protegido no servidor, mas o
      // detalhe ajuda a diagnosticar de primeira se acontecer de novo ou por outro motivo).
      const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      setError(`Não foi possível ativar as notificações neste aparelho (${detail}).`);
    }
    setBusy(false);
  }

  async function handleDisable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const sub = await registration?.pushManager.getSubscription();
      if (sub) {
        await deletePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch {
      setError("Não foi possível desativar as notificações neste aparelho.");
    }
    setBusy(false);
  }

  function handleTogglePref(key: keyof NotificationPrefs) {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    updateNotificationPrefs({ [key]: next[key] });
  }

  if (loading) return null;

  if (!supported) {
    return (
      <p className="px-4 py-3 text-xs text-tx-2">
        Este navegador/aparelho não suporta notificações push. No iPhone, o app precisa estar instalado na tela de início (Compartilhar → Adicionar à Tela de Início) e o iOS precisa estar atualizado.
      </p>
    );
  }

  return (
    <div>
      <div className="px-4 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {subscribed ? <Bell size={16} className="text-marca-tx" /> : <BellOff size={16} className="text-tx-2" />}
          <div>
            <p className="text-sm font-medium text-tx">Notificações neste aparelho</p>
            <p className="text-xs text-tx-2">{subscribed ? "Ativadas" : "Desativadas"}</p>
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={subscribed ? handleDisable : handleEnable}
          className={`text-xs font-semibold px-3 py-1.5 transition-colors disabled:opacity-50 ${
            subscribed
              ? "bg-sf-apoio text-tx-2"
              : "bg-acao hover:bg-acao-hover text-acao-tx"
          }`}
        >
          {busy ? "Aguarde..." : subscribed ? "Desativar" : "Ativar"}
        </button>
      </div>

      {error && <p className="px-4 pb-2 text-xs font-semibold text-urgente">{error}</p>}

      {subscribed && prefs && (
        <div className="divide-y divide-regua border-t border-regua">
          {TYPE_OPTIONS.map((opt) => (
            <label key={opt.key} className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer">
              <span className="text-sm text-tx-2">{opt.label}</span>
              <input
                type="checkbox"
                checked={prefs[opt.key]}
                onChange={() => handleTogglePref(opt.key)}
                className="h-4 w-4 accent-acao cursor-pointer"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
