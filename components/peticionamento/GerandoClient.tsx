"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { acompanharGeracaoDaMinuta } from "@/lib/actions/peticionamento";
import { fraseDoTempoDeGeracao, type FaixaDeGeracao } from "@/lib/peticionamentoTempoDeGeracao";
import { useSaidaDoPeticionamento } from "@/components/peticionamento/SaidaContext";

// ============================================================================================
// A TELA DE "O AGENTE ESTÁ REDIGINDO".
//
// O QUE ELA PRECISA DIZER, e por quê. Antes desta entrega a geração acontecia dentro da própria
// requisição: o advogado clicava, o botão dizia "Gerando…" e ou a peça aparecia, ou (aos 230s)
// aparecia um erro. Agora a geração corre no servidor, fora do pedido web — e isso só é uma
// melhora se a tela contar a verdade sobre o que está acontecendo:
//
//   · que está EM ANDAMENTO (uma tela parada, sem sinal de vida, é indistinguível de uma tela
//     quebrada — e depois de quatro minutos olhando para ela, é isso que a pessoa conclui);
//   · que ele PODE FECHAR A ABA sem perder o trabalho. Esta frase só está aqui porque é VERDADE
//     no código: a rede de segurança por cron (app/api/cron/minutas-pendentes) colhe a geração de
//     quem fechou a aba. Sem aquele cron, esta frase seria mentira e não poderia ser escrita.
//
// E O QUE ELA NUNCA MOSTRA: PORCENTAGEM. O sistema não sabe quanto falta — não existe sinal
// nenhum vindo do agente sobre progresso. Uma barra que anda sozinha é um número inventado, e
// número inventado é a coisa que esta casa mais evita. O único número na tela é o tempo decorrido,
// que é um fato medido.
//
// ── O AVISO DE ABERTURA (pedido do dono, 23/09/2026) ──────────────────────────────────────────
//
// O pedido, textual: "um pop up dizendo algo como: não é necessário esperar a minuta ficar pronta.
// O tempo médio de produção é de x a 15 minutos. Apenas não feche esta janela. Ao final, a
// notificação de conclusão aparecerá na central de alertas."
//
// DUAS COISAS DO TEXTO PEDIDO NÃO PODIAM IR PARA A TELA COMO ESTAVAM:
//
//   1. "APENAS NÃO FECHE ESTA JANELA" É FALSO NESTE SISTEMA, e falso na direção mais cara: seria
//      uma restrição que o código NÃO impõe. A rede de segurança por cron
//      (app/api/cron/minutas-pendentes) foi construída exatamente para que a aba possa ser
//      fechada, e há teste guardando essa promessa. Escrever "não feche" prenderia o advogado
//      quinze minutos numa tela por nada — o oposto do que esta entrega inteira faz. A tela diz o
//      que é verdade: pode fechar, o trabalho continua, o aviso chega na Central de Alertas.
//   2. O "x" DE "de x a 15 minutos" NINGUÉM MEDIU. Inventar um piso aqui seria a mesma coisa que
//      a porcentagem que esta tela recusa, só com outra roupa. Por isso o piso vem MEDIDO do
//      banco (lib/peticionamentoTempoDeGeracao.ts) e, enquanto o escritório não tiver medições
//      suficientes, a frase fala só do teto e NÃO inventa piso nenhum.
//
// FAIXA FIXA, E NÃO MODAL — e a decisão vem do próprio conteúdo da mensagem. Um modal tem de ser
// dispensado para a pessoa seguir, e o que esta mensagem diz é justamente "você não precisa ficar
// aqui": um diálogo que prende o foco e cobra um clique antes de deixar sair contradiz o próprio
// texto. Mais três razões:
//
//   · a mensagem precisa estar legível NO MINUTO 10, para quem voltou à aba — um modal dispensado
//     no segundo 3 não está mais lá, e a informação de quando a peça chega é justamente a que a
//     pessoa procura ao voltar;
//   · quem fecha a aba imediatamente (o comportamento que a tela RECOMENDA) nunca leria um modal;
//   · esta casa já usa modal para o que exige RESPOSTA (o pop-up de saída, SaidaContext.tsx). Isto
//     é informação, não decisão. Usar a mesma forma para as duas coisas ensina a pessoa a fechar
//     sem ler.
// ============================================================================================

