// Ponte entre o robô Python de captura (DJEN/Datajud, rodando no Railway, que grava
// diretamente nas tabelas "publicacoes"/"andamentos" do mesmo Postgres — espelhadas
// aqui como RoboPublicacao/RoboAndamento) e as tabelas principais do site
// (Publication/Case). Segue o mesmo padrão de lib/jusbrasilEmailSync.ts.

import { prisma } from "@/lib/prisma";
import { converterHtmlParaTextoSimples } from "@/lib/htmlEntities";
import { enqueueNotification } from "@/lib/notificationOutbox";
import { detectarTribunalPorNumeroCNJ } from "@/lib/cnjTribunal";

// Prefere o tribunal derivado do próprio número CNJ (confiável, mesmo algoritmo usado em
// robo-publicacoes/src/datajud.py) ao texto livre que o robô eventualmente traz do
// DJEN/Datajud (RoboPublicacao.tribunal / RoboAndamento.tribunal) — que não segue formato
// fixo e não é validado contra o catálogo. O campo do robô só entra como reserva, quando o
// número não permite identificação (fora do padrão CNJ completo de 20 dígitos, por exemplo).
function tribunalDetectadoPara(numeroProcesso: string | null | undefined, tribunalDoRobo: string | null | undefined): string | null {
  return detectarTribunalPorNumeroCNJ(numeroProcesso)?.sigla ?? tribunalDoRobo ?? null;
}

export type RoboBridgeResult = {
  publicacoesCriadas: number;
  andamentosCriados: number;
  semCasoVinculado: number;
  // Itens capturados que não puderam ser atribuídos a nenhum escritório (nenhum Case com aquele
  // número, nenhuma OAB conhecida). Ficam na fila de origem para triagem em vez de irem parar no
  // escritório do dono da plataforma — ver resolverOffice.
  naoRoteados: number;
  processosMonitoradosCriados: number;
  erros: string[];
};

const JAIRO_OAB_RE = /78[.\s]?295/;
const RODRIGO_OAB_RE = /32[.\s]?943/;

// Número CNJ completo tem exatamente 20 dígitos: NNNNNNN-DD.AAAA.J.TR.OOOO
// (7 + 2 + 4 + 1 + 2 + 4). Só aceitamos o formato completo — não tentamos
// "meio-CNJ" solto, para evitar falso-positivo de vínculo com o Case errado.
export function normalizarNumeroProcesso(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 20) return null;
  return digits;
}

// A partir da OAB (ou, na falta dela, do nome do advogado) informada pelo robô,
// identifica qual advogado do escritório está associado à publicação/andamento.
function detectLawyerTagFromOab(oab: string | null | undefined, nomeAdvogado: string | null | undefined): string | null {
  const oabText = oab ?? "";
  const hasJairo = JAIRO_OAB_RE.test(oabText);
  const hasRodrigo = RODRIGO_OAB_RE.test(oabText);
  if (hasJairo && hasRodrigo) return "Jairo e Rodrigo";
  if (hasJairo) return "Jairo";
  if (hasRodrigo) return "Rodrigo";
  return nomeAdvogado ?? null;
}

// Mesma lógica de extração de número/UF usada em lib/djenSync.ts:parseOab e no robô
// Python (config.py:_parse_oab_texto) — os três precisam concordar sobre o mesmo dado
// de texto livre ("OAB/GO 78.295", "78295-GO", etc.). Usada só para o OAB em texto livre
// de User.oab (cadastro manual, Configurações → Equipe & Acesso) — RoboPublicacao já traz
// número e UF em colunas separadas (oab/uf), não precisa (e não pode) passar por aqui: um
// número puro como "78295" nunca bate o \b(UF)\b exigido abaixo.
const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SE", "SP", "TO"];
function parseOabLivre(raw: string): { numero: string; uf: string } | null {
  const ufMatch = raw.toUpperCase().match(new RegExp(`\\b(${UFS.join("|")})\\b`));
  const numeroMatch = raw.match(/\d[\d.]{3,}/);
  if (!ufMatch || !numeroMatch) return null;
  return { numero: numeroMatch[0].replace(/\D/g, ""), uf: ufMatch[1] };
}

