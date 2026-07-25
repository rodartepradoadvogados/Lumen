import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { getMyProfile } from "@/lib/actions/profile";
import { PageHeader, Card, CardHeader } from "@/components/ui";
import EditProfileForm from "@/components/EditProfileForm";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");

  const profile = await getMyProfile();
  if (!profile) redirect("/");

  const initials = viewer.name.split(" ").map((n) => n[0]).slice(0, 2).join("");

  return (
    <div className="p-6 max-w-[720px] mx-auto animate-fade-in space-y-6">
      <PageHeader title="Meu Perfil" subtitle="Seus dados pessoais — só você enxerga e edita" />
      <Card>
        <CardHeader title="Dados pessoais" />
        <div className="p-5">
          <EditProfileForm profile={profile} userId={viewer.id} initials={initials} />
        </div>
      </Card>
    </div>
  );
}
