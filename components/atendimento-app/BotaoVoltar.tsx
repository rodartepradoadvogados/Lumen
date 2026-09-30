"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { destinoDoVoltar, guiaDaConversa } from "@/lib/navegacaoDoAtendimentoApp";
import { caminhoAnterior } from "@/components/atendimento-app/historico";

// O "voltar" do cabeçalho de tela cheia (conversa, detalhes, novo). É um <a> de verdade (abre o
// endereço certo com o botão do meio ou sem JavaScript) e, ao toque, segue a pilha do app.
export default function BotaoVoltar({
  tela,
  idDaConversa,
  rotulo,
  className = "",
  tom = "grafite",
}: {
  /** "conversa" = descobre pelo endereço se está no Chat ou nos Detalhes. */
  tela: "conversa" | "chat" | "detalhes" | "novo";
  idDaConversa?: string | null;
  rotulo: string;
  className?: string;
  /** "claro" = sobre o fundo da tela (chat, acabamento WhatsApp); "grafite" = cabeçalho grafite das telas ainda não migradas. */
  tom?: "claro" | "grafite";
}) {
  const router = useRouter();
  const pathname = usePathname() || "";
  const telaReal = tela === "conversa" ? (guiaDaConversa(pathname) === "detalhes" ? "detalhes" : "chat") : tela;
  const fixo = destinoDoVoltar(telaReal, idDaConversa ?? null, null);
  const href = fixo.tipo === "ir" ? fixo.href : "/atendimento-app";
  return (
    <Link
      href={href}
      aria-label={rotulo}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        const d = destinoDoVoltar(telaReal, idDaConversa ?? null, caminhoAnterior());
        if (d.tipo === "voltar") router.back();
        else router.push(d.href);
      }}
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center ${tom === "claro" ? "rounded-full text-atd-tinta hover:bg-atd-linha-hover" : "rounded-[2px] text-atd-hdr-tx hover:bg-atd-hdr-linha"} ${className}`}
    >
      <ArrowLeft size={22} aria-hidden="true" />
    </Link>
  );
}
