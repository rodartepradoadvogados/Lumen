import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { LumenPanel, LumenPanelHeader } from "@/components/painelMestre/LumenUi";

export const dynamic = "force-dynamic";

// Página informativa, sem CRUD — descreve em linguagem factual (não é parecer jurídico) o que
// o sistema já faz hoje em termos de isolamento de dado e trilha de auditoria. Nenhuma
// alegação de conformidade legal (LGPD, certificação) é feita aqui: só o que já existe no
// código, com o que ainda está "em construção" nomeado como tal.
export default async function ConfiancaPage() {
  const viewer = await getCurrentUser({ ignoreActing: true });
  if (!viewer) redirect("/");
  if (!viewer.isPlatformOwner) redirect("/painel");

  const officeCount = await prisma.office.count();

  return (
    <div className="p-6 max-w-[900px] mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-navy-900 dark:text-cream-50">Confiança e LGPD</h1>
        <p className="text-sm text-navy-800/55 dark:text-cream-50/55 mt-1">
          O que já está implementado tecnicamente hoje — descrição factual, não é parecer jurídico
        </p>
      </div>

      <LumenPanel>
        <LumenPanelHeader title="Isolamento por escritório" />
        <div className="p-5 text-sm text-cream-50/75 space-y-2">
          <p>
            Cada um dos <strong className="text-cream-50 font-mono tabular-nums">{officeCount}</strong> escritório(s)
            cadastrado(s) só enxerga os próprios dados. Todo modelo de negócio do sistema (processos, atendimentos,
            financeiro, contatos, publicações) carrega um <code className="text-xs bg-white/10 rounded px-1 py-0.5">officeId</code>{" "}
            obrigatório, denormalizado propositalmente para tornar &ldquo;toda query direta filtra por
            officeId&rdquo; uma regra mecânica e auditável — desde a fundação multi-tenant do sistema.
          </p>
        </div>
      </LumenPanel>

      <LumenPanel>
        <LumenPanelHeader title="Acesso de suporte sob controle do cliente" />
        <div className="p-5 text-sm text-cream-50/75 space-y-2">
          <p>
            Toda entrada do suporte da Lúmen em dado de um escritório passa por pedido, motivo (de uma lista
            fechada, nunca texto livre) e prazo curto — e fica registrada em log de auditoria, sem exceção. Cada
            escritório escolhe, na própria tela de Configurações, se esse acesso é liberado automaticamente ou se
            exige aprovação prévia de um sócio.
          </p>
          <p>
            <Link href="/painel-mestre/cofre" className="text-gold-400 font-semibold hover:underline">
              Ver o Cofre de acesso
            </Link>{" "}
            — a visão consolidada, somente leitura, de sessões ativas, pedidos e auditoria de todos os escritórios.
          </p>
        </div>
      </LumenPanel>

      <LumenPanel>
        <LumenPanelHeader title="Próximo passo: Vidro Fosco" />
        <div className="p-5 text-sm text-cream-50/75 space-y-2">
          <p>
            O modelo de dados para um controle de sigilo mais fino — por papel e por pessoa da equipe Lúmen — já
            existe (<code className="text-xs bg-white/10 rounded px-1 py-0.5">PlatformRole.maxVisibility</code>),
            mas ainda não está ativo em nenhuma tela.
          </p>
          <p>
            É aditivo e dormente: hoje ninguém alcança o nível mais alto de sigilo (nem mesmo sócio), e nenhum
            comportamento muda até uma fase futura ligar esse controle de verdade.
          </p>
        </div>
      </LumenPanel>
    </div>
  );
}
