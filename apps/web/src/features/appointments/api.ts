"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  Appointment,
  type AppointmentStatus,
  type BookAppointmentInput,
  type ChangeAppointmentStatusInput,
  type RescheduleAppointmentInput,
} from "@pedia/shared";
import { api } from "@/lib/api-client";
import { dueKeys } from "@/features/recalls/api";

export const appointmentKeys = {
  all: ["appointments"] as const,
  range: (from: string, to: string) => [...appointmentKeys.all, "range", from, to] as const,
  forPatient: (patientId: string) => [...appointmentKeys.all, "patient", patientId] as const,
};

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  booked: "Booked",
  confirmed: "Confirmed",
  arrived: "Arrived",
  in_chair: "In chair",
  done: "Done",
  no_show: "No-show",
  cancelled: "Cancelled",
};

/** Appointments starting in [from, to), ISO timestamps. */
export function useAppointments(from: string, to: string) {
  return useQuery({
    queryKey: appointmentKeys.range(from, to),
    queryFn: () => api(`/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, z.array(Appointment)),
  });
}

/** Oldest first. */
export function usePatientAppointments(patientId: string) {
  return useQuery({
    queryKey: appointmentKeys.forPatient(patientId),
    queryFn: () => api(`/patients/${patientId}/appointments`, z.array(Appointment)),
  });
}

function useAppointmentMutation<T>(mutationFn: (input: T) => Promise<Appointment>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: appointmentKeys.all });
      qc.invalidateQueries({ queryKey: dueKeys.all }); // booking closes a due item; cancelling reopens it
    },
  });
}

export function useBookAppointment() {
  return useAppointmentMutation((input: BookAppointmentInput) =>
    api("/appointments", Appointment, { method: "POST", body: JSON.stringify(input) }),
  );
}

export function useRescheduleAppointment() {
  return useAppointmentMutation(({ id, ...input }: RescheduleAppointmentInput & { id: string }) =>
    api(`/appointments/${id}`, Appointment, { method: "PUT", body: JSON.stringify(input) }),
  );
}

export function useChangeAppointmentStatus() {
  return useAppointmentMutation(({ id, ...input }: ChangeAppointmentStatusInput & { id: string }) =>
    api(`/appointments/${id}/status`, Appointment, { method: "POST", body: JSON.stringify(input) }),
  );
}
