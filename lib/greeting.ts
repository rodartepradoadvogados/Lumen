// Saudação por período do dia (bom dia/boa tarde/boa noite) — mesma lógica usada em
// app/m/page.tsx (função `greeting()` local), extraída aqui para poder ser reaproveitada
// pelo Painel do desktop sem duplicar a regra nem editar o arquivo do mobile.
export function getGreeting(date: Date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

// Primeiro nome a partir do nome completo do usuário — mesmo recorte usado em
// app/m/page.tsx (`user?.name.split(" ")[0]`).
export function getFirstName(fullName?: string | null): string {
  if (!fullName) return "";
  return fullName.split(" ")[0];
}
