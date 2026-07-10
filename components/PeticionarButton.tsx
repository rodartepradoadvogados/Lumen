import { FileEdit } from "lucide-react";
import { PETICIONAR_URL } from "@/lib/constants";

export default function PeticionarButton({ compact }: { compact?: boolean }) {
  return (
    <a
      href={PETICIONAR_URL}
      target="_blank"
      rel="noopener noreferrer"
      title="Abre o timbrado do escritório no Google Docs para peticionar"
      className={
        compact
          ? "flex items-center gap-1 text-[11px] font-semibold text-gold-800 hover:text-gold-900 px-2.5 py-1 rounded-lg bg-gold-500/10 hover:bg-gold-500/20"
          : "hidden sm:flex items-center gap-1.5 bg-gold-600 hover:bg-gold-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
      }
    >
      <FileEdit size={compact ? 12 : 16} /> Peticionar
    </a>
  );
}
