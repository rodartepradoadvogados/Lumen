// Máscara de dado sensível por padrão (documento 07 do handoff do redesenho — Fase 4,
// Privacidade e LGPD) — vale para TODA a equipe, inclusive admin: "quem tem o dado na mão é quem
// precisa dele para o ato". Funções puras (sem Prisma, sem sessão) — quem decide MOSTRAR o valor
// cru em vez do mascarado é o componente components/Sensivel.tsx, nunca este arquivo.
//
// Não confundir com os dois mecanismos de máscara que já existem no projeto, com propósitos
// diferentes:
// - lib/masks.ts (sem "k" antes do "s" plural) — máscara de FORMATAÇÃO DE DIGITAÇÃO em campo de
//   formulário (o `MaskedInput` que vira "024.111.222-04" enquanto a pessoa digita), não esconde
//   nada — o valor completo já está ali, só formatado.
// - lib/supportMasking.ts (+ supportMaskingMap.ts/supportMaskingApply.ts) — "Vidro Fosco":
//   mascara para o SUPORTE DA PLATAFORMA durante uma sessão de "atuar como", nunca para a própria
//   equipe do escritório em uso normal.
// Este arquivo é um TERCEIRO mecanismo, para uma quarta audiência: a própria equipe do escritório,
// today em uso normal, sem sessão de suporte nenhuma envolvida.
//
// Todo `mask*` abaixo é best-effort: entrada fora do formato esperado (documento incompleto,
// telefone com DDD faltando etc.) devolve uma versão mascarada genérica em vez de estourar ou de
// vazar o valor cru sem querer.

export type MaskKind = "documento" | "telefone" | "email" | "endereco" | "valor";

function onlyDigits(v: string): string {
  return v.replace(/\D/g, "");
}

function bullets(n: number): string {
  return "•".repeat(Math.max(n, 0));
}

// CPF (11 dígitos, ddd.ddd.ddd-dd) ou CNPJ (14 dígitos, dd.ddd.ddd/dddd-dd) — detectados pela
// quantidade de dígitos, mesmo critério que Client.type (PF/PJ) já implica sem precisar repassar
// o tipo aqui. Mantém o 1º e o último grupo visíveis (CPF: 3 dígitos iniciais + 2 finais; CNPJ:
// 2 dígitos iniciais + o "0001" da filial + 2 dígitos finais), mascara o miolo — mesmo recorte do
// exemplo do documento 07 ("024.•••.•••-04", "04.•••.•••/0001-90").
export function maskDocumento(valor: string | null | undefined): string {
  if (!valor) return "";
  const d = onlyDigits(valor);
  if (d.length === 11) {
    return `${d.slice(0, 3)}.•••.•••-${d.slice(9, 11)}`;
  }
  if (d.length === 14) {
    return `${d.slice(0, 2)}.•••.•••/${d.slice(8, 12)}-${d.slice(12, 14)}`;
  }
  // Formato desconhecido (documento estrangeiro, incompleto...): mascara tudo, sem tentar adivinhar.
  return bullets(Math.max(d.length, 4));
}

// Telefone (DDD + 8 ou 9 dígitos) — mantém o DDD e os 2 últimos dígitos visíveis, mascara o
// resto, preservando a pontuação (parênteses/espaço/hífen) na posição certa — mesmo recorte do
// exemplo do documento 07 ("(62) ••••-••32").
export function maskTelefone(valor: string | null | undefined): string {
  if (!valor) return "";
  const d = onlyDigits(valor);
  if (d.length !== 10 && d.length !== 11) return bullets(Math.max(d.length, 4));
  const ddd = d.slice(0, 2);
  const local = d.slice(2); // 8 ou 9 dígitos
  const visivelFinal = local.slice(-2);
  const mascarado = bullets(local.length - 2);
  // 8 dígitos: 4-4 (••••-••32); 9 dígitos: 5-4 (•••••-••32).
  const primeiroGrupoLen = local.length === 9 ? 5 : 4;
  const grupo1 = mascarado.slice(0, primeiroGrupoLen);
  const grupo2 = mascarado.slice(primeiroGrupoLen) + visivelFinal;
  return `(${ddd}) ${grupo1}-${grupo2}`;
}

// E-mail — mantém o primeiro caractere da parte local e o domínio inteiro visíveis, mascara o
// resto da parte local (um • por caractere restante) — mesmo recorte do documento 07
// ("j••••@gmail.com").
export function maskEmail(valor: string | null | undefined): string {
  if (!valor) return "";
  const at = valor.indexOf("@");
  if (at <= 0) return bullets(Math.max(valor.length, 4));
  const local = valor.slice(0, at);
  const dominio = valor.slice(at); // inclui o "@"
  return `${local[0]}${bullets(local.length - 1)}${dominio}`;
}

// Endereço — o campo é texto livre (Client.address não é estruturado em logradouro/número/
// complemento separados), então o recorte é heurístico: tudo até o primeiro número da rua fica
// visível (logradouro, bairro por extenso quando vem antes do número); do primeiro número em
// diante (número + complemento, que costuma vir depois) é mascarado — mesmo espírito do documento
// 07 ("logradouro visível, número e complemento mascarados"), sem exigir endereço estruturado.
export function maskEndereco(valor: string | null | undefined): string {
  if (!valor) return "";
  const match = valor.match(/\d/);
  if (!match || match.index === undefined) {
    // Sem número identificável: não há o que recortar com segurança — mascara tudo.
    return bullets(Math.max(valor.length, 4));
  }
  const logradouro = valor.slice(0, match.index).replace(/[,\-\s]+$/, "");
  return `${logradouro}, •••`;
}

// Valor monetário (honorário, sem acesso ao módulo Financeiro) — formata em R$ pt-BR normalmente
// e troca cada dígito por •, preservando "R$", separador de milhar e vírgula decimal na posição
// certa — mesmo recorte do documento 07 ("R$ ••.•••,••"), qualquer que seja a ordem de grandeza.
export function maskValor(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "";
  const formatted = valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return formatted.replace(/\d/g, "•");
}

export function maskField(kind: MaskKind, valor: string | number | null | undefined): string {
  if (kind === "valor") return maskValor(typeof valor === "number" ? valor : Number(valor));
  const s = valor === null || valor === undefined ? "" : String(valor);
  if (kind === "documento") return maskDocumento(s);
  if (kind === "telefone") return maskTelefone(s);
  if (kind === "email") return maskEmail(s);
  return maskEndereco(s);
}
