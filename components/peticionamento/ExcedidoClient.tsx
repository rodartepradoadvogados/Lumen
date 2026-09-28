"use client";

import { useRouter } from "next/navigation";

export function ExcedidoClient({ sessaoId, motivoBloqueio, avisoResumo }: { sessaoId: string; motivoBloqueio: string | null; avisoResumo: string | null }) {
  const router = useRouter();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{motivoBloqueio ? "O contexto selecionado é grande demais" : "Contexto dentro do limite"}</h1>
          <p>
            {motivoBloqueio
              ? "Nunca cortamos em silêncio, e nunca mandamos ao agente meia leitura de um documento: preferimos parar aqui e deixar a escolha com você."
              : "Esta sessão não está bloqueada por tamanho de contexto no momento."}
          </p>
        </div>
      </div>

      <div className="content">
        {motivoBloqueio ? (
          <>
            <div className="callout callout-danger" style={{ marginBottom: 20 }}>
              <h2>O pedido ao agente não cabe no limite</h2>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{motivoBloqueio}</p>
            </div>
            {/* Documento anexado nunca é cortado pela metade (ver "POR QUE DOCUMENTO CONTINUA
                PROTEGIDO" em lib/peticionamentoJanelaDeContexto.ts): numa contestação de oitenta
                páginas, os primeiros 15% são endereçamento e preliminares, e a minuta sairia
                redigida contra uma peça que o agente não leu — com aparência de completa. Dizer
                isto aqui é o que transforma o bloqueio em decisão, e não em obstáculo. */}
            <p style={{ fontSize: 12.5, lineHeight: 1.6, margin: "0 0 16px", opacity: 0.85 }}>
              Os documentos anexados vão inteiros ao agente ou não vão — nunca pela metade. Por isso, quando o conjunto
              não cabe, quem escolhe o que fica de fora é você: o texto acima diz quanto passou e qual escolha faz caber.
            </p>
            <h2 style={{ fontSize: 13, margin: "0 0 10px" }}>Escolha um caminho antes de continuar</h2>
            <div className="actions-list">
              <div className="action-opt">
                <div>
                  <div className="t">Remover um item vinculado</div>
                  <div className="d">Voltar à seleção de contexto e desmarcar processo, atendimento ou assessoria</div>
                </div>
                <button className="btn btn-sm" onClick={() => router.push(`/peticionamento/${sessaoId}/contexto`)}>
                  Ir para Contexto
                </button>
              </div>
              <div className="action-opt">
                <div>
                  <div className="t">Selecionar menos documentos</div>
                  <div className="d">Manter só o essencial para esta peça — os demais continuam disponíveis depois</div>
                </div>
                <button className="btn btn-sm" onClick={() => router.push(`/peticionamento/${sessaoId}/documentos`)}>
                  Ir para Documentos
                </button>
              </div>
              <div className="action-opt">
                <div>
                  <div className="t">Iniciar uma sessão separada</div>
                  <div className="d">Peticionar em etapas — por exemplo, uma sessão por documento de prova</div>
                </div>
                <button className="btn btn-sm" onClick={() => router.push(`/peticionamento`)}>
                  Nova sessão
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            {avisoResumo && (
              <div className="callout callout-warn" style={{ marginBottom: 20 }}>
                <h2>Resumimos parte do contexto automaticamente</h2>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{avisoResumo}</p>
              </div>
            )}
            <button className="btn btn-primary" onClick={() => router.push(`/peticionamento/${sessaoId}/confirmar`)}>
              Voltar à confirmação
            </button>
          </>
        )}
      </div>
    </>
  );
}
