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
// A SAÍDA, revisitada em 17/09/2026. O dono: "se eu clico em começar, abre um quadro de criar
// conta ou entrar. Não tem botão de sair ou voltar. Precisa. Só tem o botão na hora efetiva do
// login, e não na tela de cadastro."
//
// Estava certo, e a causa era a saída morar no `rodape` de CADA tela em vez de na casca: /login
// escrevia "← Voltar ao site" no rodapé dela, /cadastro não escrevia, e nada no sistema obrigava.
// O wordmark LÚMEN no topo era link para "/" desde F5, mas um wordmark não se anuncia como botão
// de voltar — ninguém clica numa marca esperando sair.
//
// Agora a saída é da CASCA e fica no alto, à esquerda, onde se procura por um "voltar" — não num
// rodapé abaixo do cartão. Nenhuma tela de sessão pode mais nascer sem ela: para abrir mão é
// preciso dizer `saida={false}` de propósito, e só /escolher faz isso, porque lá a saída correta
// é o logout (a pessoa já entrou; "voltar ao site" seria deixá-la logada num limbo).
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
  saida = true,
  children,
}: {
  titulo: string;
  apoio?: React.ReactNode;
  largura?: "sm" | "md";
  rodape?: React.ReactNode;
  /** `false` só quando a tela tem uma saída própria mais correta — hoje, apenas /escolher. */
  saida?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-sf-fundo flex items-center justify-center p-4">
      <div className={largura === "md" ? "w-full max-w-md" : "w-full max-w-sm"}>
        {/* A SAÍDA — sempre, no alto e à esquerda. Alvo de 44px de altura, como o resto do
            produto. Ver a nota longa acima. */}
        {saida ? (
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 min-h-[44px] -ml-2 px-2 mb-1 text-etiqueta font-semibold uppercase tracking-[.06em] text-tx-2 hover:text-tx transition-colors duration-100 ease-out"
          >
            <span aria-hidden="true">←</span> Voltar ao site
          </Link>
        ) : null}
        {/* A marca também é link para "/", mas é a marca — quem procura a porta procura o botão
            acima, não o logotipo. */}
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
