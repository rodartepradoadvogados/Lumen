// O PERFIL DO ESCRITÓRIO, MONTADO — quem ele é, como atua, e onde ficam as pastas dele.
//
// Módulo PURO de propósito (não importa Prisma): quem consulta o banco é a ferramenta
// `consultar_perfil_do_escritorio` (lib/assistantTools.ts), que faz as consultas com o recorte por
// escritório no próprio `where` — como todas as vizinhas dela — e entrega as linhas prontas aqui.
//
// A SEPARAÇÃO EXISTE PARA ESTA RESPOSTA PODER SER EXERCITADA DE VERDADE. Uma varredura de código
// prova que a função existe; ela não prova que um escritório sem armazenamento conectado recebe o
// "não invente caminho", nem que o nome da pasta saiu da configuração daquele escritório em vez de
// um literal escrito à mão. Com o montador puro, o teste monta o perfil dos dois jeitos e LÊ o que
// saiu (ver lib/testes/perfilDoEscritorio.teste.ts).
//
// NENHUM NOME DE PASTA É ESCRITO AQUI. Todos saem de `montarNomeacao` (lib/driveNaming.ts), a
// mesma função que cria as pastas de verdade e que monta a prévia da tela de Configurações. Um
// escritório que trocou a pasta-mãe ou tirou o prefixo recebe o nome que ele de fato vê no Drive.
// O mesmo vale para o nome do arquivo: o exemplo é montado por `montarNomeArquivoPeticao`, e o da
// mídia do WhatsApp por `montarNomeArquivoWhatsapp` — nunca um formato redigido à mão, que
// divergiria do código no dia seguinte.

import { montarNomeacao, montarNomeArquivoWhatsapp, RAIZ_ROTULO, type RaizKey } from "@/lib/driveNaming";
import { montarNomeArquivoPeticao } from "@/lib/peticionamentoNomeArquivo";
import { DOCUMENT_TYPE_GROUPS } from "@/lib/documentTypes";
import { atuacaoParaOAgente, AVISO_DE_TEXTO_DO_ESCRITORIO } from "@/lib/atuacaoDoEscritorio";

/** Rótulo legível de cada provedor — o valor cru do banco não é o nome que ninguém usa ao falar. */
export const ROTULO_DO_PROVEDOR: Record<string, string> = {
  GOOGLE_DRIVE: "Google Drive",
  ONEDRIVE: "OneDrive",
  DROPBOX: "Dropbox",
};

export function rotuloDoProvedor(valor: string | null | undefined): string {
  return ROTULO_DO_PROVEDOR[valor ?? ""] ?? ROTULO_DO_PROVEDOR.GOOGLE_DRIVE;
}

export type DadosDoPerfil = {
  nome: string;
  descricaoAtuacao: string | null;
  storageProvider: string;
  drivePastaMae: string | null;
  drivePrefixo: string | null;
  /** Há conta do provedor ATIVO conectada a este escritório? Falso é estado normal, não erro. */
  conectado: boolean;
  categoriasDoEscritorio: { rotulo: string; secao: string }[];
  totalDeCategoriasDoEscritorio: number;
  /** O aviso de amostra da casa (AVISO_AMOSTRA, lib/assistantTools.ts) — entra só se truncou. */
  avisoDeAmostra: string;
  /** "Agora" vem de quem chama: este módulo é puro e não decide o relógio. */
  agora: Date;
};

