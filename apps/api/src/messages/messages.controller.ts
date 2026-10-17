import { Body, Controller, Get, Param, Post, Put, Query } from "@nestjs/common";
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

  /** GET /messages?patientId=&status=: messages.view; a parent only for their own child (owner "query", the guard). */
  @Get("messages")
  list(@Query("patientId") patientId?: string, @Query("status") status?: string) {
    return this.messages.list(patientId, status);
  }

  /** POST /due-items/:id/message: the due list's one-tap recall text. 201. */
  @Post("due-items/:id/message")
  recall(@Param("id") id: string) {
    return this.messages.recallMessage(id);
  }

  /** POST /patients/:id/birthday-greeting: Today's "Send greeting". 201. */
  @Post("patients/:id/birthday-greeting")
  greet(@Param("id") id: string) {
    return this.messages.birthdayGreeting(id);
  }
}
