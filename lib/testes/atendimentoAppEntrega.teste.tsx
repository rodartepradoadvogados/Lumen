import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import crypto from "node:crypto";
import { teste, igual, verdade, resumo, codigoDe } from "./executar";
import {
  ehAtualizacaoDaEvolution,
  entregaDaLinha,
  entregaMaisAvancada,
  lerAtualizacoesDaEvolution,
  lerStatusesDaMeta,
  motivoCurto,
  type EventoDeEntrega,
} from "@/lib/entregaDaMensagem";
import { aplicarEventoDeEntrega, aplicarEventosDeEntrega, processarStatusesDaMeta, type BancoDeEntrega, type ConfigDoProvedor } from "@/lib/entregaDaMensagemDb";
import { aplicarEntregas, prepararMensagem, type MensagemDoChat } from "@/lib/mensagensDoChat";
import { montarLinha, type LinhaDaListaApp } from "@/lib/conversasDoApp";
import { EVENTOS_DO_WEBHOOK } from "@/lib/whatsappEvolution";
import BolhaDaMensagem from "@/components/atendimento-app/BolhaDaMensagem";
import ListaDeConversasApp from "@/components/atendimento-app/ListaDeConversasApp";
import { contagensPorFase } from "@/lib/listaDeAtendimentos";

// ============================================================================
// R2A — ENTREGUE / LIDA no chat do aplicativo de Atendimento.
//
// Prova: (1) a leitura do retorno de status dos DOIS provedores (Meta `statuses`, Evolution MESSAGES_UPDATE);
// (2) a regra "só AVANÇA" contra um provedor falso (ordem, repetição, mensagem alheia/desconhecida/de entrada);
// (3) o webhook continua fail-closed; (4) a atualização de 15 s devolve o estado das mensagens já vistas;
// (5) a UI (✓ / ✓✓ / ✓✓ lida, texto para leitor de tela, contraste AA); (6) a Evolution assina o evento novo e
// dá para reaplicar em instância existente sem desconectar; (7) o caminho de envio/Ana não foi tocado.
// ============================================================================

const RAIZ = process.cwd();
const le = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");

// ── PROVEDOR FALSO ─────────────────────────────────────────────────────────────────────────────

type Linha = { id: string; waMessageId: string | null; officeId: string; direction: string; status: string; entregueEm: Date | null; lidaEm: Date | null; falhaProvedor: string | null };
const nova = (o: Partial<Linha> = {}): Linha => ({ id: "m1", waMessageId: "wamid.A", officeId: "o1", direction: "OUT", status: "SENT", entregueEm: null, lidaEm: null, falhaProvedor: null, ...o });

/** Um banco em memória que entende só o `updateMany` com igualdade (o que a regra usa). */
function bancoFalso(linhas: Linha[]): BancoDeEntrega & { linhas: Linha[]; chamadas: number } {
  const b = {
    linhas,
    chamadas: 0,
    whatsappMessage: {
      async updateMany({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) {
        b.chamadas++;
        let count = 0;
        for (const l of linhas) {
          if (Object.entries(where).every(([k, v]) => (l as Record<string, unknown>)[k] === v)) {
            Object.assign(l, data);
            count++;
          }
        }
        return { count };
      },
    },
  };
  return b;
}
const T0 = new Date("2026-09-30T20:00:00.000Z");
const ev = (estado: EventoDeEntrega["estado"], extra: Partial<EventoDeEntrega> = {}): EventoDeEntrega => ({ waMessageId: "wamid.A", estado, quando: null, ...extra });

// ── META: ler `statuses` ───────────────────────────────────────────────────────────────────────

const payloadMeta = (statuses: unknown[], phone = "PN1") => ({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { metadata: { phone_number_id: phone }, statuses } }] }] });

teste("META: sent, delivered, read e failed viram os quatro estados, com a hora do provedor (segundos) e o número", () => {
  const e = lerStatusesDaMeta(
    payloadMeta([
      { id: "wamid.1", status: "sent", timestamp: "1790000000" },
      { id: "wamid.1", status: "delivered", timestamp: "1790000005" },
      { id: "wamid.1", status: "read", timestamp: "1790000010" },
      { id: "wamid.2", status: "failed", timestamp: "1790000011", errors: [{ code: 131026, title: "Message undeliverable" }] },
    ]),
  );
  igual(e.map((x) => x.estado), ["enviada", "entregue", "lida", "falhou"]);
  igual(e[2].quando?.toISOString(), new Date(1790000010 * 1000).toISOString());
  igual(e[3].motivo, "Message undeliverable");
  igual(e[0].phoneNumberId, "PN1");
});

