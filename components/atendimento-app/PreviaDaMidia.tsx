"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Info, Music, Send, Video, X } from "lucide-react";
import { LIMITE_DA_LEGENDA, ROTULO_DO_TIPO_DE_SAIDA, tamanhoDeSaidaLegivel, type TipoDeSaida } from "@/lib/midiaDeSaida";

// A PRÉ-VISUALIZAÇÃO ANTES DE ENVIAR (R3). O arquivo escolhido aparece (miniatura, nome, tipo e tamanho) e a pessoa decide: Enviar ou
// Cancelar. A LEGENDA é opcional e começa com o que já estava escrito no campo de mensagem (o texto vira legenda). Áudio não tem legenda
// (o WhatsApp não aceita). Nada sai daqui: "Enviar" entrega o arquivo e a legenda a quem chamou, e a bolha da conversa mostra o
// progresso, o erro e o "Tentar de novo".
// O arquivo é lido só neste aparelho (`URL.createObjectURL`), revogado ao fechar. Foco preso na folha; Esc cancela.

export default function PreviaDaMidia({
  arquivo,
  tipo,
  nome,
  legendaInicial,
  nomeDoContato,
  aoEnviar,
  aoCancelar,
}: {
  arquivo: File;
  tipo: TipoDeSaida;
  nome: string;
  legendaInicial: string;
  nomeDoContato: string;
  aoEnviar: (legenda: string) => void;
  aoCancelar: () => void;
}) {
  const [legenda, setLegenda] = useState(tipo === "audio" ? "" : legendaInicial);
  const [endereco, setEndereco] = useState<string | null>(null);
  const [falhaNaImagem, setFalhaNaImagem] = useState(false);
  const cancelar = useRef<HTMLButtonElement>(null);
  const folha = useRef<HTMLDivElement>(null);
  // O cancelar mais recente, sem refazer o efeito do foco a cada renderização de quem chamou (a busca de 15 s renderiza a conversa).
  const cancelarAgora = useRef(aoCancelar);
  cancelarAgora.current = aoCancelar;

  useEffect(() => {
    if (tipo === "documento") return;
    const url = URL.createObjectURL(arquivo);
    setEndereco(url);
    return () => URL.revokeObjectURL(url);
  }, [arquivo, tipo]);

  useEffect(() => {
    const voltarPara = document.activeElement as HTMLElement | null;
    cancelar.current?.focus({ preventScroll: true });
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancelarAgora.current();
        return;
      }
      if (e.key !== "Tab" || !folha.current) return;
      const alvos = Array.from(folha.current.querySelectorAll<HTMLElement>("button:not([disabled]), textarea:not([disabled]), video, audio"));
      if (alvos.length === 0) return;
      const primeiro = alvos[0];
      const ultimo = alvos[alvos.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      voltarPara?.focus?.({ preventScroll: true });
    };
  }, []);

  const tipoEscrito = ROTULO_DO_TIPO_DE_SAIDA[tipo];
  const detalhe = `${tipoEscrito.charAt(0).toUpperCase()}${tipoEscrito.slice(1)} · ${tamanhoDeSaidaLegivel(arquivo.size)}`;
  const passou = legenda.length > LIMITE_DA_LEGENDA;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" data-previa-da-midia="">
      <div ref={folha} role="dialog" aria-modal="true" aria-labelledby="previa-titulo" className="flex max-h-[92dvh] w-full flex-col rounded-t-[20px] bg-atd-tela p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-atd-tinta">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 id="previa-titulo" className="text-destaque font-bold">
            Enviar {tipoEscrito} a {nomeDoContato}
          </h2>
          <button type="button" onClick={aoCancelar} aria-label="Cancelar e fechar" className="inline-flex h-11 w-11 items-center justify-center rounded-full text-atd-previa hover:bg-atd-linha-hover">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mb-2 flex items-center justify-center overflow-hidden rounded-atd-balao bg-atd-pilula-2" data-miniatura={tipo}>
            {tipo === "imagem" && endereco && !falhaNaImagem ? (
              // eslint-disable-next-line @next/next/no-img-element -- arquivo local do aparelho (blob:), fora do otimizador do Next
              <img src={endereco} alt={`Pré-visualização de ${nome}`} onError={() => setFalhaNaImagem(true)} className="block max-h-[38dvh] w-full object-contain" />
            ) : tipo === "video" && endereco ? (
              <video src={endereco} controls playsInline preload="metadata" aria-label={`Pré-visualização do vídeo ${nome}`} className="block max-h-[38dvh] w-full bg-black" />
            ) : tipo === "audio" && endereco ? (
              <div className="flex w-full flex-col items-center gap-2 px-3 py-4">
                <Music size={32} aria-hidden="true" className="text-atd-texto-ouro" />
                <audio src={endereco} controls preload="metadata" aria-label={`Pré-visualização do áudio ${nome}`} className="w-full" />
              </div>
            ) : (
              <div className="flex w-full flex-col items-center gap-1 px-3 py-6 text-atd-previa">
                {tipo === "video" ? <Video size={36} aria-hidden="true" /> : <FileText size={36} aria-hidden="true" />}
                <span className="text-app-meta font-semibold">{tipo === "imagem" ? "Sem miniatura" : "Sem pré-visualização"}</span>
              </div>
            )}
          </div>

          <p className="break-words text-corpo font-semibold [overflow-wrap:anywhere]" data-nome-do-arquivo="">
            {nome}
          </p>
          <p className="mb-2 text-app-meta text-atd-previa">{detalhe}</p>

          {tipo === "audio" ? (
            <p className="mb-2 flex items-start gap-1.5 text-app-meta text-atd-previa">
              <Info size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
              <span>O WhatsApp não aceita legenda em áudio. O texto que estava no campo continua lá.</span>
            </p>
          ) : (
            <div className="mb-2">
              <label htmlFor="legenda-da-midia" className="mb-1 block text-app-meta font-semibold text-atd-previa">
                Legenda (opcional)
              </label>
              <textarea
                id="legenda-da-midia"
                value={legenda}
                onChange={(e) => setLegenda(e.target.value)}
                rows={2}
                aria-describedby="legenda-apoio"
                className="atd-campo-de-mensagem block min-h-[46px] w-full resize-none rounded-[14px] bg-atd-pilula px-3.5 py-2.5 text-atd-tinta placeholder:text-atd-terciario focus:outline-none focus:ring-2 focus:ring-[var(--atd-foco)]"
                placeholder="Escreva uma legenda"
              />
              <p id="legenda-apoio" className={`mt-0.5 text-app-meta tabular-nums ${passou ? "font-semibold text-urgente" : "text-atd-previa"}`}>
                {legenda.length}/{LIMITE_DA_LEGENDA}
                {passou ? " · a legenda passou do limite" : ""}
              </p>
            </div>
          )}

          <p className="mb-2 flex items-start gap-1.5 text-app-meta text-atd-previa">
            <Info size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>Vai para {nomeDoContato} pelo WhatsApp e fica guardado nos anexos do atendimento. Depois de enviado, não dá para desfazer.</span>
          </p>
        </div>

        <div className="flex gap-2">
          <button ref={cancelar} type="button" onClick={aoCancelar} className="inline-flex min-h-12 flex-1 items-center justify-center rounded-atd-pilula bg-atd-pilula-2 px-4 text-corpo font-semibold text-atd-tinta">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => aoEnviar(tipo === "audio" ? "" : legenda.trim())}
            disabled={passou}
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-atd-pilula bg-atd-ouro px-4 text-corpo font-semibold text-atd-ouro-tx disabled:bg-atd-pilula-2 disabled:text-atd-terciario"
          >
            <Send size={18} aria-hidden="true" /> Enviar
          </button>
        </div>
      </div>
    </div>
  );
}
