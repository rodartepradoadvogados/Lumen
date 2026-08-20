// Casca compartilhada das folhas imprimíveis do Financeiro (DRE, Fluxo de Caixa, Livro Caixa) —
// mesmo padrão de app/(app)/relatorios/personalizado/imprimir/page.tsx: fundo branco/texto preto
// FIXOS, independentes do tema Manhã/Noite (impressão em tema Noite gastaria tinta e ficaria
// ilegível no papel), sem CSS custom property — hex literal aqui é exceção deliberada e
// documentada, não sobra da varredura de tokens. Extraído pra cá porque três telas passaram a
// precisar do mesmo estilo/cabeçalho — antes só existia a de Relatório Personalizado.
export function FolhaImprimivelStyle() {
  return (
    <style>{`
      @page { size: A4; margin: 16mm 14mm 18mm; }
      .folha { background:#fff; color:#16191d; font-size:11px; line-height:1.5; }
      .folha table { border-collapse:collapse; width:100%; }
      .folha th { text-align:left; font-size:8.5px; text-transform:uppercase; letter-spacing:.08em;
                  color:#5b646e; border-bottom:1px solid #c9cdd3; padding:0 6px 4px 0; }
      .folha td { padding:4px 6px 4px 0; border-bottom:1px solid #e5e7ea; vertical-align:top; overflow-wrap:anywhere; word-break:break-word; }
      .folha tr { break-inside: avoid; }
      .cab-timbre { border-bottom:2px solid #c9962f; }
      @media print { .nao-imprimir { display:none !important; } }
      @media screen { .folha { max-width:820px; margin:0 auto; padding:28px; box-shadow:0 8px 30px rgba(0,0,0,.12); } }
      @media print {
        html, body, main { height:auto !important; max-height:none !important; overflow:visible !important; }
        body { background:#fff !important; }
      }
    `}</style>
  );
}

export function FolhaCabecalho({
  officeName,
  officeCnpj,
  titulo,
  subtitulo,
  emitidoPor,
}: {
  officeName: string | null | undefined;
  officeCnpj?: string | null;
  titulo: string;
  subtitulo: string;
  emitidoPor: string;
}) {
  return (
    <div className="cab-timbre" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, paddingBottom: 10, marginBottom: 16 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-.01em" }}>{officeName ?? "—"}</div>
        {officeCnpj && <div style={{ fontSize: 9.5, color: "#5b646e" }}>CNPJ {officeCnpj}</div>}
      </div>
      <div style={{ textAlign: "right", fontSize: 9.5, color: "#5b646e" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#16191d" }}>{titulo}</div>
        <div>{subtitulo}</div>
        <div>
          emitido em {new Date().toLocaleDateString("pt-BR")} por {emitidoPor}
        </div>
      </div>
    </div>
  );
}
