import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { ShellPeticionamento } from "@/components/peticionamento/Shell";
import { DocumentosClient } from "@/components/peticionamento/DocumentosClient";
import { obterSessaoPeticionamento, listarDocumentosDoVinculo, listarAnexosDaSessao, avaliarTrabalhoEmAndamento, contarRascunhos, gravarPassoDaSessao } from "@/lib/actions/peticionamento";
import { avaliarProntidao } from "@/lib/peticionamentoMinimo";

export const dynamic = "force-dynamic";

export default async function DocumentosPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) notFound();
  const sessao = await obterSessaoPeticionamento(params.id).catch(() => null);
  if (!sessao) notFound();

  // Grava o passo real a cada navegação — Retomar usa isto, não mais a dedução (lib/peticionamentoPasso.ts).
  const [documentosExistentes, anexos, temTrabalho, rascunhosCount] = await Promise.all([
    listarDocumentosDoVinculo(params.id),
    listarAnexosDaSessao(params.id),
    avaliarTrabalhoEmAndamento(params.id),
    contarRascunhos(),
    gravarPassoDaSessao(params.id, "documentos"),
  ]);
  const prontidao = avaliarProntidao({ fatos: sessao.fatos, pedidos: (sessao.pedidos as string[] | null) ?? [] });
  const jaSelecionados = ((sessao.documentosExistentesIds as string[] | null) ?? []) as string[];

  return (
    <ShellPeticionamento
      sessaoId={params.id}
      ativo="documentos"
      crumbAtual="Documentos"
      nomeUsuario={user.name}
      papelUsuario={`OAB ${user.oab ?? "—"} · ${user.role}`}
      temTrabalho={temTrabalho}
      rascunhosCount={rascunhosCount}
    >
      <DocumentosClient
        sessaoId={params.id}
        documentosExistentes={documentosExistentes}
        jaSelecionados={jaSelecionados}
        anexosIniciais={anexos.map((a) => ({ id: a.id, nome: a.nome, markdownConvertido: a.markdownConvertido, markdownRecusado: a.markdownRecusado }))}
        pronto={prontidao.pronto}
        faltando={prontidao.faltando}
      />
    </ShellPeticionamento>
  );
}
