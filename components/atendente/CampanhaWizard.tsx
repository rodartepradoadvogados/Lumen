"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, GripVertical, Plus, Trash2, X } from "lucide-react";
import { salvarCampanha, type DadosDaCampanha } from "@/lib/actions/campanhas";
import { MOTIVOS_DE_RECUSA_PRONTOS } from "@/lib/campanhas";

// ============================================================================
// O FORMULÁRIO DA CAMPANHA — sete etapas, uma de cada vez.
//
// POR QUE UMA DE CADA VEZ, e não uma página longa: são dezesseis campos, e quase todos exigem uma
// decisão de conteúdo ("o que a Ana diz ao transferir?"). Numa página só, quem preenche vê o
// tamanho da tarefa antes de começar e desiste; e quem não desiste preenche por cima, que é pior.
//
// A ETAPA 7 NÃO É ENFEITE. "Motivo de recusa" é o campo que impede a campanha de virar funil de
// lead desqualificado — que foi exatamente a preocupação do dono. Ele vem por último porque é o
// mais fácil de decidir depois de ter escrito o resto.
//
// SÓ A ETAPA 1 É OBRIGATÓRIA PARA SALVAR. Campanha nasce desligada; salvar pela metade e voltar
// amanhã é o uso normal, e um formulário que só aceita tudo de uma vez é um formulário que
// ninguém termina. Quem barra campanha incompleta é a ATIVAÇÃO, não a gravação.
// ============================================================================

const ETAPAS = [
  { n: 1, titulo: "Identificação", sub: "como você chama esta campanha" },
  { n: 2, titulo: "O gatilho", sub: "o que liga a conversa a ela" },
  { n: 3, titulo: "O objeto", sub: "do que ela trata" },
  { n: 4, titulo: "A conversa", sub: "o que a atendente pergunta" },
  { n: 5, titulo: "Os documentos", sub: "o que ela pede" },
  { n: 6, titulo: "O desfecho", sub: "como termina" },
  { n: 7, titulo: "Motivos de recusa", sub: "quando não seguir" },
];

const VAZIA: DadosDaCampanha = {
  nome: "",
  ativa: false,
  inicioEm: null,
  fimEm: null,
  sourceUrl: "",
  textoDoClique: "",
  rede: "INSTAGRAM",
  area: "",
  sobre: "",
  foraDoEscopo: "FORMULARIO",
  primeiraMensagem: "",
  tetoDeMensagens: 12,
  perguntas: [{ texto: "" }],
  documentos: [{ nome: "", paraQue: "", obrigatorio: false }],
  mensagemDeTransferencia: "",
  destino: "AUTOMATICO",
  motivosDeRecusa: [],
};

