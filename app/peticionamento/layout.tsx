import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Marcellus, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { getCurrentUser } from "@/lib/currentUser";
import { podeAcessarAba } from "@/lib/peticionamentoAcesso";
import { ProvedorDeSaida } from "@/components/peticionamento/SaidaContext";
import "./peticionamento.css";

// Aba de Peticionamento — decisão do dono: "sensação de sair do Lúmen". Por isso é uma raiz de
// rota PRÓPRIA (app/peticionamento/, fora de app/(app)/), com layout e folha de estilo próprios,
// nunca dentro do AppShell/TopBar do resto do produto (components/AppShell.tsx) — ver
// decisions.md da pasta de mockups para a justificativa completa da direção visual.
//
// self-hosted via next/font/google (mesmo padrão do Inter em app/layout.tsx) — nunca um <link>
// direto ao Google Fonts em runtime, que os mockups usavam por serem HTML solto fora do Next.
const marcellus = Marcellus({ subsets: ["latin"], weight: "400", variable: "--font-peticionamento-display", display: "swap" });
const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-peticionamento-ui", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-peticionamento-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Peticionamento | Lúmen",
  description: "Minuta em rascunho, redigida por agente, a partir do contexto escolhido — nunca protocolada por aqui.",
};

// Sempre dinâmico — decide acesso por papel do usuário logado a cada requisição (recepção NUNCA
// entra aqui, especificação §4).
export const dynamic = "force-dynamic";

export default async function PeticionamentoLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !user.active) redirect("/");

  // HARD GATE de acesso à aba inteira — checado no layout (roda antes de QUALQUER página desta
  // árvore), não só em cada página individualmente. lib/peticionamentoAcesso.ts é o módulo puro
  // testado; aqui só se aplica o resultado dele.
  if (!podeAcessarAba(user)) {
    return (
      <div className={`peticionamento ${marcellus.variable} ${plexSans.variable} ${plexMono.variable}`}>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22, padding: 24, textAlign: "center" }}>
          <h1 className="title" style={{ fontSize: "clamp(28px,5vw,44px)" }}>
            Sem acesso
          </h1>
          <p className="scope-line">
            Esta aba é restrita a advogados e estagiários do escritório. Se você acredita que deveria ter acesso, fale com um sócio ou administrador.
          </p>
          <a className="btn btn-primary" href="/painel" style={{ marginTop: 12 }}>
            Voltar ao Lúmen
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className={`peticionamento ${marcellus.variable} ${plexSans.variable} ${plexMono.variable}`}>
      {/* Pop-up de saída (espec. §4) — um único Provider para a aba inteira, ver
          components/peticionamento/SaidaContext.tsx para o porquê de morar aqui e não em cada
          página. */}
      <ProvedorDeSaida>{children}</ProvedorDeSaida>
    </div>
  );
}
