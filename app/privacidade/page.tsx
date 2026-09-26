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
    <div className="min-h-screen bg-sf-fundo">
      {/* Masthead grafite-800 fixo — chrome do site público, mesmo raciocínio do rail/barra de
          menus (DESIGN-SYSTEM.md §3) e de app/blog/page.tsx. Texto branco fixo, não --acao/--tx:
          esses trocam de tema e, no Manhã, ficariam ilegíveis contra um fundo que não troca.
          Tipografia: Archivo, sem serifa — igual ao produto (a licença de serifa própria vale
          só para o blog, ver app/blog/layout.tsx). */}
      <header className="bg-grafite-800 px-6 py-8">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          {/* eslint-disable-next-line no-restricted-syntax -- Cabeçalho bg-grafite-800, fixo nos dois temas. */}
          <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-semibold text-white hover:text-white/80">
            <ArrowLeft size={14} /> Voltar
          </Link>
          <div className="flex items-center gap-2">
            <LumenMark size={22} />
            {/* eslint-disable-next-line no-restricted-syntax -- Cabeçalho bg-grafite-800, fixo nos dois temas. */}
            <span className="font-semibold text-white">Lúmen</span>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <article className="bg-sf border-t-2 border-regua-forte overflow-hidden">
          <div className="p-6 sm:p-8 space-y-5 text-sm leading-relaxed text-tx">
            <div>
              <h1 className="font-bold text-tx text-2xl sm:text-3xl leading-tight mb-1">Política de Privacidade</h1>
              <p className="text-xs text-tx-2">Última atualização: 26 de setembro de 2026</p>
            </div>

            <p>
              Esta política explica como tratamos dados pessoais quando você entra em contato com um escritório de
              advocacia que utiliza o <b>Lúmen</b> — inclusive pelo WhatsApp — e como esses dados são usados dentro
              do sistema de gestão do escritório. A seção 4 trata especificamente dos dados obtidos das contas
              Google que a equipe do escritório conecta ao sistema.
            </p>

            <section className="space-y-1.5">
              <h2 className="font-bold text-tx text-lg">1. Quem é o responsável pelos dados</h2>
              <p>
                O escritório de advocacia com quem você troca mensagens é o responsável pelo tratamento dos seus
                dados pessoais (controlador, nos termos da LGPD — Lei nº 13.709/2018). O Lúmen é o sistema de gestão
                utilizado por esse escritório para registrar o atendimento; não decide sobre a finalidade do
                tratamento nem usa esses dados para fins próprios.
              </p>
              <p>
                Nesta conta do WhatsApp Business, o escritório responsável é o <b>Rodarte Prado Advogados</b>, com
                contato em <a className="text-marca-tx hover:text-tx font-semibold" href="mailto:rodartepradoadvogados@gmail.com">rodartepradoadvogados@gmail.com</a>.
              </p>
            </section>

            <section className="space-y-1.5">
              <h2 className="font-bold text-tx text-lg">2. Quais dados coletamos</h2>
              <p>Ao conversar pelo WhatsApp ou por outros canais atendidos pelo escritório, podemos registrar:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Nome e número de telefone associados à conversa;</li>
                <li>Conteúdo das mensagens trocadas (texto, áudio, imagens e documentos enviados);</li>
                <li>Dados que você mesmo informar durante o atendimento (ex.: dados de um caso, número de processo, documentos);</li>
                <li>Metadados técnicos da mensagem (data, hora e status de entrega), fornecidos pela própria API do WhatsApp.</li>
              </ul>
            </section>

            <section className="space-y-1.5">
              <h2 className="font-bold text-tx text-lg">3. Para que usamos esses dados</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>Responder ao seu contato e prestar o atendimento solicitado;</li>
                <li>Registrar o histórico do atendimento dentro do sistema do escritório;</li>
                <li>Vincular a conversa a um cliente, caso ou processo já existente, quando aplicável;</li>
                <li>Cumprir obrigações legais e regulatórias aplicáveis à advocacia.</li>
              </ul>
              <p>Não usamos os dados da conversa para publicidade, e não vendemos nem compartilhamos esses dados com terceiros para fins comerciais.</p>
            </section>

            {/* Seção exigida pelo Google para publicar/verificar a tela de consentimento OAuth: a
                política precisa descrever, de forma específica, quais dados das APIs do Google o
                app acessa, para quê, e trazer a declaração de Uso Limitado. O texto abaixo
                descreve o comportamento real do código — ver lib/jusbrasilEmailSync.ts (leitura
                da caixa), lib/gmailSend.ts (envio), lib/googleDrive.ts (Drive/Docs) e
                lib/assistantTools.ts:consultar_publicacoes (trecho de 300 caracteres enviado ao
                provedor de IA). Ao mudar qualquer um desses comportamentos, atualize esta seção. */}
            <section className="space-y-1.5">
              <h2 className="font-bold text-tx text-lg">4. Dados obtidos das contas Google conectadas</h2>
              <p>
                Esta seção se dirige à <b>equipe do escritório</b>, não ao cliente: são os dados que o Lúmen acessa
                quando um advogado conecta a própria conta Google ao sistema, ou quando o escritório conecta uma
                conta Google para guardar arquivos. A conexão é sempre feita pelo próprio titular da conta, por meio
                do consentimento do Google, e pode ser revogada por ele a qualquer momento.
              </p>
              <p>O Lúmen pede as seguintes permissões, e usa cada uma apenas para o fim indicado:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  <b>Leitura do Gmail</b> (<code>gmail.readonly</code>) — procurar, na caixa conectada, as
                  comunicações processuais que os tribunais e serviços de acompanhamento (como a Jusbrasil) enviam
                  por e-mail. De cada mensagem reconhecida como comunicação processual, o sistema grava no banco de
                  dados do escritório o remetente, o assunto, a data, o número do processo e um trecho do corpo da
                  mensagem (até 3.000 caracteres). Mensagens que não correspondem a esses critérios não são gravadas.
                </li>
                <li>
                  <b>Envio pelo Gmail</b> (<code>gmail.send</code>) — enviar a resposta ao cliente a partir da
                  própria caixa do advogado, e somente quando ele aciona esse envio dentro do módulo de Atendimento.
                  O Lúmen não envia e-mail por conta própria.
                </li>
                <li>
                  <b>Google Drive</b> (<code>drive</code>) — criar e organizar as pastas e os arquivos do escritório
                  (anexos de processos e atendimentos, documentos gerados), inclusive mover e renomear pastas que já
                  existiam antes do Lúmen. O acesso amplo é necessário porque a permissão restrita alcança apenas
                  arquivos criados pelo próprio sistema.
                </li>
                <li>
                  <b>Google Docs</b> (<code>documents</code>) — gerar documentos a partir dos modelos do escritório.
                </li>
                <li>
                  <b>Endereço de e-mail da conta</b> (<code>userinfo.email</code>) — identificar e exibir qual conta
                  foi conectada, para que o escritório saiba qual caixa está sendo lida.
                </li>
              </ul>
              <p>
                <b>Assistente de inteligência artificial.</b> Quando alguém da equipe pergunta ao assistente do
                Lúmen sobre publicações, um trecho de até 300 caracteres do texto da publicação — que pode ter
                origem em um e-mail lido pela permissão acima — é enviado ao provedor de IA para compor a resposta.
                Isso ocorre apenas por ação de um usuário autenticado do escritório, nunca de forma automática. Esses
                dados <b>não são usados para desenvolver, melhorar ou treinar modelos de inteligência artificial</b>.
              </p>
              <p>
                <b>O que não fazemos com esses dados:</b> não os usamos para publicidade; não os vendemos; não os
                transferimos a terceiros além dos provedores de infraestrutura indicados na seção 5; e ninguém lê o
                conteúdo manualmente, salvo com autorização expressa do titular, para investigar um problema técnico
                relatado por ele, por razões de segurança, ou quando exigido por lei.
              </p>
              <p>
                <b>Como revogar.</b> A qualquer momento, em <a className="text-marca-tx hover:text-tx font-semibold" href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">myaccount.google.com/permissions</a>,
                ou removendo a conta conectada dentro do próprio Lúmen. Revogada a autorização, o sistema deixa
                imediatamente de acessar a conta; os registros já gravados no banco do escritório seguem a regra de
                retenção da seção 6 e podem ser excluídos a pedido.
              </p>
              <p className="border-l-2 border-regua-forte pl-3">
                <b>Uso Limitado.</b> O uso e a transferência, pelo Lúmen, de informações recebidas das APIs do Google
                obedecem à <a className="text-marca-tx hover:text-tx font-semibold" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Política de Dados do Usuário dos Serviços de API do Google</a>,
                inclusive aos requisitos de Uso Limitado.
              </p>
            </section>

            <section className="space-y-1.5">
              <h2 className="font-bold text-tx text-lg">5. Com quem os dados são compartilhados</h2>
              <p>
                As mensagens trafegam pela infraestrutura da <b>Meta</b> (WhatsApp Cloud API) para serem entregues ao
                sistema do escritório, conforme os termos e políticas da própria Meta. Dentro do escritório, os dados
                ficam visíveis apenas à equipe autorizada a usar o Lúmen, para fins de atendimento. Não compartilhamos
                esses dados com outros escritórios ou terceiros não envolvidos no seu atendimento.
              </p>
              <p>
                Os provedores de infraestrutura que processam dados por conta do escritório, e apenas para manter o
                sistema no ar, são: <b>Vercel</b> (hospedagem da aplicação), <b>Neon</b> (banco de dados PostgreSQL),
                <b>Google</b> (armazenamento de arquivos no Drive e envio/leitura de e-mail nas contas conectadas
                pela equipe, conforme a seção 4) e o provedor do assistente de inteligência artificial, acionado
                apenas quando alguém da equipe faz uma pergunta a ele. Nenhum desses provedores está autorizado a
                usar os dados para finalidade própria.
              </p>
            </section>

            <section className="space-y-1.5">
              <h2 className="font-bold text-tx text-lg">6. Por quanto tempo guardamos os dados</h2>
              <p>
                O histórico de atendimento é mantido enquanto durar a relação com o escritório e pelo prazo necessário
                para cumprir obrigações legais (incluindo prazos de prescrição aplicáveis a serviços advocatícios),
                podendo ser excluído a pedido do titular, quando não houver impedimento legal para isso.
              </p>
            </section>

            <section className="space-y-1.5">
              <h2 className="font-bold text-tx text-lg">7. Segurança</h2>
              <p>
                O acesso ao sistema é restrito por login individual da equipe do escritório, e os dados ficam
                armazenados em infraestrutura com controle de acesso e criptografia em trânsito.
              </p>
            </section>

            <section className="space-y-1.5">
              <h2 className="font-bold text-tx text-lg">8. Seus direitos</h2>
              <p>
                Nos termos da LGPD, você pode solicitar ao escritório responsável a confirmação, o acesso, a
                correção ou a exclusão dos seus dados pessoais, bem como informações sobre com quem eles foram
                compartilhados. Para exercer esses direitos, entre em contato pelo e-mail indicado na seção 1.
              </p>
            </section>

            <section className="space-y-1.5">
              <h2 className="font-bold text-tx text-lg">9. Alterações desta política</h2>
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
