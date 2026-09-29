import { Lock } from "lucide-react";

// O pé do chat nesta etapa: leitura. O celular ainda NÃO envia mensagem, e a tela diz isso em vez de
// mostrar um campo que não funciona. O caminho real para responder hoje é o computador.
export default function AvisoSemEnvio() {
  return (
    <div
      className="shrink-0 border-t-2 border-regua-forte bg-sf px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      data-caixa-de-resposta-desabilitada=""
    >
      <p className="flex items-start gap-2 text-corpo text-tx-2">
        <Lock size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-tx-3" />
        <span>
          <span className="font-semibold text-tx">Envio pelo celular chega na próxima etapa.</span> Para responder agora, use o Lúmen no computador.
        </span>
      </p>
    </div>
  );
}
