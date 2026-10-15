"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Columns3, ExternalLink, Inbox, LogOut, MessageSquare, Settings, Smartphone, SlidersHorizontal, Zap } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

// O TRILHO DA CENTRAL (DESIGN.md §9, 15/10/2026) — a barra inferior do app de Atendimento, de pé.
//
// Os MESMOS quatro alvos do celular, na mesma ordem e com os mesmos ícones (lib/navegacaoDoAtendimentoApp.ts):
// Conversas, Funil, Triagem, Mais. Quem usa o app no fórum e a Central no escritório encontra cada
// coisa no mesmo lugar. Os endereços continuam os de sempre (`?aba=` / `?sub=`, lib/conversaDaCentral.ts):
// o trilho troca a forma da navegação, não as rotas.
//
// Funil e Triagem só existem para quem vê todo o atendimento (mesma regra das abas antigas: o alvo
// não fica desabilitado, ele SOME). "Mais" é um menu, não uma tela: ali moram atalhos que saem da
// Central (configurações, app do celular, voltar ao Lúmen).
//
// Em janela de celular (<= 760px, atendimento-central.css) o trilho deita e vira a barra inferior do
// app; dentro de uma conversa ele some, como no app (a conversa é a tela).

export type AlvoDoTrilho = "conversas" | "funil" | "triagem";

const ALTURA_DO_ALVO = 64; // px — a pílula do alvo ativo desliza de um para outro (--atd-trilho-ind)

export default function TrilhoDaCentral({
  ativo,
  veTodo,
  esperando,
  hrefConversas,
  hrefFunil,
  hrefTriagem,
}: {
  ativo: AlvoDoTrilho;
  veTodo: boolean;
  /** Quantos clientes esperam resposta agora — o selo do alvo Triagem. */
  esperando: number;
  hrefConversas: string;
  hrefFunil: string;
  hrefTriagem: string;
}) {
  const alvos = [
    { chave: "conversas" as const, rotulo: "Conversas", href: hrefConversas, Icone: MessageSquare, selo: 0 },
    ...(veTodo
      ? [
          { chave: "funil" as const, rotulo: "Funil", href: hrefFunil, Icone: Columns3, selo: 0 },
          { chave: "triagem" as const, rotulo: "Triagem", href: hrefTriagem, Icone: Inbox, selo: esperando },
        ]
      : []),
  ];
  const indice = Math.max(0, alvos.findIndex((a) => a.chave === ativo));

  const [maisAberto, setMaisAberto] = useState(false);
  const caixaDoMais = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!maisAberto) return;
    function fora(ev: MouseEvent) {
      if (caixaDoMais.current && !caixaDoMais.current.contains(ev.target as Node)) setMaisAberto(false);
    }
    function esc(ev: KeyboardEvent) {
      if (ev.key === "Escape") setMaisAberto(false);
    }
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [maisAberto]);

  return (
    <nav aria-label="Atendimento" className="atd-trilho-nav" data-trilho-da-central="">
      <span aria-hidden="true" className="atd-trilho-marca">
        L
      </span>
      <div className="atd-trilho-alvos" style={{ ["--atd-trilho-ind" as string]: `${indice * ALTURA_DO_ALVO}px` }}>
        <span aria-hidden="true" className="atd-trilho-ind" />
        <ul>
        {alvos.map(({ chave, rotulo, href, Icone, selo }) => {
          const aceso = chave === ativo;
          return (
            <li key={chave}>
              <Link href={href} aria-current={aceso ? "page" : undefined} className="atd-trilho-alvo" data-alvo={chave}>
                <span className="atd-trilho-icone">
                  <Icone size={22} aria-hidden="true" />
                  {selo > 0 && (
                    <span data-selo-contagem="" className="atd-trilho-selo" aria-label={`${selo} esperando resposta`}>
                      {selo > 99 ? "99+" : selo}
                    </span>
                  )}
                </span>
                <span className="atd-trilho-rotulo">{rotulo}</span>
              </Link>
            </li>
          );
        })}
        <li className="atd-trilho-mais" ref={caixaDoMais}>
          <button type="button" aria-expanded={maisAberto} aria-controls="menu-mais-da-central" onClick={() => setMaisAberto((v) => !v)} className="atd-trilho-alvo">
            <span className="atd-trilho-icone">
              <Settings size={22} aria-hidden="true" />
            </span>
            <span className="atd-trilho-rotulo">Mais</span>
          </button>
          {maisAberto && (
            <div id="menu-mais-da-central" className="atd-trilho-menu" role="menu">
              <ItemDoMais href="/configuracoes" Icone={SlidersHorizontal} titulo="Configurações" apoio="Atendente virtual, motivos de recusa" />
              <ItemDoMais href="/atendimento-app/respostas-rapidas" Icone={Zap} titulo="Respostas rápidas" apoio="Textos prontos do escritório" />
              <ItemDoMais href="/atendimento-app" Icone={Smartphone} titulo="App no celular" apoio="O mesmo atendimento, no bolso" />
              <ItemDoMais href="/painel" Icone={ExternalLink} titulo="Voltar ao Lúmen" apoio="Painel, processos e agenda" />
            </div>
          )}
        </li>
        </ul>
      </div>
      <div className="atd-trilho-pe">
        <ThemeToggle variant="icon" />
        <a href="/painel" className="atd-trilho-sair">
          <LogOut size={20} aria-hidden="true" />
          <span>Sair para o Lúmen</span>
        </a>
      </div>
    </nav>
  );
}

function ItemDoMais({ href, Icone, titulo, apoio }: { href: string; Icone: typeof Zap; titulo: string; apoio: string }) {
  return (
    <a href={href} role="menuitem" className="flex min-h-14 items-center gap-3 rounded-atd-balao px-3 py-2 text-tx hover:bg-atd-linha-hover focus-visible:bg-atd-linha-hover">
      <Icone size={18} aria-hidden="true" className="shrink-0 text-atd-previa" />
      <span className="min-w-0">
        <span className="block text-corpo font-semibold">{titulo}</span>
        <span className="block text-app-meta text-atd-terciario">{apoio}</span>
      </span>
    </a>
  );
}
