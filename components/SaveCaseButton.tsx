"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

// Rótulo do botão reage ao campo "type" do mesmo <form> (ouvindo "change" no DOM em vez de virar
// o formulário inteiro num client component): "Salvar Processo" quando o tipo é Judicial ou
// Administrativo (ver lib/caseNatureza.ts — os dois "têm número e tramitam em órgão"), "Salvar
// Caso" para os demais tipos (Extrajudicial/Atendimento/Consultivo). No fluxo administrativo o
// campo é um <input type="hidden"> (NovoCaseNaturezaSection.tsx) em vez do <select> original —
// mudanças nele não disparam "change" nativo, mas como as duas naturezas de processo têm o MESMO
// rótulo aqui, isso nunca chega a importar.
//
// Também ouve "lumen:attachments-uploading" (disparado por NewCaseAttachmentsField.tsx) e
// BLOQUEIA o envio enquanto algum anexo ainda está subindo pro Blob — antes disso só existia um
// texto de aviso ao lado, que não impedia o clique: se o usuário salvasse rápido demais com vários
// anexos ainda em andamento, o caso era criado só com os que já tinham terminado a tempo,
// silenciosamente (bug real relatado: "juntei vários documentos... só subiram 3").
export default function SaveCaseButton({ defaultType }: { defaultType: string }) {
  const [type, setType] = useState(defaultType);
  const [attachmentsUploading, setAttachmentsUploading] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // useFormStatus só funciona em componente descendente do <form> (que este botão sempre é) —
  // cobre o pending do submit "de verdade" (criação do caso, pasta no Drive etc.), que antes só
  // tinha o bloqueio de anexos abaixo: sem isso, o botão ficava clicável de novo durante a
  // submissão inteira, permitindo duplo clique/duplo submit acidental (criar o processo 2x).
  const { pending } = useFormStatus();

  // Publicação de origem (ver LinkPublicationMenu / PublicationRow.tsx): quando o cadastro foi
  // aberto a partir de "Cadastrar novo processo" dentro de uma publicação, a URL traz
  // ?publicationId=... — repassado aqui como campo oculto DENTRO do <form> para que a server
  // action "submit" de app/(app)/processos/novo/page.tsx (arquivo de outro agente) consiga lê-lo
  // via formData.get("publicationId"). Lido de window.location em vez de useSearchParams (que
  // exigiria um <Suspense> ao redor de <SaveCaseButton> na própria page.tsx, também fora de
  // alcance aqui) — só precisa estar pronto a tempo do submit, não da primeira renderização.
  const [publicationId, setPublicationId] = useState("");
  useEffect(() => {
    setPublicationId(new URLSearchParams(window.location.search).get("publicationId") || "");
  }, []);

  useEffect(() => {
    const form = buttonRef.current?.closest("form");
    const select = form?.elements.namedItem("type") as HTMLSelectElement | null;
    if (select) {
      setType(select.value);
      const handleChange = () => setType(select.value);
      select.addEventListener("change", handleChange);
      return () => select.removeEventListener("change", handleChange);
    }
  }, []);

  useEffect(() => {
    const form = buttonRef.current?.closest("form");
    if (!form) return;
    const handleUploading = (e: Event) => setAttachmentsUploading(Boolean((e as CustomEvent).detail?.uploading));
    form.addEventListener("lumen:attachments-uploading", handleUploading);
    return () => form.removeEventListener("lumen:attachments-uploading", handleUploading);
  }, []);

  return (
    <>
      {publicationId && <input type="hidden" name="publicationId" value={publicationId} />}
      <button
        ref={buttonRef}
        type="submit"
        disabled={attachmentsUploading || pending}
        onClick={(e) => {
          if (attachmentsUploading) e.preventDefault();
        }}
        className="w-full bg-acao hover:bg-acao-hover text-acao-tx font-semibold py-2.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {attachmentsUploading
          ? "Enviando anexos..."
          : pending
          ? "Salvando..."
          : type === "JUDICIAL" || type === "ADMINISTRATIVO"
          ? "Salvar Processo"
          : "Salvar Caso"}
      </button>
    </>
  );
}