teste("META: lê todas as `entry`/`changes`, ignora status desconhecido, sem id ou lixo, e nunca lança", () => {
  const p = { entry: [payloadMeta([{ id: "a", status: "read" }]).entry[0], payloadMeta([{ id: "b", status: "delivered" }], "PN2").entry[0]] };
  igual(lerStatusesDaMeta(p).map((x) => [x.waMessageId, x.phoneNumberId]), [["a", "PN1"], ["b", "PN2"]]);
  igual(lerStatusesDaMeta(payloadMeta([{ id: "a", status: "deleted" }, { status: "read" }, { id: 5, status: "read" }, null])), []);
  igual(lerStatusesDaMeta(null), []);
  igual(lerStatusesDaMeta("texto"), []);
  igual(lerStatusesDaMeta({ entry: [{ changes: [null] }, null] }), []);
  // mensagem de entrada não tem `statuses`
  igual(lerStatusesDaMeta({ entry: [{ changes: [{ value: { messages: [{ id: "x", type: "text" }] } }] }] }), []);
});

teste("MOTIVO de falha: curto e sem número de telefone", () => {
  verdade(!/\d{8}/.test(motivoCurto("falhou para +55 62 99614-2280 agora") ?? ""), "telefone removido");
  verdade((motivoCurto("x".repeat(500)) ?? "").length <= 160, "curto");
  igual(motivoCurto("   "), undefined);
});

// ── EVOLUTION: ler MESSAGES_UPDATE ─────────────────────────────────────────────────────────────

const upd = (data: unknown, event = "messages.update", instance = "lumen-o1") => ({ event, instance, data });

teste("EVOLUTION: DELIVERY_ACK, READ, PLAYED, SERVER_ACK e ERROR (por nome ou número) viram os estados; PENDING não vira nada", () => {
  const nomes = ["SERVER_ACK", "DELIVERY_ACK", "READ", "PLAYED", "ERROR", "PENDING"].map((s) => lerAtualizacoesDaEvolution(upd({ keyId: "k1", fromMe: true, status: s }))[0]?.estado);
  igual(nomes, ["enviada", "entregue", "lida", "lida", "falhou", undefined]);
  const numeros = [2, 3, 4, 5, 0, 1].map((s) => lerAtualizacoesDaEvolution(upd({ keyId: "k1", fromMe: true, status: s }))[0]?.estado);
  igual(numeros, ["enviada", "entregue", "lida", "lida", "falhou", undefined]);
});

teste("EVOLUTION: aceita a forma antiga (key.id + update.status), lista de eventos, MESSAGES_UPDATE em maiúsculas; ignora recibo de mensagem do CLIENTE (fromMe falso)", () => {
  igual(lerAtualizacoesDaEvolution(upd({ key: { id: "k9", fromMe: true }, update: { status: "READ" } }))[0]?.waMessageId, "k9");
  igual(lerAtualizacoesDaEvolution(upd([{ keyId: "a", fromMe: true, status: "READ" }, { keyId: "b", fromMe: false, status: "READ" }, { keyId: "c", status: "DELIVERY_ACK" }])).map((x) => x.waMessageId), ["a", "c"]);
  verdade(ehAtualizacaoDaEvolution(upd({}, "MESSAGES_UPDATE")) && ehAtualizacaoDaEvolution(upd({}, "messages.update")), "nome do evento");
  verdade(!ehAtualizacaoDaEvolution(upd({}, "messages.upsert")) && !ehAtualizacaoDaEvolution(null), "outros eventos");
  igual(lerAtualizacoesDaEvolution(upd({ keyId: "a", fromMe: true, status: "READ" }, "messages.upsert")), []);
  igual(lerAtualizacoesDaEvolution(upd({ fromMe: true, status: "READ" })), []);
  igual(lerAtualizacoesDaEvolution(undefined), []);
  igual(lerAtualizacoesDaEvolution(upd({ keyId: "a", fromMe: true, status: "READ" }))[0]?.phoneNumberId, "lumen-o1");
});

// ── A REGRA: SÓ AVANÇA ─────────────────────────────────────────────────────────────────────────

