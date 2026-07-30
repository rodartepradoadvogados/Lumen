// Ponte entre o robô Python de captura (DJEN/Datajud, rodando no Railway, que grava
// diretamente nas tabelas "publicacoes"/"andamentos" do mesmo Postgres — espelhadas
// aqui como RoboPublicacao/RoboAndamento) e as tabelas principais do site
// (Publication/Case). Segue o mesmo padrão de lib/jusbrasilEmailSync.ts.

import { prisma } from "@/lib/prisma";
import { broadcastPushIfEnabled } from "@/lib/push";
import { normalizeProcessNumber } from "@/lib/processNumber";

export type RoboBridgeResult = {
  publicacoesCriadas: number;
  andamentosCriados: number;
  semCasoVinculado: number;
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
//   2ª tentativa: OAB do advogado bate com um usuário ativo de algum escritório.
//   fallback final: escritório interno (Rodarte Prado) — nunca perde o dado, só assume o
//   dono da plataforma quando não há nenhum sinal de a qual escritório-cliente pertence.
type RoteamentoIndices = {
  casoPorProcesso: Map<string, { caseId: string; officeId: string }>;
  officePorOab: Map<string, string>;
  officeFallbackId: string | null;
  // Números que o escritório optou por deixar de acompanhar (botão "Bloquear" em
  // LinkPublicationMenu.tsx) — normalizado por normalizeProcessNumber (mais permissivo que o
  // normalizarNumeroProcesso deste arquivo, que só aceita CNJ completo de 20 dígitos), pra casar
  // com QUALQUER número exibido na tela, não só o formato CNJ estrito.
  bloqueadosPorOffice: Map<string, Set<string>>;
};

async function carregarIndicesDeRoteamento(): Promise<RoteamentoIndices> {
  const [casos, usuarios, officeInterno, officeMaisAntigo, bloqueios] = await Promise.all([
    prisma.case.findMany({ where: { processNumber: { not: null }, office: { status: "ATIVA" } }, select: { id: true, officeId: true, processNumber: true } }),
    prisma.user.findMany({ where: { active: true, oab: { not: null }, office: { status: "ATIVA" } }, select: { oab: true, officeId: true } }),
    prisma.office.findFirst({ where: { isInternal: true }, select: { id: true } }),
    prisma.office.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } }),
    prisma.blockedProcessNumber.findMany({ select: { officeId: true, processNumber: true } }),
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

  const bloqueadosPorOffice = new Map<string, Set<string>>();
  for (const b of bloqueios) {
    if (!bloqueadosPorOffice.has(b.officeId)) bloqueadosPorOffice.set(b.officeId, new Set());
    bloqueadosPorOffice.get(b.officeId)!.add(b.processNumber);
  }

  return { casoPorProcesso, officePorOab, officeFallbackId: officeInterno?.id ?? officeMaisAntigo?.id ?? null, bloqueadosPorOffice };
}

// true só quando o item NÃO bateu com nenhum Case (caseId nulo) e o número está na lista de
// bloqueados do escritório resolvido — um processo que passa a ser cadastrado depois do bloqueio
// volta a ser acompanhado normalmente, o bloqueio nunca sobrepõe um vínculo real.
function estaBloqueado(indices: RoteamentoIndices, officeId: string, caseId: string | null, numeroProcessoRaw: string | null | undefined): boolean {
  if (caseId) return false;
  const generico = numeroProcessoRaw ? normalizeProcessNumber(numeroProcessoRaw) : null;
  if (!generico) return false;
  return indices.bloqueadosPorOffice.get(officeId)?.has(generico) ?? false;
}

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
  return { caseId: null, officeId: indices.officeFallbackId };
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
    processosMonitoradosCriados: 0,
    erros: [],
  };

  const indices = await carregarIndicesDeRoteamento();
  if (!indices.officeFallbackId) {
    result.erros.push("Nenhum escritório cadastrado.");
    return result;
  }

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

  const publicacoesPendentes = await prisma.roboPublicacao.findMany({ where: { statusLido: false } });
  for (const pub of publicacoesPendentes) {
    try {
      const emailMessageId = `djen-${pub.idComunicacao}`;
      const jaExiste = await prisma.publication.findUnique({ where: { emailMessageId } });

      if (!jaExiste) {
        const numeroNormalizado = normalizarNumeroProcesso(pub.numeroProcesso);
        const oabNumero = pub.oab ? pub.oab.replace(/\D/g, "") : null;
        const { caseId, officeId } = resolverOffice(indices, numeroNormalizado, oabNumero || null, pub.uf || null);
        const lawyerTag = detectLawyerTagFromOab(pub.oab, pub.nomeAdvogado);

        if (officeId && !estaBloqueado(indices, officeId, caseId, pub.numeroProcesso)) {
          await prisma.publication.create({
            data: {
              officeId,
              kind: "PUBLICACAO",
              source: "DJEN",
              content: pub.teor ?? pub.tipoComunicacao ?? "(sem teor)",
              publishedAt: parseDataOuFallback(pub.dataDisponibilizacao, pub.dataCaptura),
              emailMessageId,
              processNumberRaw: pub.numeroProcesso,
              caseId,
              lawyerTag,
            },
          });
          result.publicacoesCriadas++;
          contar(officeId, "publicacoes");
          if (!caseId) result.semCasoVinculado++;
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

  const andamentosPendentes = await prisma.roboAndamento.findMany({ where: { statusLido: false } });
  for (const and of andamentosPendentes) {
    try {
      const emailMessageId = `datajud-${and.numeroProcesso}-${and.dataMovimentacao}-${and.codigoMovimento}`;
      const jaExiste = await prisma.publication.findUnique({ where: { emailMessageId } });

      if (!jaExiste) {
        const numeroNormalizado = normalizarNumeroProcesso(and.numeroProcesso);
        const { caseId, officeId } = resolverOffice(indices, numeroNormalizado, null, null);

        if (officeId && !estaBloqueado(indices, officeId, caseId, and.numeroProcesso)) {
          await prisma.publication.create({
            data: {
              officeId,
              kind: "ANDAMENTO",
              source: "DATAJUD",
              content: and.descricaoMovimento ?? and.codigoMovimento,
              publishedAt: parseDataOuFallback(and.dataMovimentacao, and.dataCaptura),
              emailMessageId,
              processNumberRaw: and.numeroProcesso,
              caseId,
            },
          });
          result.andamentosCriados++;
          contar(officeId, "andamentos");
          if (!caseId) result.semCasoVinculado++;
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
    const activeUserIds = (await prisma.user.findMany({ where: { active: true, officeId }, select: { id: true } })).map((u) => u.id);
    if (contagem.publicacoes > 0) {
      broadcastPushIfEnabled(activeUserIds, officeId, "publicacoes", {
        title: "Novas publicações",
        body: `${contagem.publicacoes} nova(s) publicação(ões) recebida(s).`,
        url: "/m/publicacoes",
      }).catch(() => {});
    }
    if (contagem.andamentos > 0) {
      broadcastPushIfEnabled(activeUserIds, officeId, "andamentos", {
        title: "Novos andamentos processuais",
        body: `${contagem.andamentos} novo(s) andamento(s) recebido(s).`,
        url: "/m/publicacoes",
      }).catch(() => {});
    }
  }

  return result;
}
