import { readFileSync } from "node:fs";
import { join } from "node:path";
import webpush from "web-push";
import { teste, igual, verdade, resumo, codigoDe } from "./executar";
import {
  avisarMensagemNova,
  CORPO_DO_AVISO,
  JANELA_ANTI_RAJADA_MS,
  lerConfiguracaoVapid,
  montarCargaDoAviso,
  podeReceberOAviso,
  TITULO_DO_AVISO,
  type ConfiguracaoVapid,
  type OpcoesDoEnvio,
  type PessoaComInscricoes,
  type PortasDoAviso,
} from "@/lib/pushDoAtendimento";
import { desinscreverAparelho, enderecoDePushPermitido, estadoDoPush, inscreverAparelho, lerInscricao, type PortasDaInscricao, type Viewer } from "@/lib/inscricaoDePush";
import { chaveParaUint8Array, situacaoDoAviso, TEXTOS_DO_AVISO, type EntradaDoAviso } from "@/lib/avisoPushDoApp";

// ============================================================================
// R2B — O AVISO DE MENSAGEM NOVA (Web Push) do aplicativo de Atendimento. Prova: quem recebe (o recorte do chat), o
// corpo sem texto nem nome, que uma falha de push nunca derruba o webhook, a limpeza de inscrição morta (404/410),
// o anti-rajada, o fail-closed, a guarda das rotas e o cartão da tela Mais (permissão só por toque).
// ============================================================================

const RAIZ = process.cwd();
const le = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");
const CHAVES = webpush.generateVAPIDKeys();
const ENV_OK = { VAPID_PUBLIC_KEY: CHAVES.publicKey, VAPID_PRIVATE_KEY: CHAVES.privateKey, VAPID_SUBJECT: "mailto:contato@rodarteprado.com.br" };
const CONFIG = lerConfiguracaoVapid(ENV_OK) as ConfiguracaoVapid;

// ── A CONFIGURAÇÃO É FAIL-CLOSED ─────────────────────────────────────────────────────────────────

teste("VAPID: com as três variáveis válidas abre; faltando qualquer uma, ou malformada, FECHA", () => {
  verdade(CONFIG && CONFIG.publica === CHAVES.publicKey && CONFIG.assunto.startsWith("mailto:"), "com tudo certo deve abrir");
  for (const faltando of ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"] as const) {
    verdade(lerConfiguracaoVapid({ ...ENV_OK, [faltando]: "" }) === null, `sem ${faltando} deve fechar`);
    verdade(lerConfiguracaoVapid({ ...ENV_OK, [faltando]: undefined }) === null, `${faltando} ausente deve fechar`);
  }
  verdade(lerConfiguracaoVapid({}) === null, "ambiente vazio fecha");
  verdade(lerConfiguracaoVapid({ ...ENV_OK, VAPID_PUBLIC_KEY: "abc" }) === null, "chave pública curta fecha");
  verdade(lerConfiguracaoVapid({ ...ENV_OK, VAPID_PRIVATE_KEY: "abc" }) === null, "chave privada curta fecha");
  verdade(lerConfiguracaoVapid({ ...ENV_OK, VAPID_SUBJECT: "contato@rodarteprado.com.br" }) === null, "assunto sem mailto:/https fecha");
  verdade(lerConfiguracaoVapid({ ...ENV_OK, VAPID_SUBJECT: "https://lumen.rodarteprado.com.br" }) !== null, "assunto https vale");
  // Aspas e quebras de linha coladas na Vercel não derrubam (mesma sanitização do push do site).
  verdade(lerConfiguracaoVapid({ ...ENV_OK, VAPID_PUBLIC_KEY: `"${CHAVES.publicKey}"\n`, VAPID_PRIVATE_KEY: ` ${CHAVES.privateKey} ` }) !== null, "aspas e espaço colados são limpos");
});

// ── A CARGA: SEM TEXTO E SEM NOME ────────────────────────────────────────────────────────────────

teste("CARGA: o corpo é sempre a frase fixa; só tag e url dependem da conversa", () => {
  const c = montarCargaDoAviso("cm8abc123def456ghi789jkl");
  igual(c, { tipo: "mensagem-nova", title: TITULO_DO_AVISO, body: CORPO_DO_AVISO, tag: "atd-cm8abc123def456ghi789jkl", url: "/atendimento-app/cm8abc123def456ghi789jkl" });
  verdade(CORPO_DO_AVISO === "Nova mensagem no Atendimento", "a frase do pedido");
  igual(Object.keys(c).sort(), ["body", "tag", "tipo", "title", "url"], "nenhum campo a mais que possa levar conteúdo");
  const outra = montarCargaDoAviso("zzz");
  igual({ ...c, tag: "", url: "" }, { ...outra, tag: "", url: "" }, "duas conversas diferem só em tag e url");
});

