// O ENDEREÇO QUE A PONTE ENTREGA AO HERMES — um só lugar, para as duas chamadas não divergirem.
//
// POR QUE ISTO EXISTE. A ponte (servidor-hermes/servidor.py) põe `LUMEN_FERRAMENTAS_URL` no
// ambiente do processo do Hermes a cada pergunta, e esse endereço vinha montado à mão em DOIS
// lugares — app/api/assistente/route.ts (a conversa) e lib/actions/peticionamento.ts (a geração de
// peça). Duas cópias de um endereço que precisa ser o mesmo é a forma mais barata de um dos dois
// caminhos ficar falando com a rota errada sem ninguém perceber; foi exatamente assim que as
// ferramentas do peticionamento passaram semanas desligadas.
//
// POR QUE É A ROTA MCP, E NÃO MAIS A REST. As duas cópias apontavam para
// `/api/agente/ferramentas` — a rota que fala o formato próprio do Lúmen. Nada na instalação do
// Hermes sabe ler esse formato: o script pensado para isso (servidor-hermes/lumen-consultar.py)
// dependia de uma instrução de prompt que nunca entrou no perfil. O Hermes, por outro lado, JÁ
// fala MCP nativamente, pelo `mcp_servers` do `config.yaml`. Então o endereço entregue a ele passa
// a ser o da rota MCP (app/api/agente/mcp/route.ts), que expõe EXATAMENTE o mesmo catálogo de
// ferramentas e lê a MESMA credencial (Authorization: Bearer). Muda o transporte; não muda uma
// única regra de quem alcança o quê — essa mora em lib/agenteFerramentasLiberadas.ts e as duas
// rotas importam de lá.
//
// A ROTA REST CONTINUA EXISTINDO e continua sendo o que a reserva do próprio Lúmen usa
// (app/api/assistente/route.ts, quando é o Lúmen que chama o modelo). Ela não é apagada aqui: o
// que muda é só qual das duas o HERMES recebe.

import { getAppUrl } from "@/lib/appUrl";

/** O caminho da rota MCP — o mesmo literal que app/api/agente/mcp/route.ts serve. */
export const CAMINHO_DAS_FERRAMENTAS = "/api/agente/mcp";

/**
 * O endereço completo a entregar ao Hermes. A barra final do `APP_URL` é RETIRADA antes de
 * concatenar: `APP_URL` é variável de ambiente escrita por uma pessoa, e "https://lumen.app/" com
 * a barra viraria "https://lumen.app//api/agente/mcp" — um endereço que muitos servidores aceitam,
 * alguns normalizam e outros devolvem 404, e descobrir qual dos três só em produção não é um risco
 * que vale correr por um caractere.
 */
export function urlDasFerramentasDoAgente(): string {
  return `${getAppUrl().replace(/\/+$/, "")}${CAMINHO_DAS_FERRAMENTAS}`;
}
