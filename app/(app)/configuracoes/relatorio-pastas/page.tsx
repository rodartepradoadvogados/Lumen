import { redirect } from "next/navigation";

// Movido para Conexões > Relatório de pastas (é um relatório do armazenamento conectado).
export default function RelatorioPastasAntigo() {
  redirect("/conexoes/relatorio-pastas");
}