// ── QUEM RECEBE: O MESMO RECORTE DO CHAT ─────────────────────────────────────────────────────────

const admin = { id: "u-admin", isAdmin: true, role: "Admin", recebeTransferencia: false };
const recepcao = { id: "u-rec", isAdmin: false, role: "Secretária", recebeTransferencia: false };
const advNaEscalaA = { id: "u-a", isAdmin: false, role: "Advogado", recebeTransferencia: true };
const advNaEscalaB = { id: "u-b", isAdmin: false, role: "Advogado", recebeTransferencia: true };
const advForaDaEscala = { id: "u-fora", isAdmin: false, role: "Advogado", recebeTransferencia: false };
const financeiro = { id: "u-fin", isAdmin: false, role: "Financeiro", recebeTransferencia: false };
const desconhecido = { id: "u-x", isAdmin: false, role: null, recebeTransferencia: null };

teste("QUEM RECEBE: nível total vê todos; próprios só os seus; nenhum não recebe", () => {
  const doA = { responsibleId: "u-a" };
  const semDono = { responsibleId: null };
  verdade(podeReceberOAviso(admin, doA) && podeReceberOAviso(admin, semDono), "administrador recebe de qualquer conversa");
  verdade(podeReceberOAviso(recepcao, doA) && podeReceberOAviso(recepcao, semDono), "recepção recebe de qualquer conversa");
  verdade(podeReceberOAviso(advNaEscalaA, doA), "o dono recebe");
  verdade(!podeReceberOAviso(advNaEscalaB, doA), "advogado NÃO recebe conversa do colega");
  verdade(!podeReceberOAviso(advNaEscalaA, semDono), "advogado não recebe conversa sem dono (ele só vê o que é seu)");
  verdade(!podeReceberOAviso(advForaDaEscala, { responsibleId: "u-fora" }), "advogado fora da escala não tem acesso, mesmo sendo o dono");
  verdade(!podeReceberOAviso(financeiro, doA) && !podeReceberOAviso(desconhecido, doA), "papel sem acesso não recebe");
  verdade(!podeReceberOAviso({ ...admin, active: false }, doA), "pessoa desativada não recebe");
});

// ── AS PORTAS FALSAS ─────────────────────────────────────────────────────────────────────────────

type Chamada = { inscricaoId: string; carga: string; opcoes: OpcoesDoEnvio };
function montar(opcoes: {
  dono?: string | null;
  existe?: boolean;
  recentes?: number;
  pessoas?: PessoaComInscricoes[];
  falhas?: Record<string, unknown>;
  travarEnvio?: boolean;
  falharBusca?: boolean;
}) {
  const enviadas: Chamada[] = [];
  const apagadas: string[][] = [];
  const vistas: string[][] = [];
  const consultasDeRecentes: { desde: Date; menosEssa: string | null }[] = [];
  const portas: PortasDoAviso = {
    async atendimento() {
      return opcoes.existe === false ? null : { responsibleId: opcoes.dono ?? null };
    },
    async entradasRecentes(_a, desde, menosEssa) {
      consultasDeRecentes.push({ desde, menosEssa });
      return opcoes.recentes ?? 0;
    },
    async pessoasComInscricao() {
      if (opcoes.falharBusca) throw new Error("banco fora do ar");
      return opcoes.pessoas ?? [];
    },
    async enviar(i, carga, op) {
      if (opcoes.travarEnvio) return new Promise<void>(() => {});
      if (opcoes.falhas && i.id in opcoes.falhas) throw opcoes.falhas[i.id];
      enviadas.push({ inscricaoId: i.id, carga, opcoes: op });
    },
    async apagarInscricoes(ids) {
      apagadas.push(ids);
    },
    async marcarVistas(ids) {
      vistas.push(ids);
    },
  };
  return { portas, enviadas, apagadas, vistas, consultasDeRecentes };
}
const inscr = (id: string) => [{ id, endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, p256dh: "p", auth: "a" }];
const pessoa = (u: typeof admin, ...ids: string[]): PessoaComInscricoes => ({ ...u, inscricoes: ids.flatMap(inscr) });
const ENTRADA = { officeId: "of1", attendanceId: "cm8atd0001", mensagemId: "m1", recebidaEm: new Date("2026-09-30T12:00:00Z") };

