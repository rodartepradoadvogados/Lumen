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
      .folha { background:#fff; color:#14161a; font-size:12px; line-height:1.5; }
      .folha table { border-collapse:collapse; width:100%; }
      .folha th { text-align:left; font-size:12px; text-transform:uppercase; letter-spacing:.08em; font-weight:650;
                  color:#3d4045; border-bottom:1px solid #a5b1bf; padding:0 6px 4px 0; }
      /* O filete da linha era #dfe3e8 — 1,29:1 contra o papel branco. Na tela, com retroiluminação,
         ele aparece; impresso a laser, some, e um Livro Caixa de duzentas linhas sai como um bloco
         de texto sem separação. #a5b1bf dá 2,18:1, que é o filete forte da casa, e é o mínimo que
         sobrevive à impressão. */
      .folha td { padding:4px 6px 4px 0; border-bottom:1px solid #cbd1da; vertical-align:top; overflow-wrap:anywhere; word-break:break-word; }
      .folha tr { break-inside: avoid; }
      /* O cabeçalho das colunas se REPETE em toda página. Sem isto, um Livro Caixa ou um
         Relatório Personalizado que passe de uma página perde "Data / Histórico / Valor" a partir
         da segunda folha, e quem recebe o PDF fica com colunas de números sem nome. É o defeito
         mais comum de folha impressa, e a correção é uma linha. */
      .folha thead { display: table-header-group; }
      .folha tfoot { display: table-footer-group; }
      .cab-timbre { border-bottom:2px solid #8a2f42; }
      @media screen { .folha { max-width:820px; margin:0 auto; padding:28px; box-shadow:0 8px 30px rgba(20,22,26,.16); } }
      @media print {
        .nao-imprimir { display:none !important; }
        html, body, main { height:auto !important; max-height:none !important; overflow:visible !important; }
        body { background:#fff !important; }
        /* O timbre é uma BORDA, não um fundo, então sobrevive ao "imprimir sem gráficos de fundo"
           que vem ligado por padrão. Esta linha garante o resto (cor do texto e dos filetes) mesmo
           quando o navegador tenta economizar tinta. */
        .folha { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
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
        {officeCnpj && <div style={{ fontSize: 9.5, color: "#3d4045" }}>CNPJ {officeCnpj}</div>}
      </div>
      <div style={{ textAlign: "right", fontSize: 9.5, color: "#3d4045" }}>
        {/* <h1>, não <div>: é o título da folha, e as quatro folhas imprimíveis não tinham
            nenhum título semântico — só texto grande. */}
        <h1 style={{ fontSize: 12, fontWeight: 700, color: "#14161a", margin: 0 }}>{titulo}</h1>
        <div>{subtitulo}</div>
        <div>
          emitido em {new Date().toLocaleDateString("pt-BR")} por {emitidoPor}
        </div>
      </div>
    </div>
  );
}
