"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Loader2, Search } from "lucide-react";
import ModalShell from "@/components/ModalShell";
import { criarPeticao } from "@/lib/actions/peticionar";
import {
  getScreenContextLabel,
  searchPeticionarLinkTargets,
  listLicitacoesForAssessoria,
  type PeticionarLink,
  type PeticionarLinkType,
  type LinkOption,
} from "@/lib/actions/peticionarLink";

// Wizard de vínculo do botão Peticionar (components/PeticionarButton.tsx) — pedido do dono do
// escritório: antes de gerar a petição, perguntar ONDE ela deve ficar salva, em vez de sempre
// cair solta na pasta genérica "gerados" (achado G40 da auditoria, nunca corrigido até esta
// entrega — ver lib/actions/peticionar.ts). Roteiro fixo, uma pergunta de cada vez:
//
// 1. Se há uma "tela atual" (processo/atendimento/assessoria aberto — ver screenContext, resolvido
//    por components/PeticionarButton.tsx): "Deseja vincular esta petição a X?" Sim/Não.
// 2. Se Não (ou não havia tela atual pra perguntar): "Deseja vincular a um processo/caso/
//    atendimento/assessoria?" Sim/Não.
// 3. Se Sim: escolher o TIPO, depois buscar/afunilar até o registro exato (Assessoria ainda
//    abre um passo a mais: documento geral da empresa ou de uma Licitação específica dela).
//
// Cada botão terminal (Sim do passo 1, Não do passo 2, um resultado de busca, uma opção do passo
// da Assessoria) chama finalize() DIRETO no onClick — precisa ser síncrono até o window.open,
// senão o navegador perde o gesto do usuário e bloqueia a aba como pop-up (mesmo cuidado que já
// existia no PeticionarButton antigo, só que agora o clique final pode vir de qualquer um destes
// pontos, não só de um botão único).
type Step = "confirmScreen" | "askLink" | "chooseType" | "search" | "assessoriaSub";

type ScreenContext = { type: Extract<PeticionarLinkType, "PROCESSO" | "CASO" | "ATENDIMENTO" | "ASSESSORIA">; id: string };

const TYPE_OPTIONS: { type: PeticionarLinkType; label: string }[] = [
  { type: "PROCESSO", label: "Processo" },
  { type: "CASO", label: "Caso" },
  { type: "ATENDIMENTO", label: "Atendimento" },
  { type: "ASSESSORIA", label: "Assessoria" },
];

const btnPrimary = "h-10 px-5 rounded-md bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold disabled:opacity-50";
const btnSecondary = "h-10 px-5 rounded-md border border-regua-forte text-tx text-sm font-semibold hover:bg-sf-apoio disabled:opacity-50";

