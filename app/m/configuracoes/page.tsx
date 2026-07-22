import Link from "next/link";
import { getCurrentUser } from "@/lib/currentUser";
import { Card } from "@/components/ui";
import MobileChangePasswordForm from "@/components/mobile/MobileChangePasswordForm";
import NotificationPreferences from "@/components/mobile/NotificationPreferences";
import { ArrowLeft, User, KeyRound, AlertTriangle, Users, DollarSign, Gauge, Workflow, FileText, Plug, Newspaper, CheckSquare, Image as ImageIcon, Bell, type LucideIcon } from "lucide-react";

export const dynamic = "force-dynamic";

// Versão mobile ENXUTA de app/(app)/configuracoes/page.tsx (600+ linhas, 7 sub-seções:
// Geral, Equipe & Acesso, Financeiro, Produtividade, Workflows, Blog Jurídico, Modelos &
// Integrações). Não faz sentido portar aquilo tudo pro celular. Aqui só ficam os dois itens
// que fazem sentido pra qualquer usuário no dia a dia (perfil e trocar a própria senha). O
// resto — incluindo Equipe & Acesso e Blog Jurídico — é só uma lista informativa pra
// administradores saberem que existe; o app NUNCA linka pra rotas do site desktop (regra
// fixa), então cada item é um resumo sem navegação, com a mesma nota "só no computador".
const READONLY_ADMIN_ITEMS: { label: string; desc: string; Icon: LucideIcon }[] = [
  { label: "Equipe & Acesso", desc: "Cadastro de membros, credenciais e acesso ao Financeiro.", Icon: Users },
  { label: "Blog Jurídico — Fila de revisão", desc: "Matérias pendentes de aprovação.", Icon: CheckSquare },
  { label: "Blog Jurídico — Matérias publicadas", desc: "Histórico do que já foi publicado.", Icon: Newspaper },
  { label: "Blog Jurídico — Banco de fotos", desc: "Fotos usadas nas matérias e na página pública.", Icon: ImageIcon },
  { label: "Categorias & Centros de Custo", desc: "Plano de contas do Financeiro (categorias, centros de custo).", Icon: DollarSign },
  { label: "Produtividade", desc: "Pontuação por tipo de tarefa usada no ranking da equipe.", Icon: Gauge },
  { label: "Workflows", desc: "Modelos de fluxo de trabalho (etapas padrão de processos).", Icon: Workflow },
  { label: "Modelos de Documento", desc: "Modelos de petições e documentos usados no escritório.", Icon: FileText },
  { label: "Integrações", desc: "Conexões com Google Drive/Gmail, DJEN e Jusbrasil.", Icon: Plug },
];

export default async function MobileConfiguracoes() {
  const viewer = await getCurrentUser();
  if (!viewer) return null;

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link href="/m" className="inline-flex items-center gap-1 text-xs font-semibold text-navy-800/50 dark:text-cream-50/50">
        <ArrowLeft size={13} /> Início
      </Link>

      <div>
        <h1 className="font-serif text-xl font-bold text-navy-900 dark:text-cream-50">Configurações</h1>
        <p className="text-sm text-navy-800/50 dark:text-cream-50/50">Perfil e preferências da conta</p>
      </div>

      <Card>
        <div className="flex items-center gap-2 px-4 py-3.5 border-b border-navy-800/8 dark:border-white/10">
          <User size={16} className="text-gold-600" />
          <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50 text-sm">Meu Perfil</h3>
        </div>
        <div className="divide-y divide-navy-800/5 dark:divide-white/10">
          <Field label="Nome" value={viewer.name} />
          <Field label="E-mail" value={viewer.email} />
          <Field label="Cargo" value={viewer.role} />
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-2 px-4 py-3.5 border-b border-navy-800/8 dark:border-white/10">
          <KeyRound size={16} className="text-gold-600" />
          <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50 text-sm">Trocar minha senha</h3>
        </div>
        <div className="p-4">
          <MobileChangePasswordForm />
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-2 px-4 py-3.5 border-b border-navy-800/8 dark:border-white/10">
          <Bell size={16} className="text-gold-600" />
          <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50 text-sm">Notificações</h3>
        </div>
        <NotificationPreferences />
      </Card>

      {viewer.isAdmin && (
        <Card>
          <div className="flex items-start gap-2.5 px-4 py-3.5 border-b border-navy-800/8 dark:border-white/10 bg-amber-500/5">
            <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-navy-800/70 dark:text-cream-50/70 leading-relaxed">
              Esses ajustes precisam ser feitos pelo computador. Aqui é só um resumo do que existe.
            </p>
          </div>
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {READONLY_ADMIN_ITEMS.map(({ label, desc, Icon }) => (
              <div key={label} className="flex items-start gap-3 px-4 py-3">
                <span className="h-8 w-8 rounded-lg bg-navy-900/5 dark:bg-white/5 text-navy-800/60 dark:text-cream-50/60 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon size={15} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-navy-900 dark:text-cream-50">{label}</p>
                  <p className="text-xs text-navy-800/45 dark:text-cream-50/45 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="px-4 py-3 flex items-center justify-between gap-3">
      <span className="text-xs text-navy-800/50 dark:text-cream-50/50">{label}</span>
      <span className="text-sm font-medium text-navy-900 dark:text-cream-50 truncate">{value || "—"}</span>
    </div>
  );
}