teste("AVANÇA: enviada, entregue, lida, em ordem", async () => {
  const b = bancoFalso([nova()]);
  await aplicarEventoDeEntrega("o1", ev("entregue"), b, T0);
  igual(entregaDaLinha(b.linhas[0]), "entregue");
  await aplicarEventoDeEntrega("o1", ev("lida"), b, T0);
  igual(entregaDaLinha(b.linhas[0]), "lida");
  verdade(b.linhas[0].entregueEm && b.linhas[0].lidaEm, "as duas marcas");
});

teste("FORA DE ORDEM: 'lida' antes de 'entregue' deixa as duas marcas; 'entregue' depois de 'lida' NÃO recua", async () => {
  const b = bancoFalso([nova()]);
  await aplicarEventoDeEntrega("o1", ev("lida"), b, T0);
  igual(entregaDaLinha(b.linhas[0]), "lida");
  verdade(b.linhas[0].entregueEm !== null, "lida implica entregue");
  const antes = { ...b.linhas[0] };
  await aplicarEventoDeEntrega("o1", ev("entregue", { quando: new Date("2020-01-01") }), b, T0);
  await aplicarEventoDeEntrega("o1", ev("enviada"), b, T0);
  igual(b.linhas[0], antes);
});

teste("REPETIDO: o mesmo evento duas vezes não muda nada na segunda e não mexe na hora já gravada", async () => {
  const b = bancoFalso([nova()]);
  igual(await aplicarEventoDeEntrega("o1", ev("entregue", { quando: T0 }), b, T0), 1);
  igual(await aplicarEventoDeEntrega("o1", ev("entregue", { quando: new Date("2030-01-01") }), b, T0), 0);
  igual(b.linhas[0].entregueEm?.toISOString(), T0.toISOString());
  await aplicarEventoDeEntrega("o1", ev("lida", { quando: T0 }), b, T0);
  igual(await aplicarEventoDeEntrega("o1", ev("lida", { quando: new Date("2030-01-01") }), b, T0), 0);
  igual(b.linhas[0].lidaEm?.toISOString(), T0.toISOString());
});

teste("FALHOU: marca só quem ainda não foi entregue; depois de entregue/lida é ruído; entrega posterior desfaz a falha do webhook", async () => {
  const a = bancoFalso([nova()]);
  await aplicarEventoDeEntrega("o1", ev("falhou", { motivo: "sem WhatsApp" }), a, T0);
  igual([a.linhas[0].status, a.linhas[0].falhaProvedor], ["FAILED", "sem WhatsApp"]);
  igual(entregaDaLinha(a.linhas[0]), null);
  await aplicarEventoDeEntrega("o1", ev("entregue"), a, T0);
  igual([a.linhas[0].status, a.linhas[0].falhaProvedor, entregaDaLinha(a.linhas[0])], ["SENT", null, "entregue"]);

  const b = bancoFalso([nova({ entregueEm: T0 })]);
  igual(await aplicarEventoDeEntrega("o1", ev("falhou"), b, T0), 0);
  igual(b.linhas[0].status, "SENT");
  const c = bancoFalso([nova({ entregueEm: T0, lidaEm: T0 })]);
  igual(await aplicarEventoDeEntrega("o1", ev("falhou"), c, T0), 0);
  // falha repetida: só a primeira grava
  const d = bancoFalso([nova()]);
  igual(await aplicarEventoDeEntrega("o1", ev("falhou"), d, T0), 1);
  igual(await aplicarEventoDeEntrega("o1", ev("falhou", { motivo: "outro" }), d, T0), 0);
  igual(d.linhas[0].falhaProvedor, "o WhatsApp não conseguiu entregar");
});

teste("ALHEIA: mensagem de OUTRO escritório, de ENTRADA ou desconhecida é ignorada sem erro e sem mudar nada", async () => {
  const b = bancoFalso([nova({ officeId: "o2" }), nova({ id: "m2", waMessageId: "wamid.IN", direction: "IN", status: "RECEIVED" })]);
  const antes = JSON.parse(JSON.stringify(b.linhas));
  igual(await aplicarEventoDeEntrega("o1", ev("lida"), b, T0), 0); // do o2
  igual(await aplicarEventoDeEntrega("o1", ev("lida", { waMessageId: "wamid.IN" }), b, T0), 0); // de entrada
  igual(await aplicarEventoDeEntrega("o1", ev("lida", { waMessageId: "wamid.NAOEXISTE" }), b, T0), 0);
  igual(JSON.parse(JSON.stringify(b.linhas)), antes);
});