export default function PeticionarWizard({
  screenContext,
  onClose,
}: {
  screenContext: ScreenContext | null;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>(screenContext ? "confirmScreen" : "askLink");
  const [screenLabel, setScreenLabel] = useState<string | null>(null);
  const [screenLink, setScreenLink] = useState<PeticionarLink | null>(null);
  const [loadingScreen, setLoadingScreen] = useState(Boolean(screenContext));
  const [chosenType, setChosenType] = useState<PeticionarLinkType | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LinkOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [assessoria, setAssessoria] = useState<{ id: string; label: string } | null>(null);
  const [licitacoes, setLicitacoes] = useState<LinkOption[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchReqId = useRef(0);

  // Passo 1: só existe pergunta se a "tela atual" resolver de verdade (registro existe e é do
  // escritório do usuário — getScreenContextLabel confere isso, nunca confia no id da URL sozinho).
  // Sem resolver, pula direto pro passo 2 — não faz sentido perguntar sobre um vínculo que não
  // existe (ex.: Peticionar clicado no Painel, sem processo/atendimento/assessoria nenhum aberto).
  useEffect(() => {
    if (!screenContext) return;
    let active = true;
    getScreenContextLabel(screenContext.type, screenContext.id).then((res) => {
      if (!active) return;
      setLoadingScreen(false);
      if (res) {
        setScreenLabel(res.label);
        setScreenLink(res.link);
      } else {
        setStep("askLink");
      }
    });
    return () => {
      active = false;
    };
  }, [screenContext]);

  // Passo 4 (busca): mesmo padrão de debounce (300ms) + id de requisição pra descartar resposta
  // atrasada já usado em components/NewAttendanceModal.tsx.
  useEffect(() => {
    if (step !== "search" || !chosenType) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const reqId = ++searchReqId.current;
    const timer = setTimeout(async () => {
      const res = await searchPeticionarLinkTargets(chosenType, q);
      if (reqId === searchReqId.current) {
        setResults(res);
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, step, chosenType]);

  useEffect(() => {
    if (step !== "assessoriaSub" || !assessoria) return;
    listLicitacoesForAssessoria(assessoria.id).then(setLicitacoes);
  }, [step, assessoria]);

  function finalize(link: PeticionarLink | null) {
    setError(null);
    // Mesmo truque de sempre: abrir as duas abas DENTRO do gesto de clique, antes de qualquer
    // await — senão o navegador perde o gesto e bloqueia a aba como pop-up.
    const driveWindow = window.open("", "_blank", "noopener,noreferrer");
    window.open("/peticionar", "_blank", "noopener,noreferrer");
    setPending(true);
    criarPeticao(link ?? undefined).then((result) => {
      setPending(false);
      if (result.error) {
        setError(result.error);
        driveWindow?.close();
        return;
      }
      if (driveWindow && result.driveUrl) driveWindow.location.href = result.driveUrl;
      onClose();
    });
  }

  function pickType(type: PeticionarLinkType) {
    setChosenType(type);
    setQuery("");
    setResults([]);
    setStep("search");
  }

  function pickResult(opt: LinkOption) {
    if (chosenType === "ASSESSORIA") {
      setAssessoria({ id: opt.id, label: opt.titulo });
      setLicitacoes(null);
      setStep("assessoriaSub");
      return;
    }
    if (chosenType === "PROCESSO" || chosenType === "CASO") finalize({ caseId: opt.id });
    else if (chosenType === "ATENDIMENTO") finalize({ attendanceId: opt.id });
  }

  const title = "Peticionar";

  return (
    <ModalShell size="compacto" title={title} subtitle="Onde esta petição deve ficar salva?" onClose={onClose}>
      <div className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-4">
        {error && (
          <p className="text-sm text-urgente bg-urgente-bg border border-linha-urgente rounded-md px-3 py-2">{error}</p>
        )}

        {loadingScreen && (
          <div className="flex items-center gap-2 text-sm text-tx-2 py-6 justify-center">
            <Loader2 size={16} className="animate-spin" /> Carregando...
          </div>
        )}

        {!loadingScreen && step === "confirmScreen" && screenLabel && (
          <>
            <p className="text-sm text-tx">
              Deseja vincular esta petição a <span className="font-semibold">{screenLabel}</span>?
            </p>
            <div className="flex gap-2 justify-end mt-2">
              <button type="button" className={btnSecondary} disabled={pending} onClick={() => setStep("askLink")}>
                Não
              </button>
              <button type="button" className={btnPrimary} disabled={pending} onClick={() => finalize(screenLink)}>
                Sim
              </button>
            </div>
          </>
        )}

        {!loadingScreen && step === "askLink" && (
          <>
            <p className="text-sm text-tx">Deseja vincular essa petição a um processo, caso, atendimento ou assessoria?</p>
            <div className="flex gap-2 justify-end mt-2">
              <button type="button" className={btnSecondary} disabled={pending} onClick={() => finalize(null)}>
                Não
              </button>
              <button type="button" className={btnPrimary} disabled={pending} onClick={() => setStep("chooseType")}>
                Sim
              </button>
            </div>
          </>
        )}

        {step === "chooseType" && (
          <>
            <p className="text-sm text-tx-2">Vincular a qual tipo de registro?</p>
            <div className="grid grid-cols-2 gap-2">
              {TYPE_OPTIONS.map((o) => (
                <button
                  key={o.type}
                  type="button"
                  className="h-11 rounded-md border border-regua-forte text-sm font-semibold text-tx hover:bg-sf-apoio hover:border-marca-tx"
                  onClick={() => pickType(o.type)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </>
        )}

        {step === "search" && chosenType && (
          <>
            <button
              type="button"
              className="flex items-center gap-1 text-xs font-semibold text-tx-2 hover:text-tx self-start"
              onClick={() => setStep("chooseType")}
            >
              <ChevronLeft size={14} /> Trocar tipo
            </button>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-tx-3" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Buscar ${TYPE_OPTIONS.find((o) => o.type === chosenType)?.label.toLowerCase()}...`}
                className="w-full h-10 pl-9 pr-3 rounded-md border border-regua-forte bg-sf text-sm text-tx focus:outline-none focus:border-marca-tx"
              />
            </div>
            <div className="flex flex-col divide-y divide-regua max-h-64 overflow-y-auto -mx-1">
              {searching && <p className="text-xs text-tx-3 px-1 py-3">Buscando...</p>}
              {!searching && query.trim().length >= 2 && results.length === 0 && (
                <p className="text-xs text-tx-3 px-1 py-3">Nada encontrado.</p>
              )}
              {!searching &&
                results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    disabled={pending}
                    onClick={() => pickResult(r)}
                    className="text-left px-2 py-2.5 hover:bg-sf-apoio disabled:opacity-50"
                  >
                    <p className="text-sm font-medium text-tx truncate">{r.titulo}</p>
                    {r.subtitulo && <p className="text-xs text-tx-2 truncate">{r.subtitulo}</p>}
                  </button>
                ))}
            </div>
          </>
        )}

        {step === "assessoriaSub" && assessoria && (
          <>
            <button
              type="button"
              className="flex items-center gap-1 text-xs font-semibold text-tx-2 hover:text-tx self-start"
              onClick={() => setStep("search")}
            >
              <ChevronLeft size={14} /> Trocar assessoria
            </button>
            <p className="text-sm text-tx-2">Documento geral da empresa, ou de uma licitação específica?</p>
            <button
              type="button"
              disabled={pending}
              onClick={() => finalize({ assessoriaId: assessoria.id })}
              className="text-left px-3 py-2.5 rounded-md border border-regua-forte hover:bg-sf-apoio hover:border-marca-tx disabled:opacity-50"
            >
              <p className="text-sm font-medium text-tx">Documento geral de {assessoria.label}</p>
            </button>
            {licitacoes === null && <p className="text-xs text-tx-3 px-1">Carregando licitações...</p>}
            {licitacoes !== null && licitacoes.length > 0 && (
              <div className="flex flex-col divide-y divide-regua max-h-48 overflow-y-auto">
                {licitacoes.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    disabled={pending}
                    onClick={() => finalize({ licitacaoId: l.id })}
                    className="text-left px-2 py-2.5 hover:bg-sf-apoio disabled:opacity-50"
                  >
                    <p className="text-sm font-medium text-tx truncate">{l.titulo}</p>
                    {l.subtitulo && <p className="text-xs text-tx-2 truncate">{l.subtitulo}</p>}
                  </button>
                ))}
              </div>
            )}
            {licitacoes !== null && licitacoes.length === 0 && (
              <p className="text-xs text-tx-3 px-1">Nenhuma licitação cadastrada nesta assessoria.</p>
            )}
          </>
        )}
      </div>
    </ModalShell>
  );
}
