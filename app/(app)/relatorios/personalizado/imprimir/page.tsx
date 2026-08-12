import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { gerarRelatorio } from "@/lib/actions/relatorioPersonalizado";
import {
  BASE_DATA_OPCOES,
  CRITERIO_AUTORIA_OPCOES,
  filtrosPadrao,
  type RelatorioFiltros,
} from "@/lib/relatorioPersonalizado";
import ImprimirAoAbrir from "@/components/relatorios/ImprimirAoAbrir";

export const dynamic = "force-dynamic";

// Folha imprimível do Relatório Personalizado — o caminho RÁPIDO ("Imprimir / PDF"). Não existe
// biblioteca de PDF no projeto (e uma serverless da Vercel é um lugar ruim pra renderizar PDF
// pesado): esta rota é uma página A4 com folha de estilo de impressão, e o PDF é o próprio
// "Salvar como PDF" do navegador.
//
// O formato oficial de entrega é o Word (botão "Baixar em Word", ver
// app/api/relatorios/personalizado/word/route.ts) — é ele que sai dentro do papel timbrado e é o
// que se anexa a e-mail e a processo.
//
// MULTI-TENANT: o cabeçalho é SEMPRE do escritório de quem está imprimindo (Office.name,
// Office.cnpj) — nunca do Rodarte Prado.
//
// O papel timbrado cadastrado em Configurações (Office.timbradoUrl) NÃO entra aqui: ele é um
// arquivo .docx/.pdf, que não tem como ser embutido numa página HTML. Quem sai dentro do papel
// timbrado de verdade é o relatório em Word (ver lib/relatorioDocx.ts) — esta folha é o caminho
// rápido de impressão, com a identificação textual do escritório.
function decodificar(f?: string): RelatorioFiltros {
  if (!f) return filtrosPadrao();
  try {
    return JSON.parse(decodeURIComponent(Buffer.from(f, "base64").toString("utf8"))) as RelatorioFiltros;
  } catch {
    return filtrosPadrao();
  }
}

function dataBR(iso: string) {
  return new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("pt-BR");
}

