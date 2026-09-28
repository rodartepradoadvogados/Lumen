"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCirclePlus, X, Search } from "lucide-react";
import { buscarContatosParaConversa, iniciarConversaComContato, iniciarConversaComNumero } from "@/lib/actions/attendance";
import type { ContatoConhecido } from "@/lib/quemEEsteNumero";
import { ROTULO_DO_TIPO } from "@/lib/quemEEsteNumero";
import PhoneInput, { type PhoneValue } from "@/components/PhoneInput";
import { DEFAULT_COUNTRY } from "@/lib/countries";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import { hrefDaConversa, type DestinoDaConversa } from "@/lib/conversaDaCentral";

// ============================================================================
// INICIAR CONVERSA — F5.5, item 4, pedido do dono: "colocar para poder iniciar conversa, tanto no
// atendimento como em clientes, advogado, fornecedor, pois eu só consigo responder reativamente".
//
// DUAS ABAS: buscar um contato já cadastrado (cliente, advogado parceiro, fornecedor — nunca
// advogado adverso, ver buscarContatosParaConversa em lib/actions/attendance.ts), ou digitar um
// número que não está em cadastro nenhum. As duas terminam no mesmo lugar: uma primeira mensagem,
// enviada de verdade, que abre (ou retoma) uma conversa na Central de Atendimento.
//
// O AVISO DA JANELA DE 24H FICA NA TELA, NÃO SÓ NO CÓDIGO. Este escritório pode estar na Cloud API
// oficial da Meta ou na Evolution (WhatsApp Web) — ver lib/whatsapp.ts. Na Meta, iniciar contato
// com quem nunca escreveu (ou está fora da janela de 24h da última mensagem dele) exige um modelo
// aprovado, que este projeto não implementa; a tentativa é rejeitada pela própria Graph API, e o
// erro que ela der é o que aparece aqui — nunca um "enviado" fingido. Por isso o aviso abaixo é
// condicional à realidade, não uma promessa.
// ============================================================================

type Aba = "contato" | "numero";

