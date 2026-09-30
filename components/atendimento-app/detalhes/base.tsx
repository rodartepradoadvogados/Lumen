"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, X } from "lucide-react";

// ============================================================================
// AS PEÇAS COMUNS DA ABA DETALHES: aviso com "Desfazer", gaveta (diálogo), bloco que abre e fecha e as
// classes dos controles. Um só lugar para o que se repete em todo bloco — alvo de 44 px, foco visível e o
// texto de erro em `role="alert"` saem certos em todos porque saem daqui.
// ============================================================================

// ── classes dos controles (mapas estáticos: o Tailwind só gera o que lê escrito) ────────────────────────
export const cx = {
  campo:
    "min-h-11 w-full rounded-atd-balao bg-atd-pilula-2 px-4 py-2 text-capa-corpo text-tx placeholder:text-atd-terciario disabled:opacity-60",
  primario:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-atd-pilula bg-acao px-5 text-corpo font-semibold text-acao-tx hover:bg-acao-hover active:opacity-90 disabled:opacity-60",
  secundario:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-atd-pilula bg-atd-pilula-2 px-5 text-corpo font-semibold text-tx hover:bg-atd-linha-hover active:opacity-80 disabled:opacity-60",
  discreto:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-atd-pilula px-3 text-corpo font-semibold text-atd-previa hover:bg-atd-linha-hover hover:text-tx active:opacity-80 disabled:opacity-60",
  rotulo: "block text-etiqueta font-semibold text-atd-previa",
  dica: "text-etiqueta text-atd-previa",
  erro: "text-corpo font-medium text-urgente",
  etiqueta: "text-app-tag font-semibold uppercase tracking-wider text-atd-terciario",
  chip: "inline-flex items-center rounded-atd-pilula bg-atd-pilula-2 px-2.5 py-0.5 text-etiqueta font-semibold text-atd-previa",
  /** Cartão preenchido, sem contorno: a hierarquia vem do fundo (--atd-pilula-bg), não de linha. */
  cartao: "rounded-atd-balao bg-atd-pilula",
  /** Painel dentro de um cartão: um degrau mais escuro que o cartão. */
  painel: "rounded-atd-balao bg-atd-pilula-2 p-3",
  /** Painéis com significado, em fundo suave (sem faixa lateral nem contorno). */
  painelAlerta: "rounded-atd-balao bg-urgente-bg p-3",
  painelOk: "rounded-atd-balao bg-concluido-bg p-3",
} as const;

// ── avisos ──────────────────────────────────────────────────────────────────

type Aviso = { id: number; texto: string; tom: "ok" | "erro"; desfazer?: () => void | Promise<void> };
type Avisar = (a: { texto: string; tom?: "ok" | "erro"; desfazer?: () => void | Promise<void> }) => void;

const ContextoDeAvisos = createContext<Avisar>(() => {});
export const useAvisos = () => useContext(ContextoDeAvisos);

/**
 * O aviso vive numa região `aria-live` que existe SEMPRE (avisos que aparecem num nó novo nem sempre são
 * lidos). Com "Desfazer" dura 10 s e pausa quando a pessoa toca ou põe o foco nele; sem, 5 s. Fica no pé da
 * tela, sobre a rolagem — a aba não tem campo de digitação embaixo para ele cobrir.
 */
