import { PrismaClient } from "@prisma/client";

let prisma;
if (process.env.NODE_ENV === "production") {
  prisma = new PrismaClient();
} else {
  if (!global.__brightPrisma) global.__brightPrisma = new PrismaClient();
  prisma = global.__brightPrisma;
}
export { prisma };
