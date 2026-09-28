"use client";

import { useState } from "react";
import WhatsappConfigForm from "@/components/WhatsappConfigForm";
import ConexaoEvolution from "@/components/whatsapp/ConexaoEvolution";

// ============================================================================
// OS DOIS CAMINHOS DO WHATSAPP, UM DO LADO DO OUTRO.
//
// A escolha não é de gosto, é de circunstância: um número que já está preso a outra conta da Meta
// — campanhas, por exemplo — não entra na Cloud API, e não há botão que resolva. Por isso a tela
// diz para QUEM serve cada caminho, em vez de só listar dois nomes técnicos que não significam
// nada para quem está tentando ligar o WhatsApp do escritório.
//
// E DIZ O PREÇO DO CAMINHO DO QR, aqui, antes de o escritório escolher. Conectar pelo QR é ler o
// WhatsApp Web por fora da Meta: é contra os termos de uso, e o risco real é o número ser banido.
// Esconder isso numa nota de rodapé seria vender uma decisão sem contar o que ela custa.
// ============================================================================

type Caminho = "META" | "EVOLUTION";

export default function ConexaoWhatsapp({
  providerAtual,
  metaConectado,
  evolutionConfigurado,
  displayPhone,
  endereco,
}: {
  providerAtual: string | null;
  metaConectado: boolean;
  evolutionConfigurado: boolean;
  displayPhone: string | null;
  endereco: string | null;
}) {
  const [caminho, setCaminho] = useState<Caminho>(providerAtual === "EVOLUTION" ? "EVOLUTION" : "META");

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <BotaoDeCaminho
          ativo={caminho === "META"}
          onClick={() => setCaminho("META")}
          titulo="Pela Meta (oficial)"
          detalhe="Exige o número cadastrado no Business Manager."
        />
        <BotaoDeCaminho
          ativo={caminho === "EVOLUTION"}
          onClick={() => setCaminho("EVOLUTION")}
          titulo="Lendo um QR code"
          detalhe="Para o número que a Meta não aceita."
        />
      </div>

      {caminho === "META" ? (
        <WhatsappConfigForm connected={metaConectado} displayPhone={displayPhone} />
      ) : (
        <>
          <p className="border-l-[3px] border-aviso text-aviso bg-sf-apoio px-3 py-2 text-etiqueta">
            <strong>Antes de escolher este caminho:</strong> conectar por QR é usar o WhatsApp Web por fora da Meta. É contra os
            termos de uso do WhatsApp, e o risco real — ainda que incomum em uso normal — é o número ser banido, sem aviso e sem
            recurso. Responder quem escreveu raramente é atingido; disparo em massa é.
          </p>
          <ConexaoEvolution configurado={evolutionConfigurado} displayPhone={displayPhone} endereco={endereco} />
        </>
      )}
    </div>
  );
}

function BotaoDeCaminho({
  ativo,
  onClick,
  titulo,
  detalhe,
}: {
  ativo: boolean;
  onClick: () => void;
  titulo: string;
  detalhe: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`text-left px-3 py-2 border rounded-md transition-colors ${
        ativo ? "border-marca bg-marca-bg text-marca-tx" : "border-regua text-tx-2 hover:border-marca"
      }`}
    >
      <span className="block text-xs font-semibold">{titulo}</span>
      <span className="block text-etiqueta text-tx-3">{detalhe}</span>
    </button>
  );
}
