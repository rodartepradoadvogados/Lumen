import { redirect } from "next/navigation";

// Rota renomeada para /m/financeiro/despesas — mantido como redirect para não quebrar
// favoritos/links antigos.
export default function ContasAPagarRedirect() {
  redirect("/m/financeiro/despesas");
}
