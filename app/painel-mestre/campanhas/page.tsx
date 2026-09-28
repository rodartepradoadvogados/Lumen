import { requirePlatformAccess } from "@/lib/platformMember";
import { prisma } from "@/lib/prisma";
import { LumenPanel, LumenPanelHeader } from "@/components/painelMestre/LumenUi";
import CampanhaPrecosEditor from "@/components/painelMestre/CampanhaPrecosEditor";
import AlertaMemoriaEditor from "@/components/painelMestre/AlertaMemoriaEditor";
import SolicitacoesDeCampanhaPainel, { type SolicitacaoDeCampanha } from "@/components/painelMestre/SolicitacoesDeCampanhaPainel";
import ProvisionamentoCampanhasPainel, { type ProvisionamentoDeEscritorio } from "@/components/painelMestre/ProvisionamentoCampanhasPainel";
import { normalizarEstadoDoPerfil } from "@/lib/moduloCampanhas";
import { situacaoDoProvisionamento } from "@/lib/provisionamentoCampanhas";
import { ROTULO_DO_PRECO_POR_CHAVE } from "@/lib/telaCampanhas";
import { podeAprovarCampanha, MOTIVO_PAPEL_SEM_APROVACAO } from "@/lib/aprovacaoDeCampanha";

export const dynamic = "force-dynamic";

// ============================================================================
// O MÓDULO PAGO DE CAMPANHAS, NO PAINEL MESTRE (Frente D — §6.3/§6.4, §4). Preços do módulo,
// limiar de memória da VPS (os três "nascem nulos" da especificação), a fila de solicitações
// pendentes ("liberar campanha") e o estado de provisionamento de cada escritório — nenhuma
// regra nova aqui, só leitura + chamada das ações das Frentes B/C.
// ============================================================================

export default async function CampanhasPainelMestrePage() {
  const acesso = await requirePlatformAccess();
  // Dono da plataforma (Jairo, Rodrigo) decide sempre — é o papel Sócio, mesmo quando a linha de
  // PlatformMember ainda não foi espelhada. Para o resto da equipe, vale o papel.
  const podeDecidirCampanha = acesso.isOwner || podeAprovarCampanha(acesso.member?.roleKey);

  const [precoRows, limiar, slotsSolicitados, perfis] = await Promise.all([
    prisma.campanhaPrecoParametro.findMany({ where: { chave: { in: ["MENSALIDADE_MODULO", "SLOT_EXTRA"] } } }),
    prisma.alertaMemoriaHermesParametro.findUnique({ where: { chave: "LIMIAR_MEMORIA_LIVRE_KB" } }),
    prisma.campanhaSlotPago.findMany({
      where: { estado: "SOLICITADO" },
      orderBy: { solicitadoEm: "asc" },
      include: { office: { select: { name: true } }, campanha: { select: { nome: true } } },
    }),
    prisma.perfilCampanhaHermes.findMany({
      include: { assinatura: { include: { office: { select: { name: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // As duas chaves de preço podem nem existir ainda no banco — a linha aparece com "sem preço
  // configurado" mesmo assim (ROTULO_DO_PRECO_POR_CHAVE é a mesma fonte de rótulo que a ação usa
  // ao criar a linha pela primeira vez).
  const linhasDePreco = Object.entries(ROTULO_DO_PRECO_POR_CHAVE).map(([chave, label]) => ({
    chave,
    label,
    preco: precoRows.find((p) => p.chave === chave)?.preco ?? null,
  }));

  const solicitacoes: SolicitacaoDeCampanha[] = slotsSolicitados.map((s) => ({
    slotId: s.id,
    officeName: s.office.name,
    campanhaNome: s.campanha.nome,
    formaDePagamento: s.formaDePagamento,
    solicitadoEm: s.solicitadoEm.toLocaleDateString("pt-BR"),
  }));

  const escritoriosComProvisionamento: ProvisionamentoDeEscritorio[] = perfis.map((p) => ({
    perfilId: p.id,
    officeName: p.assinatura.office.name,
    situacao: situacaoDoProvisionamento({
      estaProvisionado: normalizarEstadoDoPerfil(p.estado) === "PROVISIONADO",
      precisaReprovisionar: p.precisaReprovisionar,
      numeroDeTentativas: p.numeroDeTentativasDeProvisionamento,
      falhouDefinitivamente: p.provisionamentoFalhouDefinitivamente,
      ultimoErro: p.ultimoErroDeProvisionamento,
    }),
  }));

  return (
    <div className="p-6 max-w-[1100px] mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="text-autuacao font-bold text-tx">Campanhas</h1>
        <p className="text-sm text-tx-2 mt-1">
          Módulo pago de campanhas — preços, limiar de memória da VPS do Hermes, solicitações pendentes e estado de
          provisionamento de cada escritório
        </p>
      </div>

      <LumenPanel>
        <LumenPanelHeader
          title="Preços do módulo"
          subtitle="Mensalidade do módulo e o valor fixo da campanha simultânea adicional — as duas nascem sem preço configurado"
        />
        <CampanhaPrecosEditor linhas={linhasDePreco} />
      </LumenPanel>

      <LumenPanel>
        <LumenPanelHeader
          title="Alerta de memória da VPS do Hermes"
          subtitle="Nível único — dispara para Jairo e Rodrigo quando a memória livre (RAM + swap) cruza o limiar"
        />
        <AlertaMemoriaEditor limiarKBInicial={limiar?.limiarKB ?? null} ultimoAlertaDiarioEm={limiar?.ultimoAlertaDiarioEm ?? null} />
      </LumenPanel>

      <LumenPanel>
        <LumenPanelHeader
          title="Liberar campanha"
          subtitle={
            podeDecidirCampanha
              ? `${solicitacoes.length} solicitação(ões) de campanha simultânea aguardando aprovação`
              : `${solicitacoes.length} solicitação(ões) aguardando aprovação — ${MOTIVO_PAPEL_SEM_APROVACAO}`
          }
        />
        <SolicitacoesDeCampanhaPainel solicitacoes={solicitacoes} podeDecidir={podeDecidirCampanha} />
      </LumenPanel>

      <LumenPanel>
        <LumenPanelHeader
          title="Provisionamento do perfil de campanha"
          subtitle="O estado real de cada perfil no Hermes — nunca um silêncio que pareça sucesso"
        />
        <ProvisionamentoCampanhasPainel escritorios={escritoriosComProvisionamento} />
      </LumenPanel>
    </div>
  );
}
