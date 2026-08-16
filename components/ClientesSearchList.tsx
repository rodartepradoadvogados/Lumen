"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Badge, EmptyState } from "@/components/ui";
import EditClientModal from "@/components/EditClientModal";
import DeleteButton from "@/components/DeleteButton";
import { deleteClient } from "@/lib/actions/contatos";

type ClientRow = {
  id: string;
  name: string;
  type: string;
  document: string | null;
  rg: string | null;
  nationality: string | null;
  maritalStatus: string | null;
  profession: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  _count: { cases: number };
};

// Remove acento pra "joao" achar "João" — mesmo padrão de normalização já usado em slugify
// (lib/actions/painelMestre.ts), aqui só pra comparação, sem virar slug.
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// Filtro em memória — a lista de clientes já vem inteira do servidor (ClientesPage), então
// filtrar aqui responde na hora, sem round-trip nem debounce. Fica pesado só se um escritório
// tiver dezenas de milhares de clientes, o que não é o caso hoje.
export default function ClientesSearchList({ clients }: { clients: ClientRow[] }) {
  const [busca, setBusca] = useState("");

  const filtrados = useMemo(() => {
    const termo = normalizar(busca.trim());
    if (!termo) return clients;
    return clients.filter((c) => {
      const alvo = normalizar([c.name, c.document ?? "", c.email ?? "", c.phone ?? ""].join(" "));
      return alvo.includes(termo);
    });
  }, [clients, busca]);

  return (
    <>
      <div className="relative p-4 border-b border-regua">
        <Search size={15} className="absolute left-7 top-1/2 -translate-y-1/2 text-tx-3" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, documento, e-mail ou telefone..."
          className="w-full text-sm border border-regua bg-sf text-tx rounded-lg pl-9 pr-3 py-2.5"
        />
      </div>

      {filtrados.length === 0 ? (
        <EmptyState
          title={busca ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
          subtitle={busca ? `Nada bate com "${busca}"` : undefined}
        />
      ) : (
        <div className="divide-y divide-regua">
          {filtrados.map((c) => (
            <div key={c.id} id={`client-${c.id}`} className="flex items-center gap-4 px-5 py-3.5 target:bg-acao-bg scroll-mt-20">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link href={`/contatos/clientes/${c.id}`} className="text-sm font-medium text-tx hover:text-acao hover:underline">
                    {c.name}
                  </Link>
                  <Badge color={c.type === "PJ" ? "navy" : "slate"}>{c.type}</Badge>
                </div>
                <p className="text-xs text-tx-3 mt-0.5">
                  {c.document && <span>{c.document} · </span>}
                  {c.email}
                  {c.phone && <span> · {c.phone}</span>}
                </p>
              </div>
              <span className="text-xs text-tx-3 shrink-0">{c._count.cases} processo(s)</span>
              <div className="shrink-0 flex items-center gap-1">
                <EditClientModal client={c} />
                <DeleteButton id={c.id} action={deleteClient} confirmMessage={`Excluir o cliente "${c.name}"?`} />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
