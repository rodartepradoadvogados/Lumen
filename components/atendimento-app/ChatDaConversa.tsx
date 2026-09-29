"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Ear, FileText, Image as ImageIcon, Mic, Smile, Video } from "lucide-react";
import IconeAgente from "@/components/IconeAgente";
import RolarParaOFim from "@/components/atendimento/RolarParaOFim";
import { agruparMensagensPorDia, mesclarMensagens, type MensagemDoChat, type MidiaDaMensagem } from "@/lib/mensagensDoChat";

// O CHAT EM MODO LEITURA (Onda A). Abre JÁ ROLADO NO FIM (RolarParaOFim, o mesmo do site: abre na
// última mensagem, acompanha as novas e, se a pessoa está lendo mais acima, avisa "↓ N novas" em vez
// de arrancá-la de lá). Traz as últimas 60; "Carregar mensagens anteriores" busca as de antes em
// blocos de 60 (rota JSON com o recorte de acesso) e mantém o ponto de leitura no lugar.
//
// Bolha de canto vivo de 2 px. Recebida em branco; enviada por pessoa em ouro suave; da Ana com borda de
// ouro e o nome. Quem falou nunca depende de cor: a bolha tem lado, e o leitor de tela ouve "Cliente"
// ou "Escritório". MÍDIA É RÓTULO ("Imagem", "Documento: contrato.pdf"); o ÁUDIO mostra o rótulo e a
// transcrição, "para consulta da equipe" — a transcrição nunca é uma mensagem e o cliente nunca a vê.
// Toque na bolha não faz nada (as ações chegam com o envio).

type Pagina = { mensagens: MensagemDoChat[]; temAnteriores: boolean; cursorDasAnteriores: string | null };

const ICONE_DA_MIDIA: Record<MidiaDaMensagem["tipo"], typeof FileText> = {
  imagem: ImageIcon,
  documento: FileText,
  audio: Mic,
  video: Video,
  figurinha: Smile,
};

export default function ChatDaConversa({
  idDaConversa,
  inicial,
  nomeDoAtendente,
  semWhatsapp,
}: {
  idDaConversa: string;
  inicial: Pagina;
  nomeDoAtendente: string;
  semWhatsapp: boolean;
}) {
  const [todas, setTodas] = useState<MensagemDoChat[]>(inicial.mensagens);
  const [temAnteriores, setTemAnteriores] = useState(inicial.temAnteriores);
  const [cursor, setCursor] = useState<string | null>(inicial.cursorDasAnteriores);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // O ponto de corte: só o que é MAIS NOVO que a primeira mensagem da primeira página conta como
  // "nova" para o aviso "↓ N novas" (carregar anteriores não pode acender o aviso).
  const corte = useRef(inicial.mensagens[0]?.criadoEm ?? "");
  const caixa = useRef<HTMLDivElement>(null);
  const restaurar = useRef<{ altura: number; topo: number } | null>(null);

  // A atualização periódica (router.refresh) traz uma página nova: junta com o que já está na tela.
  useEffect(() => {
    setTodas((atuais) => mesclarMensagens(atuais, inicial.mensagens));
    if (!corte.current && inicial.mensagens[0]) corte.current = inicial.mensagens[0].criadoEm;
  }, [inicial.mensagens]);

  // Depois de prepender as anteriores, o ponto de leitura fica onde estava (a altura cresceu no topo).
  useLayoutEffect(() => {
    const c = caixa.current;
    const r = restaurar.current;
    if (c && r) {
      c.scrollTop = c.scrollHeight - r.altura + r.topo;
      restaurar.current = null;
    }
  }, [todas]);

  async function carregarAnteriores() {
    if (carregando || !cursor) return;
    setCarregando(true);
    setErro(null);
    try {
      const resp = await fetch(`/api/atendimento/${encodeURIComponent(idDaConversa)}/mensagens?antes=${encodeURIComponent(cursor)}`, { cache: "no-store" });
      if (!resp.ok) throw new Error(String(resp.status));
      const pagina = (await resp.json()) as Pagina;
      const c = caixa.current;
      if (c) restaurar.current = { altura: c.scrollHeight, topo: c.scrollTop };
      setTodas((atuais) => mesclarMensagens(atuais, pagina.mensagens));
      setTemAnteriores(pagina.temAnteriores);
      setCursor(pagina.cursorDasAnteriores);
    } catch {
      setErro("Não foi possível carregar as mensagens anteriores. Confira a internet e tente de novo.");
    } finally {
      setCarregando(false);
    }
  }

  const grupos = useMemo(() => agruparMensagensPorDia(todas), [todas]);
  const totalNaCauda = useMemo(() => todas.filter((m) => m.criadoEm >= corte.current).length, [todas]);
  const ultima = todas[todas.length - 1];

  return (
    <div
      ref={caixa}
      data-rolagem-da-conversa=""
      role="log"
      aria-label="Mensagens da conversa"
      aria-live="off"
      tabIndex={0}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-sf-fundo px-3 pb-3 pt-2"
    >
      {todas.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center px-6 text-center text-tx-2">
          <p className="text-destaque font-semibold text-tx">{semWhatsapp ? "Sem conversa de WhatsApp" : "Nenhuma mensagem ainda"}</p>
          <p className="mt-1 text-corpo">
            {semWhatsapp ? "Este atendimento não tem WhatsApp. Veja os dados e os e-mails em Detalhes." : "Quando o cliente escrever, as mensagens aparecem aqui."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {temAnteriores && (
            <div className="flex flex-col items-center gap-1 py-2">
              <button
                type="button"
                onClick={carregarAnteriores}
                disabled={carregando}
                className="inline-flex min-h-11 items-center rounded-[2px] border border-regua-forte bg-sf px-4 text-corpo font-semibold text-tx disabled:opacity-60"
              >
                {carregando ? "Carregando…" : "Carregar mensagens anteriores"}
              </button>
              {erro && (
                <p role="alert" className="max-w-xs text-center text-etiqueta font-semibold text-urgente">
                  {erro}
                </p>
              )}
            </div>
          )}
          {grupos.map((g) => (
            <section key={g.dia} aria-label={g.rotulo} className="flex flex-col gap-1">
              <h2 className="mx-auto mb-1 mt-3 rounded-[2px] border border-regua bg-sf-apoio px-2.5 py-0.5 text-etiqueta font-bold uppercase tracking-wider text-tx-2">
                {g.rotulo}
              </h2>
              {g.mensagens.map((m) => (
                <Bolha key={m.id} m={m} nomeDoAtendente={nomeDoAtendente} />
              ))}
            </section>
          ))}
          <RolarParaOFim conversa={idDaConversa} chave={ultima?.id ?? "vazia"} total={totalNaCauda} />
        </div>
      )}
    </div>
  );
}

