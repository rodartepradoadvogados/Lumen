import { prisma } from "@/lib/prisma";
import { exigirAcessoAoAtendimentoNaTela } from "@/lib/guardaDoAtendimento";
import { LIMITE_DE_RESPOSTAS_POR_ESCRITORIO, ordenarRespostas, podeMexerNaResposta } from "@/lib/respostasRapidas";
import { TituloDeTela } from "@/components/atendimento-app/ui";
import VoltarParaMais from "@/components/atendimento-app/VoltarParaMais";
import ManterRespostasRapidas from "@/components/atendimento-app/ManterRespostasRapidas";

export const dynamic = "force-dynamic";

// RESPOSTAS RÁPIDAS DO ESCRITÓRIO (PR 10): a tela onde se criam, editam e excluem os textos que o chat insere com
// um toque. Acesso: quem tem acesso ao Atendimento (a porta `exigirAcessoAoAtendimentoNaTela` dá 404 para o resto).
// A lista é SÓ do escritório de quem olha (`officeId` no WHERE); editar e excluir é do autor ou do nível total,
// e a ação de servidor confere de novo — esconder o botão não protege.
export default async function RespostasRapidasPage() {
  const viewer = await exigirAcessoAoAtendimentoNaTela();
  const linhas = await prisma.respostaRapida.findMany({
    where: { officeId: viewer.officeId },
    select: { id: true, titulo: true, texto: true, criadaPorId: true },
    take: LIMITE_DE_RESPOSTAS_POR_ESCRITORIO,
  });
  const itens = ordenarRespostas(linhas).map((l) => ({ id: l.id, titulo: l.titulo, texto: l.texto, podeEditar: podeMexerNaResposta(viewer, l.criadaPorId) }));

  return (
    <div className="animate-fade-in pb-4">
      <VoltarParaMais />
      <TituloDeTela titulo="Respostas rápidas" />
      <div className="mx-4 mt-2 space-y-4">
        <p className="text-app-previa text-atd-previa">
          Textos prontos do escritório. No chat, um toque no raio coloca a resposta no campo de mensagem; ela só é enviada quando você aperta Enviar. Todos com acesso ao Atendimento criam; edita e exclui quem criou, a recepção e os sócios administradores.
        </p>
        <ManterRespostasRapidas inicial={itens} />
      </div>
    </div>
  );
}
