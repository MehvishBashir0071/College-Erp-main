import { PrismaClient } from "@prisma/client";

// Instantiate the single database connection pool
const prisma = new PrismaClient();

export default prisma;
