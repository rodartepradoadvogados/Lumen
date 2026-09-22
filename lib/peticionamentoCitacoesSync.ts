// ============================================================================================
// A SINCRONIZAÇÃO DAS CITAÇÕES — e por que ela mudou de arquivo.
//
// Esta função sempre viveu dentro de lib/actions/peticionamento.ts, privada, chamada depois de
// toda geração e de toda edição do corpo da minuta. Ela saiu de lá nesta entrega por um motivo
// concreto: a geração da minuta deixou de acontecer sempre dentro da requisição do advogado.
//
// Quem grava a minuta agora pode ser a TELA (o advogado acompanhando) ou o CRON (a aba fechada,
// app/api/cron/minutas-pendentes) — e a lista de validação de citações é uma das TRAVAS
// JURÍDICAS do módulo: sem ela, a tela de minuta abre com a lista vazia e o "li e revisei" de
// cada precedente deixa de ser cobrado. Nenhum dos dois caminhos pode pulá-la.
//
// POR QUE NÃO BASTAVA EXPORTAR DE LÁ: lib/actions/peticionamento.ts é `"use server"`. Toda função
// exportada dali vira uma Server Action, chamável do navegador — e esta recebe `officeId` como
// PARÂMETRO. Exportá-la entregaria ao cliente uma função que aceita o escritório que ele quiser
// mandar, que é exatamente o isolamento que lib/testes/peticionamentoIsolamento.teste.ts existe
// para cobrar. Um módulo comum não tem esse risco: só o servidor o importa.
// ============================================================================================

import { prisma } from "@/lib/prisma";
import { montarListaDeCitacoes, normalizarTextoCitacao, type PrecedenteParaCitacao } from "@/lib/peticionamentoCitacoes";

/**
 * Recalcula as linhas de PeticionamentoCitacao a partir do estado ATUAL da sessão (jurisprudência
 * estruturada + corpo da minuta) — chamada depois de toda geração e de toda edição do corpo, para
 * a lista nunca ficar desatualizada.
 *
 * IDENTIDADE de uma citação = (tipo, texto normalizado). Uma citação cujo texto mudou é, por
 * definição, OUTRA citação: a linha antiga (com a confirmação que carregava) é apagada, e a nova
 * entra sem confirmação nenhuma. É assim que "editar a minuta invalida a confirmação das citações
 * que mudaram" (decisão do dono) vira código — hashDoTexto é a impressão do texto gravada NA
 * confirmação, para auditoria; a invalidação em si acontece aqui, pela identidade deixar de bater.
 */
export async function sincronizarCitacoes(sessaoId: string, officeId: string): Promise<void> {
  // A MESMA GUARDA DE SEMPRE, escrita aqui em vez de importada: toda leitura/escrita de UMA
  // sessão reconfere o officeId, nunca confia num id sozinho. Estoura quando não acha — devolver
  // null deixaria quem chamou seguir com uma sessão que não é dele.
  const sessao = await prisma.peticionamentoSessao.findFirst({ where: { id: sessaoId, officeId } });
  if (!sessao) throw new Error("Sessão de peticionamento não encontrada.");
  const atuais = montarListaDeCitacoes({
    jurisprudenciaCitada: ((sessao.jurisprudenciaCitada as PrecedenteParaCitacao[] | null) ?? []) as PrecedenteParaCitacao[],
    minutaTexto: sessao.minutaTexto,
  });

  const existentes = await prisma.peticionamentoCitacao.findMany({ where: { sessaoId } });
  const porChave = new Map(existentes.map((c) => [`${c.tipo}::${normalizarTextoCitacao(c.texto)}`, c]));
  const chavesMantidas = new Set<string>();

  const operacoes: Promise<unknown>[] = [];
  for (const item of atuais) {
    const chave = `${item.tipo}::${normalizarTextoCitacao(item.texto)}`;
    chavesMantidas.add(chave);
    const existente = porChave.get(chave);
    if (existente) {
      // Mesma identidade de TEXTO. Duas mudanças possíveis aqui, e elas NÃO valem o mesmo:
      //
      //  · só a FORMA do texto mudou (um espaço, uma quebra de linha, uma maiúscula — tudo que a
      //    normalização já ignora): a confirmação SOBREVIVE. É para isso que a identidade é a
      //    forma normalizada, e não a string crua.
      //
      //  · mudaram os LINKS: a confirmação CAI. Achado da revisão — antes, `fonteUrl` e
      //    `fonteSecundariaUrl` eram atualizados junto com o texto e a confirmação seguia de pé.
      //    A decisão do dono é explícita sobre o que o advogado está confirmando: "os links
      //    utilizados na dupla validação para conferência, uma a uma". O "li e revisei" é sobre
      //    a citação E os links por onde ela foi conferida. Como `jurisprudenciaCitada` é
      //    repovoada a cada geração do Hermes, uma mesma ementa pode voltar com outra fonte
      //    secundária (ou com uma que antes não existia) sem uma vírgula do texto mudar — e, com
      //    o comportamento antigo, o "li e revisei" de ontem passava a responder por um link que
      //    o advogado nunca abriu. É exatamente a responsabilidade que esta tela existe para
      //    criar ("ninguém poderá dizer que não viu"), assinada em branco.
      //
      // hashDoTexto não socorre aqui: ele é impressão do TEXTO, e o texto não mudou.
      const mudouAFormaDoTexto = existente.texto !== item.texto;
      const mudaramOsLinks =
        existente.fonteUrl !== item.fonteUrl || existente.fonteSecundariaUrl !== item.fonteSecundariaUrl;
      if (mudouAFormaDoTexto || mudaramOsLinks) {
        operacoes.push(
          prisma.peticionamentoCitacao.update({
            where: { id: existente.id },
            data: {
              texto: item.texto,
              fonteUrl: item.fonteUrl,
              fonteSecundariaUrl: item.fonteSecundariaUrl,
              ...(mudaramOsLinks ? { confirmadaPorId: null, confirmadaEm: null, hashDoTexto: null } : {}),
            },
          }),
        );
      }
    } else {
      operacoes.push(
        prisma.peticionamentoCitacao.create({
          data: { sessaoId, tipo: item.tipo, texto: item.texto, fonteUrl: item.fonteUrl, fonteSecundariaUrl: item.fonteSecundariaUrl },
        }),
      );
    }
  }
  // Sobrou no mapa quem não está mais na lista atual — a citação mudou de texto ou desapareceu; dos
  // dois jeitos, uma confirmação antiga (se houver) não pode continuar valendo por um texto que já
  // não existe mais na minuta.
  for (const [chave, existente] of porChave) {
    if (!chavesMantidas.has(chave)) operacoes.push(prisma.peticionamentoCitacao.delete({ where: { id: existente.id } }));
  }
  await Promise.all(operacoes);
}

