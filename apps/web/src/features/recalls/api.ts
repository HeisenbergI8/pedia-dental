"use client";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { DueItem } from "@pedia/shared";
import { api } from "@/lib/api-client";

export const dueKeys = { all: ["due-items"] as const };

/** Open follow-ups and recalls, soonest first. Signing a note or booking an appointment changes it. */
export function useDueItems() {
  return useQuery({ queryKey: dueKeys.all, queryFn: () => api("/due-items", z.array(DueItem)) });
}
