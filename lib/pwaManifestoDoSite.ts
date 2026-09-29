import { headers } from "next/headers";
import { ehAparelhoMovel } from "@/lib/pwaApps";

// Manifesto a oferecer nas rotas do SITE (raiz do domínio). O PWA do site tem escopo "/", que
// engloba /m e /atendimento-app; por isso só é oferecido em computador. Em celular/tablet devolve
// `undefined` e a rota herda o manifesto padrão do layout raiz (app mobile, escopo "/m") — no
// Android um WebAPK de escopo "/" captura os links dos outros dois apps e o Chrome passa a dizer
// que "já existe outro" ao instalar o segundo. Só pode ser chamada em rota dinâmica (lê headers()).
//
// Devolve um objeto para espalhar no metadata ({} em aparelho móvel): passar `manifest: undefined`
// explícito APAGARIA o manifesto herdado (o Next zera a chave presente com valor vazio).
export function comManifestoDoSite(): { manifest?: string } {
  return ehAparelhoMovel(headers().get("user-agent")) ? {} : { manifest: "/manifest-desktop.webmanifest" };
}
