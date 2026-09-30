"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import RolarParaOFim from "@/components/atendimento/RolarParaOFim";
import BarraDoChat from "@/components/atendimento-app/BarraDoChat";
import BolhaDaMensagem from "@/components/atendimento-app/BolhaDaMensagem";
import CompositorDoChat from "@/components/atendimento-app/CompositorDoChat";
import AcoesDaMensagem from "@/components/atendimento-app/AcoesDaMensagem";
import FixadaDoChatTopo from "@/components/atendimento-app/FixadaDoChat";
import { trechoDaMensagem } from "@/lib/mensagemFixada";
import { agruparMensagensPorDia, cursorDaMaisNova, mesclarMensagens, type MensagemDoChat } from "@/lib/mensagensDoChat";
import type { EstadoDoChat } from "@/lib/estadoDoChat";
import { useAvisoDeMensagemNova } from "@/components/atendimento-app/useAvisoDeMensagemNova";
import { deveBuscarAgora, novasDoCliente } from "@/lib/avisoDeMensagemNova";
import { novaChaveDeMensagem, resultadoDoPedido } from "@/lib/envioDeMensagem";
import { resultadoDaNota } from "@/lib/notaDaConversa";
import { comoAguardandoConexao, decidirSaida, gravarPendentesNoAparelho, lerPendentesDoAparelho, novoPendente, pendenteComoMensagem, pendentesParaReenviarAoVoltar, semOsJaConfirmados, type Pendente } from "@/lib/filaDoChat";
import { registrarFalhaDeRede, registrarRedeOk } from "@/lib/conexaoDoApp";
import { useSemConexao } from "@/components/atendimento-app/useConexaoDoApp";

// O CHAT (Onda A: leitura; Onda B-1: ENVIO). Abre JÁ ROLADO NO FIM (RolarParaOFim: abre na última mensagem,
// acompanha as novas e, se a pessoa está lendo mais acima, avisa "↓ N novas" em vez de arrancá-la de
// lá). Traz as últimas 60; "Carregar mensagens anteriores" busca as de antes em blocos de 60.
//
// A ATUALIZAÇÃO A CADA 15 S é uma rota JSON leve (só o que chegou depois da última mensagem + o estado da
// conversa), e NÃO um `router.refresh()`: a página inteira não é rerenderizada, então nem a rolagem, nem o
// rascunho, nem o balão "enviando" podem ser levados junto. As mensagens do servidor se mesclam com as da
// tela por id, e o balão local vira o de verdade pela `clientMessageId`.
//
// O ENVIO: a mensagem ENTRA NA TELA AO TOCAR ENVIAR e fica com o estado (enviando, enviada, não enviada,
// sem confirmação). O POST leva uma chave por mensagem; tentar de novo REUSA a chave, e o servidor nunca
// duplica no WhatsApp (lib/envioDeMensagemDb.ts). Um tempo esgotado ou rede caída é "sem confirmação",
// nunca "não enviada": não se sabe se saiu.
//
// SEM CONEXÃO (R2B): tocar em enviar SEM rede não chama o servidor: o balão fica "Aguardando conexão" (guardado só
// em sessionStorage, como toda a fila) e SAI SOZINHO quando a conexão volta, com a MESMA chave — o servidor nunca
// duplica. Só sai sozinho o que NUNCA saiu (`aguardando`); o que saiu e ficou "sem confirmação" continua exigindo a
// ação de uma pessoa (lib/filaDoChat.ts, `pendentesParaReenviarAoVoltar`).
//
// LEITOR DE TELA: a lista é `role="log"` SEM aria-live (senão leria tudo a cada atualização); uma região
// `role="status"` à parte anuncia o que mudou (mensagem nova, estado do envio).

type Pagina = { mensagens: MensagemDoChat[]; temAnteriores: boolean; cursorDasAnteriores: string | null };

const INTERVALO_MS = 15_000;
const TEMPO_ESGOTADO_MS = 25_000;
const CURSOR_DO_INICIO = "1970-01-01T00:00:00.000Z|0";

