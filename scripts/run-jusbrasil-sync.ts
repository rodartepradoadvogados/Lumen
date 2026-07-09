import { syncJusbrasilEmails } from "../lib/jusbrasilEmailSync";
import { prisma } from "../lib/prisma";

async function main() {
  const result = await syncJusbrasilEmails();
  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