export function ProvedorDeAvisos({ children }: { children: ReactNode }) {
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const seq = useRef(0);
  const pausado = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const limpar = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const armar = useCallback(
    (id: number, ms: number) => {
      limpar();
      timer.current = setTimeout(() => {
        if (pausado.current) return armar(id, 2000);
        setAviso((atual) => (atual && atual.id === id ? null : atual));
      }, ms);
    },
    [limpar],
  );

  const avisar = useCallback<Avisar>(
    (a) => {
      const id = ++seq.current;
      setAviso({ id, texto: a.texto, tom: a.tom ?? "ok", desfazer: a.desfazer });
      armar(id, a.desfazer ? 10_000 : a.tom === "erro" ? 8_000 : 5_000);
    },
    [armar],
  );

  useEffect(() => limpar, [limpar]);

  return (
    <ContextoDeAvisos.Provider value={avisar}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-avisos=""
      >
        {aviso && (
          <div
            key={aviso.id}
            className="pointer-events-auto flex w-full max-w-md items-center gap-1 rounded-atd-balao bg-atd-hdr py-1 pl-4 pr-1 text-corpo text-atd-hdr-tx shadow-atd-flutuante"
            onMouseEnter={() => (pausado.current = true)}
            onMouseLeave={() => (pausado.current = false)}
            onFocus={() => (pausado.current = true)}
            onBlur={() => (pausado.current = false)}
            onTouchStart={() => (pausado.current = true)}
          >
            <p className="min-w-0 flex-1 py-2" data-aviso-tom={aviso.tom}>
              {aviso.tom === "erro" ? <span className="font-semibold">Não deu certo. </span> : null}
              {aviso.texto}
            </p>
            {aviso.desfazer && (
              <button
                type="button"
                onClick={async () => {
                  const f = aviso.desfazer;
                  setAviso(null);
                  await f?.();
                }}
                className="inline-flex min-h-11 shrink-0 items-center rounded-atd-pilula px-3 font-bold text-atd-hdr-foco hover:underline"
              >
                Desfazer
              </button>
            )}
            <button
              type="button"
              onClick={() => setAviso(null)}
              aria-label="Fechar o aviso"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-atd-hdr-tx2 hover:text-atd-hdr-tx"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </ContextoDeAvisos.Provider>
  );
}

// ── executar uma ação com feedback ──────────────────────────────────────────

export type Operacao = {
  fazer: () => Promise<{ error?: string } | void>;
  /** O que se diz quando dá certo. Sem texto, a ação é silenciosa (o resultado já aparece na tela). */
  ok?: string;
  desfazer?: () => Promise<{ error?: string } | void>;
};

/**
 * `rodar` faz UMA ação por vez (o botão fica desligado enquanto ela corre, então o segundo toque não
 * repete), atualiza a tela do servidor, e conta o que houve — com "Desfazer" quando a operação sabe
 * desfazer. Erro vira aviso E volta para quem chamou (o formulário aberto o mostra no próprio lugar).
 */
export function useRodar() {
  const router = useRouter();
  const avisar = useAvisos();
  const [pendente, setPendente] = useState(false);
  const emCurso = useRef(false);

  const rodar = useCallback(
    async (op: Operacao): Promise<{ ok: boolean; error?: string }> => {
      if (emCurso.current) return { ok: false, error: "Aguarde a ação anterior terminar." };
      emCurso.current = true;
      setPendente(true);
      try {
        const r = await op.fazer();
        if (r && r.error) {
          avisar({ texto: r.error, tom: "erro" });
          return { ok: false, error: r.error };
        }
        router.refresh();
        if (op.ok) {
          const desfazer = op.desfazer;
          avisar({
            texto: op.ok,
            desfazer: desfazer
              ? async () => {
                  try {
                    const d = await desfazer();
                    if (d && d.error) avisar({ texto: d.error, tom: "erro" });
                    else {
                      router.refresh();
                      avisar({ texto: "Desfeito." });
                    }
                  } catch {
                    avisar({ texto: "Sem conexão: não foi possível desfazer. Tente de novo.", tom: "erro" });
                  }
                }
              : undefined,
          });
        }
        return { ok: true };
      } catch {
        const msg = "Sem conexão ou o servidor não respondeu. Nada foi salvo; tente de novo.";
        avisar({ texto: msg, tom: "erro" });
        return { ok: false, error: msg };
      } finally {
        emCurso.current = false;
        setPendente(false);
      }
    },
    [avisar, router],
  );

  return { rodar, pendente };
}

// ── gaveta (diálogo nativo) ─────────────────────────────────────────────────

/**
 * Diálogo de verdade (`<dialog>` + `showModal`): o navegador prende o Tab dentro dele, fecha com Esc e deixa
 * o resto da página inerte. No celular sobe do pé como gaveta; em tela larga fica na coluna do aplicativo.
 * O foco vai ao título ao abrir e volta ao botão que abriu ao fechar.
 */
export function Gaveta({
  aberta,
  aoFechar,
  titulo,
  children,
  rodape,
}: {
  aberta: boolean;
  aoFechar: () => void;
  titulo: string;
  children: ReactNode;
  rodape?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  const tituloRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberta && !d.open) {
      d.showModal();
      tituloRef.current?.focus();
    }
    if (!aberta && d.open) d.close();
  }, [aberta]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={idTitulo}
      onCancel={(e) => {
        e.preventDefault();
        aoFechar();
      }}
      onClick={(e) => {
        if (e.target === ref.current) aoFechar();
      }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 mx-auto max-h-[92dvh] w-full max-w-md overflow-hidden rounded-t-atd-flutuante bg-atd-tela p-0 text-tx backdrop:bg-grafite-900/60 open:flex open:flex-col"
    >
      {aberta && (
        <>
          <div className="flex shrink-0 items-center gap-1 pb-1 pl-5 pr-2 pt-2">
            <h2 id={idTitulo} ref={tituloRef} tabIndex={-1} className="min-w-0 flex-1 text-destaque font-bold text-tx outline-none">
              {titulo}
            </h2>
            <button type="button" onClick={aoFechar} aria-label="Fechar" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-atd-pilula text-atd-previa hover:text-tx">
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 pt-2">{children}</div>
          {rodape && <div className="flex shrink-0 flex-wrap gap-2 bg-atd-tela px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">{rodape}</div>}
        </>
      )}
    </dialog>
  );
}

// ── bloco que abre e fecha ──────────────────────────────────────────────────

export function BlocoRecolhivel({
  chave,
  titulo,
  meta,
  aberto,
  aoAlternar,
  children,
}: {
  chave: string;
  titulo: string;
  meta?: string;
  aberto: boolean;
  aoAlternar: (aberto: boolean) => void;
  children: ReactNode;
}) {
  return (
    <section id={`bloco-${chave}`} aria-labelledby={`titulo-${chave}`} className="mx-4 mt-3 scroll-mt-32 rounded-atd-balao bg-atd-pilula" data-bloco={chave}>
      <h3 id={`titulo-${chave}`}>
        <button
          type="button"
          aria-expanded={aberto}
          aria-controls={`corpo-${chave}`}
          onClick={() => aoAlternar(!aberto)}
          className="flex min-h-[52px] w-full items-center gap-2 rounded-atd-balao px-4 text-left"
        >
          <span className={`min-w-0 flex-1 ${cx.etiqueta}`}>{titulo}</span>
          {meta && <span className="shrink-0 text-etiqueta font-semibold tabular-nums text-atd-previa">{meta}</span>}
          <ChevronDown size={18} aria-hidden="true" className={`shrink-0 text-atd-terciario transition-transform ${aberto ? "rotate-180" : ""}`} />
        </button>
      </h3>
      <div id={`corpo-${chave}`} hidden={!aberto} className="px-4 pb-4 pt-1">
        {aberto ? children : null}
      </div>
    </section>
  );
}

// ── campos ──────────────────────────────────────────────────────────────────

export function Campo({ rotulo, dica, erro, children, className = "" }: { rotulo: string; dica?: string; erro?: string | null; children: (ids: { id: string; descricao?: string }) => ReactNode; className?: string }) {
  const id = useId();
  const idDica = dica || erro ? `${id}-d` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className={cx.rotulo}>
        {rotulo}
      </label>
      <div className="mt-1">{children({ id, descricao: idDica })}</div>
      {erro ? (
        <p id={idDica} role="alert" className={`mt-1 ${cx.erro}`}>
          {erro}
        </p>
      ) : dica ? (
        <p id={idDica} className={`mt-1 ${cx.dica}`}>
          {dica}
        </p>
      ) : null}
    </div>
  );
}

/** Lista vazia com uma frase que diz o que fazer, e não só "nada aqui". */
export function Vazio({ children }: { children: ReactNode }) {
  return <p className="py-1 text-corpo text-atd-previa">{children}</p>;
}
