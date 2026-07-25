import { redirect } from "next/navigation";

// Rota renomeada para /financeiro/receitas — mantido como redirect para não quebrar
// favoritos/links antigos.
export default function ContasAReceberRedirect() {
  redirect("/financeiro/receitas");
}
