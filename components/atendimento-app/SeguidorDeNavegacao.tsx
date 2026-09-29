"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { registrarCaminho } from "@/components/atendimento-app/historico";
import { devolverTemaDoSite, useTema } from "@/components/atendimento-app/tema";

// Não desenha nada. Registra por onde a pessoa andou (para o "voltar") e mantém o tema em dia (aplica
// a preferência e acompanha o sistema quando é "Automático") em TODAS as telas, inclusive as de tela
// cheia, que não têm o cabeçalho com o botão de tema.
export default function SeguidorDeNavegacao() {
  const pathname = usePathname() || "";
  useEffect(() => {
    registrarCaminho(pathname);
  }, [pathname]);
  useTema();
  useEffect(() => devolverTemaDoSite, []);
  return null;
}
