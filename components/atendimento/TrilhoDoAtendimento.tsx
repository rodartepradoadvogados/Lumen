import Link from "next/link";
import { ExternalLink } from "lucide-react";
import QuemEEsteNumero from "@/components/atendimento/QuemEEsteNumero";
import { pendenciaKindLabel } from "@/lib/pendencias";
import { dataDeBrasilia } from "@/lib/horaDeBrasilia";
import type { ContatoConhecido } from "@/lib/quemEEsteNumero";

// ============================================================================
// O TRILHO DE 360px, À DIREITA DA CONVERSA.
//
// É o contexto que quem vai responder precisa ter SEM sair da conversa. Três seções num cartão só,
// separadas por filete: o que a triagem apurou, os documentos, e o que o escritório ainda deve.
//
// POR QUE 360px E NÃO 420. A 420 o trilho começava a competir com a conversa por atenção, e a
// conversa é o assunto da tela. A 360 ele continua legível (uma coluna de ficha, não de leitura
// corrida) e devolve 60px para as bolhas.
//
// DOCUMENTOS × PENDÊNCIAS, a divisão que o modelo já tem: "solicitar ao lead" é documento que falta
// chegar, e mora com os anexos que já chegaram — as duas metades da mesma pergunta ("temos o que
// precisamos?"). "Enviar ao lead" é obrigação do escritório, e mora à parte, porque a providência é
// de quem está lendo.
//
// "TRANSFORMAR EM PROCESSO" É CONTORNADO, e leva à segunda guia, na divisória certa. Contornado
// porque a tela tem UM botão cheio, o Enviar: transformar em processo é uma decisão de minutos,
// responder ao cliente é de segundos, e o peso visual tem que dizer isso.
// ============================================================================

// F.6 — DOCUMENTO CLICÁVEL, SEM SAIR DA CONVERSA.
//
// O DEFEITO: a lista de anexos aqui era texto puro — nome do arquivo, sem link nenhum. Para abrir
// qualquer documento, foto ou áudio da conversa (pedido do dono), era preciso sair do Lúmen, entrar
// no Drive à mão e procurar a pasta certa. `driveUrl` já existia no Attachment desde sempre (é o
// mesmo campo que AttachmentList.tsx usa para o link "Abrir") — só não vinha até aqui, porque este
// trilho nasceu (Fase de fusão da Central) só com `id`/`name`, sem pensar em abrir o documento
// direto dali. `target="_blank"` porque o Drive não roda dentro do Lúmen: abrir na mesma aba
// trocaria a conversa pela página do Google, e quem está atendendo perderia o lugar onde estava.
export type AnexoDoTrilho = { id: string; name: string; driveUrl: string };

export type ItemDePendencia = {
  id: string;
  direction: string;
  kind: string;
  description: string | null;
  status: string;
  dueDate: Date | null;
};

