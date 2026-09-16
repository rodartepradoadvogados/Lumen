import clsx from "clsx";

// AVISO — a caixa de recado do sistema. Filete de 2px NO TOPO, nunca na lateral.
//
// O detector acusava treze filetes laterais coloridos de 4px espalhados pelo produto, cada tela
// tendo reinventado a sua caixa de recado com um mapa de tom próprio: Conexões, Perfil,
// Comunicados, Editor de modelo, Chaves de API, Break-glass, Teste do DJEN. Nove eram recado
// avulso — o filete lateral grosso é o antipadrão que a regra da casa já proibia ("cartão usa
// filete só no topo") e que o contrato de direção confirmou ao escolher o canto vivo.
//
// Os outros quatro ficaram como estavam, de propósito, porque ali o filete lateral É o sistema:
// ele codifica a SEVERIDADE de uma linha de fila (DayQueueRow), o ESTADO de um item de lista
// (PublicationsTriage, ConexoesView) — informação que pertence à linha inteira, não a uma caixa.
//
// Regra do sistema que este componente carrega: cor é risco ou é lugar, nunca categoria.
export type TomAviso = "ok" | "atencao" | "perigo" | "neutro";

const FILETE: Record<TomAviso, string> = {
  ok: "border-t-concluido",
  atencao: "border-t-aviso",
  perigo: "border-t-urgente",
  neutro: "border-t-regua-forte",
};

const TEXTO: Record<TomAviso, string> = {
  ok: "text-concluido",
  atencao: "text-aviso",
  perigo: "text-urgente",
  neutro: "text-tx-2",
};

export default function Aviso({
  tom = "neutro",
  className,
  children,
  as: Tag = "div",
}: {
  tom?: TomAviso;
  className?: string;
  children: React.ReactNode;
  as?: "div" | "p";
}) {
  return (
    <Tag className={clsx("bg-sf-apoio border-t-2 px-3 py-2.5 text-corpo", FILETE[tom], className)}>
      {children}
    </Tag>
  );
}

// Cor do TEXTO no mesmo tom do filete, para quando o conteúdo precisa acompanhar o estado.
export function tomTexto(tom: TomAviso): string {
  return TEXTO[tom];
}
