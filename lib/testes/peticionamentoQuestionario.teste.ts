import { teste, igual, verdade, resumo } from "./executar";
import { CATEGORIAS_DE_PECA } from "../peticionamentoCategoriaPeca";
import { obterConfiguracaoQuestionario } from "../peticionamentoQuestionario";

// Decisão do dono (22/09/2026): "hoje o questionário é igual para todos os tipos" deixa de valer
// — cinco caminhos, e o de "Geral" com MAIS perguntas, nunca menos.

teste("as cinco categorias têm configuração própria — nenhuma cai no genérico por acidente", () => {
  const vistos = new Set<string>();
  for (const c of CATEGORIAS_DE_PECA) {
    const cfg = obterConfiguracaoQuestionario(c);
    verdade(cfg.tituloFatos.length > 0, `${c}: tituloFatos vazio`);
    verdade(cfg.labelPedidos.length > 0, `${c}: labelPedidos vazio`);
    verdade(cfg.pedidosSugeridos.length > 0, `${c}: pedidosSugeridos vazio`);
    const chave = cfg.tituloFatos + "|" + cfg.labelPedidos;
    verdade(!vistos.has(chave), `${c}: configuração idêntica a outra categoria já vista`);
    vistos.add(chave);
  }
});

teste("categoria desconhecida ou ausente cai no padrão de Petição, nunca em branco", () => {
  const semCategoria = obterConfiguracaoQuestionario(null);
  const peticao = obterConfiguracaoQuestionario("Petição");
  igual(semCategoria, peticao);
  igual(obterConfiguracaoQuestionario("Recurso"), peticao);
  igual(obterConfiguracaoQuestionario(undefined), peticao);
});

teste("SÓ 'Geral' ganha o passo extra de pistas — é a categoria com MENOS pista, não com menos pergunta", () => {
  for (const c of CATEGORIAS_DE_PECA) {
    const cfg = obterConfiguracaoQuestionario(c);
    if (c === "Geral") {
      verdade(cfg.temPassoDePistas, "Geral deveria ter o passo extra de pistas");
      verdade(cfg.pistasSugeridas.length >= 4, "Geral deveria oferecer várias pistas sugeridas, não uma ou duas");
    } else {
      verdade(!cfg.temPassoDePistas, `${c} não deveria ter o passo extra de pistas`);
    }
  }
});

teste("Contrato pergunta partes/objeto, não 'pedidos' processuais", () => {
  const cfg = obterConfiguracaoQuestionario("Contrato");
  verdade(/parte/i.test(cfg.tituloFatos), "Contrato deveria perguntar pelas partes nos fatos");
  verdade(/objeto|cláusula/i.test(cfg.tituloPedidos), "Contrato deveria perguntar objeto/cláusulas, não 'pedido e urgência'");
  verdade(!cfg.mostrarDescumprimento, "Contrato não deveria mostrar a pergunta de descumprimento pelo réu");
  verdade(!cfg.mostrarTeses, "Contrato não deveria mostrar teses jurídicas de petição");
});

teste("Parecer pergunta a pergunta a responder", () => {
  const cfg = obterConfiguracaoQuestionario("Parecer");
  verdade(/pergunta/i.test(cfg.tituloPedidos), "Parecer deveria ter uma etapa de 'pergunta a responder'");
  verdade(!cfg.mostrarDescumprimento, "Parecer não deveria mostrar a pergunta de descumprimento pelo réu");
});

teste("Notificação Extrajudicial pergunta o que se exige e em que prazo", () => {
  const cfg = obterConfiguracaoQuestionario("Notificação Extrajudicial");
  verdade(/exige/i.test(cfg.tituloPedidos) || /exige/i.test(cfg.labelPedidos), "Notificação deveria perguntar o que se exige");
  verdade(/prazo/i.test(cfg.rotuloPrazo), "Notificação deveria manter o rótulo de prazo");
  verdade(cfg.mostrarPrazoValor, "Notificação precisa mostrar o campo de prazo");
});

teste("Petição mantém o comportamento anterior (fatos + pedidos + prazo/valor/descumprimento + teses)", () => {
  const cfg = obterConfiguracaoQuestionario("Petição");
  verdade(cfg.mostrarPrazoValor && cfg.mostrarDescumprimento && cfg.mostrarTeses, "Petição não deveria perder nenhum campo existente");
});

resumo("Peticionamento — questionário por tipo de peça (decisão do dono, 22/09/2026)");
