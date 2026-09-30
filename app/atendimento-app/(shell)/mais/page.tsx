import Link from "next/link";
import type { ReactNode } from "react";
import { exigirAcessoAoAtendimentoNaTela } from "@/lib/guardaDoAtendimento";
import { TituloDeTela } from "@/components/atendimento-app/ui";
import { User, Users, Palette, LogOut, ExternalLink, Zap, BellOff, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

// A tela MAIS no acabamento WhatsApp: título grande, um cartão preenchido (sem contorno) com as linhas de
// atalho — ícone em círculo suave, título, apoio e seta — e, separados, o aviso honesto e o Sair. Só o visual:
// as rotas e a porta de acesso são as mesmas.
function Linha({ href, icone, titulo, apoio, perigo = false }: { href: string; icone: ReactNode; titulo: string; apoio: string; perigo?: boolean }) {
  return (
    <Link href={href} data-linha-mais="" className="flex min-h-14 items-center gap-3.5 rounded-atd-balao px-3 py-2 hover:bg-atd-linha-hover active:bg-atd-linha-hover">
      <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${perigo ? "bg-atd-tela text-urgente" : "bg-atd-pilula-2 text-atd-texto-ouro"}`}>
        {icone}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-app-nome font-semibold ${perigo ? "text-urgente" : "text-tx"}`}>{titulo}</span>
        <span className="block text-app-previa text-atd-previa">{apoio}</span>
      </span>
      {!perigo && <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-atd-terciario" />}
    </Link>
  );
}

export default async function MaisAppPage() {
  await exigirAcessoAoAtendimentoNaTela();

  return (
    <div className="animate-fade-in pb-4">
      <TituloDeTela titulo="Mais" />

      <div className="mx-4 mt-2 space-y-3">
        <nav aria-label="Mais opções" className="rounded-atd-balao bg-atd-pilula p-1.5">
          <Linha href="/atendimento-app/perfil" icone={<User size={18} />} titulo="Perfil" apoio="Dados da conta e preferências" />
          <Linha href="/atendimento-app/equipe" icone={<Users size={18} />} titulo="Equipe" apoio="Usuários e permissões" />
          <Linha href="/atendimento-app/respostas-rapidas" icone={<Zap size={18} />} titulo="Respostas rápidas" apoio="Textos prontos do escritório para o chat" />
          <Linha href="/atendimento-app/tema" icone={<Palette size={18} />} titulo="Tema" apoio="Dia, Noite ou Automático" />
          <Linha href="/" icone={<ExternalLink size={18} />} titulo="Abrir site completo" apoio="Ir para o Lúmen desktop" />
        </nav>

        <div className="rounded-atd-balao bg-atd-pilula p-4" data-avisos-de-mensagem-nova="">
          <div className="flex items-start gap-3">
            <BellOff size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-atd-terciario" />
            <div className="min-w-0">
              <p className="text-corpo font-semibold text-tx">Avisos de mensagem nova · a construir</p>
              <p className="mt-1 text-app-previa text-atd-previa">
                Com o aplicativo aberto, o número de mensagens novas aparece no título da aba e no ícone do aplicativo enquanto você está em outra tela.
                Com o aplicativo fechado o aviso ainda não existe: confira as Conversas.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-atd-balao bg-urgente-bg p-1.5">
          <Linha href="/atendimento-app/sair" icone={<LogOut size={18} />} titulo="Sair do Atendimento" apoio="Encerrar sessão neste dispositivo" perigo />
        </div>
      </div>

      <p className="mt-6 text-center text-app-meta text-atd-terciario">Lúmen Atendimento — Versão PWA independente</p>
    </div>
  );
}
