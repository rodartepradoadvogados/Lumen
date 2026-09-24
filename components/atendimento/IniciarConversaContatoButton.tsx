"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCirclePlus, X } from "lucide-react";
import { iniciarConversaComContato } from "@/lib/actions/attendance";
import type { TipoDeContato } from "@/lib/quemEEsteNumero";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import { hrefDaConversa } from "@/lib/conversaDaCentral";

// ============================================================================
// "INICIAR CONVERSA" NA LINHA DE UM CONTATO JÁ CADASTRADO — F5.5, item 4.
//
// Versão enxuta de NovaConversaModal.tsx para as três listas de contato (Clientes, Advogados,
// Fornecedores): telefone e nome já são conhecidos (vêm do cadastro, buscados de novo no servidor
// por `iniciarConversaComContato` — nunca confiando no que esta linha já tem na tela), então o
// pop-up só pergunta a mensagem.
//
// SÓ APARECE QUANDO HÁ TELEFONE. Um contato sem telefone não tem para onde a mensagem ir — quem
// hospeda esta linha (a página de Clientes/Advogados/Fornecedores) decide isso, filtrando antes de
// renderizar o botão, e não este componente sozinho.
// ============================================================================

export default function IniciarConversaContatoButton({ tipo, contatoId, nome }: { tipo: TipoDeContato; contatoId: string; nome: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, comecar] = useTransition();

  useEscapeToClose(aberto, () => setAberto(false));

  function enviar() {
    if (!mensagem.trim()) return;
    setErro(null);
    comecar(async () => {
      const r = await iniciarConversaComContato(tipo, contatoId, mensagem);
      if (r.error) {
        setErro(r.error);
        return;
      }
      setAberto(false);
      if (r.id) {
        // "classico" — as três listas de contato moram fora da Central, então a conversa abre na
        // ficha de sempre (/atendimento/:id), não incrustada numa tela que a pessoa nem abriu.
        router.push(hrefDaConversa("classico", r.id));
      }
    });
  }

  return (
    <span className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setAberto(true)}
        title={`Iniciar conversa no WhatsApp com ${nome}`}
        data-tip="Iniciar conversa"
        className="p-1.5 text-tx-3 transition-colors hover:bg-sf-apoio hover:text-marca-tx rounded-md"
      >
        <MessageCirclePlus size={15} />
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-grafite-900/40 p-4" onClick={() => setAberto(false)}>
          <div className="w-full max-w-sm bg-sf shadow-pop" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-regua px-5 py-4">
              <h3 className="text-sm font-bold text-tx">Conversar com {nome} no WhatsApp</h3>
              <button onClick={() => setAberto(false)} className="text-tx-3 hover:text-tx">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3 p-4">
              <textarea
                autoFocus
                rows={3}
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                placeholder={`Escreva a primeira mensagem para ${nome.split(" ")[0]}…`}
                className="w-full resize-none border border-regua bg-sf px-3 py-2 text-sm text-tx focus:outline-none focus:ring-2 focus:ring-marca-tx"
              />
              <p className="text-xs text-tx-3">
                Se o WhatsApp deste escritório for o oficial (Meta) e esta pessoa nunca escreveu antes — ou não
                escreve há mais de 24 horas —, o próprio WhatsApp pode recusar o envio, exigindo um modelo aprovado.
                O erro, se acontecer, aparece aqui.
              </p>
              <button
                type="button"
                onClick={enviar}
                disabled={pendente || !mensagem.trim()}
                className="w-full bg-acao px-4 py-2 text-xs font-semibold text-acao-tx transition-colors hover:bg-acao-hover disabled:opacity-50"
              >
                {pendente ? "Enviando…" : "Enviar e abrir conversa"}
              </button>
              {erro && <p className="text-xs font-medium text-urgente">{erro}</p>}
            </div>
          </div>
        </div>
      )}
    </span>
  );
}
