"use client";

import { useEffect, useRef, useState } from "react";

// Demonstração do sigilo (Capa, seção "Segurança"). Reproduz NO NAVEGADOR o mecanismo real de
// lib/actions/mask.ts — motivo com no mínimo 20 caracteres (REASON_MIN_LENGTH), janela de 15
// minutos (REVEAL_MINUTES) e trilha só de acréscimo — sem servidor, sem dado real e sem tocar em
// nenhuma server action. NUNCA ligar isto à ação verdadeira: os dados abaixo são fictícios e o
// rótulo "dados fictícios" e o controle "Avançar 15 minutos" precisam permanecer (risco R4 do plano
// da Capa).
//
// Responde ao terceiro medo de quem decide (expor sigilo) com uma prova que a pessoa opera, em vez
// de um adjetivo.
const JANELA_MS = 15 * 60 * 1000;
const MOTIVO_MIN = 20;

type Campo = { id: "cpf" | "tel"; rotulo: string; artigo: string; mascara: string; valor: string };
const CAMPOS: Campo[] = [
  { id: "cpf", rotulo: "CPF", artigo: "o CPF", mascara: "•••.•••.•••-••", valor: "111.444.777-35" },
  { id: "tel", rotulo: "Telefone", artigo: "o telefone", mascara: "(62) •••••-••••", valor: "(62) 90000-0000" },
];

type Linha = { id: number; quando: string; texto: string; novo: boolean };

