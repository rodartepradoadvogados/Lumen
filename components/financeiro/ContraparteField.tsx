"use client";

import { useState } from "react";
import EntityPicker from "@/components/EntityPicker";
import { createSupplierQuick } from "@/lib/actions/suppliers";

type Option = { id: string; name: string };

// Campo "Pago a" das Contas a Pagar — toggle Fornecedor / Membro da equipe / Cliente. Existe
// porque pagar honorário de advogado contratado/estagiário/funcionário não é a mesma coisa que
// pagar um Fornecedor externo: o usuário não deveria precisar cadastrar um colega como
// "Fornecedor" só para lançar a despesa (pedido explícito), e misturar os dois na mesma lista
// atrapalharia relatórios futuros de folha de pagamento. Cliente entrou depois (outro pedido
// explícito) para o caso de repasse de valor de condenação ao cliente ou devolução de
// adiantamento — sem essa opção, o usuário tinha que cadastrar o próprio cliente como
// "Fornecedor" pra registrar esse pagamento. Os três campos (supplierId/payeeUserId/
// payeeClientId) são mutuamente exclusivos — só o EntityPicker do modo ativo fica montado no
// DOM, então o form só envia UM dos três nomes (os outros nem aparecem em formData.get(...)),
// ver createPayable/updatePayable em lib/actions/financeiro.ts (payeeUserId vence sobre
// payeeClientId, que vence sobre supplierId, lá também — defesa em profundidade caso mais de um
// chegue preenchido por algum motivo).
export default function ContraparteField({
  suppliers,
  teamMembers,
  clients,
  defaultSupplierId,
  defaultPayeeUserId,
  defaultPayeeClientId,
}: {
  suppliers: Option[];
  teamMembers: Option[];
  clients?: Option[];
  defaultSupplierId?: string | null;
  defaultPayeeUserId?: string | null;
  defaultPayeeClientId?: string | null;
}) {
  const [mode, setMode] = useState<"FORNECEDOR" | "EQUIPE" | "CLIENTE">(
    defaultPayeeUserId ? "EQUIPE" : defaultPayeeClientId ? "CLIENTE" : "FORNECEDOR"
  );

  return (
    <div>
      <label className="text-xs font-medium text-tx-2">Pago a</label>
      <div className="mt-1 mb-1.5 flex gap-1.5 flex-wrap">
        <button
          type="button"
          onClick={() => setMode("FORNECEDOR")}
          className={`text-xs font-semibold px-2.5 py-1 border transition-colors ${
            mode === "FORNECEDOR"
              ? "bg-acao text-acao-tx border-acao"
              : "bg-sf text-tx-2 border-regua-forte hover:bg-sf-apoio"
          }`}
        >
          Fornecedor
        </button>
        <button
          type="button"
          onClick={() => setMode("EQUIPE")}
          className={`text-xs font-semibold px-2.5 py-1 border transition-colors ${
            mode === "EQUIPE"
              ? "bg-acao text-acao-tx border-acao"
              : "bg-sf text-tx-2 border-regua-forte hover:bg-sf-apoio"
          }`}
        >
          Membro da equipe
        </button>
        {clients && (
          <button
            type="button"
            onClick={() => setMode("CLIENTE")}
            className={`text-xs font-semibold px-2.5 py-1 border transition-colors ${
              mode === "CLIENTE"
                ? "bg-acao text-acao-tx border-acao"
                : "bg-sf text-tx-2 border-regua-forte hover:bg-sf-apoio"
            }`}
          >
            Cliente
          </button>
        )}
      </div>
      {mode === "FORNECEDOR" && (
        <EntityPicker
          name="supplierId"
          title="Fornecedor"
          options={suppliers}
          defaultValue={defaultSupplierId ?? undefined}
          placeholder="Buscar fornecedor..."
          emptyLabel="Nenhum"
          addLabel="Cadastrar novo fornecedor"
          onQuickAdd={createSupplierQuick}
        />
      )}
      {mode === "EQUIPE" && (
        <EntityPicker
          name="payeeUserId"
          title="Membro da equipe"
          options={teamMembers}
          defaultValue={defaultPayeeUserId ?? undefined}
          placeholder="Buscar advogado, estagiário, funcionário..."
          emptyLabel="Nenhum"
        />
      )}
      {mode === "CLIENTE" && (
        <EntityPicker
          name="payeeClientId"
          title="Cliente"
          options={clients ?? []}
          defaultValue={defaultPayeeClientId ?? undefined}
          placeholder="Buscar cliente..."
          emptyLabel="Nenhum"
        />
      )}
    </div>
  );
}
