import Link from "next/link";
import LumenMark from "@/components/LumenMark";

// Casca única das quatro telas de sessão: /login, /cadastro, /escolher e /redefinir-senha.
//
// O que ela corrige, medido no diagnóstico de 2026-09-16: as quatro eram quatro produtos
// diferentes na mesma porta.
//
//   fundo    · /cadastro vinha em `bg-grafite-800` (escuro) e as outras três em papel — a tela do
//              DINHEIRO era a única que invertia o tema das vizinhas;
//   cartão   · `shadow-modal` sem borda · filete só no topo · borda de 2px · borda de 1px COM
//              sombra. Quatro tratamentos em quatro telas;
//   título   · `text-lg font-semibold` em duas, `text-guia font-bold` numa, e /escolher não tinha
//              `<h1>` nenhum — o mesmo defeito de navegação por títulos que a auditoria achou em
//              /login;
//   marca    · presente em duas de quatro. Quem caía em /cadastro por um link não tinha como
//              saber de que produto era a conta que estava criando, nem como voltar;
//   saída    · presente em duas de quatro.
//
// A sombra sai das duas telas que a tinham. Havia um comentário em /redefinir-senha defendendo-a
// ("cartão sobre fundo vazio: aqui a sombra é legítima"), e o argumento era razoável quando foi
// escrito. Deixou de ser em F3, quando a casa trocou elevação por filete de 2px e removeu
// `box-shadow` do produto inteiro: um cartão que é a ÚNICA coisa na tela não precisa reivindicar
// altura sobre nada.
//
// O título mora na GUIA, não numa linha dentro do cartão. A guia é a aba da gaveta — a assinatura
// formal do sistema (`.guia-ficha`) — e aqui ela carrega dado de verdade: diz qual porta o
// visitante abriu. Um `<h1>` separado dentro do cartão seria a mesma frase dita duas vezes.
export default function TelaSessao({
  titulo,
  apoio,
  largura = "sm",
  rodape,
  children,
}: {
  titulo: string;
  apoio?: React.ReactNode;
  largura?: "sm" | "md";
  rodape?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-sf-fundo flex items-center justify-center p-4">
      <div className={largura === "md" ? "w-full max-w-md" : "w-full max-w-sm"}>
        {/* A marca é link para "/" em todas as quatro — é a porta de volta que /cadastro e
            /redefinir-senha não tinham. */}
        <Link href="/" className="flex items-center gap-2 mb-8 justify-center">
          <LumenMark size={30} />
          <span className="font-extrabold text-xl tracking-[.16em] text-tx">LÚMEN</span>
        </Link>
        <h1 className="guia-sessao text-destaque font-extrabold text-tx">{titulo}</h1>
        <div className="bg-sf border-2 border-regua-forte rounded-[2px] p-6">
          {apoio ? <p className="text-corpo text-tx-2 mb-5">{apoio}</p> : null}
          {children}
        </div>
        {rodape ? <div className="mt-5 text-center">{rodape}</div> : null}
      </div>
    </div>
  );
}
