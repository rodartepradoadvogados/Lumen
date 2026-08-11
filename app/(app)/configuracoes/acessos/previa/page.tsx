import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import {
  buildMaskedComparison,
  maskKindFor,
  formatMaskedValue,
  formatRealValue,
  PREVIEW_SAMPLE_SIZE,
  type PreviewRow,
} from "@/lib/supportPreview";
import { PageHeader, Card, CardHeader } from "@/components/ui";
import { EyeOff, Eye, ShieldCheck, Lock } from "lucide-react";

export const dynamic = "force-dynamic";

// ================================================================================================
// "Ver como o suporte vê este escritório" (Fase C, comprovação nº 1)
// ================================================================================================
//
// PONTO CRÍTICO DE HONESTIDADE: esta página NÃO reimplementa máscara nenhuma. Ela busca uma
// amostra REAL dos models mais sensíveis do próprio escritório (com o client `prisma` normal —
// que aqui devolve dado cru, porque quem está lendo é o admin do escritório-cliente no próprio
// navegador, sem o cookie `rp_acting_office` — ver lib/supportContext.ts) e delega a
// lib/supportPreview.ts, que chama `maskReadResult()` — a MESMA função de
// lib/supportMaskingApply.ts que a extensão do Prisma (lib/prisma.ts) chama em produção para
// qualquer sessão de suporte mascarada. Não existe um segundo caminho de mascaramento: se o mapa
// (SUPPORT_MASK_MAP) mudar amanhã, esta tela muda junto, sem precisar editar nada aqui. A prova
// disso é executável — ver scripts/testar-comprovacao.ts.
//
// O que esta página NÃO é: uma simulação em tempo real da experiência do suporte. Não há busca,
// não há filtro, não há a possibilidade de o suporte pesquisar pelo valor real e inferir pela
// resposta (ver aviso explícito abaixo) — é uma FOTO de como o dado sai da mesma função que
// mascara de verdade. A honestidade sobre essa diferença está no texto da própria tela.
//
// Quais campos aparecem: exatamente os campos que SUPPORT_MASK_MAP declara para cada model —
// lidos DO MAPA (Object.keys, dentro de buildMaskedComparison), não escolhidos à mão aqui. Isso
// significa que um campo novo adicionado ao mapa amanhã aparece nesta tela automaticamente, sem
// precisar tocar neste arquivo.

const FIELD_LABEL: Record<string, string> = {
  // Case
  title: "Título do processo",
  processNumber: "Número do processo",
  caseValue: "Valor da causa",
  convictionValue: "Valor da condenação",
  economicBenefitValue: "Proveito econômico",
  agreementValue: "Valor do acordo",
  description: "Descrição",
  decision: "Decisão",
  outcome: "Desfecho",
  folder: "Pasta",
  tags: "Etiquetas",
  sourceUrl: "Link de origem",
  opposingPartyName: "Parte adversa — nome",
  opposingPartyDocument: "Parte adversa — CPF/CNPJ",
  opposingPartyAddress: "Parte adversa — endereço",
  lastHistoryDesc: "Último andamento",
  // Client
  name: "Nome",
  document: "CPF/CNPJ",
  rg: "RG",
  email: "E-mail",
  phone: "Telefone",
  address: "Endereço",
  notes: "Observações",
  nationality: "Nacionalidade",
  maritalStatus: "Estado civil",
  profession: "Profissão",
  // Receivable
  amount: "Valor",
  paidAmount: "Valor pago",
  discount: "Desconto",
  surcharge: "Acréscimo",
  percentual: "Percentual",
  documentNumber: "Nº do documento",
  paymentReceiptNumber: "Nº do comprovante",
  installmentBoleto: "Boleto da parcela",
  payerName: "Pagador",
  // Publication
  content: "Teor da publicação",
  emailSubject: "Assunto do e-mail",
  emailAccount: "Conta de e-mail",
  processNumberRaw: "Número do processo (bruto)",
  lawyerTag: "Advogado identificado",
};

