import type { ContatoConhecido } from "@/lib/quemEEsteNumero";
import type { EstadoDaRecusa } from "@/lib/recusaDoLead";
import type { TriagemGravada } from "@/lib/triagemApurada";

// O que o servidor entrega à aba Detalhes. Tudo já é texto, número ou "aaaa-mm-dd" (nada de Date, que não
// atravessa a fronteira servidor/cliente sem virar texto de fuso).

export type Usuario = { id: string; name: string };

export type Anexo = {
  id: string;
  name: string;
  driveUrl: string;
  docType: string;
  /** "12/03/2026" já no fuso do escritório. */
  dataLabel: string;
  uploadedByName: string | null;
};

export type Pendencia = {
  id: string;
  direction: "SOLICITAR" | "ENVIAR" | string;
  kind: string;
  description: string | null;
  status: string;
  /** "aaaa-mm-dd" ou null. */
  dueDay: string | null;
  responsibleId: string | null;
  responsibleName: string | null;
};

export type Tarefa = {
  id: string;
  title: string;
  type: string;
  priority: string;
  status: string;
  dueDay: string | null;
  columnId: string | null;
  responsibleId: string | null;
  responsibleName: string | null;
};

export type Coluna = { id: string; name: string; isDoneCol: boolean };

export type Anotacao = { id: string; content: string; referenceDay: string; criadaLabel: string };

export type Recusa = {
  id: string;
  estado: EstadoDaRecusa;
  motivoTexto: string;
  observacao: string | null;
  token: string;
  enviadaEm: string | null;
  abertaEm: string | null;
  aberturas: number;
  revisitaEm: string | null;
  recusadaPor: string | null;
  porAgente: boolean;
};

export type DadosDaConversa = {
  id: string;
  clientName: string;
  subject: string;
  area: string | null;
  description: string | null;
  channel: string;
  status: string;
  stage: string;
  lostReason: string | null;
  waPhone: string | null;
  contactPhone: string | null;
  clientEmail: string | null;
  leadSource: string | null;
  estimatedValue: number | null;
  nextContactDay: string | null;
  responsibleId: string | null;
  responsibleName: string | null;
  honorario: string | null;
  feeMode: string | null;
  campanha: string | null;
  abertoEmLabel: string;
  agenteResponde: boolean;
  agenteSilenciado: boolean;
  documentoPendente: string | null;
  documentoAteLabel: string | null;
  propostaDeRecusa: string | null;
  propostaDeRecusaEmLabel: string | null;
  propostaDeRecusaEmISO: string | null;
  convertedCase: { id: string; title: string; type: string; processNumber: string | null } | null;
};

export type PropsDosDetalhes = {
  conversa: DadosDaConversa;
  /** Telefone que identifica o contato (WhatsApp ou de contato) e quem ele é na agenda do escritório. */
  telefone: string | null;
  contato: ContatoConhecido | null;
  triagem: TriagemGravada;
  pendencias: Pendencia[];
  tarefas: Tarefa[];
  colunas: Coluna[];
  anexos: Anexo[];
  anotacoes: Anotacao[];
  usuarios: Usuario[];
  recusa: Recusa | null;
  motivosDeRecusa: { id: string; rotulo: string }[];
  enderecoDoSite: string;
  nomeDoEscritorio: string;
  /** Quem olha: define o que pode (desfazer recusa e escolher responsável são do nível total). */
  veTudo: boolean;
  meuId: string;
  hoje: string;
  /** Como o cliente do processo nasceria (para a revisão da conversão). */
  clienteDaConversa: "vinculado" | "mesmoNome" | "novo";
  contagens: { anexos: number; anotacoesMinhas: number; pendenciasAbertas: number; tarefasAbertas: number; temPastaNoDrive: boolean };
};
