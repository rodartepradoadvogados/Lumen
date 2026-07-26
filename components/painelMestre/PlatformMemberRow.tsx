"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Power } from "lucide-react";
import { updatePlatformMemberRole, togglePlatformMemberActive } from "@/lib/actions/platformEquipe";
import { LumenStatusDot } from "@/components/painelMestre/LumenUi";

type Role = { id: string; name: string };

export default function PlatformMemberRow({
  member,
  roles,
}: {
  member: { id: string; name: string; email: string; roleId: string; active: boolean };
  roles: Role[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRoleChange(roleId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await updatePlatformMemberRole(member.id, roleId);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível trocar o papel.");
      }
    });
  }

  function handleToggleActive() {
    setError(null);
    startTransition(async () => {
      try {
        await togglePlatformMemberActive(member.id, !member.active);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível alterar o status.");
      }
    });
  }

  return (
    <Fragment>
      <tr>
        <td className="px-5 py-3">
          <span className="inline-flex items-center gap-1.5 text-cream-50 font-medium">
            <LumenStatusDot tone={member.active ? "ok" : "slate"} /> {member.name}
          </span>
        </td>
        <td className="px-3 py-3 text-cream-50/70">{member.email}</td>
        <td className="px-3 py-3">
          <select
            value={member.roleId}
            disabled={pending}
            onChange={(e) => handleRoleChange(e.target.value)}
            className="bg-white/5 border border-white/15 text-cream-50 text-xs rounded-lg px-2 py-1.5 disabled:opacity-50"
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id} className="text-navy-900">
                {r.name}
              </option>
            ))}
          </select>
        </td>
        <td className="px-3 py-3 text-right">
          <button
            onClick={handleToggleActive}
            disabled={pending}
            data-tip={member.active ? "Desativar" : "Reativar"}
            className="p-1.5 rounded-lg text-cream-50/40 hover:text-gold-400 hover:bg-white/10 transition-colors disabled:opacity-40"
          >
            <Power size={14} />
          </button>
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={4} className="px-5 pb-2 pt-0">
            <span className="inline-block text-[11px] bg-bordo-900/60 text-bordo-400 border border-bordo-400/20 rounded-lg px-2.5 py-1.5">
              {error}
            </span>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
