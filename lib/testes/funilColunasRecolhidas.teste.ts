import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe } from "./executar";
import { stageOptions } from "@/lib/funil";
import { CHAVE_DAS_COLUNAS, alternarColuna, definirTodas, lerColunasAbertas, todasAbertas } from "@/lib/colunasDoFunil";

// ============================================================================
// AS COLUNAS DO FUNIL COMEÇAM RECOLHIDAS (29/09/2026) — regra pura + travas de código nas três telas.
// ============================================================================

const le = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const TODAS = ["NOVO", "AGUARDANDO", "QUALIFICACAO", "PROPOSTA", "FECHADO", "PERDIDO"];

teste("as seis colunas do funil são as do pedido, e o padrão de quem nunca escolheu é TUDO recolhido", () => {
  igual(stageOptions, TODAS);
  igual(lerColunasAbertas(null, TODAS), {});
  igual(lerColunasAbertas(undefined, TODAS), {});
  igual(lerColunasAbertas("", TODAS), {});
});

teste("lixo gravado nunca abre coluna: JSON quebrado, outro tipo, coluna que não existe, valor que não é true", () => {
  igual(lerColunasAbertas("{quebrado", TODAS), {});
  igual(lerColunasAbertas("[1,2]", TODAS), {});
  igual(lerColunasAbertas("null", TODAS), {});
  igual(lerColunasAbertas('"NOVO"', TODAS), {});
  igual(lerColunasAbertas('{"NOVO":"true","PROPOSTA":1,"XPTO":true}', TODAS), {});
  igual(lerColunasAbertas('{"NOVO":true,"XPTO":true,"PROPOSTA":true}', TODAS), { NOVO: true, PROPOSTA: true });
});

teste("recolher e expandir por coluna, e 'Expandir todas / Recolher todas'", () => {
  let a = lerColunasAbertas(null, TODAS);
  a = alternarColuna(a, "PROPOSTA");
  igual(a, { PROPOSTA: true });
  a = alternarColuna(a, "NOVO");
  igual(a, { PROPOSTA: true, NOVO: true });
  a = alternarColuna(a, "PROPOSTA");
  igual(a, { NOVO: true });
  verdade(!todasAbertas(a, TODAS), "uma só aberta não é 'todas'");
  a = definirTodas(TODAS, true);
  verdade(todasAbertas(a, TODAS), "Expandir todas abre as seis");
  igual(Object.keys(a).length, 6);
  a = definirTodas(TODAS, false);
  igual(a, {});
  verdade(!todasAbertas({}, []), "sem colunas não há 'todas abertas'");
});

teste("o que é gravado volta igual (ida e volta pelo JSON)", () => {
  const gravado = JSON.stringify(alternarColuna(alternarColuna({}, "FECHADO"), "NOVO"));
  igual(lerColunasAbertas(gravado, TODAS), { NOVO: true, FECHADO: true });
  verdade(CHAVE_DAS_COLUNAS("central") !== CHAVE_DAS_COLUNAS("app"), "cada tela tem a sua chave");
});

teste("o componente: armazenamento em try/catch, aria-expanded, alvo de 44 px, primeiro desenho recolhido", () => {
  const c = codigoDe(le("components/atendimento/ColunasRecolhiveis.tsx"));
  verdade(c.includes("aria-expanded={aberta}") && c.includes("aria-controls={idDoCorpo}"), "botão de acordeão");
  verdade((c.match(/min-h-11/g) ?? []).length >= 2, "cabeçalho da coluna e 'todas' com 44 px");
  verdade(/try \{[^}]*localStorage\.getItem[\s\S]*?\} catch/.test(c) && /try \{[^}]*localStorage\.setItem[\s\S]*?\} catch/.test(c), "leitura e escrita em try/catch");
  verdade(c.includes("useState<ColunasAbertas>({})"), "o primeiro desenho é tudo recolhido (sem divergência de hidratação)");
  verdade(c.includes("Expandir todas") && c.includes("Recolher todas"), "os dois textos do botão");
  verdade(c.includes("hidden={!aberta}"), "o corpo recolhido some");
});

teste("as três telas do funil usam as colunas recolhíveis (nenhuma volta a abrir tudo)", () => {
  for (const f of ["app/(app)/atendimento/funil/page.tsx", "app/atendimento-app/(shell)/funil/page.tsx"]) {
    const c = codigoDe(le(f));
    verdade(c.includes("<ColunasRecolhiveis") && c.includes("<ColunaRecolhivel"), `${f}: usa as colunas recolhíveis`);
    verdade(!c.includes('<h3 className="font-semibold text-sm text-tx">'), `${f}: cabeçalho fixo antigo`);
  }
  verdade(codigoDe(le("app/(app)/atendimento/funil/page.tsx")).includes("stageOptions as STAGES"), "a página do site tem as SEIS colunas (Aguardando incluída)");
  const q = codigoDe(le("components/atendimento/QuadroDoFunil.tsx"));
  verdade(q.includes('useColunasRecolhidas("central", stageOptions)'), "o quadro da Central");
  verdade(q.includes("<BotaoDeTodas") && q.includes("<TituloDaColuna"), "botão de todas e título com botão");
});

teste("ARRASTAR: coluna recolhida ainda aceita soltar (ouvintes na coluna inteira, não no corpo que some)", () => {
  const q = codigoDe(le("components/atendimento/QuadroDoFunil.tsx"));
  const iColuna = q.indexOf("onDragOver={(e) =>");
  const iCorpo = q.indexOf("hidden={!aberta}");
  verdade(iColuna > 0 && iCorpo > iColuna, "onDragOver vem no invólucro da coluna, antes do corpo escondível");
  const invólucro = q.slice(iColuna, iCorpo);
  verdade(invólucro.includes("onDrop={(e) => soltar(e, stage)}") && invólucro.includes("onDragLeave"), "onDrop no invólucro");
  const corpo = q.slice(iCorpo, iCorpo + 200);
  verdade(!/onDrop|onDragOver/.test(corpo), "o corpo escondível não carrega ouvinte de soltar");
  verdade(q.includes('"Solte aqui"'), "coluna recolhida diz 'Solte aqui' enquanto o card paira");
  verdade(q.includes("if (!aceitaSoltar) setErro(RECUSA_DE_PERDIDO)"), "Perdido continua recusando o gesto com o motivo");
});

resumo("Funil — colunas recolhidas");
