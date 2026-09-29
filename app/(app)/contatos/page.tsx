import { redirect } from "next/navigation";

// "Pessoas" abre direto em Clientes. O hub de quatro cartões que morava aqui custava um clique
// em toda entrada e deixava 40% da tela vazia; as quatro listas (e Duplicados) são guias.
// A ROTA /contatos continua existindo — quem tem o endereço salvo cai em Clientes.
export default function ContatosPage() {
  redirect("/contatos/clientes");
}
