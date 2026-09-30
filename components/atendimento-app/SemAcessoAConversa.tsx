import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ATENDIMENTO_DE_OUTRA_PESSOA } from "@/lib/acessoAtendimento";

// "Sem acesso a esta conversa": para o id que não existe, é de outro escritório ou não foi repassado
// a quem pediu — uma frase só para os três casos (distinguir diria a quem está de fora que o id
// existe). NENHUM dado do lead chega aqui: nome, número e mensagens nem foram lidos do banco.
export default function SemAcessoAConversa() {
  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-atd-tela">
      <main className="flex w-full max-w-md flex-col justify-center gap-4 px-6 text-center">
        <h1 className="text-guia font-bold text-tx">Sem acesso a esta conversa</h1>
        <p className="text-corpo text-atd-previa">{ATENDIMENTO_DE_OUTRA_PESSOA}</p>
        <Link
          href="/atendimento-app"
          className="mx-auto inline-flex min-h-11 items-center gap-2 rounded-atd-pilula bg-atd-pilula px-5 text-corpo font-semibold text-tx hover:bg-atd-pilula-2"
        >
          <ArrowLeft size={18} aria-hidden="true" /> Voltar às conversas
        </Link>
      </main>
    </div>
  );
}
