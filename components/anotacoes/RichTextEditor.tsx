"use client";

import { useEffect, useRef } from "react";
import { Bold, Italic, Underline, List, ListOrdered } from "lucide-react";

// Editor de texto rico minimalista: contentEditable + document.execCommand, sem nenhuma
// dependência nova (ver decisão no relatório da entrega — o projeto não tinha Tiptap/Slate/Quill
// nem nada parecido; para o escopo pedido, negrito/itálico/sublinhado/lista com marcadores/lista
// numerada, isso cobre tudo sem adicionar peso ao bundle). execCommand é formalmente "deprecated"
// mas segue amplamente suportado nos navegadores usados pelo escritório; se algum dia precisar de
// mais que formatação básica (tabelas, imagens inline, colaboração), aí sim vale trazer uma lib.
export default function RichTextEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Sincroniza valor externo -> DOM só quando ele muda por fora do próprio digitar (troca de
  // rascunho ao abrir um segundo, ou reset depois de salvar/cancelar) — nunca a cada tecla,
  // senão o cursor voltaria pro início do texto a cada onInput.
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value || "";
    }
  }, [value]);

  function exec(command: string) {
    ref.current?.focus();
    document.execCommand(command, false);
    onChange(ref.current?.innerHTML ?? "");
  }

  return (
    <div className="rounded-lg border border-regua overflow-hidden bg-sf">
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-regua bg-sf-apoio">
        <ToolbarButton onClick={() => exec("bold")} label="Negrito">
          <Bold size={13} />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec("italic")} label="Itálico">
          <Italic size={13} />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec("underline")} label="Sublinhado">
          <Underline size={13} />
        </ToolbarButton>
        <span className="w-px h-4 bg-sf-apoio mx-1" aria-hidden="true" />
        <ToolbarButton onClick={() => exec("insertUnorderedList")} label="Lista com marcadores">
          <List size={13} />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec("insertOrderedList")} label="Lista numerada">
          <ListOrdered size={13} />
        </ToolbarButton>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={() => onChange(ref.current?.innerHTML ?? "")}
        data-placeholder={placeholder}
        className="anotacao-editor min-h-[110px] max-h-[240px] overflow-y-auto px-2.5 py-2 text-sm text-tx focus:outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-tx-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5"
      />
    </div>
  );
}

function ToolbarButton({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      // Impede o mousedown de tirar o foco/seleção do editor antes do clique — sem isso o
      // execCommand aplicaria a formatação sem nenhum texto selecionado.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={label}
      aria-label={label}
      className="p-1.5 rounded text-tx-2 hover:bg-sf-apoio hover:text-tx transition-colors"
    >
      {children}
    </button>
  );
}
