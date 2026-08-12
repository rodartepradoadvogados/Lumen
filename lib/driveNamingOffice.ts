import { prisma } from "@/lib/prisma";
import { montarNomeacao, type NomeacaoDrive } from "@/lib/driveNaming";

// Lado servidor de lib/driveNaming.ts: lê a configuração deste escritório e devolve os nomes já
// montados. Fica separado para o módulo de nomes continuar puro e poder ser usado também pela tela
// de configuração (componente de cliente) na prévia.
export async function nomeacaoDoEscritorio(officeId: string): Promise<NomeacaoDrive> {
  const office = await prisma.office.findUnique({
    where: { id: officeId },
    select: { drivePastaMae: true, drivePrefixo: true },
  });
  return montarNomeacao(office?.drivePastaMae, office?.drivePrefixo);
}
