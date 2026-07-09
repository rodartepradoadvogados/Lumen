import LoginForm from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-pop border border-navy-800/8 overflow-hidden">
        <div className="bg-navy-900 px-8 py-8 text-center">
          <div className="flex items-center gap-1.5 mb-1.5 justify-center">
            <span className="h-px w-10 bg-gold-500/60" />
            <span className="h-1 w-1 rounded-full bg-gold-500" />
            <span className="h-px w-10 bg-gold-500/60" />
          </div>
          <h1 className="font-serif text-xl font-bold tracking-wide text-cream-50">RODARTE PRADO</h1>
          <p className="text-[11px] tracking-[0.3em] text-gold-500 font-medium mt-0.5">ADVOGADOS</p>
        </div>
        <div className="p-8">
          <p className="text-sm text-navy-800/60 mb-5 text-center">Acesso ao sistema interno</p>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
