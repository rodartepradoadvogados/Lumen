"use client";

import { logout } from "@/lib/actions/auth";
import { encerrarAssistenteLocal } from "@/lib/assistenteSessaoCliente";

// Ilha client para telas server (como /escolher): o logout é Server Action e não alcança o
// sessionStorage do navegador. Aqui, antes de sair, a Antonella desta aba é esquecida — a
// regra da casa: quem faz logout perde o chat, quem só minimiza não perde.

export default function FormSairEsquecendoAntonella({
  texto = "Sair",
  classNameBotao,
}: {
  texto?: string;
  classNameBotao: string;
}) {
  return (
    <form
      action={async () => {
        encerrarAssistenteLocal();
        await logout();
      }}
    >
      <button type="submit" className={classNameBotao}>
        {texto}
      </button>
    </form>
  );
}