teste("ENVIO: só quem tem acesso àquela conversa recebe — e o corpo não leva texto nem nome", async () => {
  // O cliente escreveu um texto sensível e tem nome: nada disso existe nas portas (só o dono do atendimento), e a
  // carga enviada é a frase fixa.
  const NOME = "Maria Aparecida da Silva";
  const TEXTO = "Meu CPF é 123.456.789-00 e fui demitida";
  const f = montar({
    dono: "u-a",
    pessoas: [pessoa(admin, "i-admin"), pessoa(recepcao, "i-rec"), pessoa(advNaEscalaA, "i-a1", "i-a2"), pessoa(advNaEscalaB, "i-b"), pessoa(advForaDaEscala, "i-fora"), pessoa(financeiro, "i-fin")],
  });
  const r = await avisarMensagemNova(ENTRADA, f.portas, CONFIG);
  igual(f.enviadas.map((e) => e.inscricaoId).sort(), ["i-a1", "i-a2", "i-admin", "i-rec"], "administrador, recepção e o dono (dois aparelhos); ninguém mais");
  igual(r.enviados, 4);
  for (const e of f.enviadas) {
    const carga = JSON.parse(e.carga);
    igual(carga.body, "Nova mensagem no Atendimento");
    igual(carga.url, "/atendimento-app/cm8atd0001");
    verdade(!e.carga.includes(NOME) && !e.carga.includes(TEXTO) && !/Maria|CPF|demitida/.test(e.carga), "a carga não pode conter nome nem texto");
    igual(e.opcoes.topic, "cm8atd0001", "o topic agrupa no serviço de push por conversa");
    verdade(e.opcoes.timeout <= 5_000 && e.opcoes.TTL > 0, "tempo curto por envio");
  }
  igual(f.vistas.flat().sort(), ["i-a1", "i-a2", "i-admin", "i-rec"], "quem recebeu tem o lastSeen renovado");
});

teste("ENVIO: conversa de outro escritório ou inexistente não avisa ninguém; sem destinatário não envia", async () => {
  const a = montar({ existe: false, pessoas: [pessoa(admin, "i1")] });
  igual((await avisarMensagemNova(ENTRADA, a.portas, CONFIG)).motivo, "sem-atendimento");
  igual(a.enviadas.length, 0);
  const b = montar({ dono: "u-a", pessoas: [pessoa(advNaEscalaB, "i1")] });
  igual((await avisarMensagemNova(ENTRADA, b.portas, CONFIG)).motivo, "sem-destinatario");
  igual(b.enviadas.length, 0);
});

teste("ENVIO: fail-closed — sem configuração VAPID não consulta nada nem envia", async () => {
  let consultou = false;
  const f = montar({ pessoas: [pessoa(admin, "i1")] });
  const portas: PortasDoAviso = { ...f.portas, async atendimento() { consultou = true; return { responsibleId: null }; } };
  const r = await avisarMensagemNova(ENTRADA, portas, null);
  igual(r.motivo, "sem-configuracao");
  verdade(!consultou && f.enviadas.length === 0, "nada consultado, nada enviado");
});

teste("ANTI-RAJADA: se o cliente já mandou outra mensagem na janela, o aviso anterior basta", async () => {
  const f = montar({ recentes: 1, pessoas: [pessoa(admin, "i1")] });
  const r = await avisarMensagemNova(ENTRADA, f.portas, CONFIG);
  igual(r.motivo, "rajada");
  igual(f.enviadas.length, 0);
  // A consulta conta as ENTRADAS dos últimos 30 s SEM a mensagem que acabou de chegar (senão ela mesma bloquearia).
  const q = f.consultasDeRecentes[0];
  igual(q.menosEssa, "m1");
  igual(ENTRADA.recebidaEm.getTime() - q.desde.getTime(), JANELA_ANTI_RAJADA_MS);
  const livre = montar({ recentes: 0, pessoas: [pessoa(admin, "i1")] });
  igual((await avisarMensagemNova(ENTRADA, livre.portas, CONFIG)).enviados, 1);
  verdade(JANELA_ANTI_RAJADA_MS >= 15_000 && JANELA_ANTI_RAJADA_MS <= 120_000, "janela curta");
});

