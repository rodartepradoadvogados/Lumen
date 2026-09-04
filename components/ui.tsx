import clsx from "clsx";
import { ButtonHTMLAttributes, ReactNode } from "react";
import { Check } from "lucide-react";

// Botões do redesenho Modernist (design_handoff_lumen_redesign/01-tokens-e-tema.md, seção
// "Botões"): primário usa a cor de AÇÃO (--acao/--acao-tx — nunca marca, nunca vinho fora da
// confirmação destrutiva). Secundário é contorno em 2px --regua-forte, fundo transparente.
// Altura 32px, raio zero (a escala inteira do Tailwind já resolve a 0, ver tailwind.config.ts),
// peso 600, rótulo alinhado à ESQUERDA (nunca centralizado — "Proibido" #8 do documento 01;
// `justify-start` em vez de `justify-center`, mesmo num botão mais largo que o rótulo). Novos
// botões devem consumir estes dois em vez de montar classes soltas; os botões existentes
// espalhados pelos formulários/modais do portal ainda não foram migrados para cá (ver checklist).
export function ButtonPrimary({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-start gap-1.5 h-8 bg-acao hover:bg-acao-hover text-acao-tx font-semibold text-sm px-4 rounded-md transition-colors disabled:opacity-60 disabled:cursor-default",
        className
      )}
      {...props}
    />
  );
}
export function ButtonSecondary({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-start gap-1.5 h-8 border-2 border-regua-forte bg-transparent hover:bg-acao-bg text-tx font-semibold text-sm px-4 rounded-md transition-colors disabled:opacity-60 disabled:cursor-default",
        className
      )}
      {...props}
    />
  );
}

// Faixa colorida opcional (Início do app mobile, setembro/2026 — proposta C aprovada em
// artefato de design): troca só a cor do filete de topo do Card, por categoria. Sem `accent`,
// comportamento idêntico ao de sempre (neutro, --regua-forte) — todo card do resto do produto
// continua igual. Mapa fechado (em vez de aceitar qualquer classe Tailwind arbitrária) porque o
// compilador do Tailwind só gera CSS para classe que aparece LITERAL no código-fonte.
export type CardAccent = "vinho" | "azul" | "verde" | "aviso" | "ouro";
const ACCENT_BORDER: Record<CardAccent, string> = {
  vinho: "border-acao",
  azul: "border-fonte-pje",
  verde: "border-concluido",
  aviso: "border-aviso",
  ouro: "border-ouro-acento",
};