export function montarPerfilDoEscritorio(dados: DadosDoPerfil) {
  const nomeacao = montarNomeacao(dados.drivePastaMae, dados.drivePrefixo);
  const provedor = rotuloDoProvedor(dados.storageProvider);
  const atuacao = atuacaoParaOAgente(dados.descricaoAtuacao);
  const caminho = (raiz: RaizKey) => `${nomeacao.pastaMae}/${nomeacao.raizes[raiz]}`;
  const truncado = dados.totalDeCategoriasDoEscritorio > dados.categoriasDoEscritorio.length;

  return {
    escritorio: {
      nome: dados.nome,
      atuacao: atuacao
        ? { texto: atuacao, comoLer: AVISO_DE_TEXTO_DO_ESCRITORIO }
        : {
            texto: null,
            // A AUSÊNCIA TEM DE SER DITA. Sem esta frase, um campo vazio vira convite a supor a
            // atuação do escritório a partir do nome dele — exatamente o que esta ferramenta
            // existe para não deixar acontecer.
            observacao:
              "Este escritório ainda não escreveu a própria atuação (Configurações → Geral → Atuação do escritório). NÃO deduza as áreas de atuação a partir do nome, dos processos ou de qualquer outra pista: diga que a informação não está cadastrada.",
          },
    },
    armazenamento: {
      provedor,
      conectado: dados.conectado,
      // SEM CONTA CONECTADA NÃO EXISTE PASTA NENHUMA ainda. Dizer isso é o que impede o agente de
      // anunciar um caminho que não existe em lugar nenhum — e de cair num caminho de máquina
      // local como consolo, que é como o padrão antigo de UM escritório virava o padrão de todos.
      aviso: dados.conectado
        ? "Estas são as pastas deste escritório. Confirme a pasta do processo/caso/atendimento antes de salvar; se ela não existir, avise — criá-la é decisão de gente."
        : `Este escritório NÃO tem ${provedor} conectado ao Lúmen. Isso é situação normal, não erro. Não existe pasta para salvar e não há caminho a informar: NUNCA invente um caminho, nunca use a pasta de outro escritório e nunca use um caminho de máquina local. Diga que o armazenamento não está conectado e que a conexão é feita em Configurações → Conexões.`,
      pastaMae: nomeacao.pastaMae,
      raizes: (Object.keys(RAIZ_ROTULO) as RaizKey[]).map((chave) => ({
        para: RAIZ_ROTULO[chave],
        pasta: caminho(chave),
      })),
      ondeCadaDocumentoFica: [
        `Processo judicial ou administrativo: ${caminho("processos")}/<pasta do processo>.`,
        `Caso sem processo (extrajudicial, consultivo): ${caminho("casos")}/<pasta do caso>.`,
        `Atendimento (triagem/captação): ${caminho("atendimentos")}/<pasta do atendimento>.`,
        `Assessoria: ${caminho("assessoria")}/<pasta da empresa-cliente>.`,
        `Peça avulsa, SEM vínculo com processo, caso, atendimento ou assessoria: ${caminho("peticionamento")}/<pasta da sessão>. Com vínculo, esta raiz não é tocada — o documento vai para a pasta do item vinculado.`,
      ],
      subpastaPorCategoria:
        "Dentro da pasta do processo/caso/atendimento/assessoria, o documento fica numa SUBPASTA com o nome exato da categoria dele — a mesma categoria do seletor de tipo de documento do Lúmen (lista em `categorias` abaixo), com a acentuação idêntica. Se a subpasta da categoria não existir, crie-a com esse nome e avise. Se a pasta do processo/caso em si não existir, avise: criá-la é decisão de gente, não sua.",
      nomeDoArquivo: {
        padrao:
          "[aaaa_mm_dd]_CATEGORIA.<extensão> — a data é a de GERAÇÃO do documento; a categoria vai em maiúsculas, sem acento, com `_` no lugar do espaço.",
        exemplo: montarNomeArquivoPeticao({ dataGeracao: dados.agora, tipoPeca: "Embargos de Declaração", tipoPecaOutro: null }),
        seRepetir:
          "Havendo mais de um documento da mesma categoria no mesmo dia para o mesmo item, acrescente um sufixo curto que identifique o conteúdo, para não sobrescrever o anterior.",
        excecaoDaMidiaDoWhatsapp: `Mídia recebida pelo WhatsApp não segue este padrão e não entra em subpasta de categoria: fica na RAIZ da pasta do atendimento, com o nome que o Lúmen já deu a ela (exemplo: "${montarNomeArquivoWhatsapp({ recebidoEm: dados.agora, mimeType: "image/jpeg", waMessageId: "exemplo" })}"). Um áudio ou uma foto que o cliente mandou não tem tipo de documento — não tente classificá-la, não renomeie e não mova.`,
      },
    },
    categorias: {
      regra:
        "Use a categoria MAIS ESPECÍFICA que couber, nunca a genérica por comodidade. Se nenhuma couber, não invente pasta: avise que falta um tipo compatível, para o escritório criar o tipo dentro do próprio Lúmen.",
      nativas: DOCUMENT_TYPE_GROUPS.map((g) => ({ grupo: g.group, categorias: g.types.map((t) => t.label) })),
      doEscritorio: {
        total: dados.totalDeCategoriasDoEscritorio,
        mostrados: dados.categoriasDoEscritorio.length,
        truncado,
        categorias: dados.categoriasDoEscritorio.map((t) => ({ grupo: t.secao, categoria: t.rotulo })),
        ...(truncado ? { aviso: dados.avisoDeAmostra } : {}),
      },
    },
  };
}
