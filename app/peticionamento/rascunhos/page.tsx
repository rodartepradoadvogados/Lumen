import { listarRascunhos } from "@/lib/actions/peticionamento";
import { RascunhosClient } from "@/components/peticionamento/RascunhosClient";

export const dynamic = "force-dynamic";

// A LISTA DE RASCUNHOS — especificação §3, "FAÇA ESTE PRIMEIRO": o pop-up de saída (§4) promete
// "nada será perdido e fica na lista de rascunhos" — sem esta tela a promessa é mentira na
// primeira vez que alguém procurar o rascunho e não achar. Corte por escritório obrigatório: a
// própria lib/actions/peticionamento.ts:listarRascunhos já filtra por officeId antes de chegar
// aqui — esta página só renderiza o que a Server Action devolveu.
export default async function RascunhosPage() {
  const rascunhos = await listarRascunhos();
  return <RascunhosClient rascunhos={rascunhos} />;
}
