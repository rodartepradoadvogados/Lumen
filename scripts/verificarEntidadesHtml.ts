// Trava do decodificador de entidades HTML das publicações (lib/htmlEntities.ts). O primeiro caso
// é uma publicação REAL relatada pelo dono do escritório, com a corrupção do "&" virado espaço em
// "A&Ccedil; Atilde;O". Os demais protegem o que é fácil de quebrar ao mexer na tabela: não
// decodificar duas vezes ("&amp;lt;" tem que virar "&lt;", não "<"), não engolir nome
// desconhecido, e ser idempotente — porque a decodificação também roda na LEITURA, para consertar
// as publicações gravadas antes desta correção.
//
// Rodar com: npx tsx scripts/verificarEntidadesHtml.ts
import { decodificarEntidadesHtml } from "../lib/htmlEntities";

const casos: [string, string][] = [
  [
    "PROTOCOLO N&ordm;  5100729-50.2020.8.09.0024 A&Ccedil; Atilde;O: PROCESSO C&Iacute;VEL E DO TRABALHO -&gt; Processo de Conhecimento -&gt; Procedimento de Cumprimento de Senten&ccedil;a/Decis&atilde;o -&gt; Cumprimento de senten&ccedil;a ",
    "PROTOCOLO Nº  5100729-50.2020.8.09.0024 AÇÃO: PROCESSO CÍVEL E DO TRABALHO -> Processo de Conhecimento -> Procedimento de Cumprimento de Sentença/Decisão -> Cumprimento de sentença ",
  ],
  ["INTIMA&Ccedil;&Atilde;O", "INTIMAÇÃO"],
  ["Jo&atilde;o &amp; Maria", "João & Maria"],
  ["&#193;GUA &#xC1;GUA", "ÁGUA ÁGUA"],
  ["texto sem entidade nenhuma", "texto sem entidade nenhuma"],
  ["EXEQ&Uuml;ENTE 1&ordf; Vara", "EXEQÜENTE 1ª Vara"],
  // não pode decodificar duas vezes: "&amp;lt;" tem que virar "&lt;", não "<"
  ["&amp;lt;", "&lt;"],
  // nome desconhecido volta intacto
  ["&naoexiste; fim", "&naoexiste; fim"],
  // já decodificado permanece igual (a decodificação é idempotente na prática)
  ["AÇÃO: Sentença", "AÇÃO: Sentença"],
];

let falhas = 0;
for (const [entrada, esperado] of casos) {
  const veio = decodificarEntidadesHtml(entrada);
  if (veio !== esperado) {
    console.error("FALHOU");
    console.error("  entrada :", entrada);
    console.error("  esperado:", esperado);
    console.error("  veio    :", veio);
    falhas++;
  }
}
// idempotência sobre o caso real
const umaVez = decodificarEntidadesHtml(casos[0][0]);
if (decodificarEntidadesHtml(umaVez) !== umaVez) { console.error("FALHOU: não é idempotente"); falhas++; }

console.log(falhas === 0 ? `OK — ${casos.length} casos, incluindo o exemplo real e a idempotência.` : `${falhas} falha(s).`);
process.exit(falhas ? 1 : 0);
