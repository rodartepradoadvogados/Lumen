import { redirect } from "next/navigation";
import { exigirAcessoAoAtendimentoNaTela } from "@/lib/guardaDoAtendimento";
import { BASE_DO_APP } from "@/lib/navegacaoDoAtendimentoApp";

export const dynamic = "force-dynamic";

// A lista de conversas virou a tela inicial (/atendimento-app). Este endereço só existe para não
// quebrar atalho antigo.
export default async function ConversasAntigaPage() {
  await exigirAcessoAoAtendimentoNaTela();
  redirect(BASE_DO_APP);
}
