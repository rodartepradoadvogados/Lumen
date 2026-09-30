// ============================================================================
// O CARTÃO "Avisos de mensagem nova" (Mais): a decisão do estado, sem React nem navegador.
//
// Seis estados honestos, na ordem em que se testam:
//   verificando        ainda não olhou o aparelho (primeira pintura; não mostra botão)
//   instalar-no-iphone iPhone/iPad fora da tela inicial: o aviso só existe com o app instalado
//   nao-suportado      o navegador não tem notificação por push
//   indisponivel       o servidor não tem as chaves (fail-closed): "indisponível neste servidor"
//   bloqueado          a pessoa (ou o sistema) bloqueou notificações para este site: só ela desbloqueia
//   desligado          suportado e permitido (ou ainda não decidido), sem inscrição
//   ligado             permissão dada E aparelho inscrito
// A permissão NUNCA é pedida ao abrir a tela: só no toque em "Ativar" (`permissaoSoPorToque`).
// ============================================================================

export type SituacaoDoAviso = "verificando" | "instalar-no-iphone" | "nao-suportado" | "indisponivel" | "bloqueado" | "desligado" | "ligado";

export type EntradaDoAviso = {
  /** false até o efeito de montagem ler o navegador (o servidor não sabe nada dele). */
  lido: boolean;
  temServiceWorker: boolean;
  temPushManager: boolean;
  temNotification: boolean;
  ehIos: boolean;
  instalado: boolean;
  /** `Notification.permission`. */
  permissao: "default" | "granted" | "denied";
  /** O servidor respondeu que tem as chaves? `null` = ainda não respondeu; `false` = não tem ou falhou. */
  servidorDisponivel: boolean | null;
  /** Este aparelho tem uma inscrição de push do navegador agora. */
  inscrito: boolean;
};

export function situacaoDoAviso(e: EntradaDoAviso): SituacaoDoAviso {
  if (!e.lido) return "verificando";
  const suporta = e.temServiceWorker && e.temPushManager && e.temNotification;
  if (!suporta) return e.ehIos && !e.instalado ? "instalar-no-iphone" : "nao-suportado";
  if (e.permissao === "denied") return "bloqueado";
  if (e.servidorDisponivel === null) return "verificando";
  if (e.servidorDisponivel === false) return "indisponivel";
  return e.permissao === "granted" && e.inscrito ? "ligado" : "desligado";
}

export type TextoDoAviso = { titulo: string; apoio: string; botao: "ativar" | "desativar" | null };

/** As frases de cada estado. Honestas: dizem o que chega, por onde chega e o que NÃO vai no aviso. */
export const TEXTOS_DO_AVISO: Record<SituacaoDoAviso, TextoDoAviso> = {
  verificando: { titulo: "Avisos de mensagem nova", apoio: "Conferindo este aparelho…", botao: null },
  "instalar-no-iphone": {
    titulo: "Avisos de mensagem nova · instale o aplicativo",
    apoio: "No iPhone e no iPad o aviso só funciona com o aplicativo instalado na tela inicial: toque em Compartilhar e em Adicionar à Tela de Início, abra o Lúmen Atendimento por lá e volte a esta tela.",
    botao: null,
  },
  "nao-suportado": {
    titulo: "Avisos de mensagem nova · não suportado",
    apoio: "Este navegador não recebe avisos com o aplicativo fechado. Com ele aberto, o número de mensagens novas aparece no título da aba e no ícone.",
    botao: null,
  },
  indisponivel: {
    titulo: "Avisos de mensagem nova · indisponível neste servidor",
    apoio: "O aviso com o aplicativo fechado ainda não foi ativado para este escritório. Confira as Conversas; com o aplicativo aberto o número de mensagens novas continua aparecendo.",
    botao: null,
  },
  bloqueado: {
    titulo: "Avisos de mensagem nova · bloqueados",
    apoio: "As notificações estão bloqueadas para o Lúmen neste aparelho. Para ligar, libere as notificações nas configurações do navegador ou do aplicativo instalado e volte aqui.",
    botao: null,
  },
  desligado: {
    titulo: "Avisos de mensagem nova · desligados",
    apoio: "Ative para ser avisado quando um cliente escrever, mesmo com o aplicativo fechado. O aviso passa pelo serviço de notificação do Google ou da Apple e diz apenas que há mensagem nova: nunca leva o nome do cliente nem o texto. Você só é avisado das conversas que pode abrir.",
    botao: "ativar",
  },
  ligado: {
    titulo: "Avisos de mensagem nova · ligados",
    apoio: "Este aparelho será avisado quando um cliente escrever numa conversa sua. O aviso diz só que há mensagem nova, sem nome nem texto, e some ao tocar. Ao sair do aplicativo este aparelho deixa de ser avisado.",
    botao: "desativar",
  },
};

/** A regra de ouro do pedido de permissão: só por toque. Nada que rode ao montar a tela pode chamá-lo. */
export const permissaoSoPorToque = true;

/** A chave pública VAPID (base64url) no formato que `pushManager.subscribe` pede. */
export function chaveParaUint8Array(base64url: string): Uint8Array {
  const preenchida = base64url + "=".repeat((4 - (base64url.length % 4)) % 4);
  const b64 = preenchida.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const saida = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) saida[i] = bin.charCodeAt(i);
  return saida;
}

export function ehAparelhoIos(userAgent: string, maxTouchPoints: number, plataforma: string): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (plataforma === "MacIntel" && maxTouchPoints > 1);
}
