import { teste, igual, resumo } from "./executar";
import { renderTemplateSubject } from "../emailTemplateRender";
import { DEFAULT_TEMPLATES } from "../comunicadosTemplatesPadrao";
import { casarClientePorNome } from "../clienteNoTexto";

// ---------- assunto do aviso do Lúmen ----------
teste("variável sem valor some junto com o separador: nunca '{{processo}}' no assunto", () => {
  igual(renderTemplateSubject("Nova publicação — {{processo}}", {}), "Nova publicação");
  igual(renderTemplateSubject("Nova publicação - {{processo}}", {}), "Nova publicação");
  igual(renderTemplateSubject("Prazo: {{processo}}", {}), "Prazo");
});
teste("variável com valor entra pura (assunto é texto, não HTML)", () => {
  igual(renderTemplateSubject("Nova publicação — {{processo}}", { processo: "5012345-88.2024.8.09.0051" }), "Nova publicação — 5012345-88.2024.8.09.0051");
  igual(renderTemplateSubject("Aviso {{cliente}}", { cliente: "Silva & Filhos" }), "Aviso Silva & Filhos");
});
teste("nenhum assunto padrão do Lúmen sai com '{{' quando as variáveis vêm vazias", () => {
  for (const [evento, t] of Object.entries(DEFAULT_TEMPLATES)) {
    const assunto = renderTemplateSubject((t as { subject: string }).subject, {});
    if (assunto.includes("{{")) throw new Error(`${evento}: ${assunto}`);
  }
});

// ---------- cliente compatível ----------
const CLIENTES = [
  { id: "c-rodrigo", name: "Rodrigo Araújo do Prado" },
  { id: "c-horizonte", name: "Horizonte Peças Automotivas Ltda" },
  { id: "c-maria", name: "Maria Souza" },
  { id: "c-solo", name: "Jairo" },
];
const EQUIPE = ["Rodrigo Prado", "Jairo Rodarte", "Anna Clara Páscoa"];

teste("o destinatário 'Sr(a). <advogado>' NÃO vira cliente compatível (144 publicações foram assim)", () => {
  const aviso = "Sr(a). RODRIGO ARAÚJO DO PRADO,\n\nO Poder Judiciário do Estado de Goiás informa que está disponível uma intimação...";
  igual(casarClientePorNome(aviso, CLIENTES, EQUIPE), null);
});
teste("sem a equipe como filtro o mesmo texto casaria (prova de que a regra é a que protege)", () => {
  igual(casarClientePorNome("Sr(a). RODRIGO ARAÚJO DO PRADO,", CLIENTES, []), "c-rodrigo");
});
teste("cliente de verdade casa por palavras inteiras, sem acento nem caixa", () => {
  igual(casarClientePorNome("Intimação: HORIZONTE PECAS AUTOMOTIVAS LTDA, autora", CLIENTES, EQUIPE), "c-horizonte");
  igual(casarClientePorNome("autora Maria Souza", CLIENTES, EQUIPE), "c-maria");
});
teste("nome de uma palavra só não casa; pedaço de palavra não casa", () => {
  igual(casarClientePorNome("Jairo Alexandre foi intimado", CLIENTES, []), null);
  igual(casarClientePorNome("Maria Souzaa e outros", CLIENTES, EQUIPE), null);
});
teste("dois clientes de mesmo tamanho casando é ambíguo: nenhum", () => {
  igual(casarClientePorNome("Maria Souza e Pedro Alves", [{ id: "a", name: "Maria Souza" }, { id: "b", name: "Pedro Alves" }], []), null);
});

resumo("e-mail: assunto do aviso do Lúmen e vínculo de cliente por nome");
