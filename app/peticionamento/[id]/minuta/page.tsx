import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { ShellPeticionamento } from "@/components/peticionamento/Shell";
import { MinutaClient } from "@/components/peticionamento/MinutaClient";
import { GerandoClient } from "@/components/peticionamento/GerandoClient";
import { obterSessaoPeticionamento, avaliarTrabalhoEmAndamento, contarRascunhos, gravarPassoDaSessao } from "@/lib/actions/peticionamento";
import { montarNotaObrigatoria, type PrecedenteCitado } from "@/lib/peticionamentoNotaObrigatoria";
import { perfilDePeticionamento } from "@/lib/hermesPonte";
import { avaliarExportacao } from "@/lib/peticionamentoAcesso";
import { htmlParaAbrirAFolha } from "@/lib/peticionamentoMinutaFormatada";
import { faixaDeGeracaoDoEscritorio } from "@/lib/peticionamentoGeracaoAssincrona";
import { marcarDesfechoDaGeracaoComoVisto } from "@/lib/actions/peticionamento";

export const dynamic = "force-dynamic";

async function descricaoDoContexto(sessao: { officeId: string; vinculoCaseIds: unknown; vinculoAttendanceIds: unknown; vinculoAssessoriaIds: unknown }): Promise<string | null> {
  const caseIds = (sessao.vinculoCaseIds as string[] | null) ?? [];
  const attendanceIds = (sessao.vinculoAttendanceIds as string[] | null) ?? [];
  const assessoriaIds = (sessao.vinculoAssessoriaIds as string[] | null) ?? [];
  if (caseIds.length === 0 && attendanceIds.length === 0 && assessoriaIds.length === 0) return null;
  const partes: string[] = [];
  if (caseIds.length) {
    const cs = await prisma.case.findMany({ where: { id: { in: caseIds }, officeId: sessao.officeId }, select: { processNumber: true, title: true, court: true } });
    partes.push(...cs.map((c) => (c.processNumber ? `Processo nº ${c.processNumber}${c.court ? ` — ${c.court}` : ""}` : c.title)));
  }
  if (attendanceIds.length) {
    const as = await prisma.attendance.findMany({ where: { id: { in: attendanceIds }, officeId: sessao.officeId }, select: { subject: true } });
    partes.push(...as.map((a) => `Atendimento — ${a.subject}`));
  }
  if (assessoriaIds.length) {
    const ases = await prisma.assessoria.findMany({ where: { id: { in: assessoriaIds }, officeId: sessao.officeId }, include: { client: true } });
    partes.push(...ases.map((a) => `Assessoria — ${a.client.name}`));
  }
  return partes.length ? partes.join(" · ") : null;
}