teste("LOTE: um evento que quebra não impede os outros e não lança", async () => {
  const b = bancoFalso([nova()]);
  const original = b.whatsappMessage.updateMany;
  let n = 0;
  b.whatsappMessage.updateMany = async (a) => {
    if (n++ === 0) throw new Error("banco caiu");
    return original(a);
  };
  const total = await aplicarEventosDeEntrega("o1", [ev("entregue"), ev("entregue")], b, T0);
  igual(total, 1);
});

teste("META (escritório): só número META com o módulo ligado; Evolution, módulo desligado e desconhecido são ignorados", async () => {
  const b = bancoFalso([nova()]);
  const configs: Record<string, ConfigDoProvedor> = {
    PN_META: { officeId: "o1", provider: "META", moduloWhatsapp: true },
    PN_EVO: { officeId: "o1", provider: "EVOLUTION", moduloWhatsapp: true },
    PN_OFF: { officeId: "o1", provider: "META", moduloWhatsapp: false },
  };
  const buscarConfig = async (n: string) => configs[n] ?? null;
  for (const n of ["PN_EVO", "PN_OFF", "PN_X"]) {
    igual(await processarStatusesDaMeta([ev("lida", { phoneNumberId: n })], { db: b, buscarConfig, agora: T0 }), 0);
    igual(b.linhas[0].lidaEm, null, n);
  }
  igual(await processarStatusesDaMeta([ev("lida")], { db: b, buscarConfig, agora: T0 }), 0); // sem número
  igual(await processarStatusesDaMeta([ev("lida", { phoneNumberId: "PN_META" })], { db: b, buscarConfig, agora: T0 }), 2);
  igual(entregaDaLinha(b.linhas[0]), "lida");
  // o número de OUTRO escritório não alcança a mensagem do o1
  const c = bancoFalso([nova()]);
  igual(await processarStatusesDaMeta([ev("lida", { phoneNumberId: "PN_META" })], { db: c, buscarConfig: async () => ({ officeId: "o2", provider: "META", moduloWhatsapp: true }), agora: T0 }), 0);
});

teste("MONOTONIA: entregaMaisAvancada nunca recua", () => {
  igual(entregaMaisAvancada("lida", "entregue"), "lida");
  igual(entregaMaisAvancada("entregue", "lida"), "lida");
  igual(entregaMaisAvancada("enviada", null), "enviada");
  igual(entregaMaisAvancada(null, "entregue"), "entregue");
  igual(entregaMaisAvancada(undefined, undefined), null);
});

// ── WEBHOOKS: continuam fail-closed ────────────────────────────────────────────────────────────

teste("META (rota): assinatura inválida ou ausente e segredo não configurado → 401, sem tocar em status", async () => {
  const { NextRequest } = await import("next/server");
  const { POST } = await import("@/app/api/whatsapp/route");
  const corpo = JSON.stringify(payloadMeta([{ id: "wamid.A", status: "read" }]));
  const pedido = (assinatura?: string) => new NextRequest("http://localhost/api/whatsapp", { method: "POST", body: corpo, headers: assinatura ? { "x-hub-signature-256": assinatura } : {} });
  delete process.env.WHATSAPP_APP_SECRET;
  igual((await POST(pedido())).status, 401, "sem segredo configurado: ");
  const certa = "sha256=" + crypto.createHmac("sha256", "segredo-de-teste").update(corpo).digest("hex");
  igual((await POST(pedido(certa))).status, 401, "segredo ausente mesmo com assinatura: ");
  process.env.WHATSAPP_APP_SECRET = "segredo-de-teste";
  igual((await POST(pedido())).status, 401, "sem assinatura: ");
  igual((await POST(pedido("sha256=" + "0".repeat(64)))).status, 401, "assinatura errada: ");
  igual((await POST(pedido("lixo"))).status, 401, "assinatura malformada: ");
  delete process.env.WHATSAPP_APP_SECRET;
});

teste("EVOLUTION (rota): sem o cabeçalho x-lumen-evolution → 401 mesmo para um MESSAGES_UPDATE", async () => {
  const { NextRequest } = await import("next/server");
  const { POST } = await import("@/app/api/whatsapp/evolution/route");
  const corpo = JSON.stringify(upd({ keyId: "k1", fromMe: true, status: "READ" }));
  igual((await POST(new NextRequest("http://localhost/api/whatsapp/evolution", { method: "POST", body: corpo }))).status, 401);
});

