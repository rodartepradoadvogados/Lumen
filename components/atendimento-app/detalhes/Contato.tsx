"use client";

import { useState } from "react";
import { ExternalLink, UserRound, Briefcase, Scale, Truck } from "lucide-react";
import { nomeDaLinha } from "@/lib/rotulosDaEspera";
import { enderecoDoContato, ROTULO_DO_TIPO, TIPOS_PARA_CADASTRAR, telefoneLegivel, type TipoDeContato } from "@/lib/quemEEsteNumero";
import { nomeEhTemporario } from "@/lib/nomeTemporarioDoLead";
import { attendanceStatusLabels } from "@/lib/atendimentoStatus";
import { stageLabels } from "@/lib/funil";
import { cadastrarContatoDoAtendimento, definirNomeDoLead } from "@/lib/actions/contatoDoAtendimento";
import { Avatar } from "../ui";
import { Gaveta, Campo, cx, useRodar } from "./base";
import type { PropsDosDetalhes } from "./tipos";

const ICONE: Record<TipoDeContato, typeof UserRound> = { cliente: UserRound, advogado: Scale, fornecedor: Truck, equipe: Briefcase };

// O CARTÃO DE QUEM É — topo da aba. Nome, número, fase e situação (duas coisas, com nomes diferentes) e "Quem é
// este número": se está na agenda do escritório, ou os três botões de cadastrar (cliente, advogado, fornecedor)
// e, quando o nome ainda é o temporário do WhatsApp, "Definir o nome do contato". As ações são as do site
// (lib/actions/contatoDoAtendimento.ts), com o recorte de acesso.
export default function Contato({
  p,
  nomeAberto,
  aoMudarNomeAberto,
}: {
  p: PropsDosDetalhes;
  nomeAberto: boolean;
  aoMudarNomeAberto: (aberto: boolean) => void;
}) {
  const c = p.conversa;
  const { rodar, pendente } = useRodar();
  const [cadastrar, setCadastrar] = useState<TipoDeContato | null>(null);
  const [nome, setNome] = useState("");
  const [erroDoNome, setErroDoNome] = useState<string | null>(null);

  const temporario = nomeEhTemporario(c.clientName);
  const exibido = nomeDaLinha(c.clientName, p.telefone);
  const ana = c.agenteSilenciado ? "Atendimento humano" : c.agenteResponde ? "Ana responde aqui" : "Sem atendente automático";
  const adverso = p.contato?.tipo === "advogado" && (p.contato.detalhe || "").startsWith("Advogado adverso");
  const Icone = p.contato ? ICONE[p.contato.tipo] : UserRound;

  async function confirmarCadastro() {
    if (!cadastrar) return;
    const r = await rodar({
      fazer: () => cadastrarContatoDoAtendimento(c.id, cadastrar),
      ok: `Cadastrado como ${ROTULO_DO_TIPO[cadastrar].toLowerCase()} na agenda do escritório.`,
    });
    if (r.ok) setCadastrar(null);
  }

  async function salvarNome() {
    setErroDoNome(null);
    const r = await rodar({ fazer: () => definirNomeDoLead(c.id, nome), ok: `Nome definido: ${nome.trim()}.` });
    if (r.ok) aoMudarNomeAberto(false);
    else setErroDoNome(r.error ?? "Não foi possível salvar.");
  }

  return (
    <section aria-label="Contato" className="mx-4 mt-4" data-bloco-contato="">
      <div className="flex items-center gap-4 px-1">
        {temporario ? (
          <span aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-atd-avatar text-atd-avatar-tx">
            <UserRound size={28} />
          </span>
        ) : (
          <Avatar nome={exibido} tamanho="lg" />
        )}
        <div className="min-w-0">
          <p className="break-words text-destaque font-bold leading-tight text-tx">{exibido}</p>
          <p className="mt-0.5 break-words text-corpo text-atd-previa">{p.telefone ? telefoneLegivel(p.telefone) : "sem telefone"}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5 px-1">
        <span className={cx.chip}>Fase: {stageLabels[c.stage] ?? stageLabels.NOVO}</span>
        <span className={cx.chip}>Situação: {attendanceStatusLabels[c.status] ?? c.status}</span>
        <span className={cx.chip}>{ana}</span>
      </div>

      <div className={`mt-3 p-4 ${cx.cartao}`}>
        <p className={`mb-1.5 ${cx.etiqueta}`}>Quem é este número</p>
        {p.contato ? (
          <div className="flex items-start gap-2.5">
            <Icone size={18} aria-hidden="true" className={`mt-1 shrink-0 ${adverso ? "text-urgente" : "text-atd-previa"}`} />
            <div className="min-w-0">
              <p className="break-words text-corpo font-semibold text-tx">{p.contato.nome}</p>
              <p className={`text-corpo ${adverso ? "font-semibold text-urgente" : "text-atd-previa"}`}>{p.contato.detalhe || ROTULO_DO_TIPO[p.contato.tipo]}</p>
              <a href={enderecoDoContato(p.contato)} target="_blank" rel="noopener noreferrer" className={`${cx.discreto} -ml-3`}>
                <ExternalLink size={16} aria-hidden="true" /> Abrir a ficha no site <span className="sr-only">(abre em outra aba)</span>
              </a>
            </div>
          </div>
        ) : !p.telefone ? (
          <p className="text-corpo text-atd-previa">Este atendimento não tem telefone registrado. Sem telefone não há o que cadastrar.</p>
        ) : (
          <>
            <p className="text-corpo text-atd-previa">Este número não está na agenda do escritório.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {TIPOS_PARA_CADASTRAR.map((t) => (
                <button key={t} type="button" onClick={() => setCadastrar(t)} className={cx.secundario}>
                  + {ROTULO_DO_TIPO[t]}
                </button>
              ))}
            </div>
          </>
        )}
        {temporario && (
          <button
            type="button"
            onClick={() => {
              setNome("");
              setErroDoNome(null);
              aoMudarNomeAberto(true);
            }}
            className={`${cx.primario} mt-3`}
          >
            Definir o nome do contato
          </button>
        )}
      </div>

      <Gaveta
        aberta={cadastrar !== null}
        aoFechar={() => setCadastrar(null)}
        titulo={cadastrar ? `Cadastrar como ${ROTULO_DO_TIPO[cadastrar].toLowerCase()}` : ""}
        rodape={
          <>
            <button type="button" className={cx.secundario} onClick={() => setCadastrar(null)}>
              Cancelar
            </button>
            <button type="button" className={`${cx.primario} flex-1`} disabled={pendente} onClick={confirmarCadastro}>
              {pendente ? "Cadastrando…" : "Cadastrar"}
            </button>
          </>
        }
      >
        <p className="text-corpo text-tx">
          Vai criar o cadastro de <strong>{exibido}</strong>
          {p.telefone ? ` (${telefoneLegivel(p.telefone)})` : ""} na agenda do escritório, só com nome e telefone. O resto se completa na ficha, no site.
        </p>
        {temporario && <p className={`mt-2 ${cx.dica}`}>O nome ainda é o temporário do WhatsApp. Se quiser, defina o nome de quem é antes de cadastrar.</p>}
      </Gaveta>

      <Gaveta
        aberta={nomeAberto}
        aoFechar={() => aoMudarNomeAberto(false)}
        titulo="Definir o nome do contato"
        rodape={
          <>
            <button type="button" className={cx.secundario} onClick={() => aoMudarNomeAberto(false)}>
              Cancelar
            </button>
            <button type="button" className={`${cx.primario} flex-1`} disabled={pendente || !nome.trim()} onClick={salvarNome}>
              {pendente ? "Salvando…" : "Salvar o nome"}
            </button>
          </>
        }
      >
        <Campo rotulo="Nome de quem é" erro={erroDoNome} dica="Vira o nome da conversa e o da pasta do atendimento no Drive. Não cria cadastro na agenda.">
          {({ id, descricao }) => (
            <input id={id} aria-describedby={descricao} className={cx.campo} value={nome} maxLength={120} autoComplete="off" onChange={(e) => setNome(e.target.value)} />
          )}
        </Campo>
      </Gaveta>
    </section>
  );
}
