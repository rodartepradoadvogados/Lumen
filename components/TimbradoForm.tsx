"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Loader2, UploadCloud } from "lucide-react";
import { salvarTimbrado } from "@/lib/actions/settings";

// Timbrado das folhas impressas/PDF DESTE escritório (multi-tenant — ver salvarTimbrado em
// lib/actions/settings.ts). O logotipo sobe pro Vercel Blob, a mesma infra dos anexos, porque a
// folha impressa precisa de uma URL pública e estável: link do Drive não renderiza em <img>.
//
// Não confundir com o "Timbrado (Peticionar)", que é um Google Doc (folha de petição) cadastrado
// logo acima em Modelos de Documento — este aqui é só o cabeçalho dos relatórios.
export default function TimbradoForm({ logoUrl, rodape }: { logoUrl: string | null; rodape: string | null }) {
  const router = useRouter();
  const [url, setUrl] = useState(logoUrl ?? "");
  const [texto, setTexto] = useState(rodape ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [salvando, startSalvar] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  async function enviarArquivo(file: File) {
    setErro(null);
    setOk(false);
    setEnviando(true);
    try {
      const blob = await upload(file.name, file, { access: "public", handleUploadUrl: "/api/attachments/blob-token" });
      setUrl(blob.url);
    } catch (e) {
      setErro(e instanceof Error ? `Erro ao enviar o logotipo: ${e.message}` : "Erro ao enviar o logotipo.");
    } finally {
      setEnviando(false);
    }
  }

  function salvar() {
    setErro(null);
    setOk(false);
    startSalvar(async () => {
      const r = await salvarTimbrado({ logoUrl: url, rodape: texto });
      if (r.error) setErro(r.error);
      else {
        setOk(true);
        router.refresh();
      }
    });
  }

  return (
    <div className="p-5 flex flex-col gap-3">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="h-16 w-40 border border-regua rounded-lg bg-sf-apoio flex items-center justify-center overflow-hidden shrink-0">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="Logotipo do escritório" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-[11px] text-tx-3">sem logotipo</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={enviando}
            className="inline-flex items-center gap-1.5 text-sm font-semibold border border-regua bg-sf hover:bg-sf-apoio text-tx rounded-lg px-3 py-2 disabled:opacity-50 w-fit"
          >
            {enviando ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
            {enviando ? "Enviando…" : url ? "Trocar logotipo" : "Enviar logotipo"}
          </button>
          {url && (
            <button type="button" onClick={() => setUrl("")} className="text-[11px] font-semibold text-tx-3 hover:text-atencao w-fit">
              Remover logotipo
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) enviarArquivo(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-tx-2">Rodapé do timbrado (endereço, telefone, OAB)</label>
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Rua X, 100 · Goiânia/GO · (62) 0000-0000"
          className="cfg-input w-full"
        />
      </div>

      {erro && <p className="text-xs text-urgente bg-urgente-bg rounded-lg px-2.5 py-1.5">{erro}</p>}
      {ok && <p className="text-xs text-concluido bg-concluido-bg rounded-lg px-2.5 py-1.5">Timbrado salvo.</p>}

      <button
        type="button"
        onClick={salvar}
        disabled={salvando}
        className="bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold rounded-lg px-4 py-2 w-fit disabled:opacity-50"
      >
        {salvando ? "Salvando…" : "Salvar timbrado"}
      </button>
    </div>
  );
}
