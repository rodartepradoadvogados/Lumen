import type { Metadata } from "next";

// Liga explicitamente o manifesto do app mobile em todo o escopo /m — inclusive a tela de entrada
// (/m/entrar), que fica FORA do grupo (shell) por ser pública. Autenticação e casca do app moram em
// app/m/(shell)/layout.tsx.
export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
};

export default function MobileRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