/**
 * De quanto em quanto tempo a tela pergunta.
 *
 * Cinco segundos: rápido o bastante para a minuta aparecer quase no instante em que fica pronta.
 *
 * COM O TETO EM QUINZE MINUTOS a conta mudou, e ela continua cabendo: uma geração que vá até o fim
 * custa cerca de cento e oitenta perguntas. Cada uma é uma pergunta CURTA — uma leitura da sessão e
 * uma consulta de estado à ponte (um dicionário em memória), nunca uma chamada ao modelo. Espaçar
 * mais economizaria requisições baratas e pagaria com o que importa: o tempo entre a peça ficar
 * pronta e ela aparecer na tela de quem está esperando.
 */
const INTERVALO_MS = 5_000;

/** O relógio da tela anda de segundo em segundo; quem pergunta ao servidor é o de cima. */
const TIQUE_MS = 1_000;

function tempoDecorrido(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const minutos = Math.floor(s / 60);
  const segundos = s % 60;
  if (minutos === 0) return `${segundos}s`;
  return `${minutos}min ${String(segundos).padStart(2, "0")}s`;
}

export function GerandoClient({
  sessaoId,
  desdeMsInicial,
  faixa,
}: {
  sessaoId: string;
  desdeMsInicial: number;
  /** A faixa MEDIDA deste escritório, calculada no servidor (lib/peticionamentoTempoDeGeracao.ts). */
  faixa: FaixaDeGeracao;
}) {
  const router = useRouter();
  // A TELA DIZ "pode fechar esta aba" — então esta tela DESLIGA a pergunta do navegador ao fechar.
  //
  // Sem isto o advogado leria a promessa e, ao fechar, receberia o diálogo nativo "as alterações
  // podem não ser salvas" — uma frase FALSA (está tudo gravado, e a geração continua no servidor)
  // vinda do nosso próprio código, um segundo depois de a tela ter prometido o contrário. Era o
  // caso exato de "restrição que o código impõe e a tela nega": o gatilho do pop-up de saída
  // (SaidaContext.tsx) não sabia distinguir "há texto não salvo" de "há trabalho correndo no
  // servidor". Agora sabe, e só nesta tela.
  const { declararFechamentoSeguro } = useSaidaDoPeticionamento();
  const [desdeMs, setDesdeMs] = useState(desdeMsInicial);
  const [falha, setFalha] = useState<string | null>(null);
  // `useRef` e não estado: o laço de perguntas não pode ser reiniciado por uma re-renderização do
  // relógio (que acontece a cada segundo) — seria uma pergunta por segundo em vez de uma a cada
  // cinco.
  const encerrado = useRef(false);
  // Uma pergunta por vez. Sem isto, uma resposta lenta (a colheita grava a minuta e sincroniza as
  // citações — não é sempre instantânea) deixaria as perguntas se empilharem de cinco em cinco
  // segundos, todas disputando a mesma sessão.
  const emVoo = useRef(false);

  const perguntar = useCallback(async () => {
    if (emVoo.current) return;
    emVoo.current = true;
    try {
      const andamento = await acompanharGeracaoDaMinuta(sessaoId);
      if (encerrado.current) return;
      if (andamento.estado === "pronta") {
        encerrado.current = true;
        // A PÁGINA INTEIRA É RECARREGADA, e não um estado local trocado: a partir daqui o
        // advogado segue o caminho de sempre da tela de minuta — nota obrigatória, riscos,
        // validação de citações, exportação. Nada disso é reimplementado aqui.
        router.refresh();
        return;
      }
      if (andamento.estado === "falhou") {
        encerrado.current = true;
        setFalha(andamento.motivo);
        return;
      }
      if (andamento.estado === "semGeracao") {
        encerrado.current = true;
        router.refresh();
        return;
      }
      setDesdeMs(andamento.desdeMs);
    } catch {
      // Uma pergunta que se perdeu (rede, sessão expirando, servidor reiniciando) NÃO vira erro na
      // tela: a próxima pergunta acontece daqui a cinco segundos, e o trabalho do outro lado não
      // parou por causa disto. Quem fecha este caminho é o prazo máximo da geração, do lado do
      // servidor — nunca uma espera sem fim.
    } finally {
      emVoo.current = false;
    }
  }, [sessaoId, router]);

  // Enquanto ESTA tela estiver montada, fechar a aba é seguro e o navegador não pergunta nada. Ao
  // desmontar (a minuta ficou pronta, ou a geração falhou), a trava de saída volta ao normal: aí
  // existe texto na tela que o advogado pode ter editado, e a pergunta volta a fazer sentido.
  useEffect(() => {
    declararFechamentoSeguro(true);
    return () => declararFechamentoSeguro(false);
  }, [declararFechamentoSeguro]);

  useEffect(() => {
    encerrado.current = false;
    const relogio = setInterval(() => setDesdeMs((atual) => atual + TIQUE_MS), TIQUE_MS);
    const laco = setInterval(() => {
      if (!encerrado.current) void perguntar();
    }, INTERVALO_MS);
    return () => {
      encerrado.current = true;
      clearInterval(relogio);
      clearInterval(laco);
    };
  }, [perguntar]);

  if (falha) {
    return (
      <div className="callout callout-danger">
        <h2>Não foi possível gerar a minuta</h2>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{falha}</p>
        <a className="btn btn-primary" style={{ marginTop: 14, width: "fit-content" }} href={`/peticionamento/${sessaoId}/confirmar`}>
          Tentar novamente
        </a>
      </div>
    );
  }

  return (
    <div className="gerando">
      {/* `role="status"` no CABEÇALHO, que não muda — e NÃO no relógio, que muda a cada segundo.
          Um contador com `aria-live` faria o leitor de tela anunciar o tempo sessenta vezes por
          minuto, o que é pior do que não anunciar nada. O pulso é `aria-hidden`: ele é sinal
          visual de vida, e não tem o que ser lido. */}
      <div className="gerando-cabeca" role="status">
        <span className="gerando-pulso" aria-hidden="true" />
        <h2>O agente está redigindo a minuta</h2>
      </div>
      <p className="gerando-linha">
        Ele lê os documentos desta sessão por inteiro antes de escrever, e uma peça a partir de um processo longo leva alguns
        minutos. <strong>Não há como saber quanto falta</strong> — o tempo abaixo é só há quanto tempo o trabalho começou.
      </p>
      <p className="gerando-relogio">
        em andamento há <span className="mono">{tempoDecorrido(desdeMs)}</span>
      </p>
      {/* O AVISO DE ABERTURA. Faixa fixa, e não modal — o porquê está no cabeçalho do arquivo.
          `aria-live` NÃO entra aqui: o texto não muda depois de renderizado, e o cabeçalho acima
          já é o `role="status"` desta tela. */}
      <div className="gerando-aviso">
        <h3>Não é necessário esperar a minuta ficar pronta</h3>
        <p className="gerando-aviso-tempo">{fraseDoTempoDeGeracao(faixa)}</p>
        <p>
          <strong>Pode fechar esta aba</strong> — a geração continua no servidor, e a minuta fica guardada nesta sessão. Ao
          final, o aviso de conclusão aparece na <strong>Central de Alertas</strong> do Lúmen, com o caminho direto para a
          minuta pronta. Ela também continua na lista de rascunhos.
        </p>
        {/* DE ONDE VEM O NÚMERO, dito na tela. Uma faixa medida e uma faixa chutada se parecem; a
            diferença só existe para quem lê se estiver escrita. */}
        <p className="gerando-aviso-fonte">
          {faixa.pisoMin === null
            ? "Nenhum tempo típico é estimado aqui: enquanto não houver gerações medidas o suficiente neste escritório, a tela fala apenas do teto do sistema."
            : "O tempo típico acima é medido nas gerações deste escritório, não estimado."}
        </p>
      </div>
    </div>
  );
}