// Número de OAB só é único DENTRO de um estado (OAB 12345/GO e 12345/SP são pessoas
// diferentes) — a chave do índice precisa das duas partes, nunca só o número (mesmo
// princípio já usado no lado Python, config.py:carregar_oabs_do_banco, chave (numero, uf)).
function oabKey(numero: string, uf: string): string {
  return `${numero}|${uf.toUpperCase()}`;
}

// Índices carregados uma vez por sincronização (não por item) para resolver, pra cada
// publicação/andamento capturado pelo robô, a QUAL escritório ele pertence:
//   1ª tentativa: número de processo bate com um Case existente (de qualquer escritório).
//   2ª tentativa: OAB do advogado bate com um usuário de algum escritório.
//   sem nenhum sinal: NÃO ROTEIA — ver resolverOffice abaixo.
//
// A QUEM O DADO PERTENCE NÃO DEPENDE DE PAGAMENTO. Estes índices já incluíram só escritórios
// `status: "ATIVA"`, e a combinação disso com o antigo fallback "cai no escritório interno"
// produzia um vazamento grave: o cron de billing marca um escritório inadimplente como SUSPENSA
// sozinho (lib/actions/billing.ts), o robô continuava capturando os processos dele, o roteamento
// deixava de encontrá-lo e a intimação — com nome de parte e teor de decisão — era gravada
// DENTRO do escritório do dono da plataforma, visível em /publicacoes para outra banca. Sigilo
// profissional quebrado entre escritórios concorrentes, fora do Vidro Fosco, sem AccessSession e
// sem nada em AccessAuditLog, justamente contra o cliente que está devendo.
//
// Status do escritório decide se ele é NOTIFICADO, não a quem o dado pertence — por isso o
// filtro saiu daqui e vive só no bloco de push (fim de syncRoboParaSite). Uma publicação de
// escritório suspenso é gravada normalmente no escritório dele: quando a fatura for paga, já
// está lá, no lugar certo, sem precisar de reprocessamento.
type RoteamentoIndices = {
  casoPorProcesso: Map<string, { caseId: string; officeId: string }>;
  officePorOab: Map<string, string>;
};

async function carregarIndicesDeRoteamento(): Promise<RoteamentoIndices> {
  const [casos, usuarios] = await Promise.all([
    prisma.case.findMany({ where: { processNumber: { not: null } }, select: { id: true, officeId: true, processNumber: true } }),
    // `active: true` continua (um advogado desativado não deve atrair publicação nova para o
    // escritório dele por OAB), mas o filtro por status do ESCRITÓRIO saiu pelo motivo acima.
    prisma.user.findMany({ where: { active: true, oab: { not: null } }, select: { oab: true, officeId: true } }),
  ]);

  const casoPorProcesso = new Map<string, { caseId: string; officeId: string }>();
  for (const c of casos) {
    const normalizado = normalizarNumeroProcesso(c.processNumber);
    if (normalizado) casoPorProcesso.set(normalizado, { caseId: c.id, officeId: c.officeId });
  }

  const officePorOab = new Map<string, string>();
  for (const u of usuarios) {
    const parsed = u.oab ? parseOabLivre(u.oab) : null;
    if (parsed) officePorOab.set(oabKey(parsed.numero, parsed.uf), u.officeId);
  }

  return { casoPorProcesso, officePorOab };
}

// Bloqueio de processo (botão "Bloquear" em LinkPublicationMenu.tsx) é POR USUÁRIO — a Publication
// é sempre criada normalmente pro escritório inteiro; o bloqueio só filtra a listagem de quem
// bloqueou (ver publicationsWhereForViewer em lib/actions/publications.ts), nunca a ingestão.

