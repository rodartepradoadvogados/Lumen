import { Lock } from "lucide-react";

// Extraído de app/(app)/layout.tsx para ser reaproveitado também em app/m/layout.tsx — mesma
// mensagem de escritório suspenso por inadimplência (Painel Mestre) nos dois lugares, sem os
// dois textos poderem divergir com o tempo.
export default function OfficeSuspendedNotice({ officeName }: { officeName: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-sf-fundo p-6">
      <div className="max-w-md text-center space-y-4">
        <div className="mx-auto h-12 w-12 rounded-full bg-atencao/10 flex items-center justify-center">
          <Lock size={22} className="text-atencao" />
        </div>
        <h1 className="font-serif text-xl font-bold text-tx">Acesso temporariamente suspenso</h1>
        <p className="text-sm text-tx-2">
          O acesso do escritório <strong>{officeName}</strong> está suspenso. Entre em contato com o Rodarte Prado Advogados
          para regularizar a situação e liberar o acesso novamente.
        </p>
      </div>
    </div>
  );
}