teste("LIMPEZA: 404 e 410 apagam a inscrição; outros erros NÃO (o serviço pode estar só fora do ar)", async () => {
  const f = montar({
    pessoas: [pessoa(admin, "i-ok", "i-404", "i-410", "i-500", "i-429", "i-rede")],
    falhas: { "i-404": { statusCode: 404 }, "i-410": { statusCode: 410 }, "i-500": { statusCode: 500 }, "i-429": { statusCode: 429 }, "i-rede": new Error("ECONNRESET") },
  });
  const r = await avisarMensagemNova(ENTRADA, f.portas, CONFIG);
  igual(f.apagadas.flat().sort(), ["i-404", "i-410"]);
  igual(r.apagadas, 2);
  igual(r.enviados, 1);
  igual(f.vistas.flat(), ["i-ok"], "só a que recebeu tem lastSeen renovado");
});

teste("FALHA NÃO DERRUBA O WEBHOOK: erro do banco, do serviço de push ou da limpeza nunca lança", async () => {
  const silencio = console.error;
  console.error = () => {};
  try {
    const banco = montar({ falharBusca: true });
    const r1 = await avisarMensagemNova(ENTRADA, banco.portas, CONFIG);
    igual(r1.motivo, "erro");
    // A limpeza também falha: continua sem lançar.
    const f = montar({ pessoas: [pessoa(admin, "i1")], falhas: { i1: { statusCode: 410 } } });
    f.portas.apagarInscricoes = async () => {
      throw new Error("sem banco");
    };
    const r2 = await avisarMensagemNova(ENTRADA, f.portas, CONFIG);
    igual(r2.enviados, 0);
    // O atendimento consultado explode: idem.
    const g = montar({});
    g.portas.atendimento = async () => {
      throw new Error("timeout do banco");
    };
    igual((await avisarMensagemNova(ENTRADA, g.portas, CONFIG)).motivo, "erro");
  } finally {
    console.error = silencio;
  }
});

teste("FALHA NÃO ATRASA: um serviço de push que trava é abandonado no limite geral", async () => {
  const silencio = console.error;
  console.error = () => {};
  try {
    const f = montar({ travarEnvio: true, pessoas: [pessoa(admin, "i1")] });
    const inicio = Date.now();
    const r = await avisarMensagemNova(ENTRADA, f.portas, CONFIG, 60);
    igual(r.motivo, "tempo");
    verdade(Date.now() - inicio < 1_000, "voltou logo, sem esperar o serviço");
  } finally {
    console.error = silencio;
  }
});

teste("ENVIO (código): nada de web-push é chamado sem tempo, e o tempo geral cabe no webhook", () => {
  const c = codigoDe(le("lib/pushDoAtendimento.ts"));
  verdade(/timeout: opcoes\.timeout/.test(c) && /LIMITE_POR_ENVIO_MS = 4_000/.test(c) && /LIMITE_GERAL_MS = 5_000/.test(c), "timeouts curtos");
  verdade(/vapidDetails:/.test(c) && !/setVapidDetails/.test(c), "as chaves vão por chamada, sem estado global compartilhado com o push do site");
  verdade(/catch \(e\)[\s\S]*?return \{ enviados: 0, apagadas: 0, motivo: "erro" \}/.test(c), "a função inteira é protegida por try/catch");
  // Quem monta a carga não recebe nome nem texto: a assinatura só tem o id da conversa.
  verdade(/export function montarCargaDoAviso\(attendanceId: string\)/.test(c), "a carga só conhece o id da conversa");
  verdade(!/clientName|\.body\b|\.texto\b|profileName/.test(c.replace(/body: CORPO_DO_AVISO/, "")), "o módulo do aviso nunca lê nome nem texto do cliente");
});

// ── O GANCHO: UM SÓ CAMINHO, DEPOIS DE A MENSAGEM ESTAR GRAVADA ───────────────────────────────────