export default function CampanhaWizard({
  inicial,
  aoFechar,
}: {
  inicial?: DadosDaCampanha;
  aoFechar: () => void;
}) {
  const router = useRouter();
  const [etapa, setEtapa] = useState(1);
  const [d, setD] = useState<DadosDaCampanha>(inicial ?? VAZIA);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [arrastando, setArrastando] = useState<number | null>(null);

  function mudar<K extends keyof DadosDaCampanha>(campo: K, valor: DadosDaCampanha[K]) {
    setD((a) => ({ ...a, [campo]: valor }));
  }

  // Reordenar a lista movendo um item de uma posição para outra. A lista é a ordem das perguntas
  // na conversa, então arrastar é o gesto certo — digitar números seria pedir que a pessoa
  // traduza uma ordem que ela já enxerga.
  function mover(lista: "perguntas" | "documentos", de: number, para: number) {
    if (de === para) return;
    setD((a) => {
      const itens = [...a[lista]];
      const [item] = itens.splice(de, 1);
      itens.splice(para, 0, item);
      return { ...a, [lista]: itens } as DadosDaCampanha;
    });
  }

  async function salvar(eAtivar: boolean) {
    setErro(null);
    setSalvando(true);
    const r = await salvarCampanha({ ...d, ativa: eAtivar ? true : d.ativa });
    setSalvando(false);
    if (r.error) {
      setErro(r.error);
      return;
    }
    router.refresh();
    aoFechar();
  }

  // ESC FECHA, e a página atrás para de rolar enquanto isto está aberto.
  //
  // As duas coisas foram descobertas testando: o roteiro de teste conseguiu marcar um campo do
  // formulário que está ATRÁS do modal, porque ele continua no documento e continua alcançável.
  // Para quem usa o mouse isso é invisível; para quem navega por teclado, o Tab sai do formulário
  // e cai no que está embaixo — e a pessoa fica digitando num lugar que não vê.
  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.body.style.overflow = antes;
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aoFechar]);

  const ultima = etapa === ETAPAS.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-grafite-900/50 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={d.id ? "Editar campanha" : "Nova campanha"}
    >
      <div className="flex h-full w-full max-w-[720px] flex-col overflow-hidden border border-regua bg-sf sm:h-[90vh]">
        {/* Cabeçalho com a trilha das etapas. A trilha existe para a pessoa saber quanto falta —
            sem ela, um formulário de sete passos parece não ter fim. */}
        <div className="shrink-0 border-b border-regua px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-destaque font-semibold text-tx">
                {d.id ? "Editar campanha" : "Nova campanha"}
              </h2>
              <p className="mt-0.5 text-etiqueta text-tx-2">
                Etapa {etapa} de {ETAPAS.length} · {ETAPAS[etapa - 1].titulo} — {ETAPAS[etapa - 1].sub}
              </p>
            </div>
            <button
              type="button"
              onClick={aoFechar}
              aria-label="Fechar"
              className="shrink-0 rounded p-1.5 text-tx-2 hover:bg-sf-apoio"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mt-3 flex gap-1">
            {ETAPAS.map((e) => (
              <button
                key={e.n}
                type="button"
                onClick={() => setEtapa(e.n)}
                aria-label={`Ir para a etapa ${e.n}: ${e.titulo}`}
                aria-current={e.n === etapa ? "step" : undefined}
                className={`h-1.5 flex-1 transition-colors ${
                  e.n === etapa ? "bg-acao" : e.n < etapa ? "bg-guia-ativa" : "bg-regua"
                }`}
              />
            ))}
          </div>
        </div>

        {/* O deslize. `key={etapa}` refaz o nó a cada troca, que é o que dispara a animação; sem
            isso o React reaproveita o mesmo nó e nada se move. */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div key={etapa} className="animate-slide-in space-y-4">
            {etapa === 1 && (
              <>
                <Campo rotulo="Nome da campanha" dica="Só você vê. Ex.: “Setembro · plano de saúde · Instagram”.">
                  <input
                    className="cfg-input w-full"
                    value={d.nome}
                    onChange={(e) => mudar("nome", e.target.value)}
                    placeholder="Setembro · plano de saúde"
                  />
                </Campo>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Campo rotulo="Começa em" dica="Opcional. Em branco, vale desde já.">
                    <input
                      type="date"
                      className="cfg-input w-full"
                      value={d.inicioEm ?? ""}
                      onChange={(e) => mudar("inicioEm", e.target.value || null)}
                    />
                  </Campo>
                  <Campo rotulo="Termina em" dica="Opcional. Em branco, não expira.">
                    <input
                      type="date"
                      className="cfg-input w-full"
                      value={d.fimEm ?? ""}
                      onChange={(e) => mudar("fimEm", e.target.value || null)}
                    />
                  </Campo>
                </div>
              </>
            )}

            {etapa === 2 && (
              <>
                <p className="border border-regua bg-sf-apoio px-3 py-2 text-etiqueta leading-relaxed text-tx-2">
                  É por aqui que o Lúmen reconhece que a conversa veio deste anúncio. O <strong>link</strong> é o
                  identificador seguro; o <strong>texto</strong> é a reserva, para quando o link não chegar. Pode
                  preencher os dois — o link sempre vence.
                </p>
                <Campo rotulo="Link de origem do anúncio" dica="Cole o endereço que você usou no anúncio. Parâmetros de rastreio são ignorados na comparação.">
                  <input
                    className="cfg-input w-full"
                    value={d.sourceUrl}
                    onChange={(e) => mudar("sourceUrl", e.target.value)}
                    placeholder="https://seusite.com.br/plano-negou"
                  />
                </Campo>
                <Campo
                  rotulo="Texto que já vem escrito no clique"
                  dica="Exatamente como está no anúncio. Mínimo de 10 caracteres — um texto curto casaria com conversas que não são desta campanha."
                >
                  <input
                    className="cfg-input w-full"
                    value={d.textoDoClique}
                    onChange={(e) => mudar("textoDoClique", e.target.value)}
                    placeholder="Olá, vi o anúncio sobre negativa de plano de saúde"
                  />
                </Campo>
                <Campo rotulo="Rede" dica="Só para você se orientar depois.">
                  <select className="cfg-input w-full" value={d.rede} onChange={(e) => mudar("rede", e.target.value)}>
                    <option value="INSTAGRAM">Instagram</option>
                    <option value="FACEBOOK">Facebook</option>
                    <option value="OUTRA">Outra</option>
                  </select>
                </Campo>
              </>
            )}

            {etapa === 3 && (
              <>
                <Campo rotulo="Área jurídica" dica="A matéria desta campanha.">
                  <input
                    className="cfg-input w-full"
                    value={d.area}
                    onChange={(e) => mudar("area", e.target.value)}
                    placeholder="Direito Médico e Saúde Suplementar"
                  />
                </Campo>
                <Campo rotulo="Do que esta campanha trata" dica="Uma frase. É o que a atendente entende como sendo o assunto permitido aqui.">
                  <textarea
                    className="cfg-input w-full"
                    rows={3}
                    value={d.sobre}
                    onChange={(e) => mudar("sobre", e.target.value)}
                    placeholder="Negativa de cobertura de plano de saúde: cirurgia, exame, medicamento ou home care negados."
                  />
                </Campo>
                <Campo rotulo="Se o lead trouxer outro assunto" dica="O caminho do formulário é o filtro; acolher é o caminho aberto.">
                  <select
                    className="cfg-input w-full"
                    value={d.foraDoEscopo}
                    onChange={(e) => mudar("foraDoEscopo", e.target.value)}
                  >
                    <option value="FORMULARIO">Recusar com cordialidade e enviar o formulário</option>
                    <option value="ACOLHE">Acolher e transferir como conversa comum</option>
                  </select>
                </Campo>
              </>
            )}

            {etapa === 4 && (
              <>
                <Campo rotulo="Primeira mensagem" dica="O que ela diz assim que a pessoa chega pelo anúncio.">
                  <textarea
                    className="cfg-input w-full"
                    rows={3}
                    value={d.primeiraMensagem}
                    onChange={(e) => mudar("primeiraMensagem", e.target.value)}
                    placeholder="Olá! Sou a Ana, do Rodarte Prado Advogados. Vi que você chegou pelo nosso anúncio sobre plano de saúde. Me conta o que aconteceu?"
                  />
                </Campo>

                <Lista
                  rotulo="Perguntas da triagem"
                  dica="Uma por mensagem, na ordem. Arraste para reordenar."
                  itens={d.perguntas.map((p, i) => (
                    <input
                      key={i}
                      className="cfg-input w-full"
                      value={p.texto}
                      onChange={(e) => {
                        const novas = [...d.perguntas];
                        novas[i] = { texto: e.target.value };
                        mudar("perguntas", novas);
                      }}
                      placeholder={i === 0 ? "O que aconteceu, em poucas palavras?" : "Próxima pergunta"}
                    />
                  ))}
                  aoAdicionar={() => mudar("perguntas", [...d.perguntas, { texto: "" }])}
                  aoExcluir={(i) => mudar("perguntas", d.perguntas.filter((_, j) => j !== i))}
                  aoMover={(de, para) => mover("perguntas", de, para)}
                  arrastando={arrastando}
                  setArrastando={setArrastando}
                />

                <Campo rotulo="Teto de mensagens" dica="Quantas mensagens do lead até transferir mesmo sem concluir a triagem.">
                  <input
                    type="number"
                    min={3}
                    max={40}
                    className="cfg-input w-32"
                    value={d.tetoDeMensagens}
                    onChange={(e) => mudar("tetoDeMensagens", Number(e.target.value))}
                  />
                </Campo>
              </>
            )}

            {etapa === 5 && (
              <>
                <p className="border border-regua bg-sf-apoio px-3 py-2 text-etiqueta leading-relaxed text-tx-2">
                  Documento marcado como <strong>obrigatório</strong> decide se o lead avança. Sem ele, a pessoa tem
                  48 horas para enviar; passado o prazo, ela recebe o formulário e o atendimento é encerrado com esse
                  motivo — que fica separado de quem foi recusado por preço.
                </p>
                <Lista
                  rotulo="Documentos a pedir"
                  dica="Um por vez, com o nome que o leigo entende. Arraste para reordenar."
                  itens={d.documentos.map((doc, i) => (
                    <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                      <input
                        className="cfg-input w-full"
                        value={doc.nome}
                        onChange={(e) => {
                          const novos = [...d.documentos];
                          novos[i] = { ...doc, nome: e.target.value };
                          mudar("documentos", novos);
                        }}
                        placeholder="A negativa do plano por escrito"
                      />
                      <input
                        className="cfg-input w-full"
                        value={doc.paraQue}
                        onChange={(e) => {
                          const novos = [...d.documentos];
                          novos[i] = { ...doc, paraQue: e.target.value };
                          mudar("documentos", novos);
                        }}
                        placeholder="para quê — ex.: prova a recusa"
                      />
                      <label className="flex min-h-11 items-center gap-2 whitespace-nowrap text-etiqueta text-tx-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[var(--acao)]"
                          checked={doc.obrigatorio}
                          onChange={(e) => {
                            const novos = [...d.documentos];
                            novos[i] = { ...doc, obrigatorio: e.target.checked };
                            mudar("documentos", novos);
                          }}
                        />
                        obrigatório
                      </label>
                    </div>
                  ))}
                  aoAdicionar={() => mudar("documentos", [...d.documentos, { nome: "", paraQue: "", obrigatorio: false }])}
                  aoExcluir={(i) => mudar("documentos", d.documentos.filter((_, j) => j !== i))}
                  aoMover={(de, para) => mover("documentos", de, para)}
                  arrastando={arrastando}
                  setArrastando={setArrastando}
                />
              </>
            )}

            {etapa === 6 && (
              <>
                <Campo rotulo="O que ela diz ao transferir" dica="A última coisa que o lead ouve dela.">
                  <textarea
                    className="cfg-input w-full"
                    rows={3}
                    value={d.mensagemDeTransferencia}
                    onChange={(e) => mudar("mensagemDeTransferencia", e.target.value)}
                    placeholder="Obrigada! Já tenho o que o advogado precisa para avaliar o seu caso. Vou passar tudo para ele agora e você recebe o retorno em breve."
                  />
                </Campo>
                <Campo rotulo="Para quem vai" dica="“Decidir sozinho” usa a regra da casa: caso triado vai para advogado, genérico para a recepção.">
                  <select
                    className="cfg-input w-full"
                    value={d.destino}
                    onChange={(e) => mudar("destino", e.target.value)}
                  >
                    <option value="AUTOMATICO">Decidir sozinho (recomendado)</option>
                    <option value="ADVOGADOS">Sempre para os advogados</option>
                    <option value="RECEPCAO">Sempre para a recepção</option>
                  </select>
                </Campo>
              </>
            )}

            {etapa === 7 && (
              <>
                <p className="border border-regua bg-sf-apoio px-3 py-2 text-etiqueta leading-relaxed text-tx-2">
                  Marque o que faz esta campanha <strong>encerrar cordialmente</strong> em vez de seguir. É o que
                  impede que lead desqualificado chegue ao advogado — e cada recusa fica gravada com o motivo, para
                  você medir depois se o filtro está apertado demais.
                </p>
                <div className="space-y-2">
                  {MOTIVOS_DE_RECUSA_PRONTOS.map((m) => (
                    <label key={m} className="flex min-h-11 cursor-pointer items-center gap-2 text-corpo text-tx">
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 accent-[var(--acao)]"
                        checked={d.motivosDeRecusa.includes(m)}
                        onChange={(e) =>
                          mudar(
                            "motivosDeRecusa",
                            e.target.checked
                              ? [...d.motivosDeRecusa, m]
                              : d.motivosDeRecusa.filter((x) => x !== m),
                          )
                        }
                      />
                      {m}
                    </label>
                  ))}
                </div>

                <Campo rotulo="Outros motivos" dica="Um por linha. São seus, desta campanha.">
                  <textarea
                    className="cfg-input w-full"
                    rows={3}
                    value={d.motivosDeRecusa.filter((m) => !MOTIVOS_DE_RECUSA_PRONTOS.includes(m)).join("\n")}
                    onChange={(e) => {
                      const proprios = e.target.value.split("\n").map((x) => x.trim()).filter(Boolean);
                      const prontos = d.motivosDeRecusa.filter((m) => MOTIVOS_DE_RECUSA_PRONTOS.includes(m));
                      mudar("motivosDeRecusa", [...prontos, ...proprios]);
                    }}
                    placeholder="Mora fora do estado&#10;Causa abaixo do valor mínimo"
                  />
                </Campo>
              </>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-regua px-5 py-3">
          {erro && <p className="mb-2 text-etiqueta font-medium text-urgente">{erro}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setEtapa((e) => Math.max(1, e - 1))}
              disabled={etapa === 1 || salvando}
              className="inline-flex min-h-11 items-center gap-1.5 border border-regua px-3 text-etiqueta font-semibold text-tx-2 hover:bg-sf-apoio disabled:opacity-40"
            >
              <ArrowLeft size={14} /> Voltar
            </button>

            {!ultima ? (
              <button
                type="button"
                onClick={() => setEtapa((e) => Math.min(ETAPAS.length, e + 1))}
                className="inline-flex min-h-11 items-center gap-1.5 bg-acao px-4 text-etiqueta font-semibold text-acao-tx hover:bg-acao-hover"
              >
                Continuar <ArrowRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => salvar(false)}
                disabled={salvando}
                className="inline-flex min-h-11 items-center gap-1.5 bg-acao px-4 text-etiqueta font-semibold text-acao-tx hover:bg-acao-hover disabled:opacity-50"
              >
                <Check size={14} /> {salvando ? "Salvando…" : "Salvar campanha"}
              </button>
            )}

            <button
              type="button"
              onClick={() => salvar(false)}
              disabled={salvando}
              className="ml-auto min-h-11 text-etiqueta text-tx-2 underline underline-offset-2 hover:text-tx disabled:opacity-50"
            >
              Salvar e continuar depois
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Campo({ rotulo, dica, children }: { rotulo: string; dica?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-etiqueta font-semibold text-tx">{rotulo}</label>
      {children}
      {dica && <p className="mt-1 text-etiqueta leading-snug text-tx-3">{dica}</p>}
    </div>
  );
}

/**
 * Lista reordenável por arrasto.
 *
 * Arrasto nativo do HTML, sem biblioteca: a lista tem meia dúzia de itens, e trazer uma
 * dependência de arrastar-e-soltar para isto custaria mais em peso do que entrega em conforto.
 * As setas de teclado ficam de fora por ora — anotado como dívida, não como decisão.
 */
function Lista({
  rotulo,
  dica,
  itens,
  aoAdicionar,
  aoExcluir,
  aoMover,
  arrastando,
  setArrastando,
}: {
  rotulo: string;
  dica: string;
  itens: React.ReactNode[];
  aoAdicionar: () => void;
  aoExcluir: (i: number) => void;
  aoMover: (de: number, para: number) => void;
  arrastando: number | null;
  setArrastando: (i: number | null) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-etiqueta font-semibold text-tx">{rotulo}</label>
      <p className="mb-2 text-etiqueta leading-snug text-tx-3">{dica}</p>

      <div className="space-y-2">
        {itens.map((item, i) => (
          <div
            key={i}
            draggable
            onDragStart={() => setArrastando(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (arrastando !== null) aoMover(arrastando, i);
              setArrastando(null);
            }}
            onDragEnd={() => setArrastando(null)}
            className={`flex items-start gap-2 border border-regua bg-sf-apoio p-2 transition-opacity ${
              arrastando === i ? "opacity-40" : ""
            }`}
          >
            <span className="mt-2 cursor-grab text-tx-3 active:cursor-grabbing" aria-hidden="true">
              <GripVertical size={16} />
            </span>
            <div className="min-w-0 flex-1">{item}</div>
            <button
              type="button"
              onClick={() => aoExcluir(i)}
              aria-label={`Excluir item ${i + 1}`}
              className="mt-1 shrink-0 rounded p-1.5 text-tx-3 hover:bg-urgente-bg hover:text-urgente"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={aoAdicionar}
        className="mt-2 inline-flex min-h-11 items-center gap-1.5 border border-regua px-3 text-etiqueta font-semibold text-tx-2 hover:bg-sf-apoio"
      >
        <Plus size={14} /> Acrescentar
      </button>
    </div>
  );
}
