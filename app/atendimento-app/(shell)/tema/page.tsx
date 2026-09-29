"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Sun, Moon, Monitor } from "lucide-react";

export default function TemaAppPage() {
  const [theme, setTheme] = useState<"light" | "dark" | "auto">("light");

  useEffect(() => {
    const stored = localStorage.getItem("rp-atendimento-theme") as "light" | "dark" | "auto" | null;
    if (stored) setTheme(stored);
  }, []);

  const applyTheme = (newTheme: "light" | "dark" | "auto") => {
    setTheme(newTheme);
    localStorage.setItem("rp-atendimento-theme", newTheme);
    const shell = document.getElementById("atendimento-shell");
    if (!shell) return;
    const isDark = newTheme === "dark" || (newTheme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    shell.classList.toggle("atendimento-dark", isDark);
  };

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link href="/atendimento-app/mais" className="inline-flex items-center gap-1 text-corpo font-semibold text-tx-2">
        <ArrowLeft size={13} /> Mais
      </Link>

      <h1 className="text-xl font-bold text-tx">Tema</h1>

      <div className="bg-sf-apoio border border-regua rounded-[2px] p-4 space-y-3">
        <p className="text-sm text-tx-2">Escolha o modo de exibição do app.</p>

        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => applyTheme("light")}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-[2px] border-2 transition-colors ${
              theme === "light" ? "border-ouro-acento bg-ouro-bg" : "border-regua hover:border-ouro-acento"
            }`}
          >
            <Sun size={22} className={theme === "light" ? "text-ouro-acento" : "text-tx-2"} />
            <span className={`text-corpo font-medium ${theme === "light" ? "text-ouro-acento" : "text-tx"}`}>Claro</span>
          </button>

          <button
            onClick={() => applyTheme("dark")}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-[2px] border-2 transition-colors ${
              theme === "dark" ? "border-ouro-acento bg-ouro-bg" : "border-regua hover:border-ouro-acento"
            }`}
          >
            <Moon size={22} className={theme === "dark" ? "text-ouro-acento" : "text-tx-2"} />
            <span className={`text-corpo font-medium ${theme === "dark" ? "text-ouro-acento" : "text-tx"}`}>Escuro</span>
          </button>

          <button
            onClick={() => applyTheme("auto")}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-[2px] border-2 transition-colors ${
              theme === "auto" ? "border-ouro-acento bg-ouro-bg" : "border-regua hover:border-ouro-acento"
            }`}
          >
            <Monitor size={22} className={theme === "auto" ? "text-ouro-acento" : "text-tx-2"} />
            <span className={`text-corpo font-medium ${theme === "auto" ? "text-ouro-acento" : "text-tx"}`}>Automático</span>
          </button>
        </div>
      </div>

      <p className="text-xs text-tx-3 text-center mt-4">Lúmen Atendimento — Preferência de tema</p>
    </div>
  );
}