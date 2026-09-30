"use client";

import { useState } from "react";
import { AlertTriangle, Check, ExternalLink } from "lucide-react";
import { cnjValido } from "@/lib/cnjNumero";
import { nomeEhTemporario } from "@/lib/nomeTemporarioDoLead";
import { revisaoDaConversao, validarConversao, OPCOES_DO_APLICATIVO, type TipoDeConversao } from "@/lib/conversaoEmProcesso";
import { converterEmProcessoNoApp } from "@/lib/actions/detalhesDoAtendimento";
import { Gaveta, cx, useRodar } from "./base";
import type { PropsDosDetalhes } from "./tipos";

type Etapa = 1 | 2 | 3;

// TRANSFORMAR EM PROCESSO OU CASO (N19). Converter não tem volta pelo Lúmen, então o aplicativo mostra ANTES
// o que será criado, o que será levado (dados, anexos), o que NÃO é copiado (anotações pessoais) e o que
// continua aqui, e só converte depois de "Entendi que não dá para desfazer". O servidor repete as travas
// (já convertido, CNJ, nome temporário, lead recusado): a tela é só a tela.
export default function Processo({ p, aoDefinirNome, aoDesfazerRecusa }: { p: PropsDosDetalhes; aoDefinirNome: () => void; aoDesfazerRecusa: () => void }) {
  const c = p.conversa;
  const { rodar, pendente } = useRodar();
  const [aberta, setAberta] = useState(false);
  const [etapa, setEtapa] = useState<Etapa>(1);
  const [tipo, setTipo] = useState<TipoDeConversao>("CASO");
  const [numero, setNumero] = useState("");
  const [vara, setVara] = useState("");
  const [ciente, setCiente] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<{ caseId: string; titulo: string; honorarioQuery: string } | null>(null);

  const temporario = nomeEhTemporario(c.clientName);
  const bloqueio = validarConversao({ tipo, numero, nomeDoContato: c.clientName, status: c.status, convertedCaseId: c.convertedCase?.id ?? null }, { ...OPCOES_DO_APLICATIVO, exigirCnj: false });

  function abrir() {
    setEtapa(1);
    setTipo("CASO");
    setNumero("");
    setVara("");
    setCiente(false);
    setErro(null);
    setFeito(null);
    setAberta(true);
  }

  function continuar() {
    setErro(null);
    if (tipo === "JUDICIAL") {
      if (!numero.trim()) return setErro("Informe o número do processo.");
      if (!cnjValido(numero)) return setErro("Número fora do padrão CNJ ou com dígito verificador que não confere. Confira os dígitos.");
    }
    setEtapa(2);
  }

  async function converter() {
    setErro(null);
    const r = await rodar({
      fazer: async () => {
        const x = await converterEmProcessoNoApp(c.id, { tipo, numero, vara });
        if (!x.error && x.caseId) setFeito({ caseId: x.caseId, titulo: x.titulo ?? c.subject, honorarioQuery: x.honorarioQuery ?? "" });
        return x;
      },
      ok: tipo === "JUDICIAL" ? "Convertido em processo judicial." : "Convertido em caso.",
    });
    if (r.ok) setEtapa(3);
    else setErro(r.error ?? null);
  }

  const revisao = revisaoDaConversao({
    tipo,
    numero,
    vara,
    assunto: c.subject,
    nomeDoContato: c.clientName,
    cliente: p.clienteDaConversa,
    materia: c.area,
    responsavel: c.responsibleName,
    temRelato: Boolean(c.description),
    anexos: p.contagens.anexos,
    temPastaNoDrive: p.contagens.temPastaNoDrive,
    anotacoesDoUsuario: p.contagens.anotacoesMinhas,
    pendenciasAbertas: p.contagens.pendenciasAbertas,
    tarefasAbertas: p.contagens.tarefasAbertas,
    honorario: c.feeMode || c.estimatedValue ? { valor: c.estimatedValue, modo: c.feeMode } : null,
  });

  const enderecoDoProcesso = (id: string, q: string) => `/processos/${id}${q ? `?tab=financeiro&${q}` : ""}`;

  const cc = c.convertedCase;
  const jaConvertido = cc ? (
      <div className={cx.painelOk}>
        <p className="flex items-center gap-2 text-corpo font-bold text-tx">
          <Check size={18} aria-hidden="true" className="text-concluido" /> Convertido em {cc.type === "JUDICIAL" ? "processo judicial" : cc.type === "ADMINISTRATIVO" ? "processo administrativo" : "caso"}
        </p>
        <p className="mt-1 break-words text-corpo text-tx">{cc.title}</p>
        {cc.processNumber && <p className="text-corpo text-atd-previa">Nº {cc.processNumber}</p>}
        <a href={`/processos/${cc.id}`} target="_blank" rel="noopener noreferrer" className={`${cx.secundario} mt-2`}>
          <ExternalLink size={16} aria-hidden="true" /> Abrir no site <span className="sr-only">(abre em outra aba)</span>
        </a>
      </div>
  ) : null;

  return (
    <div>
      {jaConvertido ?? <>
      <p className="text-corpo text-atd-previa">Cria um caso ou processo ligado ao cliente e leva os anexos e a pasta do Drive. A conversa, as pendências e as tarefas continuam neste atendimento.</p>
      {c.status === "RECUSADO" ? (
        <div className={`mt-3 ${cx.painel}`}>
          <p className="flex items-start gap-2 text-corpo text-tx">
            <AlertTriangle size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-aviso" /> Este lead foi recusado. Desfaça a recusa antes de transformá-lo em processo.
          </p>
          {p.veTudo && (
            <button type="button" className={`${cx.secundario} mt-2`} onClick={aoDesfazerRecusa}>
              Ir para “Encerrar”
            </button>
          )}
        </div>
      ) : temporario ? (
        <div className={`mt-3 ${cx.painel}`}>
          <p className="flex items-start gap-2 text-corpo text-tx">
            <AlertTriangle size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-aviso" /> O nome do contato ainda é temporário. Defina o nome de quem é antes de converter: o cliente do processo nasceria com o telefone como nome.
          </p>
          <button type="button" className={`${cx.primario} mt-2`} onClick={aoDefinirNome}>
            Definir o nome agora
          </button>
        </div>
      ) : (
        <button type="button" className={`${cx.primario} mt-3 w-full`} onClick={abrir}>
          Transformar…
        </button>
      )}
      </>}

      <Gaveta
        aberta={aberta}
        aoFechar={() => (pendente ? undefined : setAberta(false))}
        titulo="Transformar em processo ou caso"
        rodape={
          etapa === 1 ? (
            <>
              <button type="button" className={cx.secundario} onClick={() => setAberta(false)}>
                Cancelar
              </button>
              <button type="button" className={`${cx.primario} flex-1`} onClick={continuar}>
                Continuar
              </button>
            </>
          ) : etapa === 2 ? (
            <>
              <button type="button" className={cx.secundario} disabled={pendente} onClick={() => setEtapa(1)}>
                Voltar
              </button>
              <button type="button" className={`${cx.primario} flex-1`} disabled={pendente || !ciente || Boolean(bloqueio)} onClick={converter}>
                {pendente ? "Convertendo…" : "Converter agora"}
              </button>
            </>
          ) : (
            <button type="button" className={`${cx.secundario} flex-1`} onClick={() => setAberta(false)}>
              Ficar neste atendimento
            </button>
          )
        }
      >
        <ol className="mb-4 flex gap-2" aria-label="Etapas">
          {["1 · Tipo", "2 · Revisar e confirmar", "3 · Pronto"].map((t, i) => (
            <li key={t} aria-current={etapa === i + 1 ? "step" : undefined} className={`flex-1 rounded-atd-pilula px-2 py-1.5 text-center text-app-tag font-semibold uppercase leading-tight tracking-wide ${etapa === i + 1 ? "bg-atd-ouro-suave text-atd-texto-ouro" : "bg-atd-pilula text-atd-terciario"}`}>
              {t}
            </li>
          ))}
        </ol>

        {etapa === 1 && (
          <div className="space-y-3">
            <div role="radiogroup" aria-label="O que criar" className="space-y-2">
              {(
                [
                  ["CASO", "Caso", "Consultivo, extrajudicial ou ainda sem número. Entra em “Casos”."],
                  ["JUDICIAL", "Processo judicial", "Já tem número CNJ. Entra em “Processos”."],
                ] as const
              ).map(([v, t, d]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={tipo === v}
                  onClick={() => {
                    setTipo(v);
                    setErro(null);
                  }}
                  className={`flex min-h-16 w-full items-start gap-3 rounded-atd-balao p-3.5 text-left ${tipo === v ? "bg-atd-ouro-suave" : "bg-atd-pilula"}`}
                >
                  <span aria-hidden="true" className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${tipo === v ? "border-atd-ouro-texto" : "border-atd-campo"}`}>
                    {tipo === v && <span className="h-2.5 w-2.5 rounded-full bg-atd-ouro-texto" />}
                  </span>
                  <span>
                    <span className="block text-corpo font-bold text-tx">{t}</span>
                    <span className="block text-corpo text-atd-previa">{d}</span>
                  </span>
                </button>
              ))}
            </div>
            {tipo === "JUDICIAL" && (
              <>
                <div>
                  <label htmlFor="conv-numero" className={cx.rotulo}>
                    Número do processo
                  </label>
                  <input id="conv-numero" className={`${cx.campo} mt-1`} inputMode="numeric" autoComplete="off" placeholder="0000000-00.2026.8.09.0051" value={numero} onChange={(e) => setNumero(e.target.value)} aria-describedby="conv-numero-d" />
                  <p id="conv-numero-d" role={erro ? "alert" : undefined} className={`mt-1 ${erro ? cx.erro : cx.dica}`}>
                    {erro ?? "Formato CNJ: 0000000-00.0000.0.00.0000. O dígito verificador é conferido."}
                  </p>
                </div>
                <div>
                  <label htmlFor="conv-vara" className={cx.rotulo}>
                    Vara ou comarca (opcional)
                  </label>
                  <input id="conv-vara" className={`${cx.campo} mt-1`} autoComplete="off" placeholder="Ex.: 3ª Vara Cível de Goiânia" value={vara} onChange={(e) => setVara(e.target.value)} />
                </div>
              </>
            )}
          </div>
        )}

        {etapa === 2 && (
          <div>
            <p className="text-corpo text-tx">
              <strong>{tipo === "JUDICIAL" ? "Processo judicial" : "Caso"}</strong>
              {tipo === "JUDICIAL" ? ` · nº ${numero.trim()}${vara.trim() ? ` · ${vara.trim()}` : ""}` : ""} — “{c.subject}”
            </p>
            <p className={`mb-2 mt-3 ${cx.etiqueta}`}>O que vai acontecer</p>
            <ul className="space-y-2" data-revisao-da-conversao="">
              {revisao.map((i) => (
                <li key={i.texto} className="flex items-start gap-2.5 text-corpo text-tx">
                  {i.tom === "ok" ? <Check size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-concluido" /> : <AlertTriangle size={18} aria-hidden="true" className={`mt-0.5 shrink-0 ${i.tom === "nao-desfaz" ? "text-urgente" : "text-aviso"}`} />}
                  <span className={i.tom === "nao-desfaz" ? "font-semibold" : ""}>{i.texto}</span>
                </li>
              ))}
            </ul>
            <label className="mt-4 flex min-h-11 items-start gap-3 text-corpo text-tx">
              <input type="checkbox" checked={ciente} onChange={(e) => setCiente(e.target.checked)} className="mt-0.5 h-[22px] w-[22px] shrink-0 accent-[var(--atd-ouro)]" />
              Entendi que não dá para desfazer
            </label>
            {(erro || bloqueio) && (
              <p role="alert" className={`mt-2 ${cx.erro}`}>
                {erro ?? bloqueio}
              </p>
            )}
          </div>
        )}

        {etapa === 3 && feito && (
          <div className={cx.painelOk}>
            <p className="flex items-center gap-2 text-corpo font-bold text-tx">
              <Check size={18} aria-hidden="true" className="text-concluido" /> {tipo === "JUDICIAL" ? "Processo judicial criado" : "Caso criado"}
            </p>
            <p className="mt-1 break-words text-corpo text-tx">{feito.titulo}</p>
            <p className="mt-1 text-etiqueta text-atd-previa">O atendimento agora está “Convertido”. Você continua neste aplicativo.</p>
            <a href={enderecoDoProcesso(feito.caseId, feito.honorarioQuery)} target="_blank" rel="noopener noreferrer" className={`${cx.secundario} mt-3`}>
              <ExternalLink size={16} aria-hidden="true" /> Abrir o {tipo === "JUDICIAL" ? "processo" : "caso"} no site <span className="sr-only">(abre em outra aba)</span>
            </a>
          </div>
        )}
      </Gaveta>
    </div>
  );
}
