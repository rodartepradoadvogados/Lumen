"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QrCode, RefreshCw, Loader2 } from "lucide-react";
import { salvarServidorEvolution, pedirQrEvolution, estadoEvolution, desconectarEvolution } from "@/lib/actions/whatsappEvolution";
import { TEXTO_DO_ESTADO, type EstadoDaConexao } from "@/lib/qrDaEvolution";

// ============================================================================
// LER O QR E PRONTO.
//
// O QR do WhatsApp VENCE em menos de um minuto — é assim no protocolo, não é defeito daqui. Uma
// tela que mostra o QR e fica parada entrega um código morto a quem foi buscar o celular na outra
// sala, e a pessoa conclui que o sistema não funciona. Por isso o código é renovado sozinho, e
// por isso a tela diz quanto falta.
//
// A PERGUNTA "JÁ CONECTOU?" TEM HORA PARA ACABAR. Depois de cinco minutos sem ninguém ler o QR, a
// tela para de perguntar e oferece um botão. Ficar batendo no servidor do escritório para sempre
// porque alguém deixou uma aba aberta não é aceitável.
// ============================================================================

const SEGUNDOS_DO_QR = 30;
const INTERVALO_DA_PERGUNTA_MS = 3_000;
const TEMPO_MAXIMO_MS = 5 * 60_000;

