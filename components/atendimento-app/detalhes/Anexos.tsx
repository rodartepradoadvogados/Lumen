"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Camera, Clock, ExternalLink, Paperclip } from "lucide-react";
import DocumentTypeSelect from "@/components/DocumentTypeSelect";
import { anexarArquivoDoCelular, desfazerAnexoDoCelular } from "@/lib/actions/detalhesDoAtendimento";
import { ACCEPT_DA_CAMERA, ACCEPT_DO_ANEXO, LIMITE_DO_ANEXO_BYTES, nomeFinalDoAnexo, validarArquivoDoCelular } from "@/lib/anexoDoCelular";
import { getDocumentTypeIcon, getDocumentTypeLabel } from "@/lib/documentTypes";
import { enderecoSeguroDoAnexo, origemDoAnexo } from "@/lib/detalhesDoAtendimento";
import { pendenciaKindLabel } from "@/lib/pendencias";
import { Vazio, cx, useAvisos } from "./base";
import type { PropsDosDetalhes } from "./tipos";

// ANEXOS: os que já existem, com abertura segura, e o que ainda FALTA chegar do cliente. Cada arquivo abre em
// outra aba (o Drive não roda dentro do aplicativo) com `noopener noreferrer`, e só se o endereço for http(s):
// qualquer outro esquema vira "Link indisponível".
//
// ENVIAR PELO CELULAR (PR 9): "Tirar foto" (câmera traseira) e "Escolher arquivo". O arquivo sobe do aparelho
// direto para o Vercel Blob (com progresso) e o servidor o leva ao Drive, na pasta deste atendimento
// (`anexarArquivoDoCelular`: guarda `atendimentoDaAcao`, tipos e limite de 25 MB de lib/anexoDoCelular.ts).
// Vai para os ANEXOS, NÃO para o cliente. Depois de enviar há "Desfazer" (só do que a própria pessoa enviou,
// 10 minutos).
type Andamento = { nome: string; fase: "enviando" | "guardando"; pct: number };

