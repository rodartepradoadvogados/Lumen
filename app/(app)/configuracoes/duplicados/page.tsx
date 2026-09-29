import { redirect } from "next/navigation";

// Movido para Pessoas > Duplicados (era uma subpágina órfã de Configurações).
export default function DuplicadosAntigo() {
  redirect("/contatos/duplicados");
}
