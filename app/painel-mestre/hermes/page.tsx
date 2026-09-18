import { requirePlatformAccess } from "@/lib/platformMember";
import HermesAdminClient from "./HermesAdminClient";

export const dynamic = "force-dynamic";

export default async function HermesAdminPage() {
  await requirePlatformAccess();

  return <HermesAdminClient />;
}