function hhmm(t: number) {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function contagem(ms: number) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const btnE =
  "min-h-[44px] px-4 bg-transparent text-neutro-100 border-2 border-grafite-500 rounded-[2px] text-capa-mini font-bold hover:border-neutro-300 transition-colors duration-100 ease-out disabled:opacity-45 disabled:cursor-not-allowed";
const btnEP =
  "min-h-[44px] px-4 bg-acao hover:bg-acao-hover text-acao-tx border-2 border-acao rounded-[2px] text-capa-mini font-bold transition-colors duration-100 ease-out disabled:opacity-45 disabled:cursor-not-allowed";

export default function SigiloDemo() {
  // `salto` empurra o relógio da demonstração (botão "Avançar 15 minutos"): não existe no produto,
  // serve só para o visitante ver a janela expirar sem esperar 15 minutos de verdade.
  const [salto, setSalto] = useState(0);
  const [agora, setAgora] = useState(() => Date.now());
  const [ate, setAte] = useState<Record<Campo["id"], number>>({ cpf: 0, tel: 0 });
  const [motivoPara, setMotivoPara] = useState<Campo["id"] | null>(null);
  const [motivo, setMotivo] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([
    { id: 2, quando: "ontem", novo: false, texto: "Rafael M. Tavares revelou o telefone de um cliente. Motivo: retorno de ligação sobre audiência." },
    { id: 1, quando: "ontem", novo: false, texto: "Helena A. Nogueira revelou o CPF de um cliente. Motivo: conferir dados para a procuração." },
  ]);
  const [aviso, setAviso] = useState("");
  const proximoId = useRef(3);
  const textoRef = useRef<HTMLTextAreaElement>(null);
  const botoes = useRef<Record<string, HTMLButtonElement | null>>({});
  const focarBotao = useRef<Campo["id"] | null>(null);

  const relogio = agora + salto;

  function registra(texto: string, quandoMs = relogio) {
    setLinhas((l) => [{ id: proximoId.current++, quando: hhmm(quandoMs), texto, novo: true }, ...l]);
  }

  // Tique de 1s: atualiza a contagem e encerra a janela que venceu (o campo volta mascarado e a
  // trilha registra o encerramento — o mesmo que o produto faz ao fim dos 15 minutos).
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    CAMPOS.forEach((c) => {
      if (ate[c.id] && ate[c.id] <= relogio) {
        setAte((a) => ({ ...a, [c.id]: 0 }));
        registra(`Janela de 15 minutos do ${c.rotulo} encerrada. Campo mascarado de novo.`);
        setAviso("A janela de 15 minutos terminou. Campo mascarado.");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relogio]);

  useEffect(() => {
    if (motivoPara) textoRef.current?.focus();
  }, [motivoPara]);

  useEffect(() => {
    if (focarBotao.current) {
      botoes.current[focarBotao.current]?.focus();
      focarBotao.current = null;
    }
  });

  const digitados = motivo.trim().length;

  function abrirMotivo(id: Campo["id"]) {
    setMotivo("");
    setMotivoPara(id);
  }

  function cancelar() {
    const id = motivoPara;
    setMotivoPara(null);
    focarBotao.current = id;
  }

  function revelar(e: React.FormEvent) {
    e.preventDefault();
    if (!motivoPara || digitados < MOTIVO_MIN) return;
    const c = CAMPOS.find((x) => x.id === motivoPara)!;
    const m = motivo.trim();
    setAte((a) => ({ ...a, [c.id]: relogio + JANELA_MS }));
    registra(`Você revelou ${c.artigo}. Motivo: ${m.length > 60 ? `${m.slice(0, 57)}…` : m}`);
    setAviso(`${c.rotulo} revelado por 15 minutos.`);
    setMotivoPara(null);
    focarBotao.current = c.id;
  }

  function ocultar(c: Campo) {
    setAte((a) => ({ ...a, [c.id]: 0 }));
    registra(`Você ocultou ${c.artigo} antes do fim da janela.`);
    setAviso(`${c.rotulo} mascarado.`);
    focarBotao.current = c.id;
  }

  return (
    <div className="bg-grafite-700 border-2 border-grafite-500 rounded-[2px] text-neutro-100">
      <div className="px-[18px] py-3.5 border-b border-grafite-500 flex flex-wrap justify-between gap-x-3 gap-y-1">
        <span className="text-etiqueta font-semibold uppercase tracking-[.06em]">Ficha do cliente · dados fictícios</span>
        <span className="text-capa-mini text-neutro-300">Marlene A. Pacheco</span>
      </div>

      <ul className="m-0 p-0 list-none">
        {CAMPOS.map((c) => {
          const aberto = ate[c.id] > relogio;
          const resta = aberto ? ate[c.id] - relogio : 0;
          return (
            <li key={c.id} className="px-[18px] py-4 border-b border-grafite-500 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 items-center">
              <span className="text-capa-mini text-neutro-300">{c.rotulo}</span>
              <span
                id={`sigilo-${c.id}`}
                className={`col-start-1 block font-mono text-destaque font-semibold tabular-nums tracking-[.02em] [overflow-wrap:anywhere] ${aberto ? "animate-revela" : ""}`}
              >
                {aberto ? c.valor : c.mascara}
              </span>
              <div className="col-start-2 row-start-1 row-span-2 flex flex-col items-end gap-1.5">
                {aberto ? (
                  <>
                    <button ref={(el) => { botoes.current[c.id] = el; }} type="button" className={btnE} onClick={() => ocultar(c)}>
                      Ocultar agora
                    </button>
                    <span className="text-etiqueta text-neutro-300 tabular-nums whitespace-nowrap">expira em {contagem(resta)}</span>
                  </>
                ) : (
                  <button
                    ref={(el) => { botoes.current[c.id] = el; }}
                    type="button"
                    className={btnE}
                    aria-label={`Revelar ${c.rotulo}`}
                    onClick={() => abrirMotivo(c.id)}
                  >
                    Revelar
                  </button>
                )}
              </div>
              {aberto && (
                <div className="col-span-2 h-0.5 bg-grafite-500 relative overflow-hidden" aria-hidden="true">
                  {/* Só `transform`: a barra encolhe sem disparar layout. */}
                  <i className="absolute inset-0 bg-neutro-300 origin-left" style={{ transform: `scaleX(${(resta / JANELA_MS).toFixed(4)})` }} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {motivoPara && (
        <div className="px-[18px] py-4 border-b border-grafite-500 bg-grafite-800">
          <form onSubmit={revelar} noValidate>
            <label htmlFor="sigilo-motivo" className="block text-capa-mini font-semibold">
              Motivo para revelar {CAMPOS.find((c) => c.id === motivoPara)!.artigo} (mínimo {MOTIVO_MIN} caracteres)
            </label>
            <textarea
              id="sigilo-motivo"
              ref={textoRef}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  cancelar();
                }
              }}
              aria-describedby="sigilo-contador"
              placeholder="Ex.: conferir os dados para preencher a procuração"
              className="w-full mt-2 min-h-[84px] px-3 py-2.5 text-capa-corpo bg-grafite-700 text-neutro-100 border-2 border-grafite-500 rounded-[2px] resize-y focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-0 focus-visible:outline-neutro-100"
            />
            <div className="flex flex-wrap items-center gap-2.5 mt-2.5">
              <button type="submit" className={btnEP} disabled={digitados < MOTIVO_MIN}>
                Registrar e revelar
              </button>
              <button type="button" className={btnE} onClick={cancelar}>
                Cancelar
              </button>
              <span id="sigilo-contador" className="ml-auto text-etiqueta text-neutro-300 tabular-nums">
                {digitados} de {MOTIVO_MIN}
              </span>
            </div>
          </form>
        </div>
      )}

      <div className="px-[18px] pt-3.5 pb-[18px]">
        <h3 id="sigilo-trilha-h" className="text-etiqueta font-semibold uppercase tracking-[.06em] text-neutro-300">
          Trilha de auditoria do escritório
        </h3>
        <div role="log" aria-labelledby="sigilo-trilha-h" aria-live="polite" className="mt-2.5 max-h-[220px] overflow-auto">
        <ol className="grid">
          {linhas.map((l) => (
            <li key={l.id} className={`py-2 border-t border-grafite-500 text-capa-mini grid grid-cols-[auto_1fr] gap-3 ${l.novo ? "animate-trilha-entra" : ""}`}>
              <time className="text-neutro-300 tabular-nums whitespace-nowrap">{l.quando}</time>
              <span>{l.texto}</span>
            </li>
          ))}
        </ol>
        </div>
        <p className="mt-2.5 text-etiqueta text-neutro-300">Só acréscimo: não existe botão para apagar uma linha.</p>
      </div>

      <div className="px-[18px] py-2.5 border-t border-grafite-500 flex flex-wrap items-center gap-3 text-etiqueta text-neutro-300">
        <button
          type="button"
          className={btnE}
          onClick={() => {
            setSalto((s) => s + JANELA_MS);
            setAviso("Relógio da demonstração avançado em 15 minutos.");
          }}
        >
          Avançar 15 minutos
        </button>
        <span>Controle só da demonstração, para ver a janela expirar.</span>
      </div>

      <div className="sr-only" role="status" aria-live="polite">
        {aviso}
      </div>
    </div>
  );
}
