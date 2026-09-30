"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, FileText, Image as IconeImagem, Paperclip, X } from "lucide-react";
import { ACCEPT_DA_CAMERA_DE_SAIDA, acceptDaGaleria, acceptDoDocumento, type ProvedorDoWhatsapp } from "@/lib/midiaDeSaida";

// O CLIPE DO CAMPO DE MENSAGEM (R3, mídia de saída). Um toque abre a folha com três caminhos, como no WhatsApp:
//   Foto ou vídeo da galeria · Câmera (a câmera traseira do aparelho) · Documento ou áudio.
// Cada caminho é um `<input type="file">` escondido (`sr-only`, fora da ordem de tabulação: o botão da folha é o alvo). O `accept` só ajuda o
// aparelho a filtrar (a lista do provedor, lib/midiaDeSaida.ts); quem decide é `classificarArquivoDeSaida` na tela e, de novo, o servidor.
// Escolher um arquivo NÃO envia nada: entrega o `File` a quem chamou, que abre a pré-visualização.
// Os inputs ficam sempre montados (a folha fecha antes de o seletor do aparelho devolver o arquivo).

export default function AnexarMidia({ provedor, desabilitado, aoEscolher }: { provedor: ProvedorDoWhatsapp | null | undefined; desabilitado: boolean; aoEscolher: (arquivo: File) => void }) {
  const [aberta, setAberta] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const documento = useRef<HTMLInputElement>(null);
  const fechar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aberta) return;
    const voltarPara = botao.current;
    fechar.current?.focus();
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberta(false);
    };
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      voltarPara?.focus?.({ preventScroll: true });
    };
  }, [aberta]);

  function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    // Zera o valor: escolher o MESMO arquivo de novo (depois de cancelar a pré-visualização) tem de disparar o evento outra vez.
    e.target.value = "";
    if (f) aoEscolher(f);
  }

  function abrirSeletor(input: React.RefObject<HTMLInputElement>) {
    setAberta(false);
    input.current?.click();
  }

  const linha = "flex min-h-14 w-full items-center gap-3 rounded-atd-balao bg-atd-pilula px-3.5 py-2 text-left text-corpo font-semibold text-atd-tinta hover:bg-atd-pilula-2";
  return (
    <>
      <button
        ref={botao}
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setAberta(true)}
        disabled={desabilitado}
        aria-label="Anexar arquivo"
        aria-haspopup="dialog"
        aria-expanded={aberta}
        data-clipe=""
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-atd-previa hover:text-atd-tinta disabled:opacity-50"
      >
        <Paperclip size={20} aria-hidden="true" />
      </button>
      <input ref={galeria} type="file" accept={acceptDaGaleria(provedor)} onChange={escolher} tabIndex={-1} aria-hidden="true" className="sr-only" data-entrada="galeria" />
      <input ref={camera} type="file" accept={ACCEPT_DA_CAMERA_DE_SAIDA} capture="environment" onChange={escolher} tabIndex={-1} aria-hidden="true" className="sr-only" data-entrada="camera" />
      <input ref={documento} type="file" accept={acceptDoDocumento(provedor)} onChange={escolher} tabIndex={-1} aria-hidden="true" className="sr-only" data-entrada="documento" />
      {aberta && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/50" onClick={() => setAberta(false)} data-menu-do-clipe="">
          <div role="dialog" aria-modal="true" aria-labelledby="clipe-titulo" className="flex w-full flex-col rounded-t-[20px] bg-atd-tela p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-atd-tinta" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 id="clipe-titulo" className="flex items-center gap-1.5 text-destaque font-bold">
                <Paperclip size={16} aria-hidden="true" /> Enviar arquivo
              </h2>
              <button ref={fechar} type="button" onClick={() => setAberta(false)} aria-label="Fechar" className="inline-flex h-11 w-11 items-center justify-center rounded-full text-atd-previa hover:bg-atd-linha-hover">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <ul className="flex flex-col gap-1.5">
              <li>
                <button type="button" onClick={() => abrirSeletor(galeria)} className={linha}>
                  <IconeImagem size={22} aria-hidden="true" className="shrink-0 text-atd-texto-ouro" />
                  <span className="min-w-0">
                    <span className="block">Foto ou vídeo da galeria</span>
                    <span className="block text-app-meta font-normal text-atd-previa">{provedor === "EVOLUTION" ? "JPG, PNG, WebP ou vídeo MP4" : "JPG, PNG ou vídeo MP4"}</span>
                  </span>
                </button>
              </li>
              <li>
                <button type="button" onClick={() => abrirSeletor(camera)} className={linha}>
                  <Camera size={22} aria-hidden="true" className="shrink-0 text-atd-texto-ouro" />
                  <span className="min-w-0">
                    <span className="block">Câmera</span>
                    <span className="block text-app-meta font-normal text-atd-previa">Tirar uma foto agora</span>
                  </span>
                </button>
              </li>
              <li>
                <button type="button" onClick={() => abrirSeletor(documento)} className={linha}>
                  <FileText size={22} aria-hidden="true" className="shrink-0 text-atd-texto-ouro" />
                  <span className="min-w-0">
                    <span className="block">Documento ou áudio</span>
                    <span className="block text-app-meta font-normal text-atd-previa">PDF, Word, Excel, PowerPoint, TXT{provedor === "EVOLUTION" ? ", ZIP" : ""}, áudio</span>
                  </span>
                </button>
              </li>
            </ul>
            <p className="mt-2 px-1 text-app-meta text-atd-previa">Você confere o arquivo antes de enviar. Depois de enviado ao cliente, não dá para desfazer.</p>
          </div>
        </div>
      )}
    </>
  );
}