export default async function ImprimirRelatorioPage({ searchParams }: { searchParams: { f?: string } }) {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");

  const filtros = decodificar(searchParams.f);
  const [office, r] = await Promise.all([
    prisma.office.findUnique({
      where: { id: viewer.officeId },
      select: { name: true, cnpj: true },
    }),
    gerarRelatorio(filtros),
  ]);

  const resultado = r.resultado;
  const baseLabel = BASE_DATA_OPCOES.find((o) => o.value === filtros.baseData)?.label ?? "";
  const criterioLabel = CRITERIO_AUTORIA_OPCOES.find((o) => o.value === filtros.criterioAutoria)?.label ?? "";

  return (
    <>
      <ImprimirAoAbrir />
      {/* Folha própria: fundo branco e texto preto fixos, independentes do tema Manhã/Noite —
          impressão em tema Noite sairia com fundo escuro consumindo tinta e ilegível no papel. */}
      <style>{`
        @page { size: A4; margin: 16mm 14mm 18mm; }
        .folha { background:#fff; color:#16191d; font-size:11px; line-height:1.5; }
        .folha a { color:#17325c; text-decoration:none; }
        .folha table { border-collapse:collapse; width:100%; }
        .folha th { text-align:left; font-size:8.5px; text-transform:uppercase; letter-spacing:.08em;
                    color:#5b646e; border-bottom:1px solid #c9cdd3; padding:0 6px 4px 0; }
        .folha td { padding:4px 6px 4px 0; border-bottom:1px solid #e5e7ea; vertical-align:top; }
        .folha tr { break-inside: avoid; }
        .cab-timbre { border-bottom:2px solid #c9962f; }
        @media print { .nao-imprimir { display:none !important; } }
        @media screen { .folha { max-width:820px; margin:0 auto; padding:28px; box-shadow:0 8px 30px rgba(0,0,0,.12); } }
        /* A rota é aberta com ?embed=1, então a casca do app não é montada (ver
           components/AppShell.tsx) — mas o <main> do modo embutido é h-screen com rolagem
           própria, o que faria a impressão cortar tudo na primeira página. Estes resets
           devolvem a altura natural ao papel. */
        @media print {
          html, body, main { height:auto !important; max-height:none !important; overflow:visible !important; }
          body { background:#fff !important; }
        }
      `}</style>

      <div className="folha">
        {/* ---------- TIMBRADO DO ESCRITÓRIO ---------- */}
        <div className="cab-timbre" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, paddingBottom: 10, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-.01em" }}>{office?.name ?? "—"}</div>
            {office?.cnpj && <div style={{ fontSize: 9.5, color: "#5b646e" }}>CNPJ {office.cnpj}</div>}
          </div>
          <div style={{ textAlign: "right", fontSize: 9.5, color: "#5b646e" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#16191d" }}>Relatório de produção</div>
            <div>
              {dataBR(filtros.de)} a {dataBR(filtros.ate)}
            </div>
            <div>emitido em {new Date().toLocaleDateString("pt-BR")} por {viewer.name}</div>
          </div>
        </div>

        {!resultado ? (
          <p>{r.error ?? "Não foi possível gerar o relatório."}</p>
        ) : (
          <>
            <p style={{ fontSize: 9.5, color: "#5b646e", marginBottom: 14 }}>
              Considerando a data de <strong>{baseLabel}</strong> · trabalho creditado a{" "}
              <strong>{criterioLabel.toLowerCase()}</strong>
              {resultado.semVinculoAssessoria > 0 && (
                <> · {resultado.semVinculoAssessoria} item(ns) sem assessoria vinculada não entram no corte por empresa</>
              )}
            </p>

            {/* ---------- TOTAIS ---------- */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
              {resultado.blocos.map((b) => (
                <div key={b.chave} style={{ borderLeft: "3px solid #17325c", padding: "4px 12px", minWidth: 120 }}>
                  <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.1 }}>{b.valor}</div>
                  <div style={{ fontSize: 9.5, color: "#5b646e" }}>{b.rotulo}</div>
                  <div style={{ fontSize: 8.5, color: "#8b939c" }}>período anterior: {b.anterior}</div>
                </div>
              ))}
            </div>

            {/* ---------- POR PESSOA / POR ASSESSORIA ---------- */}
            <div style={{ display: "flex", gap: 24, marginBottom: 18, breakInside: "avoid" }}>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", color: "#5b646e", marginBottom: 6 }}>Por pessoa</h2>
                <table>
                  <tbody>
                    {resultado.porPessoa.map((l) => (
                      <tr key={l.chave}>
                        <td>{l.rotulo}</td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          {l.pecas} peça(s) · {l.compromissos} compr.
                        </td>
                      </tr>
                    ))}
                    {resultado.porPessoa.length === 0 && (
                      <tr>
                        <td colSpan={2} style={{ color: "#8b939c" }}>Sem itens no período.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", color: "#5b646e", marginBottom: 6 }}>Por assessoria</h2>
                <table>
                  <tbody>
                    {resultado.porAssessoria.map((l) => (
                      <tr key={l.chave}>
                        <td>{l.rotulo}</td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          {l.pecas} peça(s) · {l.compromissos} compr.
                        </td>
                      </tr>
                    ))}
                    {resultado.porAssessoria.length === 0 && (
                      <tr>
                        <td colSpan={2} style={{ color: "#8b939c" }}>Nenhum item vinculado a assessoria.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ---------- DETALHAMENTO ---------- */}
            <h2 style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", color: "#5b646e", marginBottom: 6 }}>
              Detalhamento — {resultado.detalhes.length} de {resultado.detalhesTotal}
            </h2>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Tipo</th>
                  <th>Vínculo</th>
                  <th>Anexou / concluiu</th>
                  <th>Responsável</th>
                  <th style={{ textAlign: "right" }}>Data</th>
                </tr>
              </thead>
              <tbody>
                {resultado.detalhes.map((d) => (
                  <tr key={d.id}>
                    <td style={{ maxWidth: 220 }}>
                      {/* Mesmo no papel o link é útil: o PDF costuma ser enviado por e-mail, e o
                          destinatário clica direto no documento. */}
                      {d.driveUrl ? <a href={d.driveUrl}>{d.nome}</a> : d.nome}
                    </td>
                    <td>{d.tipoLabel}</td>
                    <td>{[d.assessoriaNome, d.origemLabel].filter(Boolean).join(" · ")}</td>
                    <td>{d.anexadoPor ?? "—"}</td>
                    <td>{d.responsavel ?? "—"}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{dataBR(d.data)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

      </div>
    </>
  );
}
