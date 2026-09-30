import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";

// "Esta tela não está disponível para o seu acesso": o que aparece quando uma tela do app responde 404 (o Funil
// para quem só vê os próprios atendimentos, por exemplo). Uma frase só, sem dizer o que existe ou não: a
// decisão de recusar é da página, que chama notFound() ANTES de qualquer consulta.
export default function TelaIndisponivelNoApp() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-16 text-center">
      <Lock size={36} aria-hidden="true" className="text-atd-terciario" />
      <h1 className="text-guia font-bold text-tx">Tela indisponível</h1>
      <p className="text-corpo text-atd-previa">Esta tela não está disponível para o seu acesso. Se precisar dela, peça a um sócio administrador.</p>
      <Link href="/atendimento-app" className="inline-flex min-h-11 items-center gap-2 rounded-atd-pilula bg-atd-pilula px-5 text-corpo font-semibold text-tx hover:bg-atd-pilula-2">
        <ArrowLeft size={18} aria-hidden="true" /> Voltar às conversas
      </Link>
    </div>
  );
}
