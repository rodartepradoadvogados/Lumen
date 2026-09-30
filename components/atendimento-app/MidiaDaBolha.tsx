"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ExternalLink, FileText, Loader2, Pause, Play, Smile, Video, X } from "lucide-react";
import type { MidiaDaMensagem } from "@/lib/mensagensDoChat";
import { enderecoDaMidia, tamanhoLegivel, tipoLegivel } from "@/lib/midiaDoChat";

// A MÍDIA DENTRO DO BALÃO (PR 8). O arquivo vem SÓ da rota autenticada (lib/midiaDoChat.ts:enderecoDaMidia),
// nunca do Drive. Sem baixar mídia grande sozinho:
//   IMAGEM     miniatura leve (carrega ao aparecer na tela, `loading="lazy"`); toque = amplia numa camada.
//   ÁUDIO      player nativo com `preload="none"`: nada baixa até a pessoa tocar em ouvir.
//   VÍDEO      cartão com "Carregar vídeo": só baixa sob toque, e então toca com controles nativos.
//   DOCUMENTO  cartão com nome, tipo e tamanho e "Abrir" (outra aba, por baixo da mesma rota autenticada).
//   FIGURINHA  cartão dizendo que não é guardada (o Lúmen não a baixa).
// Todo estado tem TEXTO: carregando, erro (com "Tentar de novo") e indisponível. A cor nunca fala sozinha.
// Só mídia RECEBIDA tem arquivo: a mensagem de saída mostra o rótulo, como antes.

// Acabamento WhatsApp (etapa 2): cartões preenchidos (sem contorno), botões em pílula, cantos de 11 px dentro do balão.
const CARTAO = "flex items-center gap-2.5 rounded-[11px] bg-atd-pilula-2 px-2.5 py-2 text-corpo text-atd-tinta";
const BOTAO = "inline-flex min-h-11 items-center gap-1.5 rounded-atd-pilula bg-atd-tela px-4 text-corpo font-semibold text-atd-tinta";

function Falha({ texto, aoTentar }: { texto: string; aoTentar?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-1.5 rounded-[11px] border border-urgente bg-urgente-bg px-2.5 py-2">
      <p className="flex items-start gap-1.5 text-corpo font-semibold text-atd-tinta">
        <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-urgente" />
        <span>{texto}</span>
      </p>
      {aoTentar && (
        <button type="button" onClick={aoTentar} className={BOTAO}>
          Tentar de novo
        </button>
      )}
    </div>
  );
}

function Ampliada({ src, alt, aoFechar }: { src: string; alt: string; aoFechar: () => void }) {
  const fechar = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const voltarPara = document.activeElement as HTMLElement | null;
    fechar.current?.focus();
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
      if (e.key === "Tab") {
        e.preventDefault(); // só há um controle: o foco fica nele
        fechar.current?.focus();
      }
    };
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      voltarPara?.focus?.();
    };
  }, [aoFechar]);
  return (
    <div role="dialog" aria-modal="true" aria-label="Imagem ampliada" className="fixed inset-0 z-50 flex flex-col bg-atd-tela">
      <div className="flex shrink-0 justify-end p-2">
        <button ref={fechar} type="button" onClick={aoFechar} className="inline-flex min-h-11 items-center gap-1.5 rounded-atd-pilula bg-atd-pilula-2 px-4 text-corpo font-semibold text-atd-tinta">
          <X size={18} aria-hidden="true" /> Fechar
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-2" onClick={aoFechar}>
        {/* eslint-disable-next-line @next/next/no-img-element -- rota autenticada com cookie; o otimizador de imagens do Next não a enxerga */}
        <img src={src} alt={alt} className="max-h-full max-w-full object-contain" />
      </div>
    </div>
  );
}

// A forma de onda é ESTÁTICA (o WhatsApp não manda a onda real): 30 barras de altura fixa por mensagem, só desenho.
// O progresso pinta as barras de ouro. O que fala com o leitor de tela é o botão, o campo de posição e o tempo.
function alturasDaOnda(semente: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < semente.length; i++) h = Math.imul(h ^ semente.charCodeAt(i), 16777619);
  return Array.from({ length: 30 }, () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) + 1;
    return 6 + ((h >>> 0) % 19);
  });
}