export default async function MinutaPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) notFound();
  const sessao = await obterSessaoPeticionamento(params.id).catch(() => null);
  if (!sessao) notFound();
  // Grava o passo real a cada navegação — Retomar usa isto, não mais a dedução (lib/peticionamentoPasso.ts).
  const [temTrabalho, rascunhosCount] = await Promise.all([
    avaliarTrabalhoEmAndamento(params.id),
    contarRascunhos(),
    gravarPassoDaSessao(params.id, "minuta"),
  ]);

  if (sessao.status === "GERANDO") {
    // A ESPERA SAIU DE DENTRO DA REQUISIÇÃO WEB (ver lib/peticionamentoGeracaoAssincrona.ts): a
    // geração corre no servidor e esta tela ACOMPANHA. Antes ela era um parágrafo parado que
    // prometia "1-2 minutos" — um número que ninguém media, numa tela que não dava sinal de vida
    // e não sobrevivia a fechar a aba.
    //
    // `desdeMs` vem do servidor, medido: é o tempo desde que a geração começou, não uma estimativa
    // de quanto falta (que não existe).
    const inicio = (sessao.geracaoIniciadaEm ?? sessao.updatedAt).getTime();
    // A FAIXA MEDIDA deste escritório, para o aviso de abertura dizer quanto isto costuma levar
    // com número medido em vez de número inventado — ver lib/peticionamentoTempoDeGeracao.ts. Uma
    // consulta curta (as vinte últimas durações), e só neste estado da tela.
    const faixa = await faixaDeGeracaoDoEscritorio(sessao.officeId);
    return (
      <ShellPeticionamento sessaoId={params.id} ativo="minuta" crumbAtual="Minuta" nomeUsuario={user.name} papelUsuario={user.role} temTrabalho={temTrabalho} rascunhosCount={rascunhosCount}>
        <div className="content">
          <GerandoClient sessaoId={params.id} desdeMsInicial={Math.max(0, Date.now() - inicio)} faixa={faixa} />
        </div>
      </ShellPeticionamento>
    );
  }

  if (sessao.status === "FALHA_GERACAO" || !sessao.minutaTexto) {
    // O MOTIVO FALADO, QUANDO HÁ UM. `contextoBloqueadoMotivo` é onde a geração grava a frase que
    // diz o que aconteceu e o que fazer (ponte reiniciada, tempo esgotado, pedido grande demais).
    // O parágrafo genérico abaixo continua existindo porque ele ainda é a verdade para o caso
    // mais comum de todos: o Hermes não configurado neste ambiente — mas ele deixou de ser a
    // ÚNICA coisa que o advogado lê, que era como uma falha explicável virava um texto que não
    // explicava nada.
    const motivoGravado = sessao.contextoBloqueadoMotivo;
    // O ALERTA DA CENTRAL SOME AO SER ABERTO, e a falha conta como aberta também: quem chegou aqui
    // já leu o que aconteceu, e o alerta não tem mais o que avisar. Ver
    // `marcarDesfechoDaGeracaoComoVisto` — não é gravado no estado GERANDO, senão o alerta morreria
    // antes de nascer.
    await marcarDesfechoDaGeracaoComoVisto(params.id);
    return (
      <ShellPeticionamento sessaoId={params.id} ativo="minuta" crumbAtual="Minuta" nomeUsuario={user.name} papelUsuario={user.role} temTrabalho={temTrabalho} rascunhosCount={rascunhosCount}>
        <div className="content">
          <div className="callout callout-danger">
            <h2>Não foi possível gerar a minuta</h2>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
              {motivoGravado ?? (
                <>
                  O agente (perfil <span className="mono">peticionamento-lumen</span>) não respondeu. Isto costuma significar que o Hermes não está configurado ou
                  está indisponível neste ambiente — os dados desta sessão continuam salvos, nada foi perdido.
                </>
              )}
            </p>
          </div>
          <a className="btn btn-primary" style={{ marginTop: 16, width: "fit-content" }} href={`/peticionamento/${params.id}/confirmar`}>
            Tentar novamente
          </a>
        </div>
      </ShellPeticionamento>
    );
  }

  // A minuta EXISTE e está sendo aberta: o aviso de "minuta pronta" da Central de Alertas cumpriu
  // o que tinha para cumprir e sai da tela sozinho, sem ninguém precisar dispensá-lo.
  await marcarDesfechoDaGeracaoComoVisto(params.id);

  const contextoDescricao = await descricaoDoContexto(sessao);
  const notaObrigatoria = montarNotaObrigatoria({
    precedentes: ((sessao.jurisprudenciaCitada as PrecedenteCitado[] | null) ?? []) as PrecedenteCitado[],
    documentosBaseConsultados: ((sessao.documentosBaseConsultados as string[] | null) ?? []) as string[],
    documentosNaoLidos: ((sessao.documentosNaoLidos as { nome: string; motivo: string }[] | null) ?? []) as { nome: string; motivo: string }[],
    // Só quando o advogado marcou a preclusão — ver lib/peticionamentoNotaObrigatoria.ts.
    prazoPreclusivoEm: sessao.prazoPreclusivo ? sessao.prazoFatal : null,
    contextoVinculadoDescricao: contextoDescricao,
    geradoEm: sessao.geradoEm ?? new Date(),
    perfil: perfilDePeticionamento(),
    sessaoId: sessao.id,
  });

  // O HTML da folha é resolvido AQUI, no servidor, por um lugar só: o gravado quando existe, a
  // semente do texto puro quando a sessão é anterior ao editor (`minutaFormatadaHtml` nulo é estado
  // legítimo — ver o contrato no schema). A tela nunca recebe as duas representações em paralelo:
  // o texto puro volta DERIVADO do HTML na gravação, e não digitado ao lado dele.
  const htmlDaFolha = htmlParaAbrirAFolha(sessao.minutaFormatadaHtml, sessao.minutaTexto);

  return (
    <ShellPeticionamento
      sessaoId={params.id}
      ativo="minuta"
      crumbAtual="Minuta"
      nomeUsuario={user.name}
      papelUsuario={`OAB ${user.oab ?? "—"} · ${user.role}`}
      statusCentro={sessao.status === "EXPORTADA" ? "exportada" : "documento vivo · edição local, ainda não exportado"}
      temTrabalho={temTrabalho}
      rascunhosCount={rascunhosCount}
    >
      <MinutaClient
        sessaoId={params.id}
        titulo={`${sessao.tipoPeca ?? "Petição"}${sessao.clienteNome ? ` — ${sessao.clienteNome}` : ""}`}
        notaObrigatoria={notaObrigatoria}
        notaRiscos={((sessao.notaRiscos as string[] | null) ?? []) as string[]}
        htmlInicial={htmlDaFolha}
        podeExportar={avaliarExportacao(user)}
        exportada={sessao.status === "EXPORTADA"}
      />
    </ShellPeticionamento>
  );
}
