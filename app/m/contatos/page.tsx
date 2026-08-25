import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { Card, EmptyState } from "@/components/ui";
import { sanitizePhoneForWhatsApp } from "@/lib/documentoEnvios";
import { ArrowLeft, Search, Phone, MessageCircle, Mail, Users, Scale as ScaleIcon, Truck, UserCog } from "lucide-react";

export const dynamic = "force-dynamic";

// Versão mobile ENXUTA de Contatos (app/(app)/contatos/**): só busca + ligar/WhatsApp/e-mail
// direto do resultado, sem cadastro nem edição — isso continua exclusivo do site. Nasceu da
// auditoria de navegação (2026-08): era o único gap com uso claro fora do escritório — achar o
// telefone de um cliente pra ligar do corredor do fórum não tinha nenhum caminho no app.
type Tab = "clientes" | "advogados" | "equipe" | "fornecedores";
const TABS: { key: Tab; label: string; icon: typeof Users }[] = [
  { key: "clientes", label: "Clientes", icon: Users },
  { key: "advogados", label: "Advogados", icon: ScaleIcon },
  { key: "equipe", label: "Equipe", icon: UserCog },
  { key: "fornecedores", label: "Fornecedores", icon: Truck },
];

type Row = { id: string; name: string; phone: string | null; email: string | null; sub?: string | null };

export default async function MobileContatos({ searchParams }: { searchParams: { tab?: string; q?: string } }) {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");

  const tab: Tab = TABS.some((t) => t.key === searchParams.tab) ? (searchParams.tab as Tab) : "clientes";
  const q = (searchParams.q ?? "").trim();
  const where = { officeId: viewer.officeId, ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}) };

  let rows: Row[] = [];
  if (tab === "clientes") {
    const clients = await prisma.client.findMany({ where, orderBy: { name: "asc" }, select: { id: true, name: true, phone: true, email: true, type: true } });
    rows = clients.map((c) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email, sub: c.type === "PJ" ? "Pessoa jurídica" : "Pessoa física" }));
  } else if (tab === "advogados") {
    const lawyers = await prisma.lawyer.findMany({ where, orderBy: { name: "asc" }, select: { id: true, name: true, phone: true, email: true, oab: true, side: true } });
    rows = lawyers.map((l) => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      email: l.email,
      sub: [l.oab ? `OAB ${l.oab}` : null, l.side === "ADVERSO" ? "Adverso" : "Parceiro"].filter(Boolean).join(" · "),
    }));
  } else if (tab === "equipe") {
    const team = await prisma.user.findMany({ where: { ...where, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, phone: true, email: true, role: true } });
    rows = team.map((u) => ({ id: u.id, name: u.name, phone: u.phone, email: u.email, sub: u.role }));
  } else {
    const suppliers = await prisma.supplier.findMany({ where, orderBy: { name: "asc" }, select: { id: true, name: true, phone: true, email: true } });
    rows = suppliers.map((s) => ({ id: s.id, name: s.name, phone: s.phone, email: s.email }));
  }

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link href="/m/mais" className="inline-flex items-center gap-1 text-xs font-semibold text-tx-2">
        <ArrowLeft size={13} /> Menu
      </Link>

      <div>
        <h1 className="text-xl font-bold text-tx">Contatos</h1>
        <p className="text-sm text-tx-2">Buscar e ligar/mandar WhatsApp direto — cadastro e edição continuam só no computador.</p>
      </div>

      <div className="flex gap-1.5 overflow-x-auto scrollbar-thin -mx-1 px-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/m/contatos?tab=${t.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 whitespace-nowrap transition-colors ${
              tab === t.key ? "bg-acao text-acao-tx" : "bg-sf-apoio text-tx-2 border border-regua"
            }`}
          >
            <t.icon size={13} /> {t.label}
          </Link>
        ))}
      </div>

      <form action={`/m/contatos`} className="relative">
        <input type="hidden" name="tab" value={tab} />
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-tx-3" />
        <input
          name="q"
          defaultValue={q}
          placeholder={`Buscar em ${TABS.find((t) => t.key === tab)!.label.toLowerCase()}`}
          className="w-full text-sm border border-regua bg-sf text-tx pl-8 pr-3 py-2.5"
        />
      </form>

      <Card>
        {rows.length === 0 ? (
          <EmptyState title="Nenhum contato encontrado" subtitle={q ? `Nada bate com "${q}"` : undefined} />
        ) : (
          <div className="divide-y divide-regua">
            {rows.map((r) => (
              <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-tx truncate">{r.name}</p>
                  {(r.sub || r.phone) && (
                    <p className="text-xs text-tx-2 truncate mt-0.5">{[r.sub, r.phone].filter(Boolean).join(" · ")}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {r.phone && (
                    <>
                      <a
                        href={`tel:${sanitizePhoneForWhatsApp(r.phone)}`}
                        aria-label={`Ligar para ${r.name}`}
                        className="p-2 text-tx-2 hover:text-acao hover:bg-sf-apoio rounded-md"
                      >
                        <Phone size={16} />
                      </a>
                      <a
                        href={`https://wa.me/${sanitizePhoneForWhatsApp(r.phone).replace(/^\+/, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`WhatsApp de ${r.name}`}
                        className="p-2 text-tx-2 hover:text-concluido hover:bg-sf-apoio rounded-md"
                      >
                        <MessageCircle size={16} />
                      </a>
                    </>
                  )}
                  {r.email && (
                    <a
                      href={`mailto:${r.email}`}
                      aria-label={`E-mail para ${r.name}`}
                      className="p-2 text-tx-2 hover:text-acao hover:bg-sf-apoio rounded-md"
                    >
                      <Mail size={16} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