teste("EVOLUTION (rota): o ramo de status confere o segredo da instância ANTES de gravar, com a mesma comparação do resto", () => {
  const f = codigoDe(le("app/api/whatsapp/evolution/route.ts"));
  const i = f.indexOf("ehAtualizacaoDaEvolution(corpoLido)");
  verdade(i > 0, "ramo de status");
  const ramo = f.slice(i, f.indexOf("if (!entrada)", i));
  const c = ramo.indexOf("segredoConfere(segredoRecebido, cfg.webhookSecret)");
  const g = ramo.indexOf("aplicarEventosDeEntrega(");
  verdade(c > 0 && g > c, "confere o segredo antes de aplicar");
  verdade(ramo.includes('cfg.provider !== "EVOLUTION"') && ramo.includes("!cfg.webhookSecret") && ramo.includes("Unauthorized"), "fail-closed: provedor, segredo cadastrado, 401");
  verdade(f.includes("timingSafeEqual"), "comparação em tempo constante");
  verdade(!ramo.includes("ingestIncomingWhatsapp") && !ramo.includes("atendenteResponde"), "status não cria atendimento nem chama a Ana");
});

teste("META (rota): os status só são lidos DEPOIS da assinatura, e não passam pela ingestão nem pela Ana", () => {
  const f = codigoDe(le("app/api/whatsapp/route.ts"));
  const sig = f.indexOf("verifySignature(rawBody, signature)");
  const st = f.indexOf("processarStatusesDaMeta(");
  verdade(sig > 0 && st > sig, "assinatura antes dos status");
  verdade(f.slice(sig, st).includes("return new Response(\"Invalid signature\", { status: 401 })"), "recusa com 401");
});

// ── A ATUALIZAÇÃO DE 15 S DEVOLVE O ESTADO DAS MENSAGENS JÁ VISTAS ─────────────────────────────

const msg = (o: Partial<MensagemDoChat> = {}): MensagemDoChat => ({
  id: "m1", direction: "OUT", porAgente: false, texto: "Oi", midia: null, falhou: false, enviada: true, entrega: "enviada", criadoEm: "2026-09-30T20:00:00.000Z",
  hora: "17:00", dia: "2026-09-30", rotuloDoDia: "Hoje", transcricao: null, clientMessageId: null, ...o,
});

teste("PREPARAR: a mensagem que sai do banco carrega o ciclo (enviada/entregue/lida/falhou)", () => {
  const l = { id: "m", direction: "OUT", porAgente: false, body: "x", status: "SENT", createdAt: T0 };
  igual(prepararMensagem(l, T0).entrega, "enviada");
  igual(prepararMensagem({ ...l, entregueEm: T0 }, T0).entrega, "entregue");
  igual(prepararMensagem({ ...l, entregueEm: T0, lidaEm: T0 }, T0).entrega, "lida");
  igual(prepararMensagem({ ...l, status: "FAILED" }, T0).entrega, null);
  igual(prepararMensagem({ ...l, direction: "IN", status: "RECEIVED" }, T0).entrega, null);
});

teste("REFRESCO: aplicarEntregas avança a mensagem já na tela; nunca recua; devolve o MESMO array se nada mudou", () => {
  const atuais = [msg({ id: "a" }), msg({ id: "b", entrega: "lida" }), msg({ id: "c", direction: "IN", enviada: false, entrega: null })];
  const r = aplicarEntregas(atuais, [
    { id: "a", entrega: "lida", falhou: false },
    { id: "b", entrega: "entregue", falhou: false }, // resposta atrasada: não recua
    { id: "c", entrega: "lida", falhou: false }, // mensagem de entrada: intocada
    { id: "zzz", entrega: "lida", falhou: false }, // mensagem que a tela não tem
  ]);
  igual(r.map((m) => m.entrega ?? null), ["lida", "lida", null]);
  verdade(r[1] === atuais[1] && r[2] === atuais[2], "o que não mudou é o mesmo objeto");
  verdade(aplicarEntregas(r, [{ id: "a", entrega: "lida", falhou: false }]) === r, "nada mudou: mesmo array (sem rerender)");
  verdade(aplicarEntregas(atuais, []) === atuais, "vazio: mesmo array");
});

teste("REFRESCO: falha do webhook aparece; entrega posterior a desfaz; nota e aviso não são tocados", () => {
  const f = aplicarEntregas([msg()], [{ id: "m1", entrega: null, falhou: true }]);
  igual([f[0].falhou, f[0].enviada, f[0].entrega], [true, false, null]);
  const v = aplicarEntregas(f, [{ id: "m1", entrega: "entregue", falhou: false }]);
  igual([v[0].falhou, v[0].enviada, v[0].entrega], [false, true, "entregue"]);
  const nota = msg({ id: "n", tipo: "nota" });
  verdade(aplicarEntregas([nota], [{ id: "n", entrega: "lida", falhou: false }])[0] === nota, "nota intacta");
});