function Bolha({ m, nomeDoAtendente }: { m: MensagemDoChat; nomeDoAtendente: string }) {
  const saiu = m.direction === "OUT";
  const autor = saiu ? (m.porAgente ? nomeDoAtendente : "Escritório") : "Cliente";
  const Icone = m.midia ? ICONE_DA_MIDIA[m.midia.tipo] : null;
  return (
    <div className={`flex ${saiu ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[84%] break-words rounded-[2px] border px-2.5 pb-1 pt-1.5 [overflow-wrap:anywhere] ${
          saiu ? "bg-atd-bolha-out" : "bg-atd-bolha-in"
        } ${m.porAgente ? "border-ouro-acento" : saiu ? "border-regua-forte" : "border-regua"} ${m.falhou ? "border-urgente" : ""}`}
      >
        <span className="sr-only">{autor} disse: </span>
        {saiu && m.porAgente && (
          <p className="mb-0.5 flex items-center gap-1.5 text-etiqueta font-bold text-tx-2">
            <IconeAgente size={12} className="text-tx-3" />
            {nomeDoAtendente}
          </p>
        )}
        {m.midia && Icone && (
          <p className="mb-1 flex items-center gap-2 rounded-[2px] border border-regua bg-sf-apoio px-2 py-1.5 text-corpo font-semibold text-tx">
            <Icone size={18} aria-hidden="true" className="shrink-0 text-tx-2" />
            <span className="min-w-0 [overflow-wrap:anywhere]">{m.midia.nome ? `${m.midia.rotulo}: ${m.midia.nome}` : m.midia.rotulo}</span>
          </p>
        )}
        {m.texto && <p className="whitespace-pre-wrap text-corpo text-tx">{m.texto}</p>}
        {m.transcricao && (
          <div className="mt-1.5 rounded-[2px] border border-regua bg-atd-ardosia-bg px-2 py-1.5">
            <p className="mb-0.5 flex items-center gap-1.5 text-etiqueta font-bold text-atd-ardosia">
              <Ear size={13} aria-hidden="true" />
              Transcrição do áudio, para consulta da equipe
            </p>
            <p className={`whitespace-pre-wrap text-corpo text-tx-2 ${m.transcricao.ehConteudo ? "italic" : ""}`}>
              {m.transcricao.ehConteudo ? `“${m.transcricao.texto}”` : m.transcricao.texto}
            </p>
          </div>
        )}
        <p className="mt-0.5 flex items-center justify-end gap-1.5 text-etiqueta tabular-nums text-tx-3">
          {m.falhou && (
            <span className="inline-flex items-center gap-1 font-semibold text-urgente">
              <AlertTriangle size={12} aria-hidden="true" /> Não enviada
            </span>
          )}
          {m.enviada && (
            <span className="inline-flex items-center gap-0.5" title="Enviada">
              <Check size={12} aria-hidden="true" />
              <span className="sr-only">Enviada</span>
            </span>
          )}
          <time dateTime={m.criadoEm}>{m.hora}</time>
        </p>
      </div>
    </div>
  );
}