// oabNumero/oabUf chegam JÁ separados (colunas próprias de RoboPublicacao) — nunca texto
// livre precisando de parseOabLivre aqui, é exatamente esse descompasso (número puro sem
// UF embutida) que fazia o roteamento por OAB nunca disparar para nenhuma publicação
// capturada pelo robô.
function resolverOffice(
  indices: RoteamentoIndices,
  processNumeroNormalizado: string | null,
  oabNumero: string | null,
  oabUf: string | null
): { caseId: string | null; officeId: string | null } {
  if (processNumeroNormalizado) {
    const match = indices.casoPorProcesso.get(processNumeroNormalizado);
    if (match) return { caseId: match.caseId, officeId: match.officeId };
  }
  if (oabNumero && oabUf) {
    const officeId = indices.officePorOab.get(oabKey(oabNumero, oabUf));
    if (officeId) return { caseId: null, officeId };
  }
  // SEM SINAL NENHUM = NÃO ROTEIA. Antes caía num fallback para o escritório interno (dono da
  // plataforma), o que significava gravar teor de comunicação judicial de origem desconhecida
  // dentro de um escritório que não é o dono dela. "Nunca perder o dado" continua valendo, mas
  // quem garante isso é o RoboPublicacao/RoboAndamento de origem, que fica com statusLido=false
  // e volta na próxima execução — não um palpite de dono. Ver syncRoboParaSite: item não roteado
  // é contado em `naoRoteados` e permanece na fila para triagem, em vez de virar Publication no
  // tenant errado.
  return { caseId: null, officeId: null };
}

// dataDisponibilizacao/dataMovimentacao vêm como string livre do robô — tenta parsear
// como data válida; se não der, cai pra dataCaptura (quando o robô salvou o registro).
function parseDataOuFallback(raw: string | null | undefined, fallback: Date): Date {
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return fallback;
}

// Alimenta o robô Python (tabela processos_monitorados/RoboProcessoMonitorado) com os
// números de processo já cadastrados nos Casos do site — assim o Datajud (que já
// funciona, ao contrário do DJEN, hoje bloqueado por IP) passa a acompanhar andamentos
// de todos os processos do escritório, mesmo enquanto a descoberta automática via DJEN
// não funcionar. Idempotente (skipDuplicates): não sobrescreve processos já monitorados,
// sejam eles descobertos via DJEN ou cadastrados manualmente pelo próprio robô.
//
// Aqui o filtro por `status: "ATIVA"` CONTINUA valendo, e agora é só uma decisão de negócio
// (não gastar chamada de robô com escritório que parou de pagar), sem efeito colateral: mesmo
// que o robô siga capturando um processo cujo escritório foi suspenso depois — a lista global
// nunca é podada —, o roteamento entrega a publicação ao dono correto (ver
// carregarIndicesDeRoteamento). Antes essa combinação era justamente o que vazava o dado.
async function seedProcessosMonitoradosFromCases(): Promise<number> {
  const casos = await prisma.case.findMany({
    where: { processNumber: { not: null }, office: { status: "ATIVA" } },
    select: { processNumber: true },
  });

  const numerosValidos = new Set<string>();
  for (const c of casos) {
    if (c.processNumber && normalizarNumeroProcesso(c.processNumber)) {
      numerosValidos.add(c.processNumber);
    }
  }
  if (numerosValidos.size === 0) return 0;

  const { count } = await prisma.roboProcessoMonitorado.createMany({
    data: Array.from(numerosValidos).map((numeroProcesso) => ({
      numeroProcesso,
      origem: "site",
    })),
    skipDuplicates: true,
  });
  return count;
}

