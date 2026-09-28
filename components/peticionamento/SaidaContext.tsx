"use client";

// O POP-UP DE SAÍDA — especificação §4 da adequação de 21/09/2026. "Dispara em QUALQUER
// tentativa de sair: o item do menu, o botão do navegador, fechar a aba (beforeunload), navegar
// para fora [...] Só aparece quando há trabalho em andamento — numa sessão vazia, sair é sair."
//
// Um único Provider, montado uma vez em app/peticionamento/layout.tsx, guarda o estado
// `temTrabalho` (nunca volta a false sozinho: uma vez que a sessão tem conteúdo, ela continua
// "em andamento" pelo resto da visita, mesmo que o campo seja esvaziado depois) e dá a qualquer
// componente da árvore duas ferramentas: `marcarTrabalho()` (chamado ao digitar/selecionar algo,
// para reação imediata, sem esperar o próximo carregamento de página) e `pedirSaida(acao)` (só
// executa `acao` na hora se não houver trabalho; senão abre o pop-up e só executa se confirmado).

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type SaidaContextValor = {
  temTrabalho: boolean;
  marcarTrabalho: () => void;
  pedirSaida: (aoConfirmar: () => void) => void;
  /**
   * "Nesta tela, fechar a aba é seguro" — desliga SÓ o gatilho do navegador (beforeunload).
   *
   * Existe por causa de UMA tela: a de geração da minuta
   * (components/peticionamento/GerandoClient.tsx), que diz ao advogado, com todas as letras, que
   * ele PODE fechar a aba porque a geração continua no servidor e o aviso chega na Central de
   * Alertas. Sem isto, o navegador perguntava "as alterações podem não ser salvas" um segundo
   * depois da promessa — uma frase falsa (está tudo gravado) saindo do nosso próprio código,
   * contradizendo a tela. A casa não escreve promessa que o código não cumpre, e também não impõe
   * restrição que a tela nega.
   *
   * SÓ O GATILHO 1. Os outros três (item de menu, botão voltar, navegar para fora) continuam
   * mostrando o pop-up de verdade: ali a pessoa CONTINUA no Lúmen e a pergunta segue fazendo
   * sentido — o que ela nega é a saída da aba, não a existência do trabalho.
   */
  declararFechamentoSeguro: (seguro: boolean) => void;
};

const SaidaContext = createContext<SaidaContextValor | null>(null);

export function useSaidaDoPeticionamento(): SaidaContextValor {
  const contexto = useContext(SaidaContext);
  if (!contexto) throw new Error("useSaidaDoPeticionamento precisa estar dentro de <ProvedorDeSaida> (app/peticionamento/layout.tsx)");
  return contexto;
}

/**
 * Ponte servidor→cliente: cada página de sessão (contexto/wizard/documentos/confirmar/minuta)
 * calcula `temTrabalho` no servidor a partir dos dados de verdade da sessão
 * (lib/peticionamentoPasso.ts:sessaoTemTrabalhoEmAndamento) e avisa o Provider — que, montado no
 * layout, não tem como saber sozinho o conteúdo de UMA sessão específica.
 */
export function SincronizarTrabalhoEmAndamento({ temTrabalho }: { temTrabalho: boolean }) {
  const { marcarTrabalho } = useSaidaDoPeticionamento();
  useEffect(() => {
    if (temTrabalho) marcarTrabalho();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temTrabalho]);
  return null;
}

const TEXTO_SERA_GUARDADO = "Tipo da peça, contexto vinculado, respostas do questionário, documentos anexados e a minuta como está agora.";

