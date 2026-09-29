"use client";

import { LogOut } from "lucide-react";
import { limparRastrosDoAparelho } from "@/lib/filaDoChat";

// O botão Sair. Antes de encerrar a sessão apaga do aparelho todo texto de conversa que ele guardava
// (rascunhos e mensagens ainda não confirmadas): sair é, também, deixar o aparelho limpo.
export default function FormularioDeSair({ action }: { action: () => void | Promise<void> }) {
  return (
    <form action={action} onSubmit={() => limparRastrosDoAparelho()}>
      <button type="submit" className="w-full h-11 flex items-center justify-center gap-2 bg-acao hover:bg-acao-hover text-acao-tx font-extrabold text-sm">
        <LogOut size={16} /> Sair
      </button>
    </form>
  );
}
