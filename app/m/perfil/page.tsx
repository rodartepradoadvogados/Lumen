import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, User, Users } from "lucide-react";
import { getCurrentUser } from "@/lib/currentUser";
import { getMyProfile } from "@/lib/actions/profile";
import { Card } from "@/components/ui";
import EditProfileForm from "@/components/EditProfileForm";
import MobileTeamMonitor from "@/components/mobile/MobileTeamMonitor";

export const dynamic = "force-dynamic";

export default async function MobilePerfilPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");

  const profile = await getMyProfile();
  if (!profile) redirect("/");

  const initials = viewer.name.split(" ").map((n) => n[0]).slice(0, 2).join("");

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link href="/m" className="inline-flex items-center gap-1 text-xs font-semibold text-tx-2">
        <ArrowLeft size={13} /> Início
      </Link>

      <div>
        <h1 className="font-serif text-xl font-bold text-tx">Meu Perfil</h1>
        <p className="text-sm text-tx-2">Seus dados pessoais — só você enxerga e edita</p>
      </div>

      <Card>
        <div className="flex items-center gap-2 px-4 py-3.5 border-b border-regua">
          <User size={16} className="text-marca-tx" />
          <h3 className="font-serif font-bold text-tx text-sm">Dados pessoais</h3>
        </div>
        <div className="p-4">
          <EditProfileForm profile={profile} userId={viewer.id} initials={initials} />
        </div>
      </Card>

      {viewer.isAdmin && (
        <Card>
          <div className="flex items-center gap-2 px-4 py-3.5 border-b border-regua">
            <Users size={16} className="text-marca-tx" />
            <h3 className="font-serif font-bold text-tx text-sm">Controle de Acesso da Equipe</h3>
          </div>
          <MobileTeamMonitor />
        </Card>
      )}
    </div>
  );
}
