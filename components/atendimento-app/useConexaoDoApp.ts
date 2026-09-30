"use client";

import { useSyncExternalStore } from "react";
import { assinarConexao, estaSemConexao } from "@/lib/conexaoDoApp";

/** `true` enquanto o app está sem conexão (navegador offline ou última chamada falhou por rede). No servidor: `false`. */
export function useSemConexao(): boolean {
  return useSyncExternalStore(assinarConexao, estaSemConexao, () => false);
}
