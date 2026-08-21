"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useTabClick } from "@/lib/hooks/useTabClick";

// <Link> que também entende duplo clique: um clique navega normal (troca a view Principal), dois
// cliques dentro da janela de tempo abrem a rota como guia interna nova (ver
// lib/hooks/useTabClick.ts e components/GuiasBar.tsx). `label` é o nome que a guia leva quando
// aberta assim — para uma entidade dinâmica (nome de processo, de cliente etc.), passe o próprio
// texto visível do link; para uma rota estática, o nome que já apareceria na barra de guias.
export default function TabLink({
  href,
  label,
  children,
  className,
}: {
  href: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const onClick = useTabClick(href, label);
  return (
    <Link href={href} onClick={onClick} className={className}>
      {children}
    </Link>
  );
}
