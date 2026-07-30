"use client";

import { useEffect, useRef, useState } from "react";

// Rótulo do botão reage ao <select name="type"> do mesmo <form> (ouvindo "change" no DOM em
// vez de virar o formulário inteiro num client component): "Salvar Processo" quando o tipo é
// Judicial, "Salvar Caso" para os demais tipos (Extrajudicial/Atendimento/Consultivo).
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
    <button
      ref={buttonRef}
      type="submit"
      disabled={attachmentsUploading}
      onClick={(e) => {
        if (attachmentsUploading) e.preventDefault();
      }}
      className="w-full bg-gold-600 hover:bg-gold-700 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {attachmentsUploading ? "Enviando anexos..." : type === "JUDICIAL" ? "Salvar Processo" : "Salvar Caso"}
    </button>
  );
}
