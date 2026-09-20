import IconeAgente from "@/components/IconeAgente";
import RolarParaOFim from "@/components/atendimento/RolarParaOFim";
import { horaDeBrasilia } from "@/lib/horaDeBrasilia";
import { agruparPorDia, fraseDaTransferencia } from "@/lib/relogioDoAtendimento";

// ============================================================================
// A CONVERSA.
//
// É a coluna da esquerda da tela do atendimento, e é a primeira coisa que a pessoa lê. O que se
// decidiu aqui, e o motivo de cada coisa:
//
// BOLHA DE CANTO VIVO, NÃO ARREDONDADA. O sistema do Lúmen tem a escala de raio inteira em 2px por
// decisão de direção (ver tailwind.config.ts, borderRadius) — "cartolina cortada tem canto vivo".
// Bolha de conversa arredondada seria a única forma redonda do produto inteiro. Quem fala se
// distingue pelo lado, pela força da borda e pela assinatura, que é o que o leitor de fato usa.
//
// AS DUAS BOLHAS SÃO BRANCAS. A de saída era vermelha (bg-acao), e isso gastava a única cor de ação
// do produto em algo que não é ação nenhuma — a tela passa a ter um só botão cheio, o Enviar.
//
// LARGURA TRAVADA EM 560px, não em porcentagem. Numa tela larga, 75% dá linha de 140 caracteres, e
// ninguém lê isso sem perder a linha. 560px dá mais ou menos 75 caracteres, que é a medida de
// leitura corrida.
//
// A HORA É DE BRASÍLIA, SEMPRE, e formatada no servidor. Deixar o navegador formatar faria a
// conversa mostrar horas diferentes para o advogado que está em Lisboa.
// ============================================================================

export type MensagemDaConversa = {
  id: string;
  direction: string;
  porAgente: boolean;
  body: string;
  status: string;
  createdAt: Date;
};

export default function Conversa({
  mensagens,
  agora,
  nomeDoAtendente,
  transferidoPor,
  transferidoEm,
}: {
  mensagens: MensagemDaConversa[];
  agora: Date;
  nomeDoAtendente: string;
  transferidoPor?: string | null;
  transferidoEm?: Date | null;
}) {
  const grupos = agruparPorDia(mensagens, (m) => m.createdAt, agora);
  const aviso = fraseDaTransferencia(transferidoPor, transferidoEm);
  // A frase da transferência entra no dia da PRIMEIRA mensagem que veio depois dela: é ali que ela
  // explica o que aconteceu, e uma frase lida fora de ordem não explica nada.
  //
  // E quando NÃO veio mensagem nenhuma depois — que é o caso mais comum, porque a transferência é
  // justamente o que acontece quando o cliente parou de receber resposta — ela vai no último dia da
  // conversa, porque é o acontecimento mais recente. Sem este segundo caso a frase simplesmente não
  // aparecia, que foi o que o teste no navegador pegou.
  const diaDaTransferencia = transferidoEm
    ? (grupos.find((g) => g.mensagens.some((m) => m.createdAt >= transferidoEm)) ?? grupos[grupos.length - 1])?.dia
    : undefined;

  if (mensagens.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-sm text-tx-3">Nenhuma mensagem nesta conversa ainda.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {grupos.map((grupo) => (
        <div key={grupo.dia} className="flex flex-col gap-2">
          <div className="flex items-center gap-4 pt-2">
            <span className="h-px flex-1 bg-regua" />
            <span className="text-etiqueta font-semibold uppercase tracking-wider text-tx-3">{grupo.rotulo}</span>
            <span className="h-px flex-1 bg-regua" />
          </div>

          {aviso && grupo.dia === diaDaTransferencia && (
            <p className="px-4 py-1 text-center text-xs text-tx-3">{aviso}</p>
          )}

          {grupo.mensagens.map((m) => {
            const saiu = m.direction === "OUT";
            return (
              <div key={m.id} className={saiu ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={`max-w-[560px] bg-sf px-4 py-3 border ${saiu ? "border-regua-forte" : "border-regua"}`}
                >
                  <p className="whitespace-pre-wrap break-words text-sm text-tx">{m.body}</p>
                  <div className={`mt-2 flex items-center gap-1.5 ${saiu ? "justify-end" : ""}`}>
                    {saiu && m.porAgente && <IconeAgente size={12} className="text-tx-3" />}
                    <span className="text-etiqueta text-tx-3">
                      {saiu && m.porAgente ? `${nomeDoAtendente} · ` : ""}
                      {horaDeBrasilia(m.createdAt)}
                      {saiu && m.status === "FAILED" ? " · falhou" : ""}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
      <RolarParaOFim />
    </div>
  );
}
