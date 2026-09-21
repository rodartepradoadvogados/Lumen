"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirDocumentosSelecionados, anexarNovoDocumento, marcarConversaoMarkdown } from "@/lib/actions/peticionamento";
import { useSaidaDoPeticionamento } from "./SaidaContext";

type DocExistente = { id: string; name: string; docType: string; driveUrl: string };
type Anexo = { id: string; nome: string; markdownConvertido: boolean; markdownRecusado: boolean };

export function DocumentosClient({
  sessaoId,
  documentosExistentes,
  jaSelecionados,
  anexosIniciais,
  pronto,
  faltando,
}: {
  sessaoId: string;
  documentosExistentes: DocExistente[];
  jaSelecionados: string[];
  anexosIniciais: Anexo[];
  pronto: boolean;
  faltando: ("fatos" | "pedidos")[];
}) {
  const router = useRouter();
  const { marcarTrabalho } = useSaidaDoPeticionamento();
  const [pendente, iniciar] = useTransition();
  const [selecionados, setSelecionados] = useState<string[]>(jaSelecionados);
  const [anexos, setAnexos] = useState<Anexo[]>(anexosIniciais);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function alternar(id: string) {
    const novo = selecionados.includes(id) ? selecionados.filter((x) => x !== id) : [...selecionados, id];
    setSelecionados(novo);
    marcarTrabalho();
    iniciar(async () => {
      await definirDocumentosSelecionados(sessaoId, novo);
    });
  }

  async function enviarArquivo(file: File) {
    setErro(null);
    setEnviando(true);
    marcarTrabalho();
    const fd = new FormData();
    fd.set("file", file);
    const resultado = await anexarNovoDocumento(sessaoId, fd);
    setEnviando(false);
    if ("error" in resultado) {
      setErro(resultado.error);
      return;
    }
    router.refresh();
    setAnexos((a) => [...a, { id: crypto.randomUUID(), nome: resultado.nome, markdownConvertido: false, markdownRecusado: false }]);
  }

  function converterMarkdown(id: string, aceitar: boolean) {
    setAnexos((prev) => prev.map((a) => (a.id === id ? { ...a, markdownConvertido: aceitar, markdownRecusado: !aceitar } : a)));
    iniciar(async () => {
      await marcarConversaoMarkdown(id, aceitar);
    });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Documentos</h1>
          <p>Escolha o que já existe no processo vinculado e, se precisar, anexe algo novo só para esta minuta. Converter para Markdown ajuda o agente a ler o conteúdo — mas nunca é obrigatório.</p>
        </div>
      </div>

      <div className="content">
        {erro && <div className="callout callout-danger">{erro}</div>}

        <div className="two-col">
          <div className="col">
            <h2>Já existem no Lúmen</h2>
            <p className="col-hint">{documentosExistentes.length} documento(s) do contexto vinculado</p>
            {documentosExistentes.length === 0 ? (
              <div className="empty-note">Nenhum documento no contexto vinculado (ou sessão avulsa).</div>
            ) : (
              <div className="doc-list">
                {documentosExistentes.map((d) => (
                  <label key={d.id} className="doc-row">
                    <input type="checkbox" checked={selecionados.includes(d.id)} onChange={() => alternar(d.id)} disabled={pendente} />
                    <div>
                      <div className="name">{d.name}</div>
                      <div className="meta">{d.docType}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
            <p className="quiet" style={{ fontSize: 12, marginTop: 10 }}>
              Documentos anexados aqui só-para-esta-sessão podem, ao final, ser promovidos a anexo oficial do processo — ou continuar em{" "}
              <span className="mono">Peticionamento/</span> até limpeza manual. Nada é apagado sozinho.
            </p>
          </div>

          <div className="col">
            <h2>Anexar novo documento</h2>
            <p className="col-hint">PDF, DOCX, imagem digitalizada ou áudio transcrito. Até 25 MB.</p>
            <div className="dropzone" onClick={() => inputRef.current?.click()} style={{ cursor: "pointer" }}>
              <strong>Clique para escolher um arquivo</strong>
              <input
                ref={inputRef}
                type="file"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) enviarArquivo(f);
                  e.target.value = "";
                }}
              />
              <div className="quiet" style={{ fontSize: 11.5 }}>{enviando ? "Enviando…" : "Até 25 MB por arquivo"}</div>
            </div>
            <div className="upload-list">
              {anexos.map((a) => (
                <div key={a.id} className="upload-item">
                  <div className="name">{a.nome}</div>
                  {a.markdownConvertido && <div className="md-badge">✓ Convertido em Markdown</div>}
                  {a.markdownRecusado && <div className="md-declined">Anexado como está — sem conversão para Markdown.</div>}
                  {!a.markdownConvertido && !a.markdownRecusado && (
                    <div className="md-suggest">
                      Sugerimos converter para Markdown — ajuda o agente a ler com mais precisão. <strong>Não é obrigatório.</strong>
                      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                        <button className="btn btn-sm" onClick={() => converterMarkdown(a.id, true)}>
                          Converter
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => converterMarkdown(a.id, false)}>
                          Manter como está
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={`readiness-bar${pronto ? " ready" : ""}`}>
          <div className="rd-main">
            <div className="rd-title">{pronto ? "Já dá para gerar a minuta" : "Ainda não dá para gerar"}</div>
            <div className="rd-detail">
              {pronto
                ? "Fatos e pedidos preenchidos no questionário — é o mínimo. Os documentos desta tela enriquecem a peça, mas não são obrigatórios."
                : `Falta preencher o mínimo desta sessão: ${faltando.join(" e ")}, no questionário.`}
            </div>
          </div>
        </div>
      </div>

      <div className="sticky-bar">
        <div className="left">
          {documentosExistentes.length} documento(s) do Lúmen · {anexos.length} anexo(s) novo(s)
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {!pronto && <span className="quiet" style={{ fontSize: 11.5 }}>Volte ao questionário e preencha fatos e pedidos</span>}
          <button className="btn btn-ghost" disabled={!pronto} onClick={() => router.push(`/peticionamento/${sessaoId}/confirmar`)}>
            Gerar sem documentos
          </button>
          <button className="btn btn-primary" disabled={!pronto} onClick={() => router.push(`/peticionamento/${sessaoId}/confirmar`)}>
            Gerar minuta
          </button>
        </div>
      </div>
    </>
  );
}
