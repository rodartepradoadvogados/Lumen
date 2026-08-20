"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { FileText, Loader2, UploadCloud } from "lucide-react";
import { salvarTimbrado } from "@/lib/actions/settings";

// Papel timbrado DESTE escritório para os relatórios (multi-tenant — ver salvarTimbrado em
// lib/actions/settings.ts). É o arquivo do papel timbrado em si, não um logotipo solto: o
// relatório em Word é gerado dentro dele, preservando cabeçalho, rodapé e margens.
//
// Não confundir com o "Timbrado (Peticionar)", cadastrado em Modelos de Documento, que é a folha
// de petição em Google Docs.
const ACEITOS = ".docx,.pdf";

function formatoDe(nome: string): "DOCX" | "PDF" | null {
  const n = nome.toLowerCase();
  if (n.endsWith(".docx")) return "DOCX";
  if (n.endsWith(".pdf")) return "PDF";
  return null;
}

export default function TimbradoForm({
  timbradoUrl,
  timbradoNomeArquivo,
  timbradoFormato,
}: {
  timbradoUrl: string | null;
  timbradoNomeArquivo: string | null;
  timbradoFormato: string | null;
}) {
  const router = useRouter();
  const [atual, setAtual] = useState({ url: timbradoUrl, nome: timbradoNomeArquivo, formato: timbradoFormato });
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [removendo, startRemover] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  async function enviar(file: File) {
    setErro(null);
    setOk(false);
    const formato = formatoDe(file.name);
    if (!formato) {
      setErro("Envie o papel timbrado em .docx (Word) ou .pdf.");
      return;
    }
    setEnviando(true);
    try {
      const blob = await upload(file.name, file, { access: "public", handleUploadUrl: "/api/attachments/blob-token" });
      const r = await salvarTimbrado({ url: blob.url, nomeArquivo: file.name, formato });
      if (r.error) {
        setErro(r.error);
        return;
      }
      setAtual({ url: blob.url, nome: file.name, formato });
      setOk(true);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? `Erro ao enviar o papel timbrado: ${e.message}` : "Erro ao enviar o papel timbrado.");
    } finally {
      setEnviando(false);
    }
  }

  function remover() {
    setErro(null);
    setOk(false);
    startRemover(async () => {
      const r = await salvarTimbrado({ url: null, nomeArquivo: null, formato: null });
      if (r.error) setErro(r.error);
      else {
        setAtual({ url: null, nome: null, formato: null });
        router.refresh();
      }
    });
  }

  return (
    <div className="p-5 flex flex-col gap-3">
      {atual.url && (
        <div className="flex items-center gap-3 border border-regua bg-sf-apoio px-3 py-2.5">
          <FileText size={17} className="text-tx-2 shrink-0" />
          <div className="min-w-0 flex-1">
            <a href={atual.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-acao hover:underline truncate block">
              {atual.nome ?? "Papel timbrado"}
            </a>
            <p className="text-[11px] text-tx-2">
              {atual.formato === "DOCX"
                ? "O relatório em Word é gerado dentro deste arquivo."
                : "PDF fica guardado como referência — o Word não pode ser gerado dentro de um PDF."}
            </p>
          </div>
          <button
            type="button"
            onClick={remover}
            disabled={removendo}
            className="text-[11px] font-semibold text-tx-3 hover:text-atencao shrink-0 disabled:opacity-50"
          >
            Remover
          </button>
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          const f = e.dataTransfer.files?.[0];
          if (f) enviar(f);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-1.5 border-2 border-dashed p-5 cursor-pointer transition-colors ${
          arrastando ? "border-acao bg-acao-bg" : "border-regua hover:border-acao/40 hover:bg-sf-apoio"
        }`}
      >
        {enviando ? <Loader2 size={20} className="text-tx-2 animate-spin" /> : <UploadCloud size={20} className="text-tx-2" />}
        <p className="text-xs text-tx-2 text-center">
          {enviando ? "Enviando…" : atual.url ? "Arraste outro arquivo aqui para substituir, ou clique para selecionar" : "Arraste o papel timbrado aqui, ou clique para selecionar"}
        </p>
        <p className="text-[11px] text-tx-3">Word (.docx) ou PDF</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACEITOS}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) enviar(f);
            e.target.value = "";
          }}
        />
      </div>

      <p className="text-[11px] text-tx-3">
        Envie em <strong className="text-tx-2">.docx</strong> para o relatório sair dentro do seu papel timbrado, com cabeçalho, rodapé e
        margens preservados. Um timbrado em PDF não pode receber o conteúdo do Word: nesse caso o relatório sai com o nome e o CNPJ do
        escritório no topo.
      </p>

      {erro && <p className="text-xs text-urgente bg-urgente-bg px-2.5 py-1.5">{erro}</p>}
      {ok && <p className="text-xs text-concluido bg-concluido-bg px-2.5 py-1.5">Papel timbrado salvo.</p>}
    </div>
  );
}