export default function ConexaoEvolution({
  configurado,
  displayPhone,
  endereco,
}: {
  configurado: boolean;
  displayPhone: string | null;
  endereco: string | null;
}) {
  const router = useRouter();
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const [qr, setQr] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoDaConexao | null>(null);
  const [buscandoQr, setBuscandoQr] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [desistiu, setDesistiu] = useState(false);

  // Instante em que esta tentativa começou — usado para parar depois de cinco minutos. Fica num
  // ref, e não no estado: mudar isso não precisa redesenhar nada.
  const comecouEm = useRef<number | null>(null);

  async function salvarServidor(formData: FormData) {
    setErro(null);
    setSalvo(false);
    setSalvando(true);
    const r = await salvarServidorEvolution({
      baseUrl: String(formData.get("baseUrl") || ""),
      apiKey: String(formData.get("apiKey") || ""),
      displayPhone: String(formData.get("displayPhone") || ""),
    });
    setSalvando(false);
    if (r.erro) {
      setErro(r.erro);
      return;
    }
    setSalvo(true);
    router.refresh();
  }

  const buscarQr = useCallback(async () => {
    setErro(null);
    setDesistiu(false);
    setBuscandoQr(true);
    const r = await pedirQrEvolution();
    setBuscandoQr(false);
    if (r.erro) {
      setErro(r.erro);
      setQr(null);
      return;
    }
    setQr(r.qr ?? null);
    setEstado(r.estado ?? null);
    setSegundos(SEGUNDOS_DO_QR);
    if (comecouEm.current === null) comecouEm.current = Date.now();
    if (r.estado === "conectado") router.refresh();
  }, [router]);

  // O relógio do QR: conta para trás e, ao chegar a zero, pede outro.
  useEffect(() => {
    if (!qr || estado === "conectado" || desistiu) return;
    if (segundos <= 0) {
      void buscarQr();
      return;
    }
    const t = setTimeout(() => setSegundos((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [qr, segundos, estado, desistiu, buscarQr]);

  // "Já conectou?" — de três em três segundos, enquanto o QR está na tela.
  useEffect(() => {
    if (!qr || estado === "conectado" || desistiu) return;
    const t = setInterval(async () => {
      if (comecouEm.current !== null && Date.now() - comecouEm.current > TEMPO_MAXIMO_MS) {
        setDesistiu(true);
        setQr(null);
        return;
      }
      const r = await estadoEvolution();
      if (r.erro) return; // Uma falha isolada não derruba a tela: a próxima pergunta tenta de novo.
      setEstado(r.estado ?? null);
      if (r.estado === "conectado") {
        setQr(null);
        router.refresh();
      }
    }, INTERVALO_DA_PERGUNTA_MS);
    return () => clearInterval(t);
  }, [qr, estado, desistiu, router]);

  async function desconectarAparelho() {
    if (!confirm("Desligar o celular desta conexão? As conversas já registradas não são apagadas, e o endereço do servidor continua salvo.")) return;
    setErro(null);
    setSalvando(true);
    const r = await desconectarEvolution();
    setSalvando(false);
    if (r.erro) {
      setErro(r.erro);
      return;
    }
    setEstado("desconectado");
    setQr(null);
    comecouEm.current = null;
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <form action={salvarServidor} className="space-y-3 max-w-sm">
        <div>
          <label className="text-xs font-medium text-tx-2">Endereço do servidor Evolution</label>
          <input
            name="baseUrl"
            required
            defaultValue={endereco ?? ""}
            placeholder="https://seu-servidor.exemplo/evolution"
            className="cfg-input w-full"
          />
          <p className="text-etiqueta text-tx-3 mt-1">Precisa ser https — a chave e as mensagens dos clientes passam por aqui.</p>
        </div>
        <div>
          <label className="text-xs font-medium text-tx-2">Chave da API (AUTHENTICATION_API_KEY)</label>
          <input name="apiKey" type="password" required className="cfg-input w-full" />
          <p className="text-etiqueta text-tx-3 mt-1">Guardada no servidor e nunca devolvida a esta tela — por isso o campo aparece vazio.</p>
        </div>
        <div>
          <label className="text-xs font-medium text-tx-2">Número exibido (opcional, só para referência)</label>
          <input name="displayPhone" defaultValue={displayPhone ?? ""} placeholder="+55 62 99999-0000" className="cfg-input w-full" />
        </div>
        <button
          type="submit"
          disabled={salvando}
          className="bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2 disabled:opacity-50 transition-colors"
        >
          {salvando ? "Salvando..." : configurado ? "Atualizar servidor" : "Salvar servidor"}
        </button>
        {salvo && (
          <p className="flex items-center gap-2 border-l-[3px] border-concluido text-concluido bg-sf-apoio px-2.5 py-1.5 text-etiqueta">
            Servidor salvo. Agora leia o QR code abaixo.
          </p>
        )}
      </form>

      {configurado && (
        <div className="border-t border-regua pt-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={buscarQr}
              disabled={buscandoQr}
              className="inline-flex items-center gap-1.5 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2 disabled:opacity-50 transition-colors"
            >
              {buscandoQr ? <Loader2 size={14} className="animate-spin" /> : <QrCode size={14} />}
              {buscandoQr ? "Falando com o servidor..." : qr ? "Gerar outro QR" : "Ler o QR code"}
            </button>
            {estado && (
              <span
                className={`text-xs font-medium ${
                  estado === "conectado" ? "text-concluido" : estado === "conectando" ? "text-aviso" : "text-tx-2"
                }`}
              >
                {TEXTO_DO_ESTADO[estado]}
              </span>
            )}
            {estado === "conectado" && (
              <button
                type="button"
                onClick={desconectarAparelho}
                disabled={salvando}
                className="text-sm font-semibold text-vinho hover:underline disabled:opacity-50"
              >
                Desligar o celular
              </button>
            )}
          </div>

          {qr && (
            <div className="flex items-start gap-4 flex-wrap">
              {/* eslint-disable-next-line @next/next/no-img-element -- QR em data: URL validado em lib/qrDaEvolution.ts; next/image não serve data: URL. */}
              <img src={qr} alt="QR code para conectar o WhatsApp" width={220} height={220} className="border border-regua bg-white p-2 rounded-md" />
              <ol className="text-xs text-tx-2 space-y-1.5 max-w-xs list-decimal pl-4">
                <li>No celular do escritório, abra o WhatsApp.</li>
                <li>Toque nos três pontinhos e depois em <strong>Aparelhos conectados</strong>.</li>
                <li>Toque em <strong>Conectar um aparelho</strong> e aponte a câmera para este código.</li>
                <li className="text-tx-3">
                  O código se renova sozinho em {segundos}s — não precisa clicar em nada se ele mudar enquanto você busca o celular.
                </li>
              </ol>
            </div>
          )}

          {desistiu && (
            <p className="flex items-center gap-2 border-l-[3px] border-aviso text-aviso bg-sf-apoio px-2.5 py-1.5 text-etiqueta">
              <RefreshCw size={12} className="shrink-0" />
              Ninguém leu o QR em cinco minutos, então parei de perguntar ao servidor. Clique em “Ler o QR code” quando estiver com o celular em mãos.
            </p>
          )}
        </div>
      )}

      {erro && <p className="flex items-center gap-2 border-l-[3px] border-vinho text-vinho bg-sf-apoio px-2.5 py-1.5 text-etiqueta">{erro}</p>}
    </div>
  );
}
