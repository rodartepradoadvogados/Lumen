import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getAlertsCount } from "@/lib/alerts";

export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ count: 0 });

  const hasFinanceAccess = Boolean(viewer.isAdmin || viewer.financeAccess);
  const count = await getAlertsCount(viewer.officeId, hasFinanceAccess, viewer.id, viewer.isAdmin);

  return NextResponse.json({ count });
}