teste("REFRESCO (fonte): a rota ?depois devolve `entregas`, dentro do recorte de dono e do escritório; o chat só aplica o estado, sem router.refresh", () => {
  const rota = codigoDe(le("app/api/atendimento/[id]/mensagens/route.ts"));
  const depois = rota.slice(rota.indexOf('if (depois !== null)'), rota.indexOf("const antes ="));
  verdade(depois.includes("carregarEntregasRecentes(attendance.id, viewer.officeId)") && depois.includes("entregas }"), "entregas na resposta do ?depois");
  verdade(rota.indexOf("atendimentoDaRota(params.id)") < rota.indexOf("carregarEntregasRecentes(attendance"), "a guarda vem antes");
  const db = codigoDe(le("lib/mensagensDoChatDb.ts"));
  const fn = db.slice(db.indexOf("export async function carregarEntregasRecentes"));
  verdade(fn.includes("attendanceId, officeId, direction: \"OUT\"") && fn.includes("select:"), "escritório + só saída + só campos de estado");
  const chat = codigoDe(le("components/atendimento-app/ChatDaConversa.tsx"));
  verdade(chat.includes("aplicarEntregas(atuais, dados.entregas") && !chat.includes("router.refresh"), "aplica por estado, sem recarregar a página");
});

// ── UI: O BALÃO ────────────────────────────────────────────────────────────────────────────────

const bolha = (m: Partial<MensagemDoChat>) => renderToStaticMarkup(<BolhaDaMensagem m={msg(m)} idDaConversa="c1" nomeDoAtendente="Ana" />);

teste("BALÃO: ✓ Enviada (uma marca), ✓✓ Entregue (cinza), ✓✓ Lida (azul --atd-lida, traço mais grosso), cada uma com texto para leitor de tela", () => {
  const e = bolha({ entrega: "enviada" });
  const d = bolha({ entrega: "entregue" });
  const l = bolha({ entrega: "lida" });
  verdade(e.includes(">Enviada<") && e.includes('lucide-check"') && !e.includes("lucide-check-check"), e);
  verdade(d.includes(">Entregue<") && d.includes("lucide-check-check") && !d.includes("text-atd-lida"), d);
  verdade(l.includes(">Lida<") && l.includes("lucide-check-check") && l.includes("text-atd-lida") && l.includes('stroke-width="3"'), l);
  verdade(!e.includes("text-atd-lida") && !e.includes(">Lida<"), "enviada não promete lida");
  for (const [html, r] of [[e, "Enviada"], [d, "Entregue"], [l, "Lida"]] as const) verdade(html.includes(`title="${r}"`), `title ${r}`);
});

teste("BALÃO: sem o campo `entrega` (mensagem antiga) continua 'Enviada'; falhou mostra 'Não enviada' e nenhuma marca de entrega; nota é 'Salva'", () => {
  const antiga = renderToStaticMarkup(<BolhaDaMensagem m={{ ...msg(), entrega: undefined }} idDaConversa="c1" nomeDoAtendente="Ana" />);
  verdade(antiga.includes(">Enviada<"), antiga);
  const f = bolha({ falhou: true, enviada: false, entrega: null });
  verdade(f.includes("Não enviada") && !f.includes(">Enviada<") && !f.includes("data-entrega"), f);
  const n = bolha({ tipo: "nota", autor: "Ana", entrega: undefined });
  verdade(n.includes(">Salva<") && !n.includes(">Lida<") && !n.includes(">Entregue<"), n);
  const cliente = bolha({ direction: "IN", enviada: false, entrega: null });
  verdade(!cliente.includes("data-entrega"), "mensagem do cliente não tem marca de entrega");
});

// ── UI: A LISTA ────────────────────────────────────────────────────────────────────────────────