export default function TrilhoDoAtendimento({
  attendanceId,
  telefone,
  contato,
  nomeAtual,
  area,
  canal,
  campanha,
  responsavel,
  abertoEm,
  descricao,
  anexos,
  pendencias,
  jaConvertido,
}: {
  attendanceId: string;
  telefone: string | null;
  contato: ContatoConhecido | null;
  /** O `clientName` de agora — repassado a QuemEEsteNumero para decidir se o pop-up de definir o
   * nome do lead faz sentido (ver DefinirNomeDoLead.tsx). */
  nomeAtual: string;
  area: string | null;
  canal: string;
  campanha: string | null;
  responsavel: string | null;
  abertoEm: Date;
  descricao: string | null;
  anexos: AnexoDoTrilho[];
  pendencias: ItemDePendencia[];
  jaConvertido: boolean;
}) {
  const aguardando = pendencias.filter((p) => p.status !== "CONCLUIDA");
  const faltamChegar = aguardando.filter((p) => p.direction === "SOLICITAR");
  const faltamSair = aguardando.filter((p) => p.direction === "ENVIAR");

  return (
    <div className="flex h-full flex-col bg-sf-fundo">
      {/* O MIOLO ROLA, O RODAPÉ NÃO. Antes o trilho inteiro rolava, e "Transformar em processo" —
          que mora no pé — só aparecia depois de rolar o trilho até o fim. Uma ação importante que
          exige rolagem para ser descoberta é, na prática, uma ação que não existe. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
      <section className="border border-regua bg-sf p-4">
        <Rotulo>Quem é este número</Rotulo>
        <QuemEEsteNumero attendanceId={attendanceId} telefone={telefone} contato={contato} nomeAtual={nomeAtual} />
      </section>

      <section className="flex flex-col gap-5 border border-regua bg-sf p-4">
        <div>
          <Rotulo>O que a triagem apurou</Rotulo>
          <div className="flex flex-col gap-3">
            <Linha titulo="Matéria" valor={area} />
            <Linha titulo="Canal" valor={canal} />
            {campanha && <Linha titulo="Campanha" valor={campanha} />}
            <Linha titulo="Responsável" valor={responsavel} />
            <Linha titulo="Aberto em" valor={dataDeBrasilia(abertoEm)} />
          </div>
          {descricao && (
            <div className="mt-3 border-t border-regua pt-3">
              <p className="text-xs text-tx-3">O que o cliente contou</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-tx-2">{descricao}</p>
            </div>
          )}
        </div>

        <div className="border-t border-regua pt-4">
          <Rotulo>Documentos</Rotulo>
          {anexos.length === 0 && faltamChegar.length === 0 ? (
            <p className="text-xs text-tx-3">Nenhum documento pedido nem recebido.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {anexos.map((doc) => (
                <div key={doc.id} className="flex items-baseline gap-2.5">
                  <a
                    href={doc.driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Abrir no Drive"
                    className="group flex min-w-0 flex-1 items-baseline gap-1.5 text-sm text-tx hover:text-marca-tx hover:underline"
                  >
                    <span className="min-w-0 flex-1 break-words">{doc.name}</span>
                    <ExternalLink size={11} className="shrink-0 text-tx-3 group-hover:text-marca-tx" />
                  </a>
                  <span className="shrink-0 text-xs font-semibold text-concluido">recebido</span>
                </div>
              ))}
              {faltamChegar.map((p) => (
                <div key={p.id} className="flex items-baseline gap-2.5">
                  <span className="min-w-0 flex-1 break-words text-sm text-tx">
                    {p.description?.trim() || pendenciaKindLabel(p.direction, p.kind)}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-aviso">falta</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-regua pt-4">
          <Rotulo>Pendências</Rotulo>
          {faltamSair.length === 0 ? (
            <p className="text-xs text-tx-3">O escritório não deve nada a este lead.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {faltamSair.map((p) => (
                <div key={p.id} className="flex items-baseline gap-2.5">
                  <span className="min-w-0 flex-1 break-words text-sm text-tx">
                    {p.description?.trim() || pendenciaKindLabel(p.direction, p.kind)}
                  </span>
                  {p.dueDate && <span className="shrink-0 text-xs text-tx-3">{dataDeBrasilia(p.dueDate)}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      </div>

      <div className="shrink-0 border-t border-regua bg-sf-fundo px-5 pb-5 pt-4">
        {!jaConvertido && (
          <Link
            href={`/atendimento/${attendanceId}?aba=ficha&bloco=processo`}
            className="mb-3 flex min-h-11 items-center justify-center border border-regua-forte bg-sf px-4 text-sm font-semibold text-tx-2 transition-colors hover:bg-sf-apoio hover:text-tx"
          >
            Transformar em processo
          </Link>
        )}
        <p className="text-xs text-tx-3">Honorário, pendências, e-mail, tarefas, anexos e anotações estão na guia “Ficha completa”.</p>
      </div>
    </div>
  );
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return <p className="mb-2.5 text-etiqueta font-bold uppercase tracking-wider text-tx-3">{children}</p>;
}

function Linha({ titulo, valor }: { titulo: string; valor: string | null }) {
  return (
    <div>
      <p className="text-xs text-tx-3">{titulo}</p>
      <p className="mt-0.5 text-sm text-tx">{valor || "—"}</p>
    </div>
  );
}
