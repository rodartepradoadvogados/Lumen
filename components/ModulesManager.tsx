import { Check, Minus } from "lucide-react";
import type { OfficeModules } from "@/lib/officeModules";

const MODULE_LABELS: { key: keyof OfficeModules; label: string; desc: string }[] = [
  { key: "financeiro", label: "Financeiro", desc: "Contas a pagar/receber, DRE, fluxo de caixa e livro caixa" },
  { key: "whatsapp", label: "WhatsApp", desc: "Conexão do número da Cloud API e recebimento de mensagens em Atendimento" },
  { key: "atendimento", label: "Atendimento (CRM)", desc: "Funil comercial, cadastro e triagem de atendimentos" },
  { key: "assessoria", label: "Assessoria Jurídica", desc: "Contratos de assessoria contínua, honorários e licitações" },
];

// Só leitura — módulo contratado não tem mais autosserviço aqui. Liga/desliga passou a ser
// exclusivo do Painel Mestre (lib/actions/painelMestre.ts:updateOfficePlanModules): a partir do
// momento em que módulo tem preço, deixar o próprio escritório-cliente se autoconceder um módulo
// pago sem o dono da Lúmen saber vira brecha de receita, não só uma questão de UX.
export default function ModulesManager({ modules }: { modules: OfficeModules }) {
  return (
    <div className="divide-y divide-regua">
      {MODULE_LABELS.map(({ key, label, desc }) => (
        <div key={key} className="flex items-center gap-3 px-5 py-3.5">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-tx">{label}</p>
            <p className="text-xs text-tx-2">{desc}</p>
          </div>
          {modules[key] ? (
            <span className="flex items-center gap-1 text-xs font-semibold text-concluido">
              <Check size={14} /> Contratado
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs font-semibold text-tx-3">
              <Minus size={14} /> Não contratado
            </span>
          )}
        </div>
      ))}
      <div className="px-5 py-3">
        <p className="text-[11px] text-tx-3">Para contratar ou cancelar um módulo, fale com a Lúmen.</p>
      </div>
    </div>
  );
}
