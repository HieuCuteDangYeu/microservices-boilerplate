import { PrismaService } from '@mail/infrastructure/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class MailRepository {
  constructor(private readonly prisma: PrismaService) {}

  createLog(data: {
    to: string;
    subject: string;
    template: string;
    status: string;
    error?: string;
  }) {
    return this.prisma.sentEmail.create({ data });
  }
}
