"use client";

import { LogOut } from "lucide-react";
import { limparRastrosDoAparelho } from "@/lib/filaDoChat";

// O botão Sair. Antes de encerrar a sessão apaga do aparelho todo texto de conversa que ele guardava
// (rascunhos e mensagens ainda não confirmadas): sair é, também, deixar o aparelho limpo.
export default function FormularioDeSair({ action }: { action: () => void | Promise<void> }) {
  return (
    <form action={action} onSubmit={() => limparRastrosDoAparelho()}>
      <button type="submit" className="flex min-h-11 w-full items-center justify-center gap-2 rounded-atd-pilula bg-acao text-corpo font-bold text-acao-tx hover:bg-acao-hover active:opacity-90">
        <LogOut size={16} aria-hidden="true" /> Sair
      </button>
    </form>
  );
}