teste("GANCHO: os DOIS provedores entram por ingestIncomingWhatsapp, que avisa depois de gravar e sem bloquear a mídia", () => {
  const w = codigoDe(le("lib/whatsapp.ts"));
  const ingest = w.slice(w.indexOf("export async function ingestIncomingWhatsapp"));
  const gravou = ingest.indexOf("await registrarMensagem(");
  const iniciou = ingest.indexOf("avisarMensagemNova(");
  const midia = ingest.indexOf("if (midia) {");
  const esperou = ingest.indexOf("await avisoDePush");
  const devolveu = ingest.indexOf("return attendance.id");
  verdade(gravou > 0 && iniciou > gravou, "o aviso começa DEPOIS de a mensagem estar gravada");
  verdade(!/await avisarMensagemNova/.test(ingest), "o aviso não é esperado no ponto em que começa (a mídia baixa enquanto ele viaja)");
  verdade(midia > iniciou && esperou > midia && devolveu > esperou, "só é esperado depois do bloco da mídia, antes de devolver");
  verdade(codigoDe(le("app/api/whatsapp/route.ts")).includes("ingestIncomingWhatsapp(incoming)"), "Meta entra por ingestIncomingWhatsapp");
  verdade(codigoDe(le("app/api/whatsapp/evolution/route.ts")).includes("ingestIncomingWhatsapp(entrada)"), "Evolution entra por ingestIncomingWhatsapp");
  // Só mensagem do CLIENTE: a função que avisa só é chamada no caminho de entrada (a saída nasce em envioDeMensagemDb).
  for (const f of ["lib/envioDeMensagemDb.ts", "lib/atendenteResponde.ts", "lib/notaDaConversaDb.ts"]) verdade(!codigoDe(le(f)).includes("avisarMensagemNova"), `${f} (saída/nota) não dispara aviso`);
});

// ── AS ROTAS: GUARDA, FAIL-CLOSED E VALIDAÇÃO ────────────────────────────────────────────────────

const SEM_ACESSO: Viewer = { id: "u-fin", officeId: "of1", isAdmin: false, role: "Financeiro", recebeTransferencia: false };
const COM_ACESSO: Viewer = { id: "u-a", officeId: "of1", isAdmin: false, role: "Advogado", recebeTransferencia: true };
const ENDERECO = "https://fcm.googleapis.com/fcm/send/abc123";
const CORPO = JSON.stringify({ subscription: { endpoint: ENDERECO, keys: { p256dh: "BNc-p256dhAAAA", auth: "auth_Key-12" } } });
function portasDaInscricao() {
  const gravadas: unknown[] = [];
  const apagadas: [string, string][] = [];
  const p: PortasDaInscricao = {
    async gravar(d) {
      gravadas.push(d);
    },
    async apagar(u, e) {
      apagadas.push([u, e]);
    },
  };
  return { p, gravadas, apagadas };
}

teste("ROTA: sem sessão 401, sem acesso ao Atendimento 403 — nas três operações, sem tocar no banco", async () => {
  const { p, gravadas, apagadas } = portasDaInscricao();
  igual(estadoDoPush(null, ENV_OK).status, 401);
  igual(estadoDoPush(SEM_ACESSO, ENV_OK).status, 403);
  igual((await inscreverAparelho(null, CORPO, "ua", p, ENV_OK)).status, 401);
  igual((await inscreverAparelho(SEM_ACESSO, CORPO, "ua", p, ENV_OK)).status, 403);
  igual((await desinscreverAparelho(null, JSON.stringify({ endpoint: ENDERECO }), p)).status, 401);
  igual((await desinscreverAparelho(SEM_ACESSO, JSON.stringify({ endpoint: ENDERECO }), p)).status, 403);
  igual(gravadas.length + apagadas.length, 0, "nada gravado nem apagado");
  const r = codigoDe(le("app/api/atendimento/push/route.ts"));
  for (const metodo of ["GET", "POST", "DELETE"]) {
    const corpo = r.slice(r.indexOf(`export async function ${metodo}(`));
    const guarda = corpo.indexOf("await guarda()");
    verdade(guarda > 0 && guarda < corpo.indexOf("req.text()") + (corpo.includes("req.text()") ? 0 : 1e9), `${metodo}: a guarda vem antes de ler o corpo`);
    verdade(/if \(g\.erro\) return g\.erro;/.test(corpo.slice(0, 400)), `${metodo}: recusa sem sessão`);
  }
  verdade(r.includes("acessoAoAtendimentoDaRota"), "usa a guarda do Atendimento");
  const g = codigoDe(le("lib/guardaDoAtendimento.ts"));
  const corpoDaGuarda = g.slice(g.indexOf("export async function acessoAoAtendimentoDaRota"), g.indexOf("export async function atendimentoDaRota"));
  verdade(corpoDaGuarda.includes("podeVerAtendimentos(viewer)") && corpoDaGuarda.includes("status: 401") && corpoDaGuarda.includes("status: 403"), "a guarda faz 401 e 403");
});

