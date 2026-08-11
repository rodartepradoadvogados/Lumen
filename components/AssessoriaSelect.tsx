"use client";

// `status` é opcional para não quebrar quem já chama este componente com a forma antiga
// {id, clientName} — mas quem monta a lista deveria sempre incluir a Assessoria de ORIGEM (a que
// veio na URL, ex.: "Novo processo" a partir da aba Pareceres/Processos e Casos de uma Assessoria)
// mesmo que ela não esteja ATIVA, para o bug abaixo não se repetir noutra tela.
type AssessoriaOption = { id: string; clientName: string; status?: string };

const STATUS_LABELS: Record<string, string> = { ATIVA: "Ativa", SUSPENSA: "Suspensa", ENCERRADA: "Encerrada" };

// Select simples para associar um novo Processo/Atendimento a uma Assessoria já cadastrada
// (contrato de assessoria continuada), importando o registro direto para o acompanhamento
// daquela assessoria. Opcional — deixado vazio, o registro não fica vinculado a nenhuma.
//
// BUG CORRIGIDO (Tarefa C, auditoria 2026-08): quem chama este componente costuma listar só
// assessorias ATIVAS (ex.: app/(app)/processos/novo/page.tsx) — o que faz sentido para "vincular
// uma assessoria nova", mas quebrava silenciosamente quando o formulário chegava com `defaultValue`
// preenchido (veio de uma Assessoria SUSPENSA/ENCERRADA, ex.: botão "Novo processo" na própria tela
// dela): a assessoria de origem não estava na lista filtrada, o componente inteiro sumia (`return
// null` abaixo), e ao salvar o processo saía SEM nenhum vínculo, sem nenhum aviso. Agora: (1) nunca
// retorna null quando há `defaultValue` — sempre existe algo vinculado para mostrar/preservar; (2)
// se `defaultValue` não estiver em `assessorias` (o cenário do bug), ainda assim entra como opção
// própria, com o rótulo genérico "Assessoria atual (verifique o nome)" — imperfeito, mas preserva o
// vínculo no submit, que é o dano real do bug. A correção completa depende de quem monta
// `assessorias` incluir a assessoria de origem MESMO fora de ATIVA (ver comentário acima do tipo).
export default function AssessoriaSelect({
  assessorias,
  inputClassName,
  defaultValue,
}: {
  assessorias: AssessoriaOption[];
  inputClassName: string;
  defaultValue?: string;
}) {
  if (assessorias.length === 0 && !defaultValue) return null;

  const hasDefaultOption = defaultValue && assessorias.some((a) => a.id === defaultValue);
  const options = hasDefaultOption || !defaultValue ? assessorias : [{ id: defaultValue, clientName: "Assessoria atual (verifique o nome)" }, ...assessorias];

  return (
    <div>
      <label className="text-xs font-medium text-tx-2">Assessoria (opcional)</label>
      <select name="assessoriaId" defaultValue={defaultValue || ""} className={inputClassName}>
        <option value="">Nenhuma — não vincular a uma assessoria</option>
        {options.map((a) => (
          <option key={a.id} value={a.id}>
            {a.clientName}
            {a.status && a.status !== "ATIVA" ? ` (${STATUS_LABELS[a.status] || a.status})` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
