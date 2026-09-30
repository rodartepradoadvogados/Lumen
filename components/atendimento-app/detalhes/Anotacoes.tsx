"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { createAnotacao, deleteAnotacao, updateAnotacao } from "@/lib/actions/anotacoes";
import { plainTextToHtml } from "@/lib/anotacoes";
import { anotacaoParaTexto, dataCurta } from "@/lib/detalhesDoAtendimento";
import { Campo, Gaveta, Vazio, cx, useRodar } from "./base";
import type { Anotacao, PropsDosDetalhes } from "./tipos";

// ANOTAÇÕES PESSOAIS: só do usuário (o servidor lê e grava por `authorId`, e o atendimento continua sob o
// recorte de acesso). Criar, editar (N20) e excluir, com "Desfazer" na exclusão e na edição. Diferente da nota
// interna do chat (que a equipe inteira vê): esta é só sua.
export default function Anotacoes({ p }: { p: PropsDosDetalhes }) {
  const { rodar, pendente } = useRodar();
  const [texto, setTexto] = useState("");
  const [dia, setDia] = useState(p.hoje);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<{ nota: Anotacao; texto: string; dia: string; formatada: boolean } | null>(null);
  const [erroDaEdicao, setErroDaEdicao] = useState<string | null>(null);

  async function salvar() {
    setErro(null);
    if (!texto.trim()) return setErro("Escreva a anotação.");
    const r = await rodar({
      fazer: async () => {
        const x = await createAnotacao({ linkType: "ATENDIMENTO", entityId: p.conversa.id, content: plainTextToHtml(texto), referenceDate: dia });
        return "error" in x ? { error: x.error } : {};
      },
      ok: "Anotação salva. Só você vê.",
    });
    if (r.ok) {
      setTexto("");
      setDia(p.hoje);
    } else setErro(r.error ?? null);
  }

  function excluir(n: Anotacao) {
    return rodar({
      fazer: () => deleteAnotacao(n.id),
      ok: "Anotação excluída.",
      desfazer: async () => {
        const x = await createAnotacao({ linkType: "ATENDIMENTO", entityId: p.conversa.id, content: n.content, referenceDate: n.referenceDay });
        return "error" in x ? { error: x.error } : {};
      },
    });
  }

  async function salvarEdicao() {
    if (!editando) return;
    setErroDaEdicao(null);
    if (!editando.texto.trim()) return setErroDaEdicao("A anotação não pode ficar vazia.");
    const { nota } = editando;
    const r = await rodar({
      fazer: () => updateAnotacao(nota.id, { content: plainTextToHtml(editando.texto), referenceDate: editando.dia }),
      ok: "Anotação atualizada.",
      desfazer: () => updateAnotacao(nota.id, { content: nota.content, referenceDate: nota.referenceDay }),
    });
    if (r.ok) setEditando(null);
    else setErroDaEdicao(r.error ?? null);
  }

  return (
    <div>
      {p.anotacoes.length === 0 ? (
        <Vazio>Nenhuma anotação sua neste atendimento.</Vazio>
      ) : (
        <ul>
          {p.anotacoes.map((n) => (
            <li key={n.id} className={`mb-2 p-3 ${cx.painel}`}>
              <p className="text-etiqueta text-atd-previa">Escrita em {dataCurta(n.referenceDay)} · só você vê</p>
              <div
                className="mt-0.5 break-words text-corpo text-tx [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1"
                // n.content é HTML já saneado por sanitizeAnotacaoHtml (lib/anotacoes.ts) no único ponto de escrita.
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: n.content }}
              />
              <div className="mt-1 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={cx.discreto}
                  onClick={() => {
                    const { texto: t, temFormatacao } = anotacaoParaTexto(n.content);
                    setErroDaEdicao(null);
                    setEditando({ nota: n, texto: t, dia: n.referenceDay, formatada: temFormatacao });
                  }}
                >
                  <Pencil size={16} aria-hidden="true" /> Editar
                </button>
                <button type="button" className={cx.discreto} disabled={pendente} onClick={() => excluir(n)} aria-label={`Excluir a anotação de ${dataCurta(n.referenceDay)}`}>
                  <Trash2 size={16} aria-hidden="true" /> Excluir
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        <Campo rotulo="Nova anotação" erro={erro} dica="Escreva para você mesmo. Não vai para o cliente nem para a equipe.">
          {({ id, descricao }) => <textarea id={id} aria-describedby={descricao} className={`${cx.campo} min-h-24`} rows={4} value={texto} maxLength={5000} onChange={(e) => setTexto(e.target.value)} />}
        </Campo>
        <div className="mt-2 flex items-end gap-2">
          <Campo rotulo="Escrita em" className="min-w-0 flex-1">
            {({ id }) => <input id={id} type="date" className={cx.campo} value={dia} onChange={(e) => setDia(e.target.value)} />}
          </Campo>
          <button type="button" className={cx.primario} disabled={pendente} onClick={salvar}>
            {pendente ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>

      <Gaveta
        aberta={editando !== null}
        aoFechar={() => setEditando(null)}
        titulo="Editar anotação"
        rodape={
          <>
            <button type="button" className={cx.secundario} onClick={() => setEditando(null)}>
              Cancelar
            </button>
            <button type="button" className={`${cx.primario} flex-1`} disabled={pendente} onClick={salvarEdicao}>
              {pendente ? "Salvando…" : "Salvar"}
            </button>
          </>
        }
      >
        {editando && (
          <div className="space-y-3">
            {editando.formatada && <p className={cx.dica}>Esta anotação tem formatação (negrito, lista…) feita no computador. Ao salvar por aqui ela vira texto simples.</p>}
            <Campo rotulo="Anotação" erro={erroDaEdicao}>
              {({ id, descricao }) => <textarea id={id} aria-describedby={descricao} className={`${cx.campo} min-h-40`} rows={7} value={editando.texto} maxLength={5000} onChange={(e) => setEditando({ ...editando, texto: e.target.value })} />}
            </Campo>
            <Campo rotulo="Escrita em">{({ id }) => <input id={id} type="date" className={cx.campo} value={editando.dia} onChange={(e) => setEditando({ ...editando, dia: e.target.value })} />}</Campo>
          </div>
        )}
      </Gaveta>
    </div>
  );
}
