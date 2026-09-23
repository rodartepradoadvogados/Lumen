import { getAlertsCount } from "@/lib/alerts";
import { getCurrentUser } from "@/lib/currentUser";
import { getCurrentSessionElapsedSeconds } from "@/lib/timesheet";
import TopBarActionsContent from "@/components/TopBarActionsContent";
import { recorteDosAlertasDeAtendimento } from "@/lib/acessoAtendimento";
import { podeAcessarAba } from "@/lib/peticionamentoAcesso";

// Cluster de ações (Peticionar/Novo/Timesheet/Painel Mestre/Alertas/avatar) renderizado direto
// dentro da faixa única de topo (components/TopBar.tsx) — busca seus próprios dados
// (getCurrentUser/getAlertsCount/sessão) em vez de receber por prop, pra TopBar.tsx não precisar
// buscar nada só pra repassar.
//
// O NÚMERO DO SINO — correção do retorno do dono de 2026-09-17: "a central de alertas, do PWA,
// está com o sino com 22 notificações, e o site está com 1. Inconsistência."
//
// Era verdade, e a causa era esta linha: o sino do site contava `getTodayItems().length` — só o
// que vence HOJE — enquanto o mesmo sino no PWA (app/m/layout.tsx) conta `getAlertsCount()`, a
// Central inteira. Dois sinos, o mesmo ícone, o mesmo destino (/alertas), dois números que não
// tinham como bater: o do site não era nem um subconjunto anunciado, era outra pergunta.
//
// Agora os dois chamam a MESMA função com os MESMOS quatro argumentos. A regra que fica: o
// número do sino é sempre a quantidade de linhas que a pessoa vai encontrar ao abrir /alertas —
// nunca um recorte diferente da tela que ele abre.
export default async function TopBarActions() {
  const user = await getCurrentUser();
  const hasFinanceAccess = Boolean(user?.isAdmin || user?.financeAccess);
  const alertsCount = user ? await getAlertsCount(user.officeId, hasFinanceAccess, user.id, user.isAdmin, recorteDosAlertasDeAtendimento(user, user.id), podeAcessarAba(user)) : 0;
  const initials = user
    ? user.name.split(" ").map((n) => n[0]).slice(0, 2).join("")
    : "??";
  const sessionSeconds = user ? await getCurrentSessionElapsedSeconds(user.id) : 0;

  // A faixa de topo (components/TopBar.tsx) já é bg-sf — não precisa mais da "ilha clara" que
  // existia quando o fundo dela era escuro fixo (ajuste de tema, agosto/2026).
  return <TopBarActionsContent user={user} initials={initials} alertsCount={alertsCount} sessionSeconds={sessionSeconds} />;
}