const AGORA = new Date(Date.UTC(2026, 8, 30, 17, 32));
const dado = (ultima: Partial<LinhaDaListaApp["whatsappMessages"][0]>): LinhaDaListaApp => ({
  id: "a1", clientName: "Marina Costa", waPhone: "5562996142280", subject: "Inventário", stage: "QUALIFICACAO", convertedCaseId: null,
  createdAt: new Date(AGORA.getTime() - 6e5), ultimaAtividadeEm: new Date(AGORA.getTime() - 3e5), prazoDeRespostaAte: null, agenteResponde: false, agenteSilenciadoEm: null, responsible: null,
  whatsappMessages: [{ direction: "OUT", body: "Combinado", porAgente: false, createdAt: new Date(AGORA.getTime() - 3e5), status: "SENT", ...ultima }],
});
const lista = (ultima: Partial<LinhaDaListaApp["whatsappMessages"][0]>) =>
  renderToStaticMarkup(
    <ListaDeConversasApp linhas={[montarLinha(dado(ultima), AGORA, "Ana")]} contagens={contagensPorFase([{ stage: "NOVO", _count: 1 }])} esperando={0} filtro="todas" recorte={{}} totalNaLista={1} ocultos={0} soOsMeus={false} haConversas />,
  );

teste("LISTA: o ícone da última mensagem enviada reflete o status (Enviada, Entregue, Lida) e a falha aparece como 'Não enviada'", () => {
  const e = lista({});
  const d = lista({ entregueEm: AGORA });
  const l = lista({ entregueEm: AGORA, lidaEm: AGORA });
  verdade(e.includes('aria-label="Enviada"') && !e.includes("lucide-check-check"), e);
  verdade(d.includes('aria-label="Entregue"') && d.includes("lucide-check-check") && !d.includes("text-atd-lida"), d);
  verdade(l.includes('aria-label="Lida"') && l.includes("text-atd-lida"), l);
  const f = lista({ status: "FAILED" });
  verdade(f.includes('aria-label="Não enviada"') && !f.includes("data-entrega"), f);
  const cliente = lista({ direction: "IN", status: "RECEIVED" });
  verdade(!cliente.includes("data-entrega"), "última do cliente: sem marca");
  igual(montarLinha(dado({ entregueEm: AGORA }), AGORA, "Ana").enviada, true, "o campo antigo continua: ");
});

// ── CONTRASTE ──────────────────────────────────────────────────────────────────────────────────

