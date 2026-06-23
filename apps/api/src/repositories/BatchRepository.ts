import { prisma } from '../lib/prisma';

export type BatchSource = 'timer' | 'upload';

export const BatchRepository = {
  create(source: BatchSource) {
    return prisma.batch.create({ data: { source } });
  },
};
