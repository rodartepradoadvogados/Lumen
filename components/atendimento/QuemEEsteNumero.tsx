"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Briefcase, Scale, Truck, UserRound } from "lucide-react";
import {
  enderecoDoContato,
  ROTULO_DO_TIPO,
  TIPOS_PARA_CADASTRAR,
  telefoneLegivel,
  type ContatoConhecido,
  type TipoDeContato,
} from "@/lib/quemEEsteNumero";
import { cadastrarContatoDoAtendimento } from "@/lib/actions/contatoDoAtendimento";

// ============================================================================
// QUEM É ESTE NÚMERO — o bloco, nas duas telas.
//
// Três estados, e cada um diz uma coisa diferente:
//
//   CONHECIDO      o nome, o que ele é, e o nome é um link para a ficha. Quem vai responder já
//                  sabe com quem está falando antes de escrever a primeira frase.
//   DESCONHECIDO   o telefone e três botões. Um clique cria o cadastro com o nome e o telefone que
//                  a conversa já tem.
//   SEM TELEFONE   diz isso, e não oferece botão nenhum. Oferecer um cadastro que vai nascer sem
//                  telefone é oferecer trabalho jogado fora.
//
// O DESTAQUE DO ADVERSO É O ÚNICO GRITO DESTE BLOCO. Responder a um advogado adverso como se fosse
// lead, num processo em curso, não se desfaz — então essa é a única linha aqui que ganha cor.
// ============================================================================

const ICONE: Record<TipoDeContato, typeof UserRound> = {
  cliente: UserRound,
  advogado: Scale,
  fornecedor: Truck,
  equipe: Briefcase,
};

export default function QuemEEsteNumero({
  attendanceId,
  telefone,
  contato,
}: {
  attendanceId: string;
  telefone: string | null;
  contato: ContatoConhecido | null;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, comecar] = useTransition();

  function cadastrar(tipo: TipoDeContato) {
    setErro(null);
    comecar(async () => {
      const r = await cadastrarContatoDoAtendimento(attendanceId, tipo);
      if (r.error) setErro(r.error);
      else router.refresh();
    });
  }

  if (contato) {
    const Icone = ICONE[contato.tipo];
    const adverso = contato.tipo === "advogado" && (contato.detalhe || "").startsWith("Advogado adverso");
    return (
      <div className="flex items-start gap-2.5">
        <Icone size={16} className={`mt-0.5 shrink-0 ${adverso ? "text-urgente" : "text-tx-3"}`} />
        <div className="min-w-0">
          <Link href={enderecoDoContato(contato)} className="text-sm font-semibold text-marca-tx hover:underline break-words">
            {contato.nome}
          </Link>
          <p className={`text-xs mt-0.5 ${adverso ? "font-semibold text-urgente" : "text-tx-3"}`}>
            {contato.detalhe || ROTULO_DO_TIPO[contato.tipo]}
          </p>
          {telefone && <p className="text-xs text-tx-3 mt-0.5">{telefoneLegivel(telefone)}</p>}
        </div>
      </div>
    );
  }

  if (!telefone) {
    return <p className="text-xs text-tx-3">Este atendimento não tem telefone registrado.</p>;
  }

  return (
    <div>
      <p className="text-sm font-medium text-tx">{telefoneLegivel(telefone)}</p>
      <p className="text-xs text-tx-3 mt-0.5">Não está na agenda do escritório.</p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {TIPOS_PARA_CADASTRAR.map((tipo) => (
          <button
            key={tipo}
            type="button"
            disabled={pendente}
            onClick={() => cadastrar(tipo)}
            className="border border-regua bg-sf px-2.5 py-1.5 text-xs font-semibold text-tx-2 transition-colors hover:bg-sf-apoio hover:text-tx disabled:opacity-50"
          >
            + {ROTULO_DO_TIPO[tipo]}
          </button>
        ))}
      </div>
      {erro && <p className="mt-2 text-xs font-medium text-urgente">{erro}</p>}
    </div>
  );
}
