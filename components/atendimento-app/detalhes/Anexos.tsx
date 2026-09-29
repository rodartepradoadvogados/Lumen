"use client";

import { Clock, ExternalLink, Lock } from "lucide-react";
import { getDocumentTypeIcon, getDocumentTypeLabel } from "@/lib/documentTypes";
import { enderecoSeguroDoAnexo, origemDoAnexo } from "@/lib/detalhesDoAtendimento";
import { pendenciaKindLabel } from "@/lib/pendencias";
import { Vazio, cx } from "./base";
import type { PropsDosDetalhes } from "./tipos";

// ANEXOS: os que já existem, com abertura segura, e o que ainda FALTA chegar do cliente. Cada arquivo abre em
// outra aba (o Drive não roda dentro do aplicativo) com `noopener noreferrer`, e só se o endereço for http(s):
// qualquer outro esquema vira "Link indisponível". Enviar arquivo pelo celular ainda não existe (é uma etapa
// própria) — a tela diz isso em vez de mostrar um botão que não faz nada.
export default function Anexos({ p }: { p: PropsDosDetalhes }) {
  const faltam = p.pendencias.filter((x) => x.direction === "SOLICITAR" && x.status !== "CONCLUIDA");
  return (
    <div>
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
      <p className={`mt-2 flex items-start gap-1.5 ${cx.dica}`}>
        <Lock size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
        Enviar arquivo pelo celular chega em uma próxima etapa. Para anexar agora, use o Lúmen no computador.
      </p>
    </div>
  );
}
