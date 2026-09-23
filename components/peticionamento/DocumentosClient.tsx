"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirDocumentosSelecionados, anexarNovoDocumento } from "@/lib/actions/peticionamento";
import { agruparDocumentosPorDemanda } from "@/lib/peticionamentoDocumentosDemanda";
import { useSaidaDoPeticionamento } from "./SaidaContext";

// `demanda` agrupa o documento dentro da assessoria vinculada (ex.: "Processo: Fulano x
// Beltrano", "Licitação: Pregão 12/2026") — null para documento de processo/atendimento
// vinculado direto (sem outro nível, exatamente como já era) e para documento geral da
// assessoria, sem demanda nenhuma.
type DocExistente = { id: string; name: string; docType: string; driveUrl: string; demanda: string | null };
type Anexo = { id: string; nome: string };

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
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function alternar(id: string) {
    const novo = selecionados.includes(id) ? selecionados.filter((x) => x !== id) : [...selecionados, id];
    setSelecionados(novo);
    marcarTrabalho();
    iniciar(async () => {
      await definirDocumentosSelecionados(sessaoId, novo);
    });
  }

  // O ÚNICO PORTÃO de envio — quem clica (input de arquivo) e quem arrasta (onDrop, abaixo) chamam
  // esta MESMA função, então a validação de tamanho e tipo (hoje em anexarNovoDocumento,
  // lib/actions/peticionamento.ts) vale igual para os dois caminhos. Nunca duplicar esta chamada.
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
    setAnexos((a) => [...a, { id: crypto.randomUUID(), nome: resultado.nome }]);
  }

  // Vários arquivos soltos de uma vez — aceita todos, um de cada vez, pelo mesmo caminho de cima.
  // Erro num arquivo não interrompe os demais (cada enviarArquivo trata o próprio erro).
  async function enviarArquivos(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      await enviarArquivo(file);
    }
  }

  function aoSoltarArquivo(e: React.DragEvent<HTMLDivElement>) {
    // SEM preventDefault aqui o navegador abre o arquivo solto como se fosse uma aba nova e SAI
    // desta página — o erro clássico de dropzone que só tem onClick.
    e.preventDefault();
    setArrastando(false);
    if (e.dataTransfer.files?.length) enviarArquivos(e.dataTransfer.files);
  }

  // Agrupamento por demanda — regra em lib/peticionamentoDocumentosDemanda.ts (módulo puro,
  // exercitado em lib/testes/peticionamentoDocumentos.teste.ts).
  const { soltos, grupos } = agruparDocumentosPorDemanda(documentosExistentes);

  function linhaDoDocumento(d: DocExistente) {
    return (
      <label key={d.id} className="doc-row">
        <input type="checkbox" checked={selecionados.includes(d.id)} onChange={() => alternar(d.id)} disabled={pendente} />
        <div>
          <div className="name">{d.name}</div>
          <div className="meta">{d.docType}</div>
        </div>
      </label>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Documentos</h1>
          <p>Escolha o que já existe no processo vinculado e, se precisar, anexe algo novo só para esta minuta. O agente lê o conteúdo de cada documento diretamente — não há conversão nenhuma a fazer aqui.</p>
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
              <>
                {soltos.length > 0 && <div className="doc-list">{soltos.map(linhaDoDocumento)}</div>}
                {grupos.map(([demanda, docs]) => (
                  <div key={demanda} className="doc-group">
                    <h3 className="doc-group-title">{demanda}</h3>
                    <div className="doc-list">{docs.map(linhaDoDocumento)}</div>
                  </div>
                ))}
              </>
            )}
            <p className="quiet" style={{ fontSize: 12, marginTop: 10 }}>
              Documentos anexados aqui só-para-esta-sessão podem, ao final, ser promovidos a anexo oficial do processo — ou continuar em{" "}
              <span className="mono">Peticionamento/</span> até limpeza manual. Nada é apagado sozinho.
            </p>
          </div>

          <div className="col">
            <h2>Anexar novo documento</h2>
            <p className="col-hint">PDF, DOCX, imagem digitalizada ou áudio transcrito. Até 25 MB. Arraste um ou mais arquivos para a área abaixo, ou clique para escolher.</p>
            <div
              className={`dropzone${arrastando ? " dropzone-ativa" : ""}`}
              onClick={() => inputRef.current?.click()}
              onDragEnter={(e) => {
                e.preventDefault();
                setArrastando(true);
              }}
              onDragOver={(e) => {
                // preventDefault É OBRIGATÓRIO aqui também — sem ele o navegador nunca dispara
                // onDrop, e trata o arraste como navegação para o arquivo.
                e.preventDefault();
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setArrastando(false);
              }}
              onDrop={aoSoltarArquivo}
              style={{ cursor: "pointer" }}
            >
              <strong>{arrastando ? "Solte para anexar" : "Clique ou arraste um arquivo para anexar"}</strong>
              <input
                ref={inputRef}
                type="file"
                multiple
                style={{ display: "none" }}
                onChange={(e) => {
                  if (e.target.files?.length) enviarArquivos(e.target.files);
                  e.target.value = "";
                }}
              />
              <div className="quiet" style={{ fontSize: 11.5 }}>{enviando ? "Enviando…" : "Até 25 MB por arquivo"}</div>
            </div>
            <div className="upload-list">
              {anexos.map((a) => (
                <div key={a.id} className="upload-item">
                  <div className="name">{a.nome}</div>
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