const css = le("app/globals.css");
const canal = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
const lum = (h: string) => 0.2126 * canal(parseInt(h.slice(1, 3), 16)) + 0.7152 * canal(parseInt(h.slice(3, 5), 16)) + 0.0722 * canal(parseInt(h.slice(5, 7), 16));
const contraste = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
function bloco(seletor: string): string {
  const i = css.indexOf(`\n${seletor} {`);
  return css.slice(i, css.indexOf("\n}\n", i));
}
const DIA = bloco(".atendimento-shell");
const NOITE = bloco(".atendimento-dark");
const tok = (b: string, n: string) => {
  const v = b.match(new RegExp(`--${n}:\\s*([^;]+);`))?.[1].trim() ?? "";
  if (!/^#[0-9a-fA-F]{6}$/.test(v)) throw new Error(`--${n} não é #hex: ${v}`);
  return v;
};
for (const [nome, b, tela] of [["Dia", DIA, DIA], ["Noite", NOITE, NOITE]] as const) {
  teste(`CONTRASTE AA em ${nome}: o azul da 'lida' >= 4,5:1 sobre o balão enviado, a tela e a pílula; o cinza do 'entregue' também`, () => {
    const lida = tok(b, "atd-lida");
    for (const fundo of ["atd-balao-out", "atd-tela", "atd-pilula-bg"]) {
      const c = contraste(lida, tok(fundo === "atd-tela" || fundo === "atd-pilula-bg" ? tela : b, fundo));
      verdade(c >= 4.5, `--atd-lida sobre --${fundo} mede ${c.toFixed(2)}:1 em ${nome}`);
    }
    verdade(contraste(tok(b, "atd-balao-out-sec"), tok(b, "atd-balao-out")) >= 4.5, "entregue no balão");
    verdade(contraste(tok(b, "atd-cinza-terciario"), tok(b, "atd-tela")) >= 4.5, "entregue na lista");
  });
}

teste("TOKEN: --atd-lida vive só dentro do app (Dia e Noite) e o tailwind o expõe como `atd-lida`", () => {
  verdade(!css.slice(0, css.indexOf(".atendimento-shell {")).includes("--atd-lida:"), "definido fora do app");
  verdade(le("tailwind.config.ts").includes('lida: "var(--atd-lida)"'), "cor no tailwind");
});

// ── EVOLUTION: assina o evento e reaplica sem desconectar ──────────────────────────────────────

teste("EVOLUTION: a lista de eventos tem MESSAGES_UPSERT e MESSAGES_UPDATE, usada na criação E na reaplicação", async () => {
  igual([...EVENTOS_DO_WEBHOOK], ["MESSAGES_UPSERT", "MESSAGES_UPDATE"]);
  const chamadas: { url: string; metodo: string; corpo: { webhook: { events: string[]; headers: Record<string, string> } } | null }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: { method: string; body?: string }) => {
    chamadas.push({ url: String(url), metodo: init.method, corpo: init.body ? JSON.parse(init.body) : null });
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  try {
    const { criarInstancia, definirWebhook } = await import("@/lib/whatsappEvolution");
    const cfg = { baseUrl: "https://evo.exemplo/evolution/", apiKey: "k", instancia: "lumen-o1" };
    await criarInstancia(cfg, { url: "https://x/api/whatsapp/evolution", segredo: "seg" });
    await definirWebhook(cfg, { url: "https://x/api/whatsapp/evolution", segredo: "seg" });
    await definirWebhook(cfg, { url: "https://x/api/whatsapp/evolution", segredo: "seg" }); // idempotente
    igual(chamadas.map((c) => c.metodo + " " + c.url), [
      "POST https://evo.exemplo/evolution/instance/create",
      "POST https://evo.exemplo/evolution/webhook/set/lumen-o1",
      "POST https://evo.exemplo/evolution/webhook/set/lumen-o1",
    ]);
    const criar = chamadas[0].corpo!.webhook;
    const reaplicar = chamadas[1].corpo!.webhook;
    igual(criar, reaplicar, "mesmo webhook na criação e na reaplicação: ");
    igual(reaplicar.events, ["MESSAGES_UPSERT", "MESSAGES_UPDATE"]);
    igual(reaplicar.headers, { "x-lumen-evolution": "seg" });
    verdade(chamadas.every((c) => !/logout|connect|delete/i.test(c.url) && c.metodo === "POST"), "reaplicar não desconecta nem gera QR");
  } finally {
    globalThis.fetch = original;
  }
});

teste("EVOLUTION (ações): reconectar instância que já existe reaplica o webhook (sem impedir o QR); há ação própria só para administrador", () => {
  const f = le("lib/actions/whatsappEvolution.ts");
  const qr = f.slice(f.indexOf("export async function pedirQrEvolution"), f.indexOf("export async function reaplicarWebhookEvolution"));
  verdade(qr.includes("definirWebhook(cfg") && /catch \(e\) \{[\s\S]*console\.error[\s\S]*\}/.test(qr), "reaplica ao reconectar, com falha só registrada");
  const acao = f.slice(f.indexOf("export async function reaplicarWebhookEvolution"), f.indexOf("export async function estadoEvolution"));
  verdade(acao.includes("exigirAdministrador()") && acao.includes("segredo: cfg.segredo") && !acao.includes("randomBytes") && !acao.includes("desconectar("), "só administrador, mesmo segredo, sem desconectar");
});

// ── O ENVIO, A IDEMPOTÊNCIA E A ANA NÃO FORAM TOCADOS ──────────────────────────────────────────

teste("ENVIO/ANA: o caminho de envio, a reserva idempotente e a Ana não conhecem o ciclo de entrega; registrarMensagem segue a única porta de gravação", () => {
  for (const arq of ["lib/envioDeMensagemDb.ts", "lib/envioDeMensagem.ts", "lib/atendenteResponde.ts", "lib/registrarMensagem.ts", "lib/pedidoDoChatDb.ts"]) {
    const f = codigoDe(le(arq));
    verdade(!/entregaDaMensagem|entregueEm|lidaEm|falhaProvedor/.test(f), `${arq} não deveria conhecer o ciclo de entrega`);
  }
  const db = codigoDe(le("lib/entregaDaMensagemDb.ts"));
  verdade(!/whatsappMessage\.(create|upsert|delete)/.test(db) && !db.includes("ultimaAtividadeEm") && !db.includes("waLastMessageAt"), "só updateMany de estado; um recibo não sobe a conversa");
  verdade(db.includes('direction: "OUT"') && db.includes("officeId, "), "todo update leva escritório e saída");
});

teste("SCHEMA: só campos ADITIVOS e opcionais (db push seguro)", () => {
  const s = le("prisma/schema.prisma");
  const m = s.slice(s.indexOf("model WhatsappMessage {"), s.indexOf("model PedidoDeEnvioWhatsapp"));
  for (const c of ["entregueEm    DateTime?", "lidaEm        DateTime?", "falhaProvedor String?"]) verdade(m.includes(c), c);
});

void resumo("R2A entregue/lida");
