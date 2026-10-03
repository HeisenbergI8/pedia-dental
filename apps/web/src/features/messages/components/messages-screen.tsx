"use client";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageLog } from "./message-log";
import { TemplateEditor } from "./template-editor";

export function MessagesScreen() {
  return (
    <div className="space-y-5">
      <PageHeader title="Messages" description="Texts to parents, queued by bookings, no-shows, signed notes, recalls and birthdays." />
      <Tabs defaultValue="log">
        <TabsList>
          <TabsTrigger value="log">Message log</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>
        <TabsContent value="log" className="pt-4">
          <MessageLog />
        </TabsContent>
        <TabsContent value="templates" className="pt-4">
          <TemplateEditor />
        </TabsContent>
      </Tabs>
    </div>
  );
}
