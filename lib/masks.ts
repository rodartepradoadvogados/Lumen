// Máscaras de formatação para campos brasileiros comuns — aplicadas a cada tecla digitada
// (ver components/MaskedInput.tsx), então o valor exibido E salvo já vem pontuado. Todos os
// usos existentes desses campos (CPF/CNPJ do cliente/fornecedor, telefone) só exibem a string
// como veio — nenhum código depende de vir só dígitos — então adicionar pontuação é seguro.

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function maskCPF(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length > 9) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{1,2})$/, "$1.$2.$3-$4");
  if (d.length > 6) return d.replace(/^(\d{3})(\d{3})(\d{1,3})$/, "$1.$2.$3");
  if (d.length > 3) return d.replace(/^(\d{3})(\d{1,3})$/, "$1.$2");
  return d;
}

export function maskCNPJ(value: string): string {
  const d = onlyDigits(value).slice(0, 14);
  if (d.length > 12) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{1,2})$/, "$1.$2.$3/$4-$5");
  if (d.length > 8) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{1,4})$/, "$1.$2.$3/$4");
  if (d.length > 5) return d.replace(/^(\d{2})(\d{3})(\d{1,3})$/, "$1.$2.$3");
  if (d.length > 2) return d.replace(/^(\d{2})(\d{1,3})$/, "$1.$2");
  return d;
}

// CPF (pessoa física, 11 dígitos) ou CNPJ (pessoa jurídica, 14) no mesmo campo — troca de
// máscara sozinho assim que a pessoa digita mais de 11 dígitos. Usado nos campos genéricos
// "CPF/CNPJ" de Cliente/Fornecedor, que não têm um seletor PF/PJ separado.
export function maskCpfCnpj(value: string): string {
  return onlyDigits(value).length > 11 ? maskCNPJ(value) : maskCPF(value);
}

export function maskCEP(value: string): string {
  const d = onlyDigits(value).slice(0, 8);
  if (d.length > 5) return d.replace(/^(\d{5})(\d{1,3})$/, "$1-$2");
  return d;
}

// Celular (11 dígitos, com o 9º dígito) ou fixo (10) — troca de máscara sozinho conforme a
// quantidade de dígitos digitados.
export function maskPhone(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length > 10) return d.replace(/^(\d{2})(\d{5})(\d{1,4})$/, "($1) $2-$3");
  if (d.length > 6) return d.replace(/^(\d{2})(\d{4})(\d{1,4})$/, "($1) $2-$3");
  if (d.length > 2) return d.replace(/^(\d{2})(\d{1,4})$/, "($1) $2");
  if (d.length > 0) return `(${d}`;
  return d;
}