export function Card({ children, className, accent }: { children: ReactNode; className?: string; accent?: CardAccent }) {
  return (
    // Régua faz o trabalho da sombra (documento 01 do redesenho Modernist,
    // "01-tokens-e-tema.md"): em vez de borda de 1px nas quatro arestas, filete de 2px só no
    // topo, em --regua-forte (ou na cor de `accent`, ver acima). Sem sombra em cartão parado.
    // Raio (ajuste de tema, agosto/2026): rounded-lg (10px, tier de "cartões" da nova escala —
    // ver tailwind.config.ts).
    <div className={clsx("bg-sf border-t-2 rounded-lg", accent ? ACCENT_BORDER[accent] : "border-regua-forte", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    // Cabeçalho de cartão conta como "abre estrutura" (documento 01: "2px --regua-forte separa
    // seções... cabeçalho de tabela, topo de coluna"), não como item de lista — por isso 2px,
    // não 1px.
    <div className="flex items-center justify-between px-5 py-4 border-b-2 border-regua-forte">
      <div>
        <h3 className="font-semibold text-tx text-base">{title}</h3>
        {subtitle && <p className="text-xs text-tx-2 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// Nota: os tokens `sf`/`tx`/`acao`/`marca`/`urgente`/`aviso`/`concluido` (app/globals.css) trocam
// de valor sozinhos com a classe `dark` no <html> — não precisam de variante `dark:` própria no
// componente, ao contrário do legado `navy-*`/`gold-*`/`bordo-*` que este arquivo usava antes.
const badgeColors: Record<string, string> = {
  // Neutro — Tarefa, prioridade Baixa, status Cancelado (ver DESIGN-SYSTEM.md §7 e §10).
  slate: "bg-sf-apoio text-tx-2",
  // Neutro mais forte — rótulo de categoria/origem sem carga de status (área de template, canal
  // de atendimento, fonte legada de publicação etc.), onde "slate" ficaria fraco demais.
  navy: "bg-sf-apoio text-tx",
  // Ação — Evento, prioridade Média.
  blue: "bg-acao-bg text-acao",
  // Marca — só a Audiência foge à regra "ouro nunca fora da marca" (§7, nota da exceção).
  gold: "bg-marca-bg text-marca-tx",
  // Aviso — Perícia, prioridade Alta, status Pendente/Parcial (dado que precisa de atenção, mas
  // ainda não estourou).
  amber: "bg-aviso-bg text-aviso",
  // Urgente — Prazo, prioridade Urgente, status Atrasado. É DADO (algo venceu), não ação
  // destrutiva — não confundir com "bordo" abaixo. Ver DESIGN-SYSTEM.md §2.
  red: "bg-urgente-bg text-urgente",
  // Vinho da marca — ação destrutiva e usos pontuais de contagem/identificação manual (ex.:
  // fonte MANUAL em publicações, DESIGN-SYSTEM.md §9). Sem token `-bg` pronto pra `--vinho`
  // (só existe para acao/marca/urgente/aviso/concluido em globals.css), por isso o modificador
  // de opacidade do Tailwind (suportado por color-mix desde a 3.4) em vez de um novo `bg-bordo-*`.
  bordo: "bg-atencao/10 dark:bg-atencao/15 text-atencao",
  // Concluído — Pago, tarefa concluída.
  green: "bg-concluido-bg text-concluido",
  // Neutro "apagado" — só o status financeiro Cancelado (DESIGN-SYSTEM.md §10: fundo --sf-apoio,
  // texto --tx-3, um tom mais fraco que o "slate" de §7, que é --tx-2). Duas entradas parecidas
  // de propósito: são tabelas diferentes do manual, com pesos de texto diferentes.
  muted: "bg-sf-apoio text-tx-3",
};

export function Badge({ children, color = "slate", className }: { children: ReactNode; color?: keyof typeof badgeColors; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap", badgeColors[color], className)}>
      {children}
    </span>
  );
}

// Chip de conclusão — "prazo cumprido", "audiência realizada", "conta paga/recebida": reaproveita
// --concluido/--concluido-bg (o mesmo verde já usado no Badge "green" acima) num formato mais
// celebrativo que um Badge comum, para o desfecho positivo se destacar numa lista em vez de virar
// só mais uma pílula cinza. Não é uma tela nova — é este componente espalhado onde fizer sentido
// (tarefa/compromisso concluído, conta paga/recebida). "Meta batida" ficou de fora de propósito:
// o Lúmen ainda não tem uma feature de metas.
export function ConclusionChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[11px] font-semibold whitespace-nowrap bg-concluido-bg text-concluido",
        className
      )}
    >
      <Check size={11} strokeWidth={3} className="shrink-0" />
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "navy",
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "navy" | "gold" | "red" | "green";
  icon?: ReactNode;
}) {
  // "red" contas a pagar e prazos atrasados: é urgência de DADO (algo vencido), por isso mapeia
  // pro token `urgente`, não pro vinho da marca — mesma distinção do badgeColors acima.
  const toneMap = {
    navy: "text-tx",
    gold: "text-marca-tx",
    red: "text-urgente",
    green: "text-concluido",
  };
  const iconToneMap = {
    navy: "bg-sf-apoio text-tx",
    gold: "bg-marca-bg text-marca-tx",
    red: "bg-urgente-bg text-urgente",
    green: "bg-concluido-bg text-concluido",
  };
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-tx-2 uppercase tracking-wide">{label}</p>
          <p className={clsx("text-2xl font-sans font-extrabold mt-1", toneMap[tone])}>{value}</p>
          {hint && <p className="text-xs text-tx-3 mt-1">{hint}</p>}
        </div>
        {icon && <div className={clsx("h-10 w-10 shrink-0 rounded-full flex items-center justify-center", iconToneMap[tone])}>{icon}</div>}
      </div>
    </Card>
  );
}

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="text-center py-12 text-tx-3">
      <p className="font-medium">{title}</p>
      {subtitle && <p className="text-sm mt-1">{subtitle}</p>}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
      <div>
        <h1 className="text-2xl font-bold text-tx">{title}</h1>
        {subtitle && <p className="text-sm text-tx-2 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function formatCurrency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDate(d: Date | string) {
  const date = new Date(d);
  return date.toLocaleDateString("pt-BR");
}

