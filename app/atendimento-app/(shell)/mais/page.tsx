import Link from "next/link";
import { exigirAcessoAoAtendimentoNaTela } from "@/lib/guardaDoAtendimento";
import { Card } from "@/components/ui";
import { User, Users, Palette, LogOut, ExternalLink } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MaisAppPage() {
  await exigirAcessoAoAtendimentoNaTela();

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <h1 className="text-xl font-bold text-tx">Mais</h1>

      <Card className="p-4 space-y-3">
        <Link href="/atendimento-app/perfil" className="flex items-center gap-3 p-3 hover:bg-sf-apoio rounded-[2px] transition-colors">
          <div className="h-10 w-10 rounded-full bg-ouro-bg flex items-center justify-center shrink-0"><User size={18} className="text-ouro-acento" /></div>
          <div className="flex-1"><p className="font-medium text-tx">Perfil</p><p className="text-xs text-tx-2">Dados da conta e preferências</p></div>
        </Link>
        <Link href="/atendimento-app/equipe" className="flex items-center gap-3 p-3 hover:bg-sf-apoio rounded-[2px] transition-colors">
          <div className="h-10 w-10 rounded-full bg-ouro-bg flex items-center justify-center shrink-0"><Users size={18} className="text-ouro-acento" /></div>
          <div className="flex-1"><p className="font-medium text-tx">Equipe</p><p className="text-xs text-tx-2">Usuários e permissões</p></div>
        </Link>
        <Link href="/atendimento-app/tema" className="flex items-center gap-3 p-3 hover:bg-sf-apoio rounded-[2px] transition-colors">
          <div className="h-10 w-10 rounded-full bg-ouro-bg flex items-center justify-center shrink-0"><Palette size={18} className="text-ouro-acento" /></div>
          <div className="flex-1"><p className="font-medium text-tx">Tema</p><p className="text-xs text-tx-2">Dia, Noite ou Automático</p></div>
        </Link>
        <Link href="/" className="flex items-center gap-3 p-3 hover:bg-sf-apoio rounded-[2px] transition-colors">
          <div className="h-10 w-10 rounded-full bg-ouro-bg flex items-center justify-center shrink-0"><ExternalLink size={18} className="text-ouro-acento" /></div>
          <div className="flex-1"><p className="font-medium text-tx">Abrir site completo</p><p className="text-xs text-tx-2">Ir para o Lúmen desktop</p></div>
        </Link>
      </Card>

      <Card className="p-4 space-y-3 border-urgente bg-urgente-bg">
        <Link href="/atendimento-app/sair" className="flex items-center gap-3 p-3 hover:bg-urgente-bg/80 rounded-[2px] transition-colors">
          <div className="h-10 w-10 rounded-full bg-urgente/10 flex items-center justify-center shrink-0"><LogOut size={18} className="text-urgente" /></div>
          <div className="flex-1"><p className="font-medium text-urgente">Sair do Atendimento</p><p className="text-xs text-tx-3">Encerrar sessão neste dispositivo</p></div>
        </Link>
      </Card>

      <p className="text-xs text-tx-3 text-center mt-4">Lúmen Atendimento — Versão PWA independente</p>
    </div>
  );
}