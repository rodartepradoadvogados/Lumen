import {
  AlertTriangle, Wallet, AtSign, CalendarClock, Gavel, PhoneCall, UserPlus,
  FolderSync, ClipboardList, AlarmClock, Bell, type LucideIcon,
} from "lucide-react";
import type { AlertItem } from "@/lib/alerts";

// FONTE ÚNICA do rótulo e do ícone de cada tipo de alerta.
//
// Existiam DUAS cópias deste mapa — uma em app/(app)/alertas/page.tsx e outra em
// app/m/alertas/page.tsx — e as duas telas faziam `kindMeta[a.kind].icon` sem guarda. Quando um
// tipo novo nasceu (DELEGACAO_SEM_CIENCIA, 2026-09-16), só uma cópia foi atualizada: a outra
// recebia `undefined` e a tela inteira quebrava com "Cannot read properties of undefined".
//
// Duas travas agora: o Record é tipado por AlertItem["kind"], então esquecer um tipo é erro de
// compilação; e `metaDoAlerta` nunca devolve undefined, então nem um dado inesperado vindo do
// banco derruba a tela.
export const ALERT_KIND_META: Record<AlertItem["kind"], { label: string; icon: LucideIcon }> = {
  PRAZO_VENCIDO: { label: "Prazo Vencido", icon: AlertTriangle },
  CONTA_PAGAR_VENCIDA: { label: "Conta a Pagar Vencida", icon: Wallet },
  CONTA_RECEBER_VENCIDA: { label: "Conta a Receber Vencida", icon: Wallet },
  MENCAO: { label: "Menção", icon: AtSign },
  PARCELA_SEM_VENCIMENTO: { label: "Parcela Sem Vencimento", icon: CalendarClock },
  FOLLOWUP_ATRASADO: { label: "Follow-up Atrasado", icon: PhoneCall },
  TAREFA_DELEGADA: { label: "Tarefa Delegada", icon: UserPlus },
  DELEGACAO_SEM_CIENCIA: { label: "Delegação sem ciência", icon: UserPlus },
  DRIVE_INCONSISTENCIA: { label: "Inconsistência no Drive", icon: FolderSync },
  HONORARIO_APURAR_DECISAO: { label: "Honorário a Apurar — Decisão", icon: Gavel },
  HONORARIO_APURAR_PARADO: { label: "Honorário a Apurar — Parado", icon: Gavel },
  PENDENCIA_ATENDIMENTO_VENCIDA: { label: "Pendência do Atendimento", icon: ClipboardList },
  RESPOSTA_PRAZO_ESTOURADO: { label: "Prazo de Resposta Estourado", icon: AlarmClock },
};

const PADRAO = { label: "Alerta", icon: Bell } as const;

export function metaDoAlerta(kind: string): { label: string; icon: LucideIcon } {
  return ALERT_KIND_META[kind as AlertItem["kind"]] ?? PADRAO;
}

// Alertas que são de UMA PESSOA, não do escritório. Tudo o mais que a Central mostra vale para
// quem quer que abra a tela — inclusive prazo vencido de colega.
export const ALERTAS_PESSOAIS: ReadonlySet<string> = new Set([
  "MENCAO",
  "TAREFA_DELEGADA",
  "DELEGACAO_SEM_CIENCIA",
]);
