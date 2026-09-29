// Carregando a conversa: esqueleto de balões dentro do cabeçalho que já está na tela. `aria-busy` e
// texto para leitor de tela; sem animação quando a pessoa pediu menos movimento (motion-safe).
export default function CarregandoConversa() {
  const balao = "h-14 rounded-[2px] border border-regua bg-atd-bolha-in motion-safe:animate-pulse";
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 py-4" aria-busy="true">
      <p className="sr-only" role="status">
        Carregando a conversa
      </p>
      <div className={`${balao} w-3/5`} />
      <div className={`${balao} ml-auto w-2/3 bg-atd-bolha-out`} />
      <div className={`${balao} w-1/2`} />
      <div className={`${balao} ml-auto w-3/5 bg-atd-bolha-out`} />
    </div>
  );
}
