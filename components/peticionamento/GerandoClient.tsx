"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { acompanharGeracaoDaMinuta } from "@/lib/actions/peticionamento";

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
// ============================================================================================

/**
 * De quanto em quanto tempo a tela pergunta.
 *
 * Cinco segundos: rápido o bastante para a minuta aparecer quase no instante em que fica pronta,
 * e devagar o bastante para uma geração de quatro minutos custar menos de cinquenta perguntas —
 * cada uma delas é uma pergunta curta à ponte, não uma chamada ao modelo.
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

export function GerandoClient({ sessaoId, desdeMsInicial }: { sessaoId: string; desdeMsInicial: number }) {
  const router = useRouter();
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
      <p className="gerando-linha gerando-promessa">
        <strong>Pode fechar esta aba.</strong> A geração continua no servidor e a minuta fica guardada nesta sessão — quando você
        voltar, pela lista de rascunhos, ela estará aqui.
      </p>
    </div>
  );
}
