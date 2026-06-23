import { PrismaClient } from '@prisma/client';

// Single client reused across function invocations.
export const prisma = new PrismaClient();