teste("ROTA: sem chaves VAPID o servidor diz 'indisponível' (GET) e recusa inscrever (503), sem quebrar", async () => {
  const { p, gravadas } = portasDaInscricao();
  const semChaves = estadoDoPush(COM_ACESSO, {});
  igual(semChaves.status, 200);
  igual(semChaves.corpo, { disponivel: false, chavePublica: null });
  igual((await inscreverAparelho(COM_ACESSO, CORPO, "ua", p, {})).status, 503);
  igual((await inscreverAparelho(COM_ACESSO, CORPO, "ua", p, { ...ENV_OK, VAPID_SUBJECT: "" })).status, 503, "falta só o assunto: também fecha");
  igual(gravadas.length, 0);
  const com = estadoDoPush(COM_ACESSO, ENV_OK);
  igual(com.corpo, { disponivel: true, chavePublica: CHAVES.publicKey });
  verdade(!JSON.stringify(com.corpo).includes(CHAVES.privateKey), "a chave privada nunca sai");
});

teste("ROTA: inscrever grava SEMPRE para o usuário da sessão e o escritório dele (o corpo não escolhe o dono)", async () => {
  const { p, gravadas } = portasDaInscricao();
  const forjado = JSON.stringify({ userId: "u-admin", officeId: "of-alheio", subscription: { endpoint: ENDERECO, keys: { p256dh: "BNc-p256dhAAAA", auth: "auth_Key-12" } } });
  const r = await inscreverAparelho(COM_ACESSO, forjado, "Mozilla/5.0 (iPhone)", p, ENV_OK);
  igual(r.status, 200);
  igual(gravadas, [{ officeId: "of1", userId: "u-a", userAgent: "Mozilla/5.0 (iPhone)", endpoint: ENDERECO, p256dh: "BNc-p256dhAAAA", auth: "auth_Key-12" }]);
  // A forma que o navegador entrega (a inscrição direta, sem o embrulho) também vale.
  igual((await inscreverAparelho(COM_ACESSO, JSON.stringify({ endpoint: ENDERECO, keys: { p256dh: "BNc-p256dhAAAA", auth: "auth_Key-12" } }), null, p, ENV_OK)).status, 200);
});

teste("ROTA: desinscrever só apaga o aparelho da PRÓPRIA pessoa", async () => {
  const { p, apagadas } = portasDaInscricao();
  igual((await desinscreverAparelho(COM_ACESSO, JSON.stringify({ endpoint: ENDERECO, userId: "u-admin" }), p)).status, 200);
  igual(apagadas, [["u-a", ENDERECO]], "o usuário vem da sessão");
  igual((await desinscreverAparelho(COM_ACESSO, "{", p)).status, 400);
  igual((await desinscreverAparelho(COM_ACESSO, "{}", p)).status, 400);
  const c = codigoDe(le("lib/inscricaoDePush.ts"));
  verdade(/deleteMany\(\{ where: \{ userId, endpoint \} \}\)/.test(c), "o apagar do banco é por usuário E endereço");
});

teste("ROTA: só endereços de serviços de push conhecidos, em https (sem SSRF); chaves e tamanhos conferidos", async () => {
  for (const bom of ["https://fcm.googleapis.com/fcm/send/x", "https://updates.push.services.mozilla.com/wpush/v2/x", "https://web.push.apple.com/Q1", "https://wns2-par02p.notify.windows.com/w/?token=x", "https://android.googleapis.com/gcm/send/x"]) {
    verdade(enderecoDePushPermitido(bom), `${bom} deve valer`);
  }
  for (const ruim of ["http://fcm.googleapis.com/fcm/send/x", "https://evil.example.com/push", "https://fcm.googleapis.com.evil.com/x", "https://169.254.169.254/latest/meta-data", "https://localhost/x", "https://user:pw@fcm.googleapis.com/x", "https://fcm.googleapis.com:8443/x", "not a url", "", "https://push.apple.com.evil.io/x", "https://evilpush.apple.com.br/x"]) {
    verdade(!enderecoDePushPermitido(ruim), `${ruim} não pode valer`);
  }
  verdade(!lerInscricao({ endpoint: ENDERECO, keys: { p256dh: "com espaço", auth: "ok" } }).ok, "chave com caractere inválido");
  verdade(!lerInscricao({ endpoint: ENDERECO, keys: { p256dh: "x".repeat(300), auth: "ok" } }).ok, "chave grande demais");
  verdade(!lerInscricao({ endpoint: ENDERECO }).ok && !lerInscricao(null).ok && !lerInscricao("texto").ok, "sem chaves / nulo / texto");
  const { p, gravadas } = portasDaInscricao();
  igual((await inscreverAparelho(COM_ACESSO, JSON.stringify({ subscription: { endpoint: "https://evil.example.com/x", keys: { p256dh: "BNc", auth: "abc" } } }), "ua", p, ENV_OK)).status, 400);
  igual((await inscreverAparelho(COM_ACESSO, "x".repeat(5_000), "ua", p, ENV_OK)).status, 400, "corpo enorme");
  igual((await inscreverAparelho(COM_ACESSO, "não é json", "ua", p, ENV_OK)).status, 400);
  igual(gravadas.length, 0);
});