export default function NovaConversaModal({ destino = "classico" }: { destino?: DestinoDaConversa }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [aba, setAba] = useState<Aba>("contato");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, comecar] = useTransition();

  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<ContatoConhecido[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [selecionado, setSelecionado] = useState<ContatoConhecido | null>(null);
  const [mensagemContato, setMensagemContato] = useState("");

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState<PhoneValue>({ ddi: DEFAULT_COUNTRY.ddi, numero: "" });
  const [mensagemNumero, setMensagemNumero] = useState("");

  useEscapeToClose(aberto, () => setAberto(false));

  function fechar() {
    setAberto(false);
    setErro(null);
    setBusca("");
    setAchados([]);
    setSelecionado(null);
    setMensagemContato("");
    setNome("");
    setTelefone({ ddi: DEFAULT_COUNTRY.ddi, numero: "" });
    setMensagemNumero("");
    setAba("contato");
  }

  async function buscar(q: string) {
    setBusca(q);
    setSelecionado(null);
    if (q.trim().length < 2) {
      setAchados([]);
      return;
    }
    setBuscando(true);
    try {
      setAchados(await buscarContatosParaConversa(q));
    } finally {
      setBuscando(false);
    }
  }

  function abrirConversa(id: string) {
    fechar();
    router.push(hrefDaConversa(destino, id));
    router.refresh();
  }

  function enviarParaContato() {
    if (!selecionado || !mensagemContato.trim()) return;
    setErro(null);
    comecar(async () => {
      const r = await iniciarConversaComContato(selecionado.tipo, selecionado.id, mensagemContato);
      if (r.error) {
        setErro(r.error);
        // O atendimento pode ter sido criado mesmo com erro no envio (ver o comentário em
        // lib/actions/attendance.ts) — a pessoa decide se quer abri-lo mesmo assim e tentar de
        // novo pela caixa de resposta comum.
        return;
      }
      if (r.id) abrirConversa(r.id);
    });
  }

  function enviarParaNumero() {
    if (!nome.trim() || !telefone.numero.trim() || !mensagemNumero.trim()) return;
    setErro(null);
    comecar(async () => {
      const r = await iniciarConversaComNumero({ nome, telefone: telefone.numero, ddi: telefone.ddi, mensagem: mensagemNumero });
      if (r.error) {
        setErro(r.error);
        return;
      }
      if (r.id) abrirConversa(r.id);
    });
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-1.5 bg-acao px-3.5 py-2 text-sm font-semibold text-acao-tx transition-colors hover:bg-acao-hover"
      >
        <MessageCirclePlus size={16} /> Iniciar conversa
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-grafite-900/40 p-4">
      <div className="w-full max-w-md bg-sf shadow-pop" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-regua px-5 py-4">
          <h3 className="text-sm font-bold text-tx">Iniciar conversa no WhatsApp</h3>
          <button onClick={fechar} className="text-tx-3 hover:text-tx">
            <X size={18} />
          </button>
        </div>

        <div className="flex border-b border-regua text-xs font-semibold">
          <TabBtn label="Buscar um contato" ativa={aba === "contato"} onClick={() => setAba("contato")} />
          <TabBtn label="Digitar um número" ativa={aba === "numero"} onClick={() => setAba("numero")} />
        </div>

        <div className="p-4">
          {aba === "contato" && (
            <div className="space-y-3">
              {!selecionado ? (
                <>
                  <div className="relative">
                    <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-tx-3" />
                    <input
                      autoFocus
                      value={busca}
                      onChange={(e) => buscar(e.target.value)}
                      placeholder="Nome do cliente, advogado ou fornecedor…"
                      className="w-full border border-regua bg-sf py-2 pl-8 pr-3 text-sm text-tx focus:outline-none focus:ring-2 focus:ring-marca-tx"
                    />
                  </div>
                  {buscando && <p className="text-xs text-tx-3">Buscando…</p>}
                  {!buscando && busca.trim().length >= 2 && achados.length === 0 && (
                    <p className="text-xs text-tx-3">Ninguém com telefone cadastrado e esse nome.</p>
                  )}
                  <div className="max-h-48 space-y-1 overflow-y-auto">
                    {achados.map((c) => (
                      <button
                        key={`${c.tipo}-${c.id}`}
                        type="button"
                        onClick={() => setSelecionado(c)}
                        className="w-full border border-regua bg-sf px-3 py-2 text-left text-sm text-tx transition-colors hover:bg-sf-apoio"
                      >
                        {c.nome}
                        <span className="ml-1.5 text-xs text-tx-3">
                          {ROTULO_DO_TIPO[c.tipo]}
                          {c.detalhe ? ` · ${c.detalhe}` : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between border border-regua bg-sf-apoio px-3 py-2">
                    <div>
                      <p className="text-sm font-semibold text-tx">{selecionado.nome}</p>
                      <p className="text-xs text-tx-3">{ROTULO_DO_TIPO[selecionado.tipo]}</p>
                    </div>
                    <button type="button" onClick={() => setSelecionado(null)} className="text-xs font-semibold text-tx-3 hover:text-tx">
                      Trocar
                    </button>
                  </div>
                  <textarea
                    autoFocus
                    rows={3}
                    value={mensagemContato}
                    onChange={(e) => setMensagemContato(e.target.value)}
                    placeholder={`Escreva a primeira mensagem para ${selecionado.nome.split(" ")[0]}…`}
                    className="w-full resize-none border border-regua bg-sf px-3 py-2 text-sm text-tx focus:outline-none focus:ring-2 focus:ring-marca-tx"
                  />
                  <AvisoDaJanela />
                  <button
                    type="button"
                    onClick={enviarParaContato}
                    disabled={pendente || !mensagemContato.trim()}
                    className="w-full bg-acao px-4 py-2 text-xs font-semibold text-acao-tx transition-colors hover:bg-acao-hover disabled:opacity-50"
                  >
                    {pendente ? "Enviando…" : "Enviar e abrir conversa"}
                  </button>
                </>
              )}
            </div>
          )}

          {aba === "numero" && (
            <div className="space-y-3">
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome da pessoa"
                className="w-full border border-regua bg-sf px-3 py-2 text-sm text-tx focus:outline-none focus:ring-2 focus:ring-marca-tx"
              />
              <PhoneInput name="telefoneNovaConversa" value={telefone} onChange={setTelefone} className="w-full border border-regua bg-sf px-3 py-2 text-sm text-tx" />
              <textarea
                rows={3}
                value={mensagemNumero}
                onChange={(e) => setMensagemNumero(e.target.value)}
                placeholder="Escreva a primeira mensagem…"
                className="w-full resize-none border border-regua bg-sf px-3 py-2 text-sm text-tx focus:outline-none focus:ring-2 focus:ring-marca-tx"
              />
              <AvisoDaJanela />
              <button
                type="button"
                onClick={enviarParaNumero}
                disabled={pendente || !nome.trim() || !telefone.numero.trim() || !mensagemNumero.trim()}
                className="w-full bg-acao px-4 py-2 text-xs font-semibold text-acao-tx transition-colors hover:bg-acao-hover disabled:opacity-50"
              >
                {pendente ? "Enviando…" : "Enviar e abrir conversa"}
              </button>
            </div>
          )}

          {erro && <p className="mt-3 text-xs font-medium text-urgente">{erro}</p>}
        </div>
      </div>
    </div>
  );
}

/** O aviso da janela de 24h — condicional à realidade (ver o cabeçalho do arquivo), nunca uma
 * promessa de que o envio vai funcionar. */
function AvisoDaJanela() {
  return (
    <p className="text-xs text-tx-3">
      Se o WhatsApp deste escritório for o oficial (Meta) e esta pessoa nunca escreveu antes — ou não escreve há mais
      de 24 horas —, o envio pode ser recusado pelo próprio WhatsApp, que exige um modelo aprovado nesse caso. O erro,
      se acontecer, aparece aqui.
    </p>
  );
}

function TabBtn({ label, ativa, onClick }: { label: string; ativa: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 px-2 py-2.5 text-center transition-colors ${
        ativa ? "border-b-2 border-marca-tx text-tx" : "text-tx-3 hover:text-tx"
      }`}
    >
      {label}
    </button>
  );
}
