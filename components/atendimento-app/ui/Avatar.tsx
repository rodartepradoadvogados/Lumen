"use client";

import { useState } from "react";
import { iniciaisDoNome } from "@/lib/conversasDoApp";

// AVATAR do app de Atendimento (acabamento WhatsApp): círculo com as INICIAIS em tom suave
// (tokens --atd-avatar-*). Aceita uma `fotoUrl` opcional e CAI NAS INICIAIS quando ela falta ou
// não carrega. Hoje nenhuma tela passa foto (foto de contato fica para depois): o componente já está pronto.
//
// Decorativo por padrão (`aria-hidden`): o nome da pessoa está escrito ao lado. Passe `rotulo` quando o
// avatar estiver sozinho, e ele vira uma imagem com nome acessível.

export type TamanhoDoAvatar = "sm" | "md" | "lg";

/** Lado em px de cada tamanho: sm 40 (cabeçalho do chat), md 52 (linha da lista), lg 64. */
export const LADO_DO_AVATAR: Record<TamanhoDoAvatar, number> = { sm: 40, md: 52, lg: 64 };

const CLASSE_DO_TAMANHO: Record<TamanhoDoAvatar, string> = {
  sm: "h-10 w-10 text-corpo",
  md: "h-[52px] w-[52px] text-destaque",
  lg: "h-16 w-16 text-guia",
};

export type AvatarProps = {
  nome: string;
  /** Endereço da foto do contato; opcional. Sem ela (ou se falhar), aparecem as iniciais. */
  fotoUrl?: string | null;
  tamanho?: TamanhoDoAvatar;
  /** Nome acessível, quando o avatar aparece sem o nome ao lado. */
  rotulo?: string;
  className?: string;
};

export default function Avatar({ nome, fotoUrl, tamanho = "md", rotulo, className = "" }: AvatarProps) {
  const [falhou, setFalhou] = useState(false);
  const mostrarFoto = Boolean(fotoUrl) && !falhou;
  const acessibilidade = rotulo ? ({ role: "img", "aria-label": rotulo } as const) : ({ "aria-hidden": true } as const);
  return (
    <span
      data-avatar=""
      className={`flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-atd-avatar font-semibold text-atd-avatar-tx ${CLASSE_DO_TAMANHO[tamanho]} ${className}`}
      {...acessibilidade}
    >
      {mostrarFoto ? (
        // eslint-disable-next-line @next/next/no-img-element -- foto de contato de origem externa, sem otimização de imagem
        <img src={fotoUrl as string} alt="" className="h-full w-full object-cover" loading="lazy" onError={() => setFalhou(true)} />
      ) : (
        iniciaisDoNome(nome)
      )}
    </span>
  );
}
