import Link from "next/link";
import LumenMark from "@/components/LumenMark";
import { ArrowLeft } from "lucide-react";

// Página PÚBLICA (sem login) exigida pela Meta para publicar o app do WhatsApp
// Cloud API ("URL da Política de Privacidade" em Configurações do app > Básico).
// Texto genérico o bastante para servir qualquer escritório que use o Lúmen,
// mas hoje descreve o uso real: Rodarte Prado Advogados atendendo pelo
// WhatsApp integrado ao sistema.
export const metadata = {
  title: "Política de Privacidade | Lúmen",
  description: "Como o Lúmen e o escritório que o utiliza tratam dados pessoais recebidos por WhatsApp e demais canais de atendimento.",
};

export default function PrivacidadePage() {
  return (
    <div className="min-h-screen bg-cream-50">
      <header className="bg-navy-900 px-6 py-8">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-semibold text-gold-500 hover:text-gold-400">
            <ArrowLeft size={14} /> Voltar
          </Link>
          <div className="flex items-center gap-2">
            <LumenMark size={22} />
            <span className="font-serif font-semibold text-cream-50">Lúmen</span>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <article className="bg-white rounded-xl border border-navy-800/8 shadow-card overflow-hidden">
          <div className="p-6 sm:p-8 space-y-5 text-sm leading-relaxed text-navy-900/80">
            <div>
              <h1 className="font-serif font-bold text-navy-900 text-2xl sm:text-3xl leading-tight mb-1">
                Política de Privacidade
              </h1>
              <p className="text-xs text-navy-900/50">Última atualização: 24 de julho de 2026</p>
            </div>

            <p>
              Esta política explica como tratamos dados pessoais quando você entra em contato com um escritório de
              advocacia que utiliza o <b>Lúmen</b> — inclusive pelo WhatsApp — e como esses dados são usados dentro
              do sistema de gestão do escritório.
            </p>

            <section className="space-y-1.5">
              <h2 className="font-serif font-bold text-navy-900 text-lg">1. Quem é o responsável pelos dados</h2>
              <p>
                O escritório de advocacia com quem você troca mensagens é o responsável pelo tratamento dos seus
                dados pessoais (controlador, nos termos da LGPD — Lei nº 13.709/2018). O Lúmen é o sistema de gestão
                utilizado por esse escritório para registrar o atendimento; não decide sobre a finalidade do
                tratamento nem usa esses dados para fins próprios.
              </p>
              <p>
                Nesta conta do WhatsApp Business, o escritório responsável é o <b>Rodarte Prado Advogados</b>, com
                contato em <a className="text-bordo-700 hover:text-bordo-600 font-semibold" href="mailto:rodartepradoadvogados@gmail.com">rodartepradoadvogados@gmail.com</a>.
              </p>
            </section>

            <section className="space-y-1.5">
              <h2 className="font-serif font-bold text-navy-900 text-lg">2. Quais dados coletamos</h2>
              <p>Ao conversar pelo WhatsApp ou por outros canais atendidos pelo escritório, podemos registrar:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Nome e número de telefone associados à conversa;</li>
                <li>Conteúdo das mensagens trocadas (texto, áudio, imagens e documentos enviados);</li>
                <li>Dados que você mesmo informar durante o atendimento (ex.: dados de um caso, número de processo, documentos);</li>
                <li>Metadados técnicos da mensagem (data, hora e status de entrega), fornecidos pela própria API do WhatsApp.</li>
              </ul>
            </section>

            <section className="space-y-1.5">
              <h2 className="font-serif font-bold text-navy-900 text-lg">3. Para que usamos esses dados</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>Responder ao seu contato e prestar o atendimento solicitado;</li>
                <li>Registrar o histórico do atendimento dentro do sistema do escritório;</li>
                <li>Vincular a conversa a um cliente, caso ou processo já existente, quando aplicável;</li>
                <li>Cumprir obrigações legais e regulatórias aplicáveis à advocacia.</li>
              </ul>
              <p>Não usamos os dados da conversa para publicidade, e não vendemos nem compartilhamos esses dados com terceiros para fins comerciais.</p>
            </section>

            <section className="space-y-1.5">
              <h2 className="font-serif font-bold text-navy-900 text-lg">4. Com quem os dados são compartilhados</h2>
              <p>
                As mensagens trafegam pela infraestrutura da <b>Meta</b> (WhatsApp Cloud API) para serem entregues ao
                sistema do escritório, conforme os termos e políticas da própria Meta. Dentro do escritório, os dados
                ficam visíveis apenas à equipe autorizada a usar o Lúmen, para fins de atendimento. Não compartilhamos
                esses dados com outros escritórios ou terceiros não envolvidos no seu atendimento.
              </p>
            </section>

            <section className="space-y-1.5">
              <h2 className="font-serif font-bold text-navy-900 text-lg">5. Por quanto tempo guardamos os dados</h2>
              <p>
                O histórico de atendimento é mantido enquanto durar a relação com o escritório e pelo prazo necessário
                para cumprir obrigações legais (incluindo prazos de prescrição aplicáveis a serviços advocatícios),
                podendo ser excluído a pedido do titular, quando não houver impedimento legal para isso.
              </p>
            </section>

            <section className="space-y-1.5">
              <h2 className="font-serif font-bold text-navy-900 text-lg">6. Segurança</h2>
              <p>
                O acesso ao sistema é restrito por login individual da equipe do escritório, e os dados ficam
                armazenados em infraestrutura com controle de acesso e criptografia em trânsito.
              </p>
            </section>

            <section className="space-y-1.5">
              <h2 className="font-serif font-bold text-navy-900 text-lg">7. Seus direitos</h2>
              <p>
                Nos termos da LGPD, você pode solicitar ao escritório responsável a confirmação, o acesso, a
                correção ou a exclusão dos seus dados pessoais, bem como informações sobre com quem eles foram
                compartilhados. Para exercer esses direitos, entre em contato pelo e-mail indicado na seção 1.
              </p>
            </section>

            <section className="space-y-1.5">
              <h2 className="font-serif font-bold text-navy-900 text-lg">8. Alterações desta política</h2>
              <p>
                Esta política pode ser atualizada periodicamente. A data no topo desta página indica a versão mais
                recente.
              </p>
            </section>
          </div>
        </article>
      </main>
    </div>
  );
}
