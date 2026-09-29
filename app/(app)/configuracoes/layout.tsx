import { Suspense, type ReactNode } from "react";
import { getCurrentUser } from "@/lib/currentUser";
import { getOfficeModules, hasBlogAccess } from "@/lib/officeModules";
import PaginaGestao from "@/components/gestao/PaginaGestao";
import MenuConfiguracoes from "@/components/configuracoes/MenuConfiguracoes";
import { ITENS, itemVisivelEmConfiguracao } from "@/lib/gestao/configuracoes";

// A CASCA de Configurações: título fixo, trilha e o menu de seis grupos. Vale para a página
// principal E para as subpáginas (comunicados, acessos, privacidade, importar), que antes eram
// órfãs — sem menu, com o "← Configurações" de 12px e a aba do topo mentindo sobre onde se estava.
export default async function ConfiguracoesLayout({ children }: { children: ReactNode }) {
  const viewer = await getCurrentUser();
  if (!viewer) return <>{children}</>;
  const [modules, blog] = await Promise.all([getOfficeModules(viewer.officeId), hasBlogAccess(viewer.officeId)]);
  const itens = ITENS.filter((i) =>
    itemVisivelEmConfiguracao(i, { isAdmin: Boolean(viewer.isAdmin), blog, whatsapp: Boolean(modules.whatsapp), atendimento: Boolean(modules.atendimento) })
  );
  return (
    <PaginaGestao
      trilha={[{ label: "Gestão", href: "/indicadores" }, { label: "Configurações" }]}
      titulo="Configurações"
      frase={viewer.isAdmin ? "Ajustes do escritório e do sistema, do que se usa todo dia ao que se mexe uma vez." : "Sua conta, a importação de dados e o que o Lúmen faz com os seus dados."}
    >
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <Suspense fallback={null}>
          <MenuConfiguracoes itens={itens} />
        </Suspense>
        <div className="flex-1 min-w-0 w-full space-y-6">{children}</div>
      </div>
    </PaginaGestao>
  );
}