function tempo(seg: number): string {
  const s = Math.max(0, Math.floor(seg));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// O PLAYER DE ÁUDIO no acabamento do app: botão de play/pause em ouro (44 px), forma de onda com o progresso e o tempo.
// O `<audio>` continua sem baixar nada (`preload="none"`) até o primeiro toque em ouvir. Acessível: botão nomeado que
// diz "Ouvir/Pausar áudio", campo de posição (setas do teclado adiantam e voltam) com `aria-valuetext` e o tempo escrito.
function PlayerDeAudio({ src, idDaMensagem, tamanho, aoFalhar }: { src: string; idDaMensagem: string; tamanho: string; aoFalhar: () => void }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [tocando, setTocando] = useState(false);
  const [posicao, setPosicao] = useState(0);
  const [duracao, setDuracao] = useState(0);
  const onda = useMemo(() => alturasDaOnda(idDaMensagem), [idDaMensagem]);
  const sabeADuracao = Number.isFinite(duracao) && duracao > 0;
  const fracao = sabeADuracao ? Math.min(1, posicao / duracao) : 0;

  function alternar() {
    const a = audio.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => aoFalhar());
    else a.pause();
  }

  return (
    <div className="flex min-w-[15rem] items-center gap-2.5 pr-1" data-player-de-audio="">
      <audio
        ref={audio}
        preload="none"
        src={src}
        onPlay={() => setTocando(true)}
        onPause={() => setTocando(false)}
        onEnded={() => {
          setTocando(false);
          setPosicao(0);
        }}
        onLoadedMetadata={(e) => setDuracao(e.currentTarget.duration)}
        onDurationChange={(e) => setDuracao(e.currentTarget.duration)}
        onTimeUpdate={(e) => setPosicao(e.currentTarget.currentTime)}
        onError={aoFalhar}
      />
      <button
        type="button"
        onClick={alternar}
        aria-label={`${tocando ? "Pausar" : "Ouvir"} áudio do cliente${tamanho ? `, ${tamanho}` : ""}`}
        aria-pressed={tocando}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-atd-ouro text-atd-ouro-tx"
      >
        {tocando ? <Pause size={18} aria-hidden="true" fill="currentColor" /> : <Play size={18} aria-hidden="true" fill="currentColor" />}
      </button>
      <div className="relative h-11 min-w-0 flex-1">
        <div aria-hidden="true" className="flex h-full items-center gap-[2px]">
          {onda.map((h, i) => (
            <span key={i} style={{ height: `${h}px` }} className={`block w-[3px] shrink-0 rounded-full ${(i + 0.5) / onda.length <= fracao ? "bg-atd-ouro" : "bg-atd-terciario opacity-70"}`} />
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={sabeADuracao ? Math.floor(duracao) : 0}
          step={1}
          value={sabeADuracao ? Math.min(Math.floor(posicao), Math.floor(duracao)) : 0}
          disabled={!sabeADuracao}
          onChange={(e) => {
            const a = audio.current;
            if (a) a.currentTime = Number(e.target.value);
            setPosicao(Number(e.target.value));
          }}
          aria-label="Posição do áudio"
          aria-valuetext={sabeADuracao ? `${tempo(posicao)} de ${tempo(duracao)}` : "Ainda não carregado"}
          className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
        />
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-atd-etiqueta peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[color:var(--atd-foco)]" />
      </div>
      <span className="shrink-0 text-app-meta tabular-nums" data-tempo-do-audio="">
        {sabeADuracao ? (tocando || posicao > 0 ? tempo(posicao) : tempo(duracao)) : tamanho || "Áudio"}
      </span>
    </div>
  );
}

export default function MidiaDaBolha({ idDaConversa, idDaMensagem, midia, recebida }: { idDaConversa: string; idDaMensagem: string; midia: MidiaDaMensagem; recebida: boolean }) {
  const [tentativa, setTentativa] = useState(0);
  const [estado, setEstado] = useState<"carregando" | "pronto" | "erro">("carregando");
  const [ampliada, setAmpliada] = useState(false);
  const [videoPedido, setVideoPedido] = useState(false);
  const [falhouOutro, setFalhouOutro] = useState(false);
  // A imagem pode terminar de carregar ANTES da hidratação (o HTML do servidor já traz o <img>): o `onLoad` do React
  // não vê esse evento. Conferir `complete` ao montar evita a miniatura ficar para sempre em "Carregando imagem…".
  const imagem = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const i = imagem.current;
    if (i && i.complete) setEstado(i.naturalWidth > 0 ? "pronto" : "erro");
  }, [tentativa]);

  const rotulo = midia.nome ? `${midia.rotulo}: ${midia.nome}` : midia.rotulo;
  const src = enderecoDaMidia(idDaConversa, idDaMensagem, { tentativa: tentativa || undefined });
  const tamanho = tamanhoLegivel(midia.bytes);
  const tipo = tipoLegivel(midia.mime, midia.nome);
  const detalhe = [tipo, tamanho].filter(Boolean).join(" · ");
  const descricao = midia.legenda || midia.nome || "sem descrição";
  const tentarDeNovo = () => {
    setEstado("carregando");
    setFalhouOutro(false);
    setTentativa((t) => t + 1);
  };

  // SEM ARQUIVO: a mensagem é nossa (saída) — só o rótulo, como antes.
  if (!recebida) {
    return (
      <p className={`mb-1 ${CARTAO} font-semibold`}>
        <FileText size={20} aria-hidden="true" className="shrink-0 text-atd-previa" />
        <span className="min-w-0 [overflow-wrap:anywhere]">{rotulo}</span>
      </p>
    );
  }

  if (midia.tipo === "figurinha") {
    return (
      <p className={`mb-1 ${CARTAO}`}>
        <Smile size={20} aria-hidden="true" className="shrink-0 text-atd-previa" />
        <span className="min-w-0">
          <span className="block font-semibold">Figurinha</span>
          <span className="block text-app-meta text-atd-previa">O Lúmen não guarda figurinhas.</span>
        </span>
      </p>
    );
  }

  if (midia.tipo === "imagem") {
    return (
      <div className="mb-1">
        {estado === "erro" ? (
          <Falha texto="Imagem indisponível. Confira a internet ou se o arquivo ainda está no Drive." aoTentar={tentarDeNovo} />
        ) : (
          <button
            type="button"
            onClick={() => setAmpliada(true)}
            aria-label={`Ampliar imagem: ${descricao}`}
            className="relative block min-h-11 w-full overflow-hidden rounded-[11px] bg-atd-pilula-2 text-left"
          >
            {estado === "carregando" && (
              <span className="flex min-h-28 items-center justify-center gap-1.5 px-2 text-app-meta font-semibold text-atd-previa" role="status">
                <Loader2 size={14} aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> Carregando imagem…
              </span>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element -- rota autenticada com cookie; não passa pelo otimizador do Next */}
            <img
              ref={imagem}
              src={src}
              alt={`Imagem enviada pelo cliente: ${descricao}`}
              loading="lazy"
              decoding="async"
              onLoad={() => setEstado("pronto")}
              onError={() => setEstado("erro")}
              className={estado === "carregando" ? "absolute inset-0 h-full w-full opacity-0" : "block max-h-56 w-full object-cover"}
            />
          </button>
        )}
        {ampliada && <Ampliada src={src} alt={`Imagem enviada pelo cliente: ${descricao}`} aoFechar={() => setAmpliada(false)} />}
      </div>
    );
  }

  if (midia.tipo === "audio") {
    return (
      <div className="mb-1 flex flex-col gap-1">
        {falhouOutro ? (
          <Falha texto="Áudio indisponível. Confira a internet ou se o arquivo ainda está no Drive." aoTentar={tentarDeNovo} />
        ) : (
          <PlayerDeAudio key={tentativa} src={src} idDaMensagem={idDaMensagem} tamanho={tamanho} aoFalhar={() => setFalhouOutro(true)} />
        )}
      </div>
    );
  }

  if (midia.tipo === "video") {
    return (
      <div className="mb-1 flex flex-col gap-1.5">
        <p className={CARTAO}>
          <Video size={20} aria-hidden="true" className="shrink-0 text-atd-previa" />
          <span className="min-w-0">
            <span className="block break-words font-semibold [overflow-wrap:anywhere]">{midia.nome ?? "Vídeo"}</span>
            {detalhe && <span className="block text-app-meta text-atd-previa">{detalhe}</span>}
          </span>
        </p>
        {falhouOutro ? (
          <Falha texto="Vídeo indisponível. Confira a internet ou se o arquivo ainda está no Drive." aoTentar={() => { setVideoPedido(true); tentarDeNovo(); }} />
        ) : videoPedido ? (
          <video key={tentativa} controls playsInline autoPlay preload="metadata" src={src} onError={() => setFalhouOutro(true)} aria-label={`Vídeo do cliente${tamanho ? `, ${tamanho}` : ""}`} className="max-h-64 w-full rounded-[11px] bg-atd-tela" />
        ) : (
          <button type="button" onClick={() => setVideoPedido(true)} className={BOTAO}>
            <Play size={16} aria-hidden="true" /> Carregar vídeo{tamanho ? ` (${tamanho})` : ""}
          </button>
        )}
      </div>
    );
  }

  // DOCUMENTO
  return (
    <div className="mb-1 flex flex-col gap-1.5">
      <p className={CARTAO}>
        <FileText size={20} aria-hidden="true" className="shrink-0 text-atd-previa" />
        <span className="min-w-0">
          <span className="block break-words font-semibold [overflow-wrap:anywhere]">{midia.nome ?? "Documento"}</span>
          {detalhe && <span className="block text-app-meta text-atd-previa">{detalhe}</span>}
        </span>
      </p>
      <a href={enderecoDaMidia(idDaConversa, idDaMensagem)} target="_blank" rel="noopener noreferrer" className={BOTAO}>
        <ExternalLink size={16} aria-hidden="true" /> Abrir
        <span className="sr-only">{midia.nome ? ` ${midia.nome}` : " documento"} (abre em outra aba)</span>
      </a>
    </div>
  );
}