// O robô Python (robo-publicacoes/) escreve num conjunto único e global de tabelas
// (RoboPublicacao/RoboAndamento/RoboProcessoMonitorado), sem coluna de escritório — ele já
// monitora as OABs de TODOS os escritórios ativos (config.py:carregar_oabs_do_banco), mas não
// sabe a qual escritório cada OAB pertence. É aqui, na ponte, que cada item capturado é
// atribuído ao escritório certo: por número de processo (bate com um Case existente) e, na
// falta disso, pela OAB do advogado (bate com um usuário ativo); sem nenhum dos dois sinais,
// cai no escritório interno (dono da plataforma) em vez de se perder.
export async function syncRoboParaSite(): Promise<RoboBridgeResult> {
  const result: RoboBridgeResult = {
    publicacoesCriadas: 0,
    andamentosCriados: 0,
    semCasoVinculado: 0,
    naoRoteados: 0,
    processosMonitoradosCriados: 0,
    erros: [],
  };

  // Não há mais guarda de "escritório de fallback existe?": o roteamento não usa fallback
  // nenhum (ver resolverOffice). Com os índices vazios, todo item simplesmente fica não roteado
  // e permanece na fila — que é o comportamento correto, não um erro de configuração.
  const indices = await carregarIndicesDeRoteamento();

  try {
    result.processosMonitoradosCriados = await seedProcessosMonitoradosFromCases();
  } catch (e) {
    const message = e instanceof Error ? e.message : "erro desconhecido";
    result.erros.push(`[seed processos monitorados] ${message}`);
  }

  // Acumula por escritório para notificar cada um só do que é seu, no fim.
  const porOffice = new Map<string, { publicacoes: number; andamentos: number }>();
  function contar(officeId: string, campo: "publicacoes" | "andamentos") {
    const atual = porOffice.get(officeId) ?? { publicacoes: 0, andamentos: 0 };
    atual[campo]++;
    porOffice.set(officeId, atual);
  }

  // `take` limita o pior caso (um lote grande de retomada não carrega a tabela de pendentes
  // inteira — com `teor` sendo o HTML bruto da página de detalhe do DJEN — de uma vez em
  // memória); o que sobrar continua com statusLido=false e volta no próximo ciclo, comportamento
  // já preparado pelo desenho atual (só marca lido depois de garantir a criação, ver abaixo).
  const publicacoesPendentes = await prisma.roboPublicacao.findMany({ where: { statusLido: false }, take: 500 });
  // Uma consulta em lote no lugar de um findUnique por item dentro do laço — elimina 1 ida ao
  // banco por publicação pendente. idComunicacao é @id de RoboPublicacao, então emailMessageId
  // (derivado dele) nunca colide entre duas linhas deste mesmo lote.
  const emailMessageIdsPub = publicacoesPendentes.map((p) => `djen-${p.idComunicacao}`);
  const existentesPub = new Set(
    (await prisma.publication.findMany({ where: { emailMessageId: { in: emailMessageIdsPub } }, select: { emailMessageId: true } })).map((p) => p.emailMessageId)
  );
  for (const pub of publicacoesPendentes) {
    try {
      const emailMessageId = `djen-${pub.idComunicacao}`;
      const jaExiste = existentesPub.has(emailMessageId);

      if (!jaExiste) {
        const numeroNormalizado = normalizarNumeroProcesso(pub.numeroProcesso);
        const oabNumero = pub.oab ? pub.oab.replace(/\D/g, "") : null;
        const { caseId, officeId } = resolverOffice(indices, numeroNormalizado, oabNumero || null, pub.uf || null);
        const lawyerTag = detectLawyerTagFromOab(pub.oab, pub.nomeAdvogado);

        if (officeId) {
          await prisma.publication.create({
            data: {
              officeId,
              kind: "PUBLICACAO",
              source: "DJEN",
              // pub.teor chega como o HTML inteiro da página de detalhe do DJEN (<html><head>
              // <style>...) — converterHtmlParaTextoSimples tira a marcação e decodifica as
              // entidades numa passada só, pra sobrar só a redação corrida que o teor tem por
              // trás da tag. Se não tiver teor nenhum, cai no tipo de comunicação (texto simples,
              // não precisa de conversão — a função detecta sozinha e devolve como veio).
              content: converterHtmlParaTextoSimples(pub.teor ?? pub.tipoComunicacao ?? "(sem teor)"),
              publishedAt: parseDataOuFallback(pub.dataDisponibilizacao, pub.dataCaptura),
              emailMessageId,
              processNumberRaw: pub.numeroProcesso,
              tribunalDetectado: tribunalDetectadoPara(pub.numeroProcesso, pub.tribunal),
              caseId,
              lawyerTag,
            },
          });
          result.publicacoesCriadas++;
          contar(officeId, "publicacoes");
          if (!caseId) result.semCasoVinculado++;
        } else {
          // Não roteado: nenhum Case e nenhuma OAB conhecida apontam para um escritório. NÃO cria
          // Publication (antes ia para o escritório interno, ver resolverOffice) e NÃO marca como
          // lido — o registro de origem fica na fila e volta na próxima execução, então nada se
          // perde e nada entra no tenant errado. Se o processo/OAB for cadastrado depois, a
          // publicação é roteada corretamente no ciclo seguinte, sozinha.
          result.naoRoteados++;
          continue;
        }
      }

      // Só marca como lido depois de garantir que a Publication foi criada ou já
      // existia — nunca antes, para não perder dado em caso de erro no meio do caminho.
      await prisma.roboPublicacao.update({ where: { idComunicacao: pub.idComunicacao }, data: { statusLido: true } });
    } catch (e) {
      const message = e instanceof Error ? e.message : "erro desconhecido";
      result.erros.push(`[publicacao ${pub.idComunicacao}] ${message}`);
    }
  }

  const andamentosPendentes = await prisma.roboAndamento.findMany({ where: { statusLido: false }, take: 500 });
  const emailMessageIdsAnd = andamentosPendentes.map((a) => `datajud-${a.numeroProcesso}-${a.dataMovimentacao}-${a.codigoMovimento}`);
  const existentesAnd = new Set(
    (await prisma.publication.findMany({ where: { emailMessageId: { in: emailMessageIdsAnd } }, select: { emailMessageId: true } })).map((p) => p.emailMessageId)
  );
  for (const and of andamentosPendentes) {
    try {
      const emailMessageId = `datajud-${and.numeroProcesso}-${and.dataMovimentacao}-${and.codigoMovimento}`;
      const jaExiste = existentesAnd.has(emailMessageId);

      if (!jaExiste) {
        const numeroNormalizado = normalizarNumeroProcesso(and.numeroProcesso);
        const { caseId, officeId } = resolverOffice(indices, numeroNormalizado, null, null);

        if (officeId) {
          await prisma.publication.create({
            data: {
              officeId,
              kind: "ANDAMENTO",
              source: "DATAJUD",
              // O Datajud normalmente já entrega descrição de movimento em texto simples, mas
              // passa pela mesma limpeza por segurança — converterHtmlParaTextoSimples não mexe
              // em texto que não tem tag nenhuma.
              content: converterHtmlParaTextoSimples(and.descricaoMovimento ?? and.codigoMovimento),
              publishedAt: parseDataOuFallback(and.dataMovimentacao, and.dataCaptura),
              emailMessageId,
              processNumberRaw: and.numeroProcesso,
              tribunalDetectado: tribunalDetectadoPara(and.numeroProcesso, and.tribunal),
              caseId,
            },
          });
          result.andamentosCriados++;
          contar(officeId, "andamentos");
          if (!caseId) result.semCasoVinculado++;
        } else {
          // Mesma regra da publicação acima: sem escritório identificado, fica na fila.
          result.naoRoteados++;
          continue;
        }
      }

      await prisma.roboAndamento.update({ where: { id: and.id }, data: { statusLido: true } });
    } catch (e) {
      const message = e instanceof Error ? e.message : "erro desconhecido";
      result.erros.push(`[andamento ${and.id}] ${message}`);
    }
  }

  // Um resumo só por tipo e por escritório (não uma notificação por publicação) — evita
  // inundar quem ativou notificações caso o robô traga muitas de uma vez num único ciclo.
  for (const [officeId, contagem] of porOffice) {
    if (contagem.publicacoes === 0 && contagem.andamentos === 0) continue;
    // É AQUI que o status do escritório importa — e só aqui. Escritório suspenso por
    // inadimplência tem a publicação GRAVADA normalmente no lugar certo (o dado é dele), mas não
    // recebe notificação enquanto não regularizar. Separar as duas coisas é o que evita o
    // vazamento que existia quando o status filtrava o roteamento (ver carregarIndicesDeRoteamento).
    const office = await prisma.office.findUnique({ where: { id: officeId }, select: { status: true } });
    if (office?.status !== "ATIVA") continue;
    const activeUserIds = (await prisma.user.findMany({ where: { active: true, officeId }, select: { id: true } })).map((u) => u.id);
    // Balde de hora — mesma limitação/motivo do outlookEmailSync.ts (contagem agregada, sem id
    // de item individual pra dedupeKey estável). Ver lib/notificationOutbox.ts.
    const balde = new Date().toISOString().slice(0, 13);
    if (contagem.publicacoes > 0) {
      for (const userId of activeUserIds) {
        enqueueNotification({
          userId,
          officeId,
          event: "PUBLICACAO_NOVA",
          title: "Novas publicações",
          body: `${contagem.publicacoes} nova(s) publicação(ões) recebida(s).`,
          url: "/m/publicacoes",
          vars: { teor: `${contagem.publicacoes} nova(s) publicação(ões) recebida(s).` },
          dedupeKey: `PUBLICACAO_NOVA:robo:${officeId}:${userId}:${balde}`,
        });
      }
    }
    if (contagem.andamentos > 0) {
      for (const userId of activeUserIds) {
        enqueueNotification({
          userId,
          officeId,
          event: "ANDAMENTO_PROCESSUAL",
          title: "Novos andamentos processuais",
          body: `${contagem.andamentos} novo(s) andamento(s) recebido(s).`,
          url: "/m/publicacoes",
          vars: { teor: `${contagem.andamentos} novo(s) andamento(s) recebido(s).` },
          dedupeKey: `ANDAMENTO_PROCESSUAL:robo:${officeId}:${userId}:${balde}`,
        });
      }
    }
  }

  // Log persistido por escritório (documento 04 — Conexões, model IntegrationRun): uma linha por
  // escritório ATIVO a cada ciclo, uma para DJEN e uma para DATAJUD, mesmo com itemCount 0 — é o
  // "0 novidade" que faz "última execução" no catálogo de /conexoes ficar sempre atualizado, não
  // só nos ciclos com alguma novidade. `porOffice` já separa publicacoes (DJEN) de andamentos
  // (DATAJUD) por escritório — ver `contar` acima. Erro de item (`result.erros`) não é atribuído a
  // um escritório específico aqui: cada erro já é por item (try/catch dentro dos dois laços
  // acima), então um erro isolado não derruba a contagem de sucesso dos outros itens do mesmo
  // escritório — o status por escritório aqui reflete só o que FOI roteado com sucesso pra ele.
  // Tudo dentro de try/catch: uma falha ao GRAVAR o log nunca pode derrubar uma sincronização que
  // já terminou e já tem o resultado pronto.
  try {
    const officesAtivos = await prisma.office.findMany({ where: { status: "ATIVA" }, select: { id: true } });
    if (officesAtivos.length > 0) {
      await prisma.integrationRun.createMany({
        data: officesAtivos.flatMap(({ id: officeId }) => {
          const contagem = porOffice.get(officeId);
          return [
            { officeId, integration: "DJEN", status: "OK" as const, itemCount: contagem?.publicacoes ?? 0 },
            { officeId, integration: "DATAJUD", status: "OK" as const, itemCount: contagem?.andamentos ?? 0 },
          ];
        }),
      });
    }
  } catch {
    // idem — log é acessório, não pode quebrar a sincronização.
  }

  return result;
}
