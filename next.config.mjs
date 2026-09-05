// SEGURANÇA (achado V5, auditoria de 05/09/2026): nenhum header de segurança estava configurado
// em lugar nenhum do stack (nem aqui, nem em middleware.ts, nem em vercel.json) — sem
// X-Frame-Options o site podia ser embutido num <iframe> de outro domínio (clickjacking), sem
// HSTS um downgrade para HTTP não era recusado pelo navegador, sem X-Content-Type-Options o
// navegador podia tentar "adivinhar" o tipo de um arquivo servido.
//
// Content-Security-Policy fica de fora por enquanto: o app usa scripts inline (registro do
// service worker, toggle de tema em app/layout.tsx/app/m/layout.tsx) que uma CSP restritiva
// bloquearia sem aviso nenhum ao usuário (a tela simplesmente perderia esses comportamentos) —
// não dá para validar isso sem acesso a um navegador real contra produção. Adicionar CSP depois,
// em modo Content-Security-Policy-Report-Only primeiro, é o próximo passo recomendado pelo
// próprio relatório da auditoria.
//
// X-Frame-Options: SAMEORIGIN, não DENY — o próprio AppShell.tsx embute a aplicação em <iframe>
// same-origin (o sistema de "abas" internas, cada uma carregando `${href}?embed=1` dentro de um
// iframe da MESMA origem). DENY bloqueia qualquer frame, inclusive esse; SAMEORIGIN já fecha o
// vetor de clickjacking real (embutir o site num domínio ALHEIO) sem quebrar essa funcionalidade.
/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default nextConfig;
