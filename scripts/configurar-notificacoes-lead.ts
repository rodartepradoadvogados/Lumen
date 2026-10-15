// ============================================================================
// CONFIGURA NOTIFICAÇÕES DE LEAD TRANSFERIDO
// ============================================================================
// Rodar UMA VEZ em produção (ou sempre que quiser garantir o estado):
//   DATABASE_URL="postgresql://..." npx tsx scripts/configurar-notificacoes-lead.ts
//
// O que faz:
// 1. Busca usuários jairo@rodarteprado.com.br e pradoadvogado@gmail.com
// 2. Garante NotificationPreference com LEAD_TRANSFERIDO → EMAIL + NA_HORA
// 3. Garante EmailTemplate para evento LEAD_TRANSFERIDO (assunto "LEAD AGUARDANDO")
// 4. Loga tudo; é idempotente (rodar de novo não duplica)
// ============================================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const EMAILS_ALVO = [
  'jairo@rodarteprado.com.br',
  'pradoadvogado@gmail.com',
];

const SUBJECT = 'LEAD AGUARDANDO';

const BODY_HTML = `
<table width="600" cellpadding="0" cellspacing="0" style="font-family: Archivo, Helvetica, Arial; border: 1px solid #e5e7eb;">
  <tr>
    <td style="background: #1a1a2e; color: #fff; padding: 24px; text-align: center;">
      <h1 style="margin: 0; font-size: 20px;">LEAD AGUARDANDO</h1>
    </td>
  </tr>
  <tr>
    <td style="padding: 24px;">
      <p style="margin: 0 0 16px; font-size: 14px; color: #374151;">Um novo lead foi transferido e aguarda atendimento.</p>
      <table cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 8px 0; font-weight: 600; color: #374151;">Nome:</td><td style="padding: 8px 0; color: #1f2937;">{{cliente}}</td></tr>
        <tr><td style="padding: 8px 0; font-weight: 600; color: #374151;">Origem:</td><td style="padding: 8px 0; color: #1f2937;">{{teor}}</td></tr>
        <tr><td style="padding: 8px 0; font-weight: 600; color: #374151;">Área:</td><td style="padding: 8px 0; color: #1f2937;">{{vars.area}}</td></tr>
        <tr><td style="padding: 8px 0; font-weight: 600; color: #374151;">Urgência:</td><td style="padding: 8px 0; color: #1f2937;">{{vars.urgencia}}</td></tr>
        <tr><td style="padding: 8px 0; font-weight: 600; color: #374151;">Resumo:</td><td style="padding: 8px 0; color: #1f2937;">{{vars.resumo}}</td></tr>
      </table>
      <p style="margin-top: 24px; text-align: center;">
        <a href="{{link}}" style="background: #1a1a2e; color: #fff; padding: 12px 24px; text-decoration: none; font-weight: 600;">Abrir no Lúmen</a>
      </p>
    </td>
  </tr>
  <tr>
    <td style="background: #f9fafb; padding: 16px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb;">
      Você recebe este aviso porque está marcado para receber transferências. Altere em Lúmen > Configurações > Comunicados.
    </td>
  </tr>
</table>
`.trim();

async function main() {
  console.log('🔍 Buscando usuários...');
  const users = await prisma.user.findMany({
    where: { email: { in: EMAILS_ALVO } },
    select: { id: true, name: true, email: true, officeId: true, recebeTransferencia: true },
  });

  if (users.length === 0) {
    console.log('❌ Nenhum usuário encontrado com os e-mails:', EMAILS_ALVO);
    return;
  }

  console.log(`✅ ${users.length} usuário(s) encontrado(s):`);
  users.forEach(u => console.log(`   - ${u.name} (${u.email}) — officeId: ${u.officeId}, recebeTransferencia: ${u.recebeTransferencia}`));

  const officeId = users[0].officeId;
  if (!officeId) {
    console.log('❌ officeId não encontrado');
    return;
  }

  // 1️⃣ NotificationPreference por usuário
  console.log('\n📝 Configurando NotificationPreference...');
  for (const u of users) {
    const pref = await prisma.notificationPreference.upsert({
      where: { userId: u.id },
      update: {
        perEvent: {
          LEAD_TRANSFERIDO: { canal: 'EMAIL', cadencia: 'NA_HORA' },
        },
      },
      create: {
        userId: u.id,
        officeId: u.officeId,
        digestOn: true,
        digestHour: 8,
        weekdaysOnly: true,
        breakthrough: ['PRAZO_HOJE', 'AUDIENCIA_24H'],
        perEvent: {
          LEAD_TRANSFERIDO: { canal: 'EMAIL', cadencia: 'NA_HORA' },
        },
      },
    });
    console.log(`   ✅ ${u.email}: preference upsertada (breakthrough: ${pref.breakthrough}, perEvent.LEAD_TRANSFERIDO: ${JSON.stringify(pref.perEvent)})`);
  }

  // 2️⃣ EmailTemplate para LEAD_TRANSFERIDO
  console.log('\n📧 Configurando EmailTemplate...');
  const template = await prisma.emailTemplate.upsert({
    where: { officeId_event: { officeId, event: 'LEAD_TRANSFERIDO' } },
    update: { subject: SUBJECT, bodyHtml: BODY_HTML },
    create: { officeId, event: 'LEAD_TRANSFERIDO', subject: SUBJECT, bodyHtml: BODY_HTML },
  });
  console.log(`   ✅ Template upsertado (id: ${template.id}, subject: "${template.subject}")`);

  // 3️⃣ Verificação final
  console.log('\n🔎 Verificação final...');
  const prefs = await prisma.notificationPreference.findMany({
    where: { userId: { in: users.map(u => u.id) } },
  });
  prefs.forEach(p => {
    const leadCfg = (p.perEvent as any)?.LEAD_TRANSFERIDO;
    console.log(`   userId=${p.userId} → LEAD_TRANSFERIDO: ${JSON.stringify(leadCfg)}`);
  });

  const tpl = await prisma.emailTemplate.findUnique({
    where: { officeId_event: { officeId, event: 'LEAD_TRANSFERIDO' } },
  });
  console.log(`   EmailTemplate LEAD_TRANSFERIDO: ${tpl ? 'EXISTE' : 'NÃO ENCONTRADO'} (subject: "${tpl?.subject}")`);

  console.log('\n🎉 Concluído! Agora:');
  console.log('   1. Confira no Lúmen: Configurações > Comunicados (por usuário)');
  console.log('   2. Garanta que os dois usuários têm "Recebe transferência de leads" = ON (Configurações > Equipe)');
  console.log('   3. Teste: mande msg no WhatsApp → Ana tria → [[TRANSFERIR:ROTEIRO]] → aguarde até 15 min (cron) ou force o cron comunicados-outbox na Vercel');
}

main()
  .catch(e => { console.error('❌ Erro:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());