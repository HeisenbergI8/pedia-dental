import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { MessagesService } from "./messages.service";

/** GET is messages.manage or documents.issue (documents print post-op text); PUT is messages.manage (access-rules.ts). */
@Controller()
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get("message-templates")
  templates() {
    return this.messages.templates();
  }

  // Body parsed after the 404 (CONVENTIONS → Traps: check before the body).
  @Put("message-templates/:kind")
  update(@Param("kind") kind: string, @Body() body: unknown) {
    return this.messages.updateTemplate(kind, body);
  }
}
