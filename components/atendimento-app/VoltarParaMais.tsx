import Link from "next/link";
import { ChevronLeft } from "lucide-react";

// O "‹ Mais" do alto das telas filhas da aba Mais (Perfil, Equipe, Tema, Respostas rápidas, Sair): um link
// discreto, de 44 px de alvo, acima do título grande da tela. Sem caixa, sem contorno.
export default function VoltarParaMais() {
  return (
    <Link href="/atendimento-app/mais" data-voltar-para-mais="" className="ml-2 mt-1 inline-flex min-h-11 items-center gap-0.5 rounded-atd-pilula pl-2 pr-3.5 text-corpo font-semibold text-atd-texto-ouro hover:bg-atd-linha-hover">
      <ChevronLeft size={20} aria-hidden="true" /> Mais
    </Link>
  );
}