export function ProvedorDeSaida({ children }: { children: React.ReactNode }) {
  const [temTrabalho, setTemTrabalho] = useState(false);
  // Diferente de `temTrabalho`, este VOLTA a false: ele descreve a TELA em que a pessoa está
  // agora, não o histórico da sessão. Quem o liga desliga ao sair da tela (ver GerandoClient).
  const [fechamentoSeguro, setFechamentoSeguro] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const acaoPendente = useRef<(() => void) | null>(null);
  const saindoConfirmado = useRef(false);
  const sentinelaEmpilhada = useRef(false);

  const marcarTrabalho = useCallback(() => setTemTrabalho(true), []);
  const declararFechamentoSeguro = useCallback((seguro: boolean) => setFechamentoSeguro(seguro), []);

  const pedirSaida = useCallback(
    (aoConfirmar: () => void) => {
      if (!temTrabalho) {
        aoConfirmar();
        return;
      }
      acaoPendente.current = aoConfirmar;
      setModalAberto(true);
    },
    [temTrabalho],
  );

  // GATILHO 1 — fechar a aba, recarregar, digitar outra URL na barra de endereço: o navegador
  // intercepta ANTES da página conseguir mostrar qualquer HTML próprio.
  //
  // LIMITAÇÃO CONHECIDA, registrada no relatório da entrega: todo navegador atual ignora texto
  // customizado neste diálogo por razão de segurança anti-abuso (a especificação do próprio HTML
  // exige isso desde 2016) — quem aparece aqui é o diálogo NATIVO do navegador ("Sair do site? As
  // alterações podem não ser salvas"), nunca o texto do §4. É o teto do que a plataforma web
  // permite; os outros três gatilhos abaixo mostram o pop-up de verdade.
  // E ELE NÃO DISPARA quando a tela atual declarou que fechar a aba é seguro (a tela de geração —
  // ver `declararFechamentoSeguro` acima). Dois estados diferentes, e a diferença é justamente o
  // que o `beforeunload` não sabia ver: "há trabalho nesta sessão" não é o mesmo que "há algo que
  // se perde se esta aba fechar agora".
  useEffect(() => {
    if (!temTrabalho || fechamentoSeguro) return;
    function aoTentarFechar(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", aoTentarFechar);
    return () => window.removeEventListener("beforeunload", aoTentarFechar);
  }, [temTrabalho, fechamentoSeguro]);

  // GATILHO 2 — botão "voltar" do navegador: empilha uma entrada extra no histórico assim que há
  // trabalho em andamento, para que o "voltar" físico gere um `popstate` interceptável aqui, em
  // vez de já ter saído da aba quando o código roda.
  useEffect(() => {
    if (!temTrabalho) return;
    if (!sentinelaEmpilhada.current) {
      window.history.pushState({ peticionamentoSaidaSentinela: true }, "");
      sentinelaEmpilhada.current = true;
    }
    function aoVoltar() {
      if (saindoConfirmado.current) return; // já confirmado por este provider — deixa a navegação seguir
      window.history.pushState({ peticionamentoSaidaSentinela: true }, "");
      pedirSaida(() => {
        saindoConfirmado.current = true;
        window.history.back();
      });
    }
    window.addEventListener("popstate", aoVoltar);
    return () => window.removeEventListener("popstate", aoVoltar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temTrabalho]);

  function confirmarSaida() {
    setModalAberto(false);
    const acao = acaoPendente.current;
    acaoPendente.current = null;
    acao?.();
  }

  function continuarEscrevendo() {
    setModalAberto(false);
    acaoPendente.current = null;
  }

  return (
    <SaidaContext.Provider value={{ temTrabalho, marcarTrabalho, pedirSaida, declararFechamentoSeguro }}>
      {children}
      {modalAberto && (
        <div className="modal-scrim" role="dialog" aria-modal="true" aria-labelledby="saida-titulo">
          <div className="modal">
            <h2 id="saida-titulo">Fechar o peticionamento?</h2>
            <p className="lede">
              Você está no meio de uma peça. <strong style={{ color: "var(--tx-0)" }}>Nada será perdido:</strong> o que você já escreveu fica guardado na
              lista de rascunhos, e você retoma exatamente de onde parou.
            </p>
            <div className="callout" style={{ marginBottom: 14 }}>
              <h2 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--tx-2)" }}>Será guardado</h2>
              <p style={{ margin: 0, fontSize: 13, color: "var(--tx-1)", lineHeight: 1.6 }}>{TEXTO_SERA_GUARDADO}</p>
            </div>
            <p className="gate-note">O Lúmen continua aberto na outra aba — você não precisa fechar esta para consultar um processo.</p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={continuarEscrevendo}>
                Continuar escrevendo
              </button>
              <button className="btn btn-primary" onClick={confirmarSaida}>
                Fechar e guardar em rascunhos
              </button>
            </div>
          </div>
        </div>
      )}
    </SaidaContext.Provider>
  );
}

/**
 * GATILHO 3 (o item de menu "Sair do peticionamento") chama isto DEPOIS de confirmado no pop-up.
 * `window.close()` só tem efeito quando o navegador considera esta aba "sem histórico próprio de
 * navegação" — normalmente porque foi aberta via `window.open`/`target="_blank"`, exatamente como
 * a especificação §2 pede agora para a aba inteira de Peticionamento. Quando o navegador recusa
 * (silenciosamente — não lança erro, não avisa a página), a aba simplesmente continua aberta; não
 * existe API web para forçar o fechamento contra a vontade do navegador. `irParaTelaInicial` é o
 * próximo melhor lugar para deixar a pessoa nesse caso — nunca uma tela em branco.
 */
export function tentarFecharJanela(irParaTelaInicial: () => void) {
  window.close();
  setTimeout(irParaTelaInicial, 150);
}
