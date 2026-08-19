import { Lock } from "lucide-react";
import { maskField, type MaskKind } from "@/lib/mask";

// Documento 07 (Fase 4 — Privacidade e LGPD): mascara CPF/CNPJ/telefone/endereço/e-mail/valor por
// padrão, para toda a equipe, inclusive admin — "quem tem o dado na mão é quem precisa dele para
// o ato". Server Component de propósito: `valor` (o dado cru) só existe durante a renderização no
// servidor — o HTML que chega ao navegador já sai com a máscara aplicada, nunca com o valor
// completo escondido por CSS/JS (que continuaria inspecionável pelo devtools).
//
// Revelação (break-glass: motivo obrigatório, expira em 15 minutos, grava AuditEvent) é a PRÓXIMA
// PR desta fase (documento 07) — por enquanto este componente só mascara, sempre, para todo
// mundo, sem exceção de cargo. Quando o break-glass existir, a decisão entre mascarado/revelado
// passa a considerar se há uma revelação ativa para quem está vendo a tela; até lá, usar
// <Sensivel> em qualquer tela já deixa o dado protegido, mesmo sem a revelação ainda funcionar.
export default function Sensivel({
  campo,
  valor,
  className,
}: {
  campo: MaskKind;
  valor: string | number | null | undefined;
  className?: string;
}) {
  if (valor === null || valor === undefined || valor === "") return null;
  return (
    <span className={`inline-flex items-center gap-1 tabular-nums ${className ?? ""}`}>
      <Lock size={11} className="text-tx-3 shrink-0" aria-hidden />
      {maskField(campo, valor)}
    </span>
  );
}
