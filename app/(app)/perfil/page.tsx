import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { getMyProfile } from "@/lib/actions/profile";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, CardHeader } from "@/components/ui";
import EditProfileForm from "@/components/EditProfileForm";
import { HardDrive } from "lucide-react";

export const dynamic = "force-dynamic";

// Linha de estado simples (mesmo vocabulário visual de components/conexoes/ConexoesView.tsx, sem
// importar o componente de lá — aquela tela é sobre integração do ESCRITÓRIO; esta é sobre conta
// PESSOAL, então tokens de cor só, sem reaproveitar o componente inteiro).
function StatusLine({ state, children }: { state: "ok" | "erro" | "off"; children: React.ReactNode }) {
  const tone: Record<typeof state, string> = { ok: "border-concluido text-concluido", erro: "border-atencao text-atencao", off: "border-tx-3 text-tx-2" };
  return <p className={`flex items-center gap-2 border-l-4 ${tone[state]} bg-sf-apoio px-3 py-2 text-xs font-medium`}>{children}</p>;
}

export default async function PerfilPage({
  searchParams,
}: {
  searchParams: { google?: string; microsoft?: string; msg?: string };
}) {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");

  const profile = await getMyProfile();
  if (!profile) redirect("/");

  const initials = viewer.name.split(" ").map((n) => n[0]).slice(0, 2).join("");

  const [minhaConexaoGoogle, minhaConexaoMicrosoft] = await Promise.all([
    prisma.googleCredential.findFirst({ where: { userId: viewer.id }, select: { accountEmail: true } }),
    prisma.microsoftCredential.findFirst({ where: { userId: viewer.id }, select: { accountEmail: true } }),
  ]);

  return (
    <div className="p-6 max-w-[720px] mx-auto animate-fade-in space-y-6">
      <PageHeader title="Meu Perfil" subtitle="Seus dados pessoais — só você enxerga e edita" />
      <Card>
        <CardHeader title="Dados pessoais" />
        <div className="p-5">
          <EditProfileForm profile={profile} userId={viewer.id} initials={initials} />
        </div>
      </Card>

      {/* Conexões PESSOAIS (Google/Outlook por pessoa) — distintas das conexões do escritório
          (Drive/OneDrive/Dropbox como armazenamento, WhatsApp etc.), que vivem em /conexoes
          (documento 04 do handoff do redesenho Modernist). Cada pessoa só conecta a própria
          conta, usada para (a) capturar publicações recebidas por e-mail (Jusbrasil/Outlook) e
          (b) enviar e-mail no Atendimento a partir da própria caixa — ver
          components/EmailSendProviderPicker.tsx em /conexoes, que decide qual das duas usar. */}
      <Card>
        <CardHeader title="Minha conta conectada" subtitle="Captura suas publicações por e-mail e permite enviar e-mail no Atendimento pela sua própria caixa" />
        <div className="divide-y divide-regua">
          <div className="p-5 space-y-3">
            <p className="text-[15px] font-semibold text-tx">Google</p>
            {searchParams.google === "conectado" && <StatusLine state="ok">Google conectado com sucesso!</StatusLine>}
            {searchParams.google === "erro" && <StatusLine state="erro">Erro ao conectar: {searchParams.msg || "tente novamente."}</StatusLine>}
            {minhaConexaoGoogle ? (
              <StatusLine state="ok">
                Conectado como <strong>{minhaConexaoGoogle.accountEmail}</strong>
              </StatusLine>
            ) : (
              <StatusLine state="off">Você ainda não conectou seu Google.</StatusLine>
            )}
            <a
              href="/api/google/connect?mode=jusbrasil"
              className="inline-flex items-center gap-2 h-8 border-2 border-regua-forte bg-transparent hover:bg-acao-bg text-tx text-sm font-semibold px-4 w-fit transition-colors"
            >
              <HardDrive size={16} /> {minhaConexaoGoogle ? "Reconectar" : "Conectar"} meu Google
            </a>
          </div>

          <div className="p-5 space-y-3">
            <p className="text-[15px] font-semibold text-tx">Microsoft (Outlook)</p>
            {searchParams.microsoft === "conectado" && <StatusLine state="ok">Microsoft conectado com sucesso!</StatusLine>}
            {searchParams.microsoft === "erro" && <StatusLine state="erro">Erro ao conectar: {searchParams.msg || "tente novamente."}</StatusLine>}
            {minhaConexaoMicrosoft ? (
              <StatusLine state="ok">
                Conectado como <strong>{minhaConexaoMicrosoft.accountEmail}</strong>
              </StatusLine>
            ) : (
              <StatusLine state="off">Você ainda não conectou sua Microsoft.</StatusLine>
            )}
            <a
              href="/api/microsoft/connect"
              className="inline-flex items-center gap-2 h-8 border-2 border-regua-forte bg-transparent hover:bg-acao-bg text-tx text-sm font-semibold px-4 w-fit transition-colors"
            >
              <HardDrive size={16} /> {minhaConexaoMicrosoft ? "Reconectar" : "Conectar"} minha Microsoft
            </a>
          </div>
        </div>
      </Card>
    </div>
  );
}
