import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { Card } from "@/components/ui";
import { ArrowLeft, Settings, User, BarChart3, Users, LogOut, Bell, Palette } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MaisAppPage() {
  const viewer = await getCurrentUser();
  if (!viewer) notFound();

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link href="/atendimento-app" className="inline-flex items-center gap-1 text-corpo font-semibold text-tx-2">
        <ArrowLeft size={13} /> Triagem
      </Link>

      <h1 className="text-xl font-bold text-tx">Mais</h1>

      <Card className="p-4 space-y-3">
        <Link href="/atendimento-app/perfil" className="flex items-center gap-3 p-3 hover:bg-sf-apoio rounded-[2px] transition-colors">
          <div className="h-10 w-10 rounded-full bg-ouro-bg flex items-center justify-center shrink-0"><User size={18} className="text-ouro-acento" /></div>
          <div className="flex-1"><p className="font-medium text-tx">Perfil</p><p className="text-xs text-tx-2">Dados da conta e preferências</p></div>
        </Link>
        <Link href="/atendimento-app/alertas" className="flex items-center gap-3 p-3 hover:bg-sf-apoio rounded-[2px] transition-colors">
          <div className="h-10 w-10 rounded-full bg-ouro-bg flex items-center justify-center shrink-0"><Bell size={18} className="text-ouro-acento" /></div>
          <div className="flex-1"><p className="font-medium text-tx">Alertas</p><p className="text-xs text-tx-2">Prazos, menções e notificações</p></div>
        </Link>
        <Link href="/atendimento-app/relatorios" className="flex items-center gap-3 p-3 hover:bg-sf-apoio rounded-[2px] transition-colors">
          <div className="h-10 w-10 rounded-full bg-ouro-bg flex items-center justify-center shrink-0"><BarChart3 size={18} className="text-ouro-acento" /></div>
          <div className="flex-1"><p className="font-medium text-tx">Relatórios</p><p className="text-xs text-tx-2">Indicadores e métricas do escritório</p></div>
        </Link>
        <Link href="/atendimento-app/equipe" className="flex items-center gap-3 p-3 hover:bg-sf-apoio rounded-[2px] transition-colors">
          <div className="h-10 w-10 rounded-full bg-ouro-bg flex items-center justify-center shrink-0"><Users size={18} className="text-ouro-acento" /></div>
          <div className="flex-1"><p className="font-medium text-tx">Equipe</p><p className="text-xs text-tx-2">Usuários e permissões</p></div>
        </Link>
        <Link href="/atendimento-app/configuracoes" className="flex items-center gap-3 p-3 hover:bg-sf-apoio rounded-[2px] transition-colors">
          <div className="h-10 w-10 rounded-full bg-ouro-bg flex items-center justify-center shrink-0"><Settings size={18} className="text-ouro-acento" /></div>
          <div className="flex-1"><p className="font-medium text-tx">Configurações</p><p className="text-xs text-tx-2">Preferências do app</p></div>
        </Link>
        <Link href="/atendimento-app/tema" className="flex items-center gap-3 p-3 hover:bg-sf-apoio rounded-[2px] transition-colors">
          <div className="h-10 w-10 rounded-full bg-ouro-bg flex items-center justify-center shrink-0"><Palette size={18} className="text-ouro-acento" /></div>
          <div className="flex-1"><p className="font-medium text-tx">Tema</p><p className="text-xs text-tx-2">Claro / Escuro / Automático</p></div>
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