teste("SAIR: o servidor apaga os avisos da pessoa, e o botão Sair desinscreve o aparelho antes de encerrar", () => {
  verdade(codigoDe(le("lib/actions/auth.ts")).includes("atendimentoPushInscricao.deleteMany({ where: { userId: viewer.id } })"), "logout apaga as inscrições do Atendimento");
  const f = codigoDe(le("components/atendimento-app/FormularioDeSair.tsx"));
  verdade(f.includes('method: "DELETE"') && f.includes("/api/atendimento/push") && f.includes("sub.unsubscribe()"), "desinscreve no servidor e no navegador");
  verdade(f.includes("limparRastrosDoAparelho()") && f.includes("requestSubmit()") && /setTimeout\(r, TEMPO_PARA_DESINSCREVER_MS\)/.test(f), "espera no máximo alguns segundos e depois o Sair segue");
});

// ── O CARTÃO DA TELA MAIS ────────────────────────────────────────────────────────────────────────

const BASE: EntradaDoAviso = { lido: true, temServiceWorker: true, temPushManager: true, temNotification: true, ehIos: false, instalado: false, permissao: "default", servidorDisponivel: true, inscrito: false };

teste("CARTÃO: cada estado real — verificando, iPhone sem instalar, não suportado, indisponível, bloqueado, desligado, ligado", () => {
  igual(situacaoDoAviso({ ...BASE, lido: false }), "verificando");
  igual(situacaoDoAviso({ ...BASE, temPushManager: false, ehIos: true, instalado: false }), "instalar-no-iphone");
  igual(situacaoDoAviso({ ...BASE, temPushManager: false, ehIos: true, instalado: true }), "nao-suportado", "iPhone instalado mas sem push (iOS antigo)");
  igual(situacaoDoAviso({ ...BASE, temNotification: false }), "nao-suportado");
  igual(situacaoDoAviso({ ...BASE, temServiceWorker: false }), "nao-suportado");
  igual(situacaoDoAviso({ ...BASE, servidorDisponivel: false }), "indisponivel");
  igual(situacaoDoAviso({ ...BASE, servidorDisponivel: null }), "verificando");
  igual(situacaoDoAviso({ ...BASE, permissao: "denied" }), "bloqueado");
  igual(situacaoDoAviso({ ...BASE, permissao: "denied", servidorDisponivel: false }), "bloqueado", "bloqueado vale mesmo com o servidor fora");
  igual(situacaoDoAviso(BASE), "desligado");
  igual(situacaoDoAviso({ ...BASE, permissao: "granted" }), "desligado", "permitido mas sem inscrição neste aparelho");
  igual(situacaoDoAviso({ ...BASE, permissao: "granted", inscrito: true }), "ligado");
  igual(situacaoDoAviso({ ...BASE, permissao: "default", inscrito: true }), "desligado", "inscrição sem permissão não conta como ligado");
});

teste("CARTÃO: textos honestos — iPhone só instalado, aviso sem conteúdo, 'indisponível neste servidor', botões certos", () => {
  verdade(/tela inicial|Tela de Início/.test(TEXTOS_DO_AVISO["instalar-no-iphone"].apoio) && /iPhone/.test(TEXTOS_DO_AVISO["instalar-no-iphone"].apoio), "iPhone: só com o app instalado");
  verdade(TEXTOS_DO_AVISO.indisponivel.titulo.includes("indisponível neste servidor"), "diz 'indisponível neste servidor'");
  for (const e of ["desligado", "ligado"] as const) {
    verdade(/nunca leva o nome do cliente nem o texto|sem nome nem texto/.test(TEXTOS_DO_AVISO[e].apoio), `${e}: diz que o aviso não leva conteúdo`);
  }
  verdade(/Google ou da Apple/.test(TEXTOS_DO_AVISO.desligado.apoio), "diz por onde o aviso chega");
  igual(TEXTOS_DO_AVISO.desligado.botao, "ativar");
  igual(TEXTOS_DO_AVISO.ligado.botao, "desativar");
  for (const e of ["verificando", "instalar-no-iphone", "nao-suportado", "indisponivel", "bloqueado"] as const) igual(TEXTOS_DO_AVISO[e].botao, null, `${e}: sem botão`);
  for (const t of Object.values(TEXTOS_DO_AVISO)) verdade(!/a construir/i.test(t.titulo + t.apoio), "nada de 'a construir'");
});

