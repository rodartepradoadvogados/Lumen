import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { whereDoAtendimento, veTodoOAtendimento } from "@/lib/acessoAtendimento";
import { exigirAcessoAoAtendimentoNaTela } from "@/lib/guardaDoAtendimento";
import { dataDeBrasilia } from "@/lib/horaDeBrasilia";
import { Inbox, Search } from "lucide-react";
import { findAttendanceIdsByLooseName } from "@/lib/looseNameSearch";
import LinhaDaTriagem from "@/components/atendimento-app/LinhaDaTriagem";
import { CampoPilula } from "@/components/atendimento-app/ui/Pilula";
import FiltroPilula from "@/components/atendimento-app/ui/FiltroPilula";

export const dynamic = "force-dynamic";

const TABS = [
  { label: "Todos", status: undefined },
  { label: "Novo", status: "NOVO" },
  { label: "Em Triagem", status: "EM_TRIAGEM" },
  { label: "Convertido", status: "CONVERTIDO" },
  { label: "Arquivado", status: "ARQUIVADO" },
  { label: "Rascunhos", status: "RASCUNHO" },
];

export default async function TriagemAppPage({ searchParams }: { searchParams: { status?: string; q?: string } }) {
  // O aplicativo NÃO é um caminho paralelo ao site: mesma porta, mesmo recorte por dono
  // (lib/acessoAtendimento.ts). Sem acesso: 404, e nenhuma consulta abaixo chega a rodar.
  const viewer = await exigirAcessoAoAtendimentoNaTela();
  const soOsMeus = !veTodoOAtendimento(viewer);

  const q = (searchParams.q || "").trim();

  const baseFilters: Prisma.AttendanceWhereInput = {
    ...whereDoAtendimento(viewer),
    status: searchParams.status || { not: "RASCUNHO" },
  };
  const matchingIds = q ? await findAttendanceIdsByLooseName(q, baseFilters) : [];
  const where: Prisma.AttendanceWhereInput = { ...baseFilters, ...(q ? { id: { in: matchingIds } } : {} ) };

  const [attendances, totalCount] = await Promise.all([
    prisma.attendance.findMany({ where, include: { responsible: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.attendance.count({ where }),
  ]);

  const tabHref = (status?: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    const s = params.toString();
    return `/atendimento-app/triagem${s ? `?${s}` : ""}`;
  };

  return (
    <div className="animate-fade-in">
      <div className="px-5 pt-1">
        <h1 className="text-app-nome font-bold text-tx">{soOsMeus ? "Suas demandas" : "Triagem"}</h1>
        <p className="text-app-meta text-atd-terciario">
          {totalCount} {soOsMeus ? "repassado(s) a você" : "registro(s)"}
        </p>
      </div>

      <form action="/atendimento-app/triagem" role="search" className="flex items-center gap-2 px-4 pb-1 pt-2">
        {searchParams.status && <input type="hidden" name="status" value={searchParams.status} />}
        <div className="min-w-0 flex-1">
          <CampoPilula
            id="busca-da-triagem"
            contorno
            rotulo="Buscar por nome ou assunto"
            icone={<Search size={20} />}
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Buscar nome ou assunto"
            autoComplete="off"
            enterKeyHint="search"
          />
        </div>
        <button type="submit" className="inline-flex min-h-11 shrink-0 items-center rounded-atd-pilula bg-atd-ouro px-5 text-corpo font-bold text-atd-ouro-tx active:scale-95">
          Buscar
        </button>
      </form>

      <nav aria-label="Filtrar por situação">
        <ul className="flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((t) => (
            <li key={t.label} className="shrink-0">
              <FiltroPilula rotulo={t.label} href={tabHref(t.status)} ativo={t.status ? searchParams.status === t.status : !searchParams.status} />
            </li>
          ))}
        </ul>
      </nav>

      {attendances.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <Inbox size={36} aria-hidden="true" className="mx-auto mb-2 text-atd-terciario" />
          <p className="text-destaque font-semibold text-tx">{q ? "Nada encontrado" : "Nenhum atendimento aqui"}</p>
          <p className="mt-1 text-corpo text-atd-previa">
            {q ? `Nenhum atendimento com “${q}”.` : soOsMeus ? "Quando um atendimento for repassado a você, ele aparece nesta fila." : "Quando entrar um contato novo, ele aparece nesta fila."}
          </p>
          {(q || searchParams.status) && (
            <Link href="/atendimento-app/triagem" className="mt-4 inline-flex min-h-11 items-center rounded-atd-pilula bg-atd-pilula px-5 text-corpo font-semibold text-tx">
              Ver toda a fila
            </Link>
          )}
        </div>
      ) : (
        <ul className="pt-1">
          {attendances.map((a) => (
            <li key={a.id}>
              <LinhaDaTriagem
                linha={{
                  id: a.id,
                  clientName: a.clientName,
                  subject: a.subject,
                  status: a.status,
                  channel: a.channel,
                  area: a.area,
                  data: dataDeBrasilia(a.createdAt),
                  responsavel: a.responsible?.name ?? null,
                }}
              />
            </li>
          ))}
        </ul>
      )}

      {attendances.length < totalCount && (
        <p className="px-5 py-3 text-center text-app-meta text-atd-terciario">
          Mostrando os {attendances.length} mais recentes de {totalCount} — use a busca para encontrar os demais
        </p>
      )}
    </div>
  );
}