function ComparisonCard({
  title,
  subtitle,
  modelName,
  rows,
  recordNoun,
}: {
  title: string;
  subtitle: string;
  modelName: string;
  rows: PreviewRow[];
  recordNoun: string;
}) {
  const { fields, pairs } = buildMaskedComparison(modelName, rows);

  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      {pairs.length === 0 ? (
        <p className="px-5 py-6 text-sm text-tx-3">
          Seu escritório ainda não tem {recordNoun} cadastrado — nada para mostrar aqui ainda.
        </p>
      ) : (
        <div className="divide-y divide-regua">
          {pairs.map((pair, i) => (
            <div key={i} className="px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-tx-3 mb-2">
                {recordNoun} {i + 1}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-tx-3">
                      <th className="py-1 pr-4 font-semibold">Campo</th>
                      <th className="py-1 pr-4 font-semibold">O que você vê</th>
                      <th className="py-1 font-semibold">O que o suporte vê</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-regua">
                    {fields.map((field) => {
                      const kind = maskKindFor(modelName, field);
                      const realValue = formatRealValue(kind, pair.real[field]);
                      const maskedValue = formatMaskedValue(kind, pair.masked[field]);
                      return (
                        <tr key={field}>
                          <td className="py-1.5 pr-4 text-tx-2 whitespace-nowrap">
                            {FIELD_LABEL[field] ?? field}
                          </td>
                          <td className="py-1.5 pr-4 text-tx max-w-[260px] truncate" title={realValue}>
                            {realValue}
                          </td>
                          <td className="py-1.5 text-tx-2 font-mono text-xs max-w-[260px] truncate" title={maskedValue}>
                            {maskedValue}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default async function PreviaSuportePage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");
  // Só admin do escritório-cliente. Não usa canConfigureIntegrations (que também libera o
  // suporte mascarado) — de propósito: esta tela é PARA o escritório se convencer, não faz
  // sentido nenhum abrir pro próprio suporte.
  if (!viewer.isAdmin) redirect("/configuracoes/acessos");

  const officeId = viewer.officeId;

  // `prisma` aqui é o client normal (mascarado só sob o cookie de suporte — ver
  // lib/supportContext.ts). Nesta requisição não há esse cookie (é o admin do escritório no
  // próprio navegador), então o retorno é o dado REAL — exatamente o que já aparece nas telas do
  // sistema hoje. officeId sempre vem de viewer, nunca de entrada externa.
  const [cases, clients, receivables, publications] = await Promise.all([
    prisma.case.findMany({ where: { officeId }, orderBy: { createdAt: "desc" }, take: PREVIEW_SAMPLE_SIZE }),
    prisma.client.findMany({ where: { officeId }, orderBy: { createdAt: "desc" }, take: PREVIEW_SAMPLE_SIZE }),
    prisma.receivable.findMany({ where: { officeId }, orderBy: { createdAt: "desc" }, take: PREVIEW_SAMPLE_SIZE }),
    prisma.publication.findMany({ where: { officeId }, orderBy: { createdAt: "desc" }, take: PREVIEW_SAMPLE_SIZE }),
  ]);

  return (
    <div className="p-6 max-w-[1000px] mx-auto animate-fade-in space-y-6">
      <Link
        href="/configuracoes/acessos"
        className="text-xs font-semibold text-tx-3 hover:text-tx"
      >
        ← Acessos da Lúmen
      </Link>
      <PageHeader
        title="Como o suporte vê o seu escritório"
        subtitle="Uma amostra real dos seus próprios dados, passada pela mesma função que redige o que o suporte enxerga numa sessão normal (sem quebra-vidro)."
      />

      <Card>
        <div className="p-5 flex items-start gap-3">
          <ShieldCheck size={20} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-sm text-tx space-y-2">
            <p>
              Abaixo estão até {PREVIEW_SAMPLE_SIZE} registros recentes de cada uma das áreas mais sensíveis do seu escritório —
              Processos, Clientes, Contas a Receber e Publicações. Ao lado de cada campo protegido, mostramos o valor
              real (o mesmo que você já vê no sistema) e, em seguida, o valor exatamente como o suporte da Lúmen o
              recebe quando entra numa sessão comum.
            </p>
            <p className="text-xs text-tx-2">
              Esta comparação roda pela mesma função de mascaramento (<code>maskReadResult</code>) que a extensão do
              Prisma aplica de verdade em toda sessão de suporte — não é um exemplo fabricado nem uma cópia à parte. Se
              a Lúmen um dia mudar o que é mascarado, esta tela muda junto, automaticamente.
            </p>
          </div>
        </div>
      </Card>

      <ComparisonCard
        title="Processos"
        subtitle="Título, número do processo, valores, descrição e dados da parte adversa"
        modelName="Case"
        rows={cases}
        recordNoun="processo"
      />
      <ComparisonCard
        title="Clientes"
        subtitle="Nome, CPF/CNPJ, contato e observações"
        modelName="Client"
        rows={clients}
        recordNoun="cliente"
      />
      <ComparisonCard
        title="Contas a receber"
        subtitle="Descrição, valores e pagador"
        modelName="Receivable"
        rows={receivables}
        recordNoun="lançamento"
      />
      <ComparisonCard
        title="Publicações"
        subtitle="Teor da publicação e dados de identificação"
        modelName="Publication"
        rows={publications}
        recordNoun="publicação"
      />

      <Card>
        <CardHeader title="O que isso garante — e o que isso não garante" />
        <div className="p-5 space-y-4 text-sm text-tx">
          <div className="flex items-start gap-3">
            <EyeOff size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">O que o suporte nunca vê numa sessão comum</p>
              <ul className="list-disc pl-5 mt-1 space-y-0.5 text-tx-2">
                <li>Valores em dinheiro (honorários, valor da causa, contas a pagar/receber) — somem por completo, nunca aparecem nem parcialmente.</li>
                <li>Nomes, CPF/CNPJ, e-mail, telefone e endereço de clientes, partes e da parte adversa — aparecem redigidos, preservando só o formato (ex.: inicial do nome, últimos dígitos do documento, domínio do e-mail).</li>
                <li>Teor de processos, publicações, tarefas e anotações — vira um rótulo com o tamanho do texto, nunca o conteúdo.</li>
                <li>Anotações pessoais (o campo &quot;Anotação&quot; do sistema) nem chegam a esta tela: já são filtradas por autor antes de qualquer consulta, e ainda assim continuam mascaradas por reforço.</li>
                <li>Tokens e credenciais de integração (Drive, WhatsApp, BTG e afins) — nunca saem em claro, mesmo para diagnosticar problema de conexão.</li>
              </ul>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Eye size={18} className="text-tx-2 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">O que o suporte continua vendo normalmente</p>
              <ul className="list-disc pl-5 mt-1 space-y-0.5 text-tx-2">
                <li>Nome e e-mail da EQUIPE do seu escritório (quem está logado, cargo, permissões) — é o que permite diagnosticar &quot;fulano não consegue acessar&quot; sem abrir os dados dos seus clientes.</li>
                <li>Datas, status, contadores e categorias (ex.: &quot;processo ativo desde X&quot;, &quot;3 parcelas em aberto&quot;) — não identificam ninguém e são o principal eixo de diagnóstico.</li>
                <li>Estrutura do processo (tribunal, ano, segmento) sem o número completo, e a agência/banco sem o valor.</li>
              </ul>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Lock size={18} className="text-gold-600 dark:text-gold-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Onde o dado real aparece — e sob que controle</p>
              <ul className="list-disc pl-5 mt-1 space-y-0.5 text-tx-2">
                <li>
                  Só existe uma forma de o suporte ver o dado real de um registro específico: pedir, um sócio do seu
                  escritório aprovar aquele registro exato, e a leitura fica gravada no histórico como &quot;Viu dados
                  reais&quot; — sem exceção de emergência e sem autoaprovação.
                </li>
                <li>
                  A máscara age sobre o que sai na TELA, não sobre a busca: o suporte ainda pode filtrar ou pesquisar
                  usando um valor real que já saiba (ex.: um número de processo informado por telefone) e inferir algo
                  pela resposta do sistema. É uma limitação conhecida do desenho, não escondida aqui.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
