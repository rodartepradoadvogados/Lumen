"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { excluirRespostaRapida, salvarRespostaRapida } from "@/lib/actions/respostasRapidas";
import { LIMITE_DO_TEXTO_RAPIDO, LIMITE_DO_TITULO, ordenarRespostas, type RespostaRapidaDaTela } from "@/lib/respostasRapidas";

// CRIAR, EDITAR E EXCLUIR RESPOSTAS RÁPIDAS (PR 10). Um formulário só serve aos dois (novo e edição). Excluir pede
// confirmação escrita no próprio cartão. Erros do servidor aparecem no lugar (`role="alert"`). A lista local
// acompanha o que o servidor devolveu; quem não pode mexer não vê Editar nem Excluir (e o servidor recusa de novo).

const CAMPO = "min-h-11 w-full rounded-[2px] border border-atd-campo bg-sf px-3 py-2 text-corpo text-tx placeholder:text-tx-3 disabled:opacity-60";
const PRIMARIO = "inline-flex min-h-11 items-center justify-center gap-2 rounded-[2px] bg-acao px-4 text-corpo font-semibold text-acao-tx hover:bg-acao-hover disabled:opacity-60";
const SECUNDARIO = "inline-flex min-h-11 items-center justify-center gap-2 rounded-[2px] border border-regua-forte bg-sf px-4 text-corpo font-semibold text-tx hover:bg-sf-apoio disabled:opacity-60";

type Edicao = { id?: string; titulo: string; texto: string };

export default function ManterRespostasRapidas({ inicial }: { inicial: RespostaRapidaDaTela[] }) {
  const [itens, setItens] = useState(inicial);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");

  async function salvar() {
    if (!edicao || ocupado) return;
    setOcupado(true);
    setErro(null);
    try {
      const r = await salvarRespostaRapida(edicao);
      if (r.erro !== undefined) return setErro(r.erro);
      setItens((atuais) => ordenarRespostas([...atuais.filter((i) => i.id !== r.item.id), r.item]));
      setAviso(edicao.id ? "Resposta atualizada." : "Resposta criada.");
      setEdicao(null);
    } catch {
      setErro("Não foi possível salvar. Confira a internet e tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  async function excluir(id: string) {
    if (ocupado) return;
    setOcupado(true);
    setErro(null);
    try {
      const r = await excluirRespostaRapida(id);
      if (r.erro) return setErro(r.erro);
      setItens((atuais) => atuais.filter((i) => i.id !== id));
      setAviso("Resposta excluída.");
      setExcluindo(null);
    } catch {
      setErro("Não foi possível excluir. Tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-3">
      {!edicao && (
        <button type="button" onClick={() => { setErro(null); setEdicao({ titulo: "", texto: "" }); }} className={PRIMARIO}>
          <Plus size={16} aria-hidden="true" /> Nova resposta
        </button>
      )}

      {edicao && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void salvar();
          }}
          className="space-y-2 rounded-[2px] border border-regua-forte bg-sf p-3"
          aria-label={edicao.id ? "Editar resposta rápida" : "Nova resposta rápida"}
        >
          <div>
            <label htmlFor="rr-titulo" className="block text-etiqueta font-semibold text-tx-2">
              Título (só para achar a resposta)
            </label>
            <input id="rr-titulo" value={edicao.titulo} maxLength={LIMITE_DO_TITULO} onChange={(e) => setEdicao({ ...edicao, titulo: e.target.value })} className={CAMPO} autoFocus />
          </div>
          <div>
            <label htmlFor="rr-texto" className="block text-etiqueta font-semibold text-tx-2">
              Texto que vai para o campo de mensagem
            </label>
            <textarea id="rr-texto" value={edicao.texto} maxLength={LIMITE_DO_TEXTO_RAPIDO} rows={5} onChange={(e) => setEdicao({ ...edicao, texto: e.target.value })} className={`${CAMPO} resize-y`} />
            <p className="text-etiqueta text-tx-2">
              {edicao.texto.length} de {LIMITE_DO_TEXTO_RAPIDO} caracteres
            </p>
          </div>
          {erro && (
            <p role="alert" className="text-corpo font-medium text-urgente">
              {erro}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={ocupado} className={PRIMARIO}>
              {ocupado ? "Salvando…" : "Salvar"}
            </button>
            <button type="button" onClick={() => { setEdicao(null); setErro(null); }} disabled={ocupado} className={SECUNDARIO}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {!edicao && erro && (
        <p role="alert" className="text-corpo font-medium text-urgente">
          {erro}
        </p>
      )}

      {itens.length === 0 ? (
        <p className="text-corpo text-tx-2">Nenhuma resposta rápida ainda. Crie a primeira: por exemplo, a mensagem de boas-vindas ou o pedido dos documentos.</p>
      ) : (
        <ul className="space-y-2">
          {itens.map((i) => (
            <li key={i.id} className="rounded-[2px] border border-regua bg-sf p-3">
              <p className="text-corpo font-semibold text-tx">{i.titulo}</p>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-corpo text-tx-2 [overflow-wrap:anywhere]">{i.texto}</p>
              {i.podeEditar &&
                (excluindo === i.id ? (
                  <div className="mt-2 space-y-2">
                    <p className="text-corpo font-medium text-tx">Excluir “{i.titulo}” para todo o escritório?</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => void excluir(i.id)} disabled={ocupado} className="inline-flex min-h-11 items-center gap-2 rounded-[2px] border-2 border-urgente bg-sf px-4 text-corpo font-semibold text-urgente disabled:opacity-60">
                        <Trash2 size={15} aria-hidden="true" /> Excluir
                      </button>
                      <button type="button" onClick={() => setExcluindo(null)} disabled={ocupado} className={SECUNDARIO}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" onClick={() => { setErro(null); setEdicao({ id: i.id, titulo: i.titulo, texto: i.texto }); }} aria-label={`Editar ${i.titulo}`} className={SECUNDARIO}>
                      <Pencil size={15} aria-hidden="true" /> Editar
                    </button>
                    <button type="button" onClick={() => setExcluindo(i.id)} aria-label={`Excluir ${i.titulo}`} className={SECUNDARIO}>
                      <Trash2 size={15} aria-hidden="true" /> Excluir
                    </button>
                  </div>
                ))}
            </li>
          ))}
        </ul>
      )}
      <div role="status" aria-live="polite" className="sr-only">
        {aviso}
      </div>
    </div>
  );
}