teste("CARTÃO (código): a permissão só é pedida no toque de Ativar; nunca ao abrir; o botão tem 44 px", () => {
  const c = codigoDe(le("components/atendimento-app/AvisosDeMensagemNova.tsx"));
  igual((c.match(/Notification\.requestPermission\(\)/g) ?? []).length, 1, "um único pedido de permissão");
  const dentro = c.slice(c.indexOf("async function ativar()"), c.indexOf("async function desativar()"));
  verdade(dentro.includes("Notification.requestPermission()"), "o pedido está dentro de ativar()");
  verdade(c.includes("onClick={ativar}"), "e ativar só roda no toque");
  const efeitos = c.slice(c.indexOf("useEffect("), c.indexOf("const situacao"));
  verdade(!efeitos.includes("requestPermission"), "nenhum efeito (que roda ao abrir) pede permissão");
  verdade(!/\bativar\(\)/.test(efeitos), "nenhum efeito chama ativar()");
  verdade((c.match(/min-h-11/g) ?? []).length >= 2, "botões de 44 px");
  verdade(c.includes("userVisibleOnly: true") && c.includes("applicationServerKey"), "inscreve com userVisibleOnly e a chave do servidor");
  verdade(c.includes("await sub.unsubscribe()") && c.includes('method: "DELETE"'), "Desativar apaga no servidor e no navegador");
  verdade(!/#[0-9a-fA-F]{3,8}\b/.test(c) && !/\bshadow-/.test(c), "só tokens do app, sem hex nem sombra");
});

teste("CHAVE: a chave pública VAPID vira os 65 bytes que o navegador exige", () => {
  const b = chaveParaUint8Array(CHAVES.publicKey);
  igual(b.length, 65);
  igual(b[0], 4);
  igual(Buffer.from(b).toString("base64url"), CHAVES.publicKey);
});

// ── SERVICE WORKER, SCHEMA, ENV E POLÍTICA ───────────────────────────────────────────────────────

teste("SCHEMA: tabela própria, aditiva, endpoint único, por pessoa e escritório, apagada com a pessoa", () => {
  const s = le("prisma/schema.prisma");
  const m = s.slice(s.indexOf("model AtendimentoPushInscricao"));
  const corpo = m.slice(0, m.indexOf("\n}"));
  for (const campo of ["officeId", "userId", "p256dh", "auth", "userAgent", "createdAt", "lastSeen"]) verdade(corpo.includes(campo), `campo ${campo}`);
  verdade(/endpoint\s+String\s+@unique/.test(corpo), "endpoint único");
  verdade(/onDelete: Cascade/.test(corpo) && /@@index\(\[officeId, userId\]\)/.test(corpo), "cascata e índice");
  verdade(!/texto|body|nome|clientName|mensagem/i.test(corpo.replace(/\/\/.*|\/\/\/.*/g, "")), "nenhum campo de conteúdo");
});

teste("ENV E POLÍTICA: .env.example documenta as três variáveis e o comando; a política de privacidade menciona o serviço de push", () => {
  const e = le(".env.example");
  for (const v of ["VAPID_PUBLIC_KEY=", "VAPID_PRIVATE_KEY=", "VAPID_SUBJECT="]) verdade(e.includes(v), v);
  verdade(e.includes("npx web-push generate-vapid-keys"), "o comando para gerar");
  verdade(!/VAPID_[A-Z_]+=\S/.test(e), "nenhum valor real no exemplo");
  const p = le("app/privacidade/page.tsx");
  verdade(p.includes("aviso de mensagem nova") && /Google<\/b>, <b>Apple<\/b>/.test(p) && p.includes("nem o texto da mensagem, nem o nome ou o telefone"), "a política diz o que passa pelo serviço de push");
  verdade(p.includes("30 de setembro de 2026"), "data da política atualizada");
});

resumo("Atendimento app — aviso de mensagem nova (push)");
