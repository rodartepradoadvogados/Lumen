import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { getOfficeModules } from "@/lib/officeModules";
import { veTodoOAtendimento } from "@/lib/acessoAtendimento";
import { inicioDoDiaEmBrasilia, inicioDoProximoMesEmBrasilia } from "@/lib/horaDeBrasilia";
import IndicadoresPagina from "@/components/indicadores/IndicadoresPagina";
import PeriodoSeg, { lerPeriodo } from "@/components/indicadores/PeriodoSeg";
import FaixaDeRisco from "@/components/indicadores/FaixaDeRisco";
import CargaPorAdvogado from "@/components/indicadores/CargaPorAdvogado";
import ReceitaEResultado from "@/components/indicadores/ReceitaEResultado";
import Inadimplencia from "@/components/indicadores/Inadimplencia";
import ProdutividadeResumo from "@/components/indicadores/ProdutividadeResumo";
import FunilResumo from "@/components/indicadores/FunilResumo";
import FecharOMes from "@/components/indicadores/FecharOMes";
import { ErroDeBloco } from "@/components/gestao/Estados";
import { cargaPorAdvogado } from "@/lib/gestao/cargaPorAdvogado";
import { publicacoesSemTriagem } from "@/lib/gestao/semTriagem";
import { receitaEResultado, ultimosMeses } from "@/lib/gestao/receitaEResultado";
import { inadimplenciaPorCliente } from "@/lib/gestao/inadimplencia";
import { fecharOMes } from "@/lib/gestao/fecharMes";
import { resumoDoFunil } from "@/lib/gestao/funil";
import { pontosPorPessoa, comoSeCalculamOsPontos } from "@/lib/gestao/pontos";

export const dynamic = "force-dynamic";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

// Cada bloco se protege sozinho: se uma consulta falhar, o resto da página continua de pé e o bloco
// que falhou mostra o erro em português com "Tentar de novo" (antes uma falha derrubava a tela).
async function seguro<T>(fn: () => Promise<T>): Promise<{ ok: true; dado: T } | { ok: false }> {
  try {
    return { ok: true, dado: await fn() };
  } catch (e) {
    console.error("[indicadores] bloco falhou", e);
    return { ok: false };
  }
}

