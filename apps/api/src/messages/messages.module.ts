import { Module } from "@nestjs/common";
import { MessageQueueModule } from "../message-queue/message-queue.module";
import { MessagesController } from "./messages.controller";
import { MessagesService } from "./messages.service";

@Module({ imports: [MessageQueueModule], controllers: [MessagesController], providers: [MessagesService], exports: [MessagesService] })
export class MessagesModule {}
