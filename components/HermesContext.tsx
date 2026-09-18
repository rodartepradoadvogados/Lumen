"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type HermesContextValue = {
  tenantId: string | null;
  tenantSlug: string | null;
  tenantName: string | null;
};

const HermesContext = createContext<HermesContextValue>({
  tenantId: null,
  tenantSlug: null,
  tenantName: null,
});

export function HermesProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<HermesContextValue>({
    tenantId: null,
    tenantSlug: null,
    tenantName: null,
  });

  useEffect(() => {
    async function fetchTenant() {
      try {
        const res = await fetch("/api/user/me");
        if (res.ok) {
          const data = await res.json();
          setTenant({
            tenantId: data.officeId,
            tenantSlug: data.officeSlug,
            tenantName: data.officeName,
          });
        }
      } catch {
        console.warn("[HermesProvider] Could not fetch tenant info");
      }
    }
    fetchTenant();
  }, []);

  return (
    <HermesContext.Provider value={tenant}>{children}</HermesContext.Provider>
  );
}

export function useHermesTenant() {
  const context = useContext(HermesContext);
  if (!context) {
    throw new Error("useHermesTenant must be used within HermesProvider");
  }
  return context;
}