// VISÃO GERAL — "como está o escritório". A resposta vem primeiro (prazos em risco), depois a
// carga por pessoa, o dinheiro (só para quem tem acesso ao Financeiro), a produtividade, o funil
// (só para quem vê o Atendimento inteiro) e o que falta para fechar o mês. Tudo lido do banco por
// lib/gestao/*; indicador sem dado mostra estado vazio em texto, nunca um número inventado.
export default async function IndicadoresPage({ searchParams }: { searchParams: { periodo?: string } }) {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");
  const agora = new Date();
  const periodo = lerPeriodo(searchParams.periodo);
  const socio = Boolean(viewer.isAdmin || viewer.financeAccess);
  const officeId = viewer.officeId;
  const modulos = await getOfficeModules(officeId);
  const vFunil = Boolean(modulos.atendimento && veTodoOAtendimento(viewer));

  const meses = ultimosMeses(agora, periodo.meses);
  const [aa, mm] = meses[0].chave.split("-").map(Number);
  const inicioPeriodo = inicioDoDiaEmBrasilia(aa, mm, 1);
  const fimPeriodo = inicioDoProximoMesEmBrasilia(agora);
  const [anoAtual, mesAtual] = meses[meses.length - 1].chave.split("-").map(Number);
  const nomeDoMes = `${MESES[mesAtual - 1]} de ${anoAtual}`;
  const rotuloDoPeriodo = periodo.meses === 1 ? nomeDoMes : `${meses[0].rotulo} a ${meses[meses.length - 1].rotulo}`;

  const [carga, triagem, caixa, inad, fechar, funil, pontos] = await Promise.all([
    seguro(() => cargaPorAdvogado(officeId, { agora, somenteUserId: socio ? undefined : viewer.id })),
    seguro(() => publicacoesSemTriagem(officeId, agora)),
    seguro(() => receitaEResultado(officeId, socio, periodo.meses, agora)),
    seguro(() => inadimplenciaPorCliente(officeId, socio, agora)),
    seguro(() => fecharOMes(officeId, socio)),
    vFunil ? seguro(() => resumoDoFunil(officeId, agora)) : Promise.resolve(null),
    seguro(async () => {
      const [tarefas, pessoas, tabela] = await Promise.all([
        prisma.task.findMany({
          where: { officeId, status: "CONCLUIDO", completedAt: { gte: inicioPeriodo, lt: fimPeriodo }, responsibleId: socio ? { not: null } : viewer.id },
          select: { responsibleId: true, points: true },
        }),
        prisma.user.findMany({ where: { officeId, active: true }, select: { id: true, name: true } }),
        prisma.taskTypePoints.findMany({ where: { officeId } }),
      ]);
      const por = pontosPorPessoa(tarefas);
      return {
        linhas: pessoas.filter((p) => por.has(p.id)).map((p) => ({ userId: p.id, nome: p.name, pontos: por.get(p.id)!.pontos })),
        comoSeCalcula: comoSeCalculamOsPontos(tabela),
      };
    }),
  ]);

  const nenhumDado = carga.ok && carga.dado.totais.abertas === 0 && triagem.ok && triagem.dado.total === 0;

  return (
    <IndicadoresPagina
      ativa="visao-geral"
      temAcessoAoFinanceiro={socio}
      frase={`Como está o escritório em ${nomeDoMes}.`}
      acao={<PeriodoSeg atual={periodo.valor} base="/indicadores" />}
    >
      {carga.ok && triagem.ok ? (
        <FaixaDeRisco
          atrasadas={carga.dado.totais.atrasadas}
          vencemEm7={carga.dado.totais.vencemEm7}
          semTriagem={triagem.dado.total}
          diasDaMaisAntiga={triagem.dado.diasDaMaisAntiga}
        />
      ) : (
        <ErroDeBloco titulo="Não foi possível calcular os prazos em risco" detalhe="A consulta de tarefas ou publicações falhou. Os outros blocos seguem abaixo." />
      )}

      {nenhumDado && (
        <p className="text-sm text-tx-2 max-w-[68ch]">
          Ainda não há tarefas abertas nem publicações sem triagem neste escritório. Os indicadores aparecem aqui conforme o trabalho for registrado.
        </p>
      )}

      {carga.ok ? (
        <CargaPorAdvogado
          linhas={carga.dado.linhas}
          totais={carga.dado.totais}
          soAPropria={!socio}
          semDono={{ tarefas: carga.dado.abertasSemResponsavel, publicacoes: carga.dado.publicacoesSemDono }}
        />
      ) : (
        <ErroDeBloco titulo="Não foi possível carregar a carga por advogado" />
      )}

      {socio && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
          {caixa.ok && caixa.dado ? <ReceitaEResultado resumo={caixa.dado} rotuloDoPeriodo={rotuloDoPeriodo} /> : <ErroDeBloco titulo="Não foi possível carregar receita e resultado" />}
          {inad.ok && inad.dado ? <Inadimplencia total={inad.dado.total} contas={inad.dado.contas} devedores={inad.dado.devedores} /> : <ErroDeBloco titulo="Não foi possível carregar a inadimplência" />}
        </div>
      )}

      <div className={`grid grid-cols-1 gap-6 items-start ${vFunil ? "xl:grid-cols-3" : "xl:grid-cols-2"}`}>
        {pontos.ok ? (
          <ProdutividadeResumo linhas={pontos.dado.linhas} comoSeCalcula={pontos.dado.comoSeCalcula} rotuloDoPeriodo={rotuloDoPeriodo} />
        ) : (
          <ErroDeBloco titulo="Não foi possível carregar a produtividade" />
        )}
        {vFunil &&
          (funil && funil.ok ? (
            <FunilResumo total={funil.dado.total} porEstagio={funil.dado.porEstagio} conversao={funil.dado.conversao} propostasParadas={funil.dado.propostasParadas} />
          ) : (
            <ErroDeBloco titulo="Não foi possível carregar o funil comercial" />
          ))}
        {fechar.ok ? <FecharOMes itens={fechar.dado} mes={nomeDoMes} /> : <ErroDeBloco titulo="Não foi possível carregar o fechamento do mês" />}
      </div>
    </IndicadoresPagina>
  );
}
