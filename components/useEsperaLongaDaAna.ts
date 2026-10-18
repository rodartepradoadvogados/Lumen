"use client";

import { useEffect, useState } from "react";
import { ESPERA_LONGA_DA_ANA_MS } from "@/lib/esperaDaAna";

/**
 * `true` quando a ação já passou de ESPERA_LONGA_DA_ANA_MS esperando. Zera sozinho quando `ativa` volta a ser falso
 * (a próxima tentativa recomeça a contagem), e limpa o relógio ao desmontar — nenhum timer sobra se o diálogo fecha.
 */
export function useEsperaLongaDaAna(ativa: boolean): boolean {
  const [longa, setLonga] = useState(false);
  useEffect(() => {
    if (!ativa) {
      setLonga(false);
      return;
    }
    const relogio = setTimeout(() => setLonga(true), ESPERA_LONGA_DA_ANA_MS);
    return () => clearTimeout(relogio);
  }, [ativa]);
  return longa;
}
