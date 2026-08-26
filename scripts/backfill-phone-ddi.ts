// Backfill único (rodar uma vez, manualmente, depois do `prisma db push` que criou os campos
// phoneDdi/contactPhoneDdi) — assume Brasil ("55") para todo telefone já cadastrado sem DDI, já
// que essa é a base real do escritório hoje. Ver plano "Código de país (DDI) no cadastro de
// telefone + correção do envio por WhatsApp".
import { prisma } from "../lib/prisma";

async function main() {
  const [users, clients, lawyers, suppliers, attendances] = await Promise.all([
    prisma.user.updateMany({ where: { phone: { not: null }, phoneDdi: null }, data: { phoneDdi: "55" } }),
    prisma.client.updateMany({ where: { phone: { not: null }, phoneDdi: null }, data: { phoneDdi: "55" } }),
    prisma.lawyer.updateMany({ where: { phone: { not: null }, phoneDdi: null }, data: { phoneDdi: "55" } }),
    prisma.supplier.updateMany({ where: { phone: { not: null }, phoneDdi: null }, data: { phoneDdi: "55" } }),
    prisma.attendance.updateMany({ where: { contactPhone: { not: null }, contactPhoneDdi: null }, data: { contactPhoneDdi: "55" } }),
  ]);
  console.log(
    `DDI "55" preenchido em: ${users.count} usuário(s), ${clients.count} cliente(s), ${lawyers.count} advogado(s), ${suppliers.count} fornecedor(es), ${attendances.count} atendimento(s).`
  );
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
