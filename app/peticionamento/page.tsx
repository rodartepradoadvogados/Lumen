import { getCurrentUser } from "@/lib/currentUser";
import { contarRascunhos } from "@/lib/actions/peticionamento";
import { EntradaClient } from "@/components/peticionamento/EntradaClient";
import { MenuPeticionamento } from "@/components/peticionamento/MenuPeticionamento";

export const dynamic = "force-dynamic";

// A TELA INICIAL — especificação §1 da adequação de 21/09/2026: "passo zero", "PETICIONAMENTO"
// grande e centralizado, com um botão Iniciar no meio; só depois do Iniciar é que se vai para a
// escolha do tipo de peça (§7). "O Menu já aparece nesta tela" — inclusive aqui, no passo zero.
export default async function PeticionamentoEntrada() {
  const user = await getCurrentUser();
  const rascunhosCount = user ? await contarRascunhos() : 0;

  return (
    <div className="entry">
      <div className="entry-top">
        <MenuPeticionamento rascunhosCount={rascunhosCount} />
      </div>

      <div className="entry-center">
        <h1 className="title">Peticionamento</h1>
        <p className="scope-line">
          Minuta em rascunho, redigida por inteligência artificial a partir do contexto que você escolher. <strong>Nunca protocolada por aqui</strong> —
          protocolar continua sendo ato seu.
        </p>
        <EntradaClient temRascunhos={rascunhosCount > 0} />
      </div>

      <div />
      <div className="entry-foot">
        <span>
          <span className="dot" style={{ display: "inline-block" }} /> Rodarte Prado Advogados · Lúmen
        </span>
        <span className="quiet">{user ? `${user.name}${user.oab ? ` · OAB ${user.oab}` : ""}` : ""}</span>
      </div>
    </div>
  );
}
