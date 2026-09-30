"use client";

import { useEffect } from "react";
import { WifiOff } from "lucide-react";
import { ENDERECO_DA_SONDA, INTERVALO_DA_SONDA_MS, registrarFalhaDeRede, registrarRedeOk } from "@/lib/conexaoDoApp";
import { useSemConexao } from "@/components/atendimento-app/useConexaoDoApp";

// A FAIXA DISCRETA "Sem conexão". Fica logo abaixo do cabeçalho de cada tela (abas, conversa, Detalhes e Novo) e some sozinha ao voltar.
// Enquanto está visível, sonda a cada 8 s um arquivo estático (o ícone: nenhum dado) para descobrir que a rede
// voltou mesmo quando o navegador não avisa (Wi-Fi sem internet). Fora disso não faz nenhuma chamada.
export default function FaixaSemConexao() {
  const sem = useSemConexao();

  useEffect(() => {
    if (!sem) return;
    let vivo = true;
    const sondar = async () => {
      try {
        await fetch(`${ENDERECO_DA_SONDA}?sonda=${Date.now()}`, { cache: "no-store", method: "HEAD" });
        if (vivo && navigator.onLine !== false) registrarRedeOk();
      } catch {
        if (vivo) registrarFalhaDeRede();
      }
    };
    const t = window.setInterval(sondar, INTERVALO_DA_SONDA_MS);
    return () => {
      vivo = false;
      window.clearInterval(t);
    };
  }, [sem]);

  if (!sem) return null;
  return (
    <div role="status" aria-live="polite" data-faixa-sem-conexao="" className="flex min-h-8 shrink-0 items-center justify-center gap-2 bg-atd-pilula-2 px-4 py-1 text-app-meta font-semibold text-atd-tinta">
      <WifiOff size={14} aria-hidden="true" />
      <span>Sem conexão. Mensagens enviadas agora esperam a internet voltar.</span>
    </div>
  );
}
