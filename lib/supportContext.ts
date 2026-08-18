import { cookies } from "next/headers";

// Contexto por requisição do "Vidro Fosco": responde a UMA pergunta, de forma síncrona e sem
// tocar o banco — "a requisição atual é uma sessão de suporte mascarada?".
//
// Nome do cookie de "atuar como". Fica DEFINIDO AQUI (e reexportado por lib/currentUser.ts, que
// é de onde o resto do app importa) porque lib/prisma.ts precisa dele: se prisma.ts importasse
// lib/currentUser.ts, fecharia o ciclo currentUser -> prisma -> currentUser.
export const ACTING_OFFICE_COOKIE = "rp_acting_office";

// ---------------------------------------------------------------------------------------------
// POR QUE NÃO É O DESENHO "ÓBVIO" (cache() do React + validar a AccessSession no banco)
// ---------------------------------------------------------------------------------------------
// A ideia natural seria memoizar por requisição com `cache()` do React e resolver o contexto
// consultando a AccessSession. Duas coisas mataram esse caminho, nesta ordem:
//
// 1. `cache` NÃO EXISTE no build padrão do React 18.3.1 — ele só é exportado sob a condição de
//    export "react-server". Verificado neste repositório: `require("react").cache` é undefined.
//    lib/prisma.ts é importado por muita coisa que não é Server Component, então um
//    `import { cache } from "react"` viraria `undefined` e quebraria na inicialização do módulo,
//    derrubando o app inteiro em vez de mascarar.
//
// 2. Mesmo com memoização funcionando, consultar a AccessSession de dentro da extensão do Prisma
//    é um caminho perigoso: a consulta passaria pela própria extensão (recursão) e transformaria
//    a decisão de sigilo em algo que depende de uma ida ao banco poder falhar.
//
// ---------------------------------------------------------------------------------------------
// O QUE É FEITO NO LUGAR
// ---------------------------------------------------------------------------------------------
// Mascarar sempre que o cookie de "atuar como" ESTIVER PRESENTE. Só isso. Sem banco, sem
// memoização, sem recursão possível.
//
// Isso é seguro — e na verdade MAIS seguro que validar a sessão — por causa de quem escreve o
// cookie: ele é gravado num único lugar (startActingAsOffice, em lib/officeActing.ts) e só
// DEPOIS de openSupportAccess ter confirmado uma AccessSession. Não existe fluxo normal que
// produza esse cookie fora de uma sessão de suporte.
//
// Os quatro estados possíveis, e por que nenhum vaza:
//
//   cookie ausente        -> não mascara. E sem cookie lib/currentUser.ts nunca troca o
//                            officeId, então não há dado de outro escritório sendo servido.
//                            Custo para o usuário comum: uma leitura de cookie, zero query.
//   cookie + sessão válida -> mascara. É o caso alvo.
//   cookie + sessão inválida/expirada -> mascara. lib/currentUser.ts recusa a troca de
//                            escritório, então o dono da plataforma vê o PRÓPRIO escritório,
//                            mascarado. É incômodo (some o valor dos próprios recebíveis até
//                            clicar em "Sair" ou o cookie vencer em 30 min), mas é excesso de
//                            sigilo, nunca falta. "Falha fecha" de verdade.
//   fora de requisição (cron, robô, script, build) -> cookies() lança, tratado como "não é
//                            suporte". Correto: não existe pessoa do suporte lendo ali.
//
// A troca explícita: abre-se mão de saber o NÍVEL de visibilidade (VIDRO_FOSCO vs QUEBRA_VIDRO)
// aqui dentro. Na Fase A isso não custa nada, porque não existe QUEBRA_VIDRO — toda entrada de
// suporte é mascarada, sem exceção nem autoaprovação. Quando a Fase B trouxer quebra-vidro POR
// REGISTRO, o desmascaramento tem que ser decidido por registro (e logado como LEITURA), não
// por um booleano global de sessão — ou seja, essa informação teria que ser recalculada de
// qualquer jeito. Ver "limitações" no relatório.
// ---------------------------------------------------------------------------------------------

export function isMaskedSupportRequest(): boolean {
  try {
    return Boolean(cookies().get(ACTING_OFFICE_COOKIE)?.value);
  } catch {
    // cookies() lança fora de escopo de requisição (cron, rota de robô, script, geração
    // estática). Sem requisição não há sessão de suporte — operação normal, sem máscara.
    return false;
  }
}

// officeId + sessionId do cookie, para quem (lib/prisma.ts, registro de ESCRITA — ver achado
// A33 da revisão gauntlet) precisa saber QUAL escritório/sessão, não só "é mascarado". Separado
// de isMaskedSupportRequest() de propósito: aquela função roda em TODA leitura (o caminho
// quente) e fica deliberadamente no formato mais barato possível (Boolean de um único get());
// esta só é chamada no caminho frio de escrita, depois que isMaskedSupportRequest() já
// confirmou que há sessão. O valor do cookie é sempre "officeId:sessionId" (gravado em
// startActingAsOffice, lib/officeActing.ts) — sem banco, mesma garantia de "sem recursão".
export function getActingSupportSession(): { officeId: string; sessionId: string } | null {
  try {
    const value = cookies().get(ACTING_OFFICE_COOKIE)?.value;
    if (!value) return null;
    const [officeId, sessionId] = value.split(":");
    if (!officeId || !sessionId) return null;
    return { officeId, sessionId };
  } catch {
    return null;
  }
}
