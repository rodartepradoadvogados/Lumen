"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { definirDocumentosSelecionados, anexarNovoDocumento } from "@/lib/actions/peticionamento";
import { criarGravadorSerial, resumoDaSelecao, agruparPorItem, type DocumentoDoSeletor } from "@/lib/peticionamentoSeletorDocumentos";
import { SeletorDeDocumentos } from "./SeletorDeDocumentos";
import { useSaidaDoPeticionamento } from "./SaidaContext";

// Cada documento chega com o ITEM a que pertence (processo, licitação, parecer, atendimento ou
// "documentos gerais"), já estruturado em listarDocumentosDoVinculo — o seletor agrupa, filtra e
// busca por esses campos, nunca por rótulo de texto.
type DocExistente = DocumentoDoSeletor;
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
  const [selecionados, setSelecionados] = useState<string[]>(jaSelecionados);
  const [anexos, setAnexos] = useState<Anexo[]>(anexosIniciais);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // UMA gravação por ação, em fila serial e com o pedido mais novo vencendo (ver
  // criarGravadorSerial): "selecionar todos" de 9 documentos eram 9 chamadas concorrentes e a última a
  // CHEGAR ao servidor vencia. Se o servidor recusar, a tela volta ao último estado que ele confirmou.
  const gravador = useRef<ReturnType<typeof criarGravadorSerial> | null>(null);
  if (!gravador.current) {
    gravador.current = criarGravadorSerial(
      (ids) => definirDocumentosSelecionados(sessaoId, ids),
      (ultimoConfirmado) => {
        setSelecionados(ultimoConfirmado);
        setErro("Não foi possível gravar a seleção de documentos. Recarregue a página e tente de novo.");
      },
      jaSelecionados,
    );
  }
  function mudarSelecao(novo: string[]) {
    setSelecionados(novo);
    setErro(null);
    marcarTrabalho();
    void gravador.current!.pedir(novo);
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

  const itens = useMemo(() => agruparPorItem(documentosExistentes), [documentosExistentes]);
  const resumo = resumoDaSelecao(itens, new Set(selecionados));

  const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

  return (
    <div className="sel-pagina">
      <div className="page-head sel-cab-pagina">
        <div>
          <h1>Documentos</h1>
          <p>Marque o que o agente deve ler, filtrando por tipo e buscando; abra só o item que interessa. O agente lê o conteúdo de cada documento diretamente — não há conversão nenhuma a fazer aqui.</p>
        </div>
      </div>

      <div className="sel-corpo">
        <SeletorDeDocumentos
          documentos={documentosExistentes}
          selecionados={selecionados}
          aoMudar={mudarSelecao}
          semDocumentos={
            <>
              <h3>Nenhum documento no contexto vinculado</h3>
              <p>Nenhum processo, licitação ou demanda do vínculo tem arquivos (ou a sessão é avulsa). Você pode anexar um documento novo ao lado, só para esta minuta.</p>
            </>
          }
        />

        <aside className="sel-lateral" aria-label="Anexar novo documento">
          {erro && <div className="callout callout-danger">{erro}</div>}
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
            <div className="quiet" style={{ fontSize: 12 }}>{enviando ? "Enviando…" : "Até 25 MB por arquivo"}</div>
          </div>
          <div className="upload-list">
            {anexos.map((a) => (
              <div key={a.id} className="upload-item">
                <div className="name">{a.nome}</div>
              </div>
            ))}
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
          <p className="quiet" style={{ fontSize: 12, marginTop: 10 }}>
            Documentos anexados aqui só-para-esta-sessão podem, ao final, ser promovidos a anexo oficial do processo — ou continuar em{" "}
            <span className="mono">Peticionamento/</span> até limpeza manual. Nada é apagado sozinho.
          </p>
        </aside>
      </div>

      <div className="sticky-bar sel-resumo">
        <div className="sel-resumo-txt" aria-live="polite">
          <b>
            <span className="mono">{resumo.documentos}</span> {plural(resumo.documentos, "documento selecionado", "documentos selecionados")} de{" "}
            <span className="mono">{resumo.itens}</span> {plural(resumo.itens, "item", "itens")}
          </b>
          <span>
            {resumo.totalItens} {plural(resumo.totalItens, "item", "itens")} · {resumo.totalDocumentos} {plural(resumo.totalDocumentos, "documento disponível", "documentos disponíveis")} · {anexos.length} {plural(anexos.length, "anexo novo", "anexos novos")}
          </span>
        </div>
        <div className="sel-resumo-bt">
          {!pronto && <span className="quiet" style={{ fontSize: 12 }}>Volte ao questionário e preencha fatos e pedidos</span>}
          <button className="btn btn-ghost" disabled={resumo.documentos === 0 && selecionados.length === 0} onClick={() => mudarSelecao([])}>
            Limpar seleção
          </button>
          <button className="btn btn-ghost" disabled={!pronto} onClick={() => router.push(`/peticionamento/${sessaoId}/confirmar`)}>
            Gerar sem documentos
          </button>
          <button className="btn btn-primary" disabled={!pronto} onClick={() => router.push(`/peticionamento/${sessaoId}/confirmar`)}>
            Gerar minuta
          </button>
        </div>
      </div>
    </div>
  );
}