export default function Anexos({ p }: { p: PropsDosDetalhes }) {
  const router = useRouter();
  const avisar = useAvisos();
  const arquivoRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState("OUTRO");
  const [andamento, setAndamento] = useState<Andamento | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(arquivo: File) {
    if (andamento) return;
    setErro(null);
    const v = validarArquivoDoCelular({ name: arquivo.name, size: arquivo.size, type: arquivo.type });
    if (!v.ok) return setErro(v.erro);
    const nome = nomeFinalDoAnexo(arquivo.name, arquivo);
    setAndamento({ nome, fase: "enviando", pct: 0 });
    try {
      const blob = await upload(nome, arquivo, {
        access: "public",
        handleUploadUrl: "/api/attachments/blob-token",
        onUploadProgress: ({ percentage }) => setAndamento((a) => (a ? { ...a, pct: Math.round(percentage) } : a)),
      });
      setAndamento({ nome, fase: "guardando", pct: 100 });
      const r = await anexarArquivoDoCelular(p.conversa.id, { blobUrl: blob.url, nome, tipo: arquivo.type, tamanho: arquivo.size, docType });
      if (r.error || !r.anexo) {
        setErro(r.error ?? "Não foi possível anexar o arquivo.");
        return;
      }
      const anexoId = r.anexo.id;
      avisar({
        texto: `“${nome}” anexado ao atendimento.`,
        desfazer: async () => {
          const d = await desfazerAnexoDoCelular(p.conversa.id, anexoId);
          if (d.error) avisar({ texto: d.error, tom: "erro" });
          else avisar({ texto: "Anexo desfeito." });
          router.refresh();
        },
      });
      router.refresh();
    } catch {
      setErro("Não foi possível enviar o arquivo. Confira a internet e tente de novo.");
    } finally {
      setAndamento(null);
      if (arquivoRef.current) arquivoRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    }
  }

  const aoEscolher = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void enviar(f);
  };

  const faltam = p.pendencias.filter((x) => x.direction === "SOLICITAR" && x.status !== "CONCLUIDA");
  return (
    <div>
      <div className="mb-3 border-b border-regua pb-3" data-enviar-anexo="">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => cameraRef.current?.click()} disabled={Boolean(andamento)} className={cx.secundario}>
            <Camera size={16} aria-hidden="true" /> Tirar foto
          </button>
          <button type="button" onClick={() => arquivoRef.current?.click()} disabled={Boolean(andamento)} className={cx.secundario}>
            <Paperclip size={16} aria-hidden="true" /> Escolher arquivo
          </button>
        </div>
        <input ref={cameraRef} type="file" accept={ACCEPT_DA_CAMERA} capture="environment" onChange={aoEscolher} tabIndex={-1} aria-hidden="true" className="sr-only" />
        <input ref={arquivoRef} type="file" accept={ACCEPT_DO_ANEXO} onChange={aoEscolher} tabIndex={-1} aria-hidden="true" className="sr-only" />
        <div className="mt-2">
          <span className={cx.rotulo}>Tipo do documento</span>
          <DocumentTypeSelect value={docType} onChange={setDocType} excludeKeys={["PARECER"]} className={cx.campo} />
        </div>
        {andamento && (
          <div className="mt-2" role="status">
            <p className="break-words text-corpo font-semibold text-tx">
              {andamento.fase === "enviando" ? `Enviando “${andamento.nome}”… ${andamento.pct}%` : `Guardando “${andamento.nome}” no Drive…`}
            </p>
            <div role="progressbar" aria-label="Envio do arquivo" aria-valuemin={0} aria-valuemax={100} aria-valuenow={andamento.pct} className="mt-1 h-2 w-full overflow-hidden rounded-[2px] border border-regua-forte bg-sf-apoio">
              <div className="h-full bg-acao" style={{ width: `${andamento.pct}%` }} />
            </div>
          </div>
        )}
        {erro && (
          <p role="alert" className={`mt-2 ${cx.erro}`}>
            {erro}
          </p>
        )}
        <p className={`mt-2 ${cx.dica}`}>Vai para os anexos deste atendimento (até {LIMITE_DO_ANEXO_BYTES / (1024 * 1024)} MB). Não é enviado ao cliente.</p>
      </div>
      {p.anexos.length === 0 && faltam.length === 0 ? <Vazio>Nenhum documento pedido nem recebido.</Vazio> : null}
      <ul>
        {p.anexos.map((a) => {
          const Icone = getDocumentTypeIcon(a.docType);
          const href = enderecoSeguroDoAnexo(a.driveUrl);
          const corpo = (
            <>
              <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[2px] border border-regua bg-sf-apoio text-tx-2">
                <Icone size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block break-words text-corpo font-semibold text-tx">{a.name}</span>
                <span className="block text-etiqueta text-tx-2">
                  {getDocumentTypeLabel(a.docType)} · {a.dataLabel}
                  {a.uploadedByName ? ` · ${a.uploadedByName}` : ""}
                  {href ? ` · ${origemDoAnexo(a.driveUrl)}` : ""}
                </span>
              </span>
            </>
          );
          return (
            <li key={a.id} className="border-t border-regua first:border-t-0">
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer" className="flex min-h-[52px] items-center gap-2.5 py-2">
                  {corpo}
                  <ExternalLink size={16} aria-hidden="true" className="shrink-0 text-tx-2" />
                  <span className="sr-only">(abre em outra aba)</span>
                </a>
              ) : (
                <div className="flex min-h-[52px] items-center gap-2.5 py-2" aria-label={`${a.name}: link indisponível`}>
                  {corpo}
                  <span className="shrink-0 text-etiqueta font-semibold text-urgente">Link indisponível</span>
                </div>
              )}
            </li>
          );
        })}
        {faltam.map((x) => (
          <li key={x.id} className="flex min-h-[52px] items-center gap-2.5 border-t border-regua py-2">
            <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[2px] border border-regua bg-sf-apoio text-aviso">
              <Clock size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block break-words text-corpo font-semibold text-tx">{x.description?.trim() || pendenciaKindLabel(x.direction, x.kind)}</span>
              <span className="block text-etiqueta font-semibold text-aviso">falta chegar do cliente</span>
            </span>
          </li>
        ))}
      </ul>
      <p className={`mt-3 ${cx.dica}`}>Os arquivos ficam no Drive do escritório, na pasta deste atendimento. Fotos e documentos que o cliente manda pelo WhatsApp entram aqui sozinhos.</p>
    </div>
  );
}
