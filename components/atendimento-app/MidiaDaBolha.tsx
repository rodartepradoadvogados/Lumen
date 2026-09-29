"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ExternalLink, FileText, Loader2, Play, Smile, Video, X } from "lucide-react";
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

const CARTAO = "flex items-center gap-2 rounded-[2px] border border-regua bg-sf-apoio px-2 py-1.5 text-corpo text-tx";
const BOTAO = "inline-flex min-h-11 items-center gap-1.5 rounded-[2px] border border-regua-forte bg-sf px-3 text-corpo font-semibold text-tx";

function Falha({ texto, aoTentar }: { texto: string; aoTentar?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-1.5 rounded-[2px] border border-urgente bg-urgente-bg px-2 py-1.5">
      <p className="flex items-start gap-1.5 text-corpo font-semibold text-tx">
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
    <div role="dialog" aria-modal="true" aria-label="Imagem ampliada" className="fixed inset-0 z-50 flex flex-col bg-atd-hdr">
      <div className="flex shrink-0 justify-end p-2">
        <button ref={fechar} type="button" onClick={aoFechar} className="inline-flex min-h-11 items-center gap-1.5 rounded-[2px] border border-atd-hdr-tx2 bg-atd-hdr px-3 text-corpo font-semibold text-atd-hdr-tx">
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

export default function MidiaDaBolha({ idDaConversa, idDaMensagem, midia, recebida }: { idDaConversa: string; idDaMensagem: string; midia: MidiaDaMensagem; recebida: boolean }) {
  const [tentativa, setTentativa] = useState(0);
  const [estado, setEstado] = useState<"carregando" | "pronto" | "erro">("carregando");
  const [ampliada, setAmpliada] = useState(false);
  const [videoPedido, setVideoPedido] = useState(false);
  const [falhouOutro, setFalhouOutro] = useState(false);

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
        <FileText size={18} aria-hidden="true" className="shrink-0 text-tx-2" />
        <span className="min-w-0 [overflow-wrap:anywhere]">{rotulo}</span>
      </p>
    );
  }

  if (midia.tipo === "figurinha") {
    return (
      <p className={`mb-1 ${CARTAO}`}>
        <Smile size={18} aria-hidden="true" className="shrink-0 text-tx-2" />
        <span className="min-w-0">
          <span className="block font-semibold">Figurinha</span>
          <span className="block text-etiqueta text-tx-2">O Lúmen não guarda figurinhas.</span>
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
            className="relative block min-h-11 w-full overflow-hidden rounded-[2px] border border-regua bg-sf-apoio text-left"
          >
            {estado === "carregando" && (
              <span className="flex min-h-24 items-center justify-center gap-1.5 px-2 text-etiqueta font-semibold text-tx-2" role="status">
                <Loader2 size={14} aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> Carregando imagem…
              </span>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element -- rota autenticada com cookie; não passa pelo otimizador do Next */}
            <img
              src={src}
              alt={`Imagem enviada pelo cliente: ${descricao}`}
              loading="lazy"
              decoding="async"
              onLoad={() => setEstado("pronto")}
              onError={() => setEstado("erro")}
              className={estado === "carregando" ? "sr-only" : "block max-h-56 w-full object-cover"}
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
          <>
            <audio key={tentativa} controls preload="none" src={src} onError={() => setFalhouOutro(true)} aria-label={`Áudio do cliente${tamanho ? `, ${tamanho}` : ""}`} className="h-11 w-full min-w-[220px]" />
            <p className="text-etiqueta text-tx-2">Toque em ouvir para carregar o áudio{tamanho ? ` (${tamanho})` : ""}.</p>
          </>
        )}
      </div>
    );
  }

  if (midia.tipo === "video") {
    return (
      <div className="mb-1 flex flex-col gap-1.5">
        <p className={CARTAO}>
          <Video size={18} aria-hidden="true" className="shrink-0 text-tx-2" />
          <span className="min-w-0">
            <span className="block break-words font-semibold [overflow-wrap:anywhere]">{midia.nome ?? "Vídeo"}</span>
            {detalhe && <span className="block text-etiqueta text-tx-2">{detalhe}</span>}
          </span>
        </p>
        {falhouOutro ? (
          <Falha texto="Vídeo indisponível. Confira a internet ou se o arquivo ainda está no Drive." aoTentar={() => { setVideoPedido(true); tentarDeNovo(); }} />
        ) : videoPedido ? (
          <video key={tentativa} controls playsInline autoPlay preload="metadata" src={src} onError={() => setFalhouOutro(true)} aria-label={`Vídeo do cliente${tamanho ? `, ${tamanho}` : ""}`} className="max-h-64 w-full rounded-[2px] bg-atd-hdr" />
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
        <FileText size={18} aria-hidden="true" className="shrink-0 text-tx-2" />
        <span className="min-w-0">
          <span className="block break-words font-semibold [overflow-wrap:anywhere]">{midia.nome ?? "Documento"}</span>
          {detalhe && <span className="block text-etiqueta text-tx-2">{detalhe}</span>}
        </span>
      </p>
      <a href={enderecoDaMidia(idDaConversa, idDaMensagem)} target="_blank" rel="noopener noreferrer" className={BOTAO}>
        <ExternalLink size={16} aria-hidden="true" /> Abrir
        <span className="sr-only">{midia.nome ? ` ${midia.nome}` : " documento"} (abre em outra aba)</span>
      </a>
    </div>
  );
}