// Para datas-calendário puras (Task.dueDate/safetyDueDate, vencimento de conta, prazo final...):
// esses campos nascem de um <input type="date"> e são gravados como meia-noite UTC (a data em
// si, sem hora — mesma convenção documentada em computeSafetyDueDate, lib/actions/tasks.ts).
// formatDate() usa o fuso LOCAL do navegador pra formatar, o que em Brasília (UTC-3) lê essa
// meia-noite UTC como 21h do dia anterior — mostrando um dia a menos. formatCalendarDate() força
// a leitura em UTC, batendo com a data que foi digitada. Não usar para timestamps de verdade
// (createdAt, paidAt...), onde o horário local em que a coisa aconteceu importa de verdade.
export function formatCalendarDate(d: Date | string) {
  const date = new Date(d);
  return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export const taskTypeLabels: Record<string, string> = {
  TAREFA: "Tarefa",
  EVENTO: "Evento",
  AUDIENCIA: "Audiência",
  PERICIA: "Perícia",
  PRAZO: "Prazo",
};

// Rótulo do ConclusionChip (acima) para uma tarefa/compromisso concluído — "Audiência realizada"
// só para o tipo Audiência, "Prazo cumprido" para todos os outros tipos (Tarefa, Evento, Perícia,
// Prazo propriamente dito).
export function taskConclusionLabel(type: string): string {
  return type === "AUDIENCIA" ? "Audiência realizada" : "Prazo cumprido";
}

// Ver DESIGN-SYSTEM.md §7 — a cor de cada tipo de tarefa aparece em três formas (bolinha de
// legenda, chip e filete de 3px no Kanban/calendário), sempre a partir deste mapa.
export const taskTypeColors: Record<string, keyof typeof badgeColors> = {
  TAREFA: "slate",
  EVENTO: "blue",
  AUDIENCIA: "gold",
  PERICIA: "amber",
  PRAZO: "red",
};

// Ver DESIGN-SYSTEM.md §7, tabela de Prioridade.
export const priorityColors: Record<string, keyof typeof badgeColors> = {
  BAIXA: "slate",
  MEDIA: "blue",
  ALTA: "amber",
  URGENTE: "red",
};

// Status financeiro (DESIGN-SYSTEM.md §10 — PayablesList, ReceivablesList, honorários). Helper
// reutilizável: outras áreas ainda mostram o enum cru em caixa alta (ATRASADO, PENDENTE); a
// migração por página passa a chamar financeStatusLabel()/financeStatusColors[status] em vez de
// montar o rótulo na mão. lib/financeStatus.tsx já tem um helper equivalente (criado antes deste
// existir aqui, com a mesma tabela) — o comentário de lá já previa a troca para este quando
// aparecesse; ver relato final desta tarefa.
export const financeStatusLabels: Record<string, string> = {
  PENDENTE: "Pendente",
  PAGO: "Pago",
  ATRASADO: "Atrasado",
  PARCIAL: "Parcial",
  CANCELADO: "Cancelado",
  // Fora da tabela do §10 — status exclusivo de parcela de honorário "a apurar no desfecho do
  // processo" (Receivable.status, ver lib/financeQuery.ts). Sem cor própria no manual, por isso
  // cai no mesmo neutro "muted" do Cancelado abaixo.
  A_APURAR: "A apurar",
};

export const financeStatusColors: Record<string, keyof typeof badgeColors> = {
  PENDENTE: "amber",
  PAGO: "green",
  ATRASADO: "red",
  PARCIAL: "amber",
  CANCELADO: "muted",
  A_APURAR: "muted",
};

// Capitaliza um status financeiro para exibição (PENDENTE -> "Pendente"). Usa a tabela acima
// quando o valor é um dos cinco status conhecidos; para qualquer outro enum em caixa alta cai
// num fallback genérico (primeira letra maiúscula, resto minúsculo) em vez de devolver o valor
// cru — mesma regra, sem precisar listar todo enum do sistema aqui.
export function financeStatusLabel(status: string): string {
  return financeStatusLabels[status] ?? (status.charAt(0) + status.slice(1).toLowerCase());
}

// Fundo por urgência de data na Central de Alertas (compromissos/atividades/audiências/
// prazos/perícias/tarefas delegadas/pendências distribuídas — ver AlertItem/TodayItem.dueStatus
// em lib/alerts.ts): atrasado usa o token `urgente`, hoje usa o token `aviso` (âmbar) — os dois já
// com a opacidade certa embutida na variável (--urgente-bg/--aviso-bg); sem dueStatus (vincendo)
// não aplica nada, a linha continua como já era. Unificado com o filete de urgência de
// lib/dueStatus.ts (proposta "Movimento & Prazos", setembro/2026) — antes "hoje" usava `marca`
// (bordô) aqui, mas âmbar em todo o resto do produto (Kanban/Agenda/mobile via PRAZO_URGENCIA_*);
// dois "hoje" de cor diferente na mesma tela diluíam exatamente a clareza que a proposta busca —
// ver apartado, item 2 ("um único estado de atenção contínua").
const dueStatusBg: Record<"atrasado" | "hoje", string> = {
  atrasado: "bg-urgente-bg",
  hoje: "bg-aviso-bg",
};

export function dueStatusClassName(dueStatus?: "atrasado" | "hoje"): string {
  return dueStatus ? dueStatusBg[dueStatus] : "";
}

// Pulso de atenção (Movimento 6, proposta "Movimento & Prazos") — reservado só a "atrasado" na
// Central de Alertas, igual ao resto do produto (KanbanBoard/AgendaView/DayQueueRow/etc.): um
// único "acende e assenta" ao entrar como vencido, nunca em "hoje" (esse é aviso, não urgência).
export function dueStatusPulseClassName(dueStatus?: "atrasado" | "hoje"): string {
  return dueStatus === "atrasado" ? "animate-attention-pulse" : "";
}