function exibidasVazia(servidor: number, locais: number): boolean {
  return servidor + locais > 0;
}

export default function ChatDaConversa({
  idDaConversa,
  inicial,
  estadoInicial,
  agoraIso,
  nomeDoAtendente,
  nomeDoContato,
  primeiroNome,
  nomeTemporario,
  telefone,
}: {
  idDaConversa: string;
  inicial: Pagina;
  estadoInicial: EstadoDoChat;
  agoraIso: string;
  nomeDoAtendente: string;
  nomeDoContato: string;
  primeiroNome: string;
  nomeTemporario: boolean;
  telefone: string | null;
}) {
  const [todas, setTodas] = useState<MensagemDoChat[]>(inicial.mensagens);
  const [temAnteriores, setTemAnteriores] = useState(inicial.temAnteriores);
  const [cursor, setCursor] = useState<string | null>(inicial.cursorDasAnteriores);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoDoChat>(estadoInicial);
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => new Date(agoraIso));
  const [aviso, setAviso] = useState("");
  // PR 10: o menu da mensagem (Responder / Fixar) e a citação local (só na tela de quem responde).
  const [acoesDe, setAcoesDe] = useState<MensagemDoChat | null>(null);
  const [citando, setCitando] = useState<{ id: string; autor: string; trecho: string } | null>(null);
  // O ponto de corte: só o que é MAIS NOVO que a primeira mensagem da primeira página conta como
  // "nova" para o aviso "↓ N novas" (carregar anteriores não pode acender o aviso).
  const corte = useRef(inicial.mensagens[0]?.criadoEm ?? "");
  const caixa = useRef<HTMLDivElement>(null);
  const restaurar = useRef<{ altura: number; topo: number } | null>(null);
  const ultimaBusca = useRef(Date.now());
  const buscando = useRef(false);
  const conteudo = useRef<HTMLDivElement>(null);
  const pertoDoFim = useRef(true);
  const semConexao = useSemConexao();
  const vivo = useRef({ todas, pendentes, estado, semConexao });
  vivo.current = { todas, pendentes, estado, semConexao };
  // As chaves que já saíram por causa da volta da conexão: o mesmo pedido não parte duas vezes.
  const reenviando = useRef(new Set<string>());

  // As mensagens do aparelho voltam depois da hidratação (guardadas por conversa em sessionStorage).
  // `restaurado` impede que a gravação do estado inicial (vazio) apague o que estava guardado antes de ele
  // ser lido.
  const [restaurado, setRestaurado] = useState(false);
  useEffect(() => {
    const guardadas = lerPendentesDoAparelho(idDaConversa, new Date());
    if (guardadas.length > 0) {
      setPendentes((atuais) => {
        const ids = new Set(atuais.map((a) => a.clientMessageId));
        return semOsJaConfirmados([...guardadas.filter((g) => !ids.has(g.clientMessageId)), ...atuais], vivo.current.todas);
      });
    }
    setRestaurado(true);
  }, [idDaConversa]);

  useEffect(() => {
    if (restaurado) gravarPendentesNoAparelho(idDaConversa, pendentes);
  }, [idDaConversa, pendentes, restaurado]);

  // Depois de prepender as anteriores, o ponto de leitura fica onde estava (a altura cresceu no topo).
  useLayoutEffect(() => {
    const c = caixa.current;
    const r = restaurar.current;
    if (c && r) {
      c.scrollTop = c.scrollHeight - r.altura + r.topo;
      restaurar.current = null;
    }
  }, [todas]);

  // O CONTEÚDO CRESCEU (o balão "não enviada" ganha os botões, o campo cresce, chega mensagem): quem estava
  // no fim continua no fim — sem isto os botões de "Tentar de novo" ficavam cortados sob o campo. Quem lê mais
  // acima não é mexido (a distância é medida na última rolagem, antes do crescimento).
  const temConteudo = exibidasVazia(todas.length, pendentes.length);
  useEffect(() => {
    const c = caixa.current;
    const alvo = conteudo.current;
    if (!c || !alvo || typeof ResizeObserver === "undefined") return;
    const aoRolar = () => {
      pertoDoFim.current = c.scrollHeight - c.scrollTop - c.clientHeight < 80;
    };
    aoRolar();
    c.addEventListener("scroll", aoRolar, { passive: true });
    const obs = new ResizeObserver(() => {
      if (pertoDoFim.current) c.scrollTop = c.scrollHeight;
    });
    obs.observe(alvo);
    return () => {
      c.removeEventListener("scroll", aoRolar);
      obs.disconnect();
    };
  }, [temConteudo]);

  const anunciar = useCallback((texto: string) => setAviso(texto), []);
  const avisarEmSegundoPlano = useAvisoDeMensagemNova();

  // Vai até a mensagem fixada, se ela está na tela (mexe só na rolagem da conversa, nunca em `scrollIntoView`).
  const irParaAMensagem = useCallback(
    (id: string) => {
      const c = caixa.current;
      const alvo = c?.querySelector<HTMLElement>(`[data-mensagem="${CSS.escape(id)}"]`);
      if (!c || !alvo) return anunciar("A mensagem fixada é mais antiga. Toque em Carregar mensagens anteriores para chegar até ela.");
      c.scrollTop += alvo.getBoundingClientRect().top - c.getBoundingClientRect().top - 8;
    },
    [anunciar],
  );
  const responderA = useCallback((m: MensagemDoChat) => {
    const autor = m.direction === "OUT" ? (m.porAgente ? nomeDoAtendente : "Escritório") : "Cliente";
    setCitando({ id: m.id, autor, trecho: trechoDaMensagem(m.midia ? `[${m.midia.rotulo.toLowerCase()}] ${m.texto}` : m.texto, 140) });
  }, [nomeDoAtendente]);

  // ── A ATUALIZAÇÃO A CADA 15 SEGUNDOS ─────────────────────────────────────────────────────────────
  const buscarNovas = useCallback(async () => {
    // Fora de vista a busca continua, mais devagar (1 min): é o que permite pôr o número no título da aba.
    const visivel = document.visibilityState === "visible";
    if (buscando.current || !deveBuscarAgora(visivel, Date.now() - ultimaBusca.current)) return;
    buscando.current = true;
    ultimaBusca.current = Date.now();
    try {
      const depois = cursorDaMaisNova(vivo.current.todas) ?? CURSOR_DO_INICIO;
      let resp: Response;
      try {
        resp = await fetch(`/api/atendimento/${encodeURIComponent(idDaConversa)}/mensagens?depois=${encodeURIComponent(depois)}`, { cache: "no-store" });
      } catch {
        registrarFalhaDeRede();
        return;
      }
      registrarRedeOk();
      if (!resp.ok) return;
      const dados = (await resp.json()) as { mensagens: MensagemDoChat[]; estado: EstadoDoChat };
      setAgora(new Date());
      setEstado(dados.estado);
      if (dados.mensagens.length > 0) {
        setTodas((atuais) => mesclarMensagens(atuais, dados.mensagens));
        setPendentes((atuais) => semOsJaConfirmados(atuais, dados.mensagens));
        const entradas = dados.mensagens.filter((m) => m.direction === "IN" && !m.tipo);
        // Aba fora de vista: só o número, no título e no selo do app (sem nome nem texto). Visível: nada disto.
        avisarEmSegundoPlano(novasDoCliente(dados.mensagens));
        const avisos = dados.mensagens.filter((m) => m.tipo === "sistema");
        // A região viva só fala com a aba à vista (escondida não há quem ouça, e o texto ficaria velho).
        if (!visivel) {
          /* o título e o selo já cuidaram do aviso */
        } else if (avisos.length > 0) anunciar(`Aviso do sistema: ${avisos[avisos.length - 1].texto}`);
        else if (entradas.length === 1) anunciar(`Nova mensagem de ${nomeDoContato}: ${(entradas[0].texto || entradas[0].midia?.rotulo || "").slice(0, 200)}`);
        else if (entradas.length > 1) anunciar(`${entradas.length} novas mensagens de ${nomeDoContato}.`);
      }
    } catch {
      /* sem internet: tenta de novo no próximo ciclo; o que está na tela continua */
    } finally {
      buscando.current = false;
    }
  }, [idDaConversa, nomeDoContato, anunciar, avisarEmSegundoPlano]);

  useEffect(() => {
    const relogio = window.setInterval(buscarNovas, INTERVALO_MS);
    const aoVoltar = () => {
      if (document.visibilityState === "visible" && Date.now() - ultimaBusca.current >= INTERVALO_MS) void buscarNovas();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      window.clearInterval(relogio);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [buscarNovas]);

  // O relógio da barra anda sozinho entre uma busca e outra.
  useEffect(() => {
    const t = window.setInterval(() => setAgora(new Date()), 20_000);
    return () => window.clearInterval(t);
  }, []);

  // ── ENVIAR ────────────────────────────────────────────────────────────────────────────────────
  const irAoFim = () => {
    requestAnimationFrame(() => {
      const c = caixa.current;
      if (c) c.scrollTop = c.scrollHeight;
    });
  };

  const atualizarPendente = useCallback((chave: string, parte: Partial<Pendente>) => {
    setPendentes((atuais) => atuais.map((p) => (p.clientMessageId === chave ? { ...p, ...parte } : p)));
  }, []);

  const disparar = useCallback(
    async (p: Pendente, confirmouReenvio: boolean) => {
      const ehNota = p.nota === true;
      const eraRetentativaIncerta = p.estado === "sem-confirmacao";
      // SEM CONEXÃO: o pedido nem sai. O que nunca saiu espera ("Aguardando conexão") e parte sozinho ao voltar; o que
      // já tinha saído sem resposta NÃO é marcado para reenvio automático — a pessoa repete quando houver conexão.
      const saida = decidirSaida(p, vivo.current.semConexao || (typeof navigator !== "undefined" && navigator.onLine === false));
      if (saida === "aguardar") {
        setPendentes((atuais) => atuais.map((x) => (x.clientMessageId === p.clientMessageId ? comoAguardandoConexao(x) : x)));
        anunciar(ehNota ? "Sem conexão. A nota é salva quando a internet voltar." : "Sem conexão. A mensagem sai sozinha quando a internet voltar.");
        return;
      }
      if (saida === "avisar") {
        atualizarPendente(p.clientMessageId, { erro: "Sem conexão agora. Quando a internet voltar, toque em Tentar de novo.", podeTentarDeNovo: true });
        anunciar("Sem conexão. Tente de novo quando a internet voltar.");
        return;
      }
      atualizarPendente(p.clientMessageId, { estado: "enviando", erro: null, podeTentarDeNovo: false, aguardando: false });
      anunciar(ehNota ? "Salvando nota…" : "Enviando mensagem…");
      let status: number | null = null;
      let corpo: { codigo?: string; erro?: string; mensagem?: MensagemDoChat | null } | null = null;
      const controle = new AbortController();
      const limite = window.setTimeout(() => controle.abort(), TEMPO_ESGOTADO_MS);
      try {
        const resp = await fetch(`/api/atendimento/${encodeURIComponent(idDaConversa)}/mensagens`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ehNota ? { modo: "nota", clientMessageId: p.clientMessageId, texto: p.texto } : { clientMessageId: p.clientMessageId, texto: p.texto, confirmouReenvio }),
          cache: "no-store",
          signal: controle.signal,
        });
        status = resp.status;
        corpo = await resp.json().catch(() => null);
      } catch {
        status = null; // rede caiu ou tempo esgotado: NÃO se sabe se saiu
        registrarFalhaDeRede();
      } finally {
        window.clearTimeout(limite);
      }
      if (status !== null) registrarRedeOk();
      const r = ehNota ? resultadoDaNota(status, corpo) : resultadoDoPedido(status, corpo);
      if (r.estado === "enviada") {
        if (corpo?.mensagem) {
          const m = corpo.mensagem;
          setTodas((atuais) => mesclarMensagens(atuais, [m]));
          setPendentes((atuais) => atuais.filter((x) => x.clientMessageId !== p.clientMessageId));
        } else {
          atualizarPendente(p.clientMessageId, { estado: "enviada", erro: null, podeTentarDeNovo: false });
        }
        // Quem enviou assumiu: o servidor calou a Ana (só quando o envio deu certo). A barra acompanha na hora,
        // sem esperar a próxima busca. NOTA NÃO ASSUME: a Ana continua respondendo.
        if (!ehNota) setEstado((e) => (e.agenteSilenciadoEm ? e : { ...e, agenteSilenciadoEm: new Date().toISOString(), agenteResponde: false }));
        anunciar(ehNota ? "Nota salva." : "Mensagem enviada.");
        return;
      }
      // A pessoa tocou em "Conferir e tentar de novo" e o servidor TAMBÉM não sabe se saiu: só reenvia se ela
      // confirmar, sabendo que pode chegar duas vezes. (No primeiro envio, sem confirmação é só o estado.)
      if (!ehNota && eraRetentativaIncerta && corpo?.codigo === "SEM_CONFIRMACAO" && !confirmouReenvio) setConfirmando(p.clientMessageId);
      atualizarPendente(p.clientMessageId, { estado: r.estado, erro: r.erro, podeTentarDeNovo: r.podeTentarDeNovo });
      anunciar(r.estado === "sem-confirmacao" ? `Sem confirmação. ${r.erro ?? ""}` : `${ehNota ? "Nota não salva" : "Mensagem não enviada"}. ${r.erro ?? ""}`);
    },
    [idDaConversa, atualizarPendente, anunciar],
  );

  const enviar = useCallback(
    (texto: string, nota = false) => {
      const p = novoPendente(novaChaveDeMensagem(), texto, new Date(), nota);
      setPendentes((atuais) => [...atuais, p]);
      irAoFim();
      void disparar(p, false);
    },
    [disparar],
  );

  // A CONEXÃO VOLTOU (ou a tela acabou de abrir com mensagens aguardando): sai o que estava esperando, uma vez cada.
  useEffect(() => {
    if (!restaurado || semConexao || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
    for (const p of pendentesParaReenviarAoVoltar(vivo.current.pendentes, false)) {
      if (reenviando.current.has(p.clientMessageId)) continue;
      reenviando.current.add(p.clientMessageId);
      void disparar(p, false).finally(() => reenviando.current.delete(p.clientMessageId));
    }
  }, [restaurado, semConexao, pendentes, disparar]);

  const tentarDeNovo = useCallback(
    (chave: string) => {
      const p = vivo.current.pendentes.find((x) => x.clientMessageId === chave);
      if (p) void disparar(p, false);
    },
    [disparar],
  );

  const confirmarReenvio = useCallback(
    (chave: string) => {
      const p = vivo.current.pendentes.find((x) => x.clientMessageId === chave);
      setConfirmando(null);
      if (p) void disparar(p, true);
    },
    [disparar],
  );

  const descartar = useCallback((chave: string) => {
    setConfirmando(null);
    setPendentes((atuais) => atuais.filter((x) => x.clientMessageId !== chave));
    anunciar("Mensagem descartada.");
  }, [anunciar]);

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

  // O que a lista desenha: as do servidor e, no fim, as que ainda esperam confirmação.
  const exibidas = useMemo(() => [...todas, ...pendentes.map((p) => pendenteComoMensagem(p, agora))], [todas, pendentes, agora]);
  const grupos = useMemo(() => agruparMensagensPorDia(exibidas), [exibidas]);
  const totalNaCauda = useMemo(() => todas.filter((m) => m.criadoEm >= corte.current).length, [todas]);
  const ultima = exibidas[exibidas.length - 1];
  const semWhatsapp = !estado.temWhatsapp && exibidas.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <BarraDoChat idDaConversa={idDaConversa} estado={estado} agora={agora} nomeDoAtendente={nomeDoAtendente} aoMudar={(parte) => setEstado((e) => ({ ...e, ...parte }))} aoResponder={() => void buscarNovas()} />
      {estado.fixada && (
        <FixadaDoChatTopo idDaConversa={idDaConversa} fixada={estado.fixada} aoIr={irParaAMensagem} aoDesafixar={() => setEstado((e) => ({ ...e, fixada: null }))} />
      )}
      <div
        ref={caixa}
        data-rolagem-da-conversa=""
        role="log"
        aria-label="Mensagens da conversa"
        aria-live="off"
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-atd-tela px-3 pb-3 pt-2"
      >
        {exibidas.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center text-atd-previa">
            <p className="text-destaque font-semibold text-atd-tinta">{semWhatsapp ? "Sem conversa de WhatsApp" : "Nenhuma mensagem ainda"}</p>
            <p className="mt-1 text-corpo">{semWhatsapp ? "Este atendimento não tem WhatsApp. Veja os dados e os e-mails em Detalhes." : "Quando o cliente escrever, as mensagens aparecem aqui."}</p>
          </div>
        ) : (
          <div ref={conteudo} className="flex flex-col gap-1">
            {temAnteriores && (
              <div className="flex flex-col items-center gap-1 py-2">
                <button
                  type="button"
                  onClick={carregarAnteriores}
                  disabled={carregando}
                  className="inline-flex min-h-11 items-center rounded-atd-pilula bg-atd-pilula px-4 text-corpo font-semibold text-atd-tinta disabled:opacity-60"
                >
                  {carregando ? "Carregando…" : "Carregar mensagens anteriores"}
                </button>
                {erro && (
                  <p role="alert" className="max-w-xs text-center text-app-meta font-semibold text-urgente">
                    {erro}
                  </p>
                )}
              </div>
            )}
            {grupos.map((g) => (
              <section key={g.dia} aria-label={g.rotulo} className="flex flex-col gap-1">
                <h2 className="mx-auto mb-1 mt-3 rounded-atd-pilula bg-atd-pilula px-3 py-1 text-app-meta font-medium text-atd-previa">
                  {g.rotulo}
                </h2>
                {g.mensagens.map((m) => (
                  <BolhaDaMensagem
                    key={m.id}
                    m={m}
                    idDaConversa={idDaConversa}
                    nomeDoAtendente={nomeDoAtendente}
                    fixada={estado.fixada?.mensagemId === m.id}
                    aoAbrirAcoes={setAcoesDe}
                    aoTentarDeNovo={tentarDeNovo}
                    aoDescartar={descartar}
                    confirmandoReenvio={confirmando !== null && confirmando === m.clientMessageId}
                    aoConfirmarReenvio={confirmarReenvio}
                    aoCancelarReenvio={() => setConfirmando(null)}
                  />
                ))}
              </section>
            ))}
            <RolarParaOFim conversa={idDaConversa} chave={ultima?.id ?? "vazia"} total={totalNaCauda} />
          </div>
        )}
      </div>
      <CompositorDoChat idDaConversa={idDaConversa} estado={estado} nomeDoContato={nomeDoContato} primeiroNome={primeiroNome} nomeTemporario={nomeTemporario} telefone={telefone} nomeDoAtendente={nomeDoAtendente} aoEnviar={enviar} citando={citando} aoLimparCitacao={() => setCitando(null)} />
      {acoesDe && (
        <AcoesDaMensagem
          m={acoesDe}
          idDaConversa={idDaConversa}
          autor={acoesDe.direction === "OUT" ? (acoesDe.porAgente ? nomeDoAtendente : "Escritório") : "Cliente"}
          fixadaAgora={estado.fixada?.mensagemId === acoesDe.id}
          aoResponder={responderA}
          aoMudarFixada={(f) => setEstado((e) => ({ ...e, fixada: f }))}
          aoFechar={() => setAcoesDe(null)}
        />
      )}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-aviso-vivo="">
        {aviso}
      </div>
    </div>
  );
}
