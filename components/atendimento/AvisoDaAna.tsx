import { AlertTriangle, Clock } from "lucide-react";
import { dataDeBrasilia } from "@/lib/horaDeBrasilia";

// ============================================================================
// O QUE A ANA DEIXOU PARA UMA PESSOA DECIDIR.
//
// Dois avisos, e eles não são a mesma coisa — a tela precisa deixar isso claro porque a diferença
// é quem age em seguida:
//
//   A PROPOSTA DE RECUSA pede DECISÃO de gente. A Ana achou que o escritório não deveria pegar o
//   caso, mas não estava autorizada a encerrar, então transferiu e escreveu o porquê. O texto é
//   interno: nunca foi para o cliente, e a tela diz isso com todas as letras — senão alguém copia
//   a frase para o WhatsApp achando que o cliente já a leu.
//
//   A ESPERA DE DOCUMENTO não pede decisão nenhuma. É o atendimento guardado até uma data,
//   esperando papel. Está aqui só para ninguém achar que o caso parou por descuido.
//
// A PROPOSTA VEM PRIMEIRO e com mais peso, porque é a única das duas em que alguém precisa fazer
// alguma coisa.
// ============================================================================

export default function AvisoDaAna({
  proposta,
  propostaEm,
  documentoAte,
  documentoPendente,
  fuso,
}: {
  proposta: string | null;
  propostaEm: Date | null;
  documentoAte: Date | null;
  documentoPendente: string | null;
  /** Opcional: sem ele vale o fuso do escritório, que é o que estas duas telas já usam. */
  fuso?: string;
}) {
  if (!proposta && !documentoAte) return null;

  return (
    <div className="flex flex-col gap-2">
      {proposta && (
        <div className="flex items-start gap-2.5 border-l-[3px] border-acao bg-acao-bg px-4 py-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-marca-tx" />
          <div className="min-w-0">
            <p className="text-corpo font-semibold text-tx">
              A atendente propôs recusar este caso — quem decide é você
            </p>
            <p className="mt-1 text-corpo leading-snug text-tx-2">{proposta}</p>
            <p className="mt-1 text-etiqueta text-tx-3">
              Nota interna, escrita pela atendente{propostaEm ? ` em ${dataDeBrasilia(propostaEm, fuso)}` : ""}. O
              cliente não leu isto.
            </p>
          </div>
        </div>
      )}

      {documentoAte && (
        <div className="flex items-start gap-2.5 border-l-[3px] border-aviso bg-sf-apoio px-4 py-3">
          <Clock size={16} className="mt-0.5 shrink-0 text-aviso" />
          <div className="min-w-0">
            <p className="text-corpo font-semibold text-tx">
              Esperando documento até {dataDeBrasilia(documentoAte, fuso)}
            </p>
            {documentoPendente && <p className="mt-0.5 text-corpo leading-snug text-tx-2">{documentoPendente}</p>}
            <p className="mt-1 text-etiqueta text-tx-3">
              Isto não é recusa: o caso está guardado esperando o papel, e continua na fila.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
