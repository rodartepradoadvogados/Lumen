import { readFileSync } from "node:fs";
import { teste, verdade, resumo, codigoDe } from "./executar";

// ============================================================================
// ENTER ENVIA (F5.5, item 1) — "permitir enviar mensagem com enter, e não apenas com o botão
// enviar". Antes só Ctrl/Cmd+Enter enviava; agora Enter sozinho envia e Shift+Enter quebra linha
// — o padrão do WhatsApp.
//
// O ARQUIVO É PEQUENO E TEM UM ÚNICO onKeyDown, então ancorar na EXPRESSÃO exata (sem comentário,
// via codigoDe) já é seguro sem precisar isolar o corpo de uma função nomeada — não há função
// nomeada aqui para isolar, é um handler inline dentro do JSX.
// ============================================================================

const corpo = codigoDe(readFileSync("components/WhatsappReplyBox.tsx", "utf8"));

teste("Enter (sem Shift, fora de composição de IME) dispara o envio", () => {
  verdade(
    corpo.includes('e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing'),
    "a condição de Enter simples não está mais no código — voltou a exigir Ctrl/Cmd, ou sumiu",
  );
});

teste("o atalho antigo (Ctrl/Cmd+Enter obrigatório) não está mais escrito no código", () => {
  // Ancorado no operador, não em comentário: `e.metaKey || e.ctrlKey` era exatamente a condição
  // antiga. Continuar aceitando os dois não é proibido (é só redundante); o que não pode é EXIGIR
  // um dos dois para enviar — e é isso que a ausência desta expressão específica prova.
  verdade(!corpo.includes('(e.metaKey || e.ctrlKey)'), "o atalho antigo (só Ctrl/Cmd+Enter) ainda está escrito");
});

resumo("Enter envia no WhatsApp (F5.5)");
