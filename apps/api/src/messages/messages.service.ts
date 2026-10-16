import { Injectable, NotFoundException } from "@nestjs/common";
import { MessageKind, MessageTemplate, UpdateMessageTemplateInput } from "@pedia/shared";
import { Clock } from "../common/clock";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PrismaService } from "../prisma/prisma.service";

const TEMPLATE = { clinicId: true, kind: true, name: true, body: true, updatedAt: true } as const;
type TemplateRow = { clinicId: string; kind: MessageKind; name: string; body: string; updatedAt: Date };
const toTemplate = (t: TemplateRow): MessageTemplate => MessageTemplate.parse({ ...t, updatedAt: t.updatedAt.toISOString() });

/** features/messages/mocks.ts. B3 serves the templates; B9 adds the queue and sending. */
@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  /** GET /message-templates: one per kind, in MessageKind order (the seed's). */
  async templates(): Promise<MessageTemplate[]> {
    return (await this.prisma.messageTemplate.findMany({ select: TEMPLATE, orderBy: { position: "asc" } })).map(toTemplate);
  }

  /** PUT /message-templates/:kind. 404 before the body is read, as the mock; then UpdateMessageTemplateInput (400). */
  async updateTemplate(kind: string, body: unknown): Promise<MessageTemplate> {
    const known = MessageKind.safeParse(kind);
    const found = known.success && (await this.prisma.messageTemplate.findFirst({ where: { kind: known.data }, select: { kind: true } }));
    if (!found) throw new NotFoundException("Template not found");
    const input = new ZodValidationPipe(UpdateMessageTemplateInput).transform(body);
    await this.prisma.messageTemplate.updateMany({ where: { kind: found.kind }, data: { body: input.body, updatedAt: this.clock.now() } });
    return toTemplate(await this.prisma.messageTemplate.findFirstOrThrow({ where: { kind: found.kind }, select: TEMPLATE }));
  }
}
