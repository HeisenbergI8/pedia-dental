"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { useThemeStore } from "@/stores/theme-store"

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useThemeStore((s) => s.preference)
  return (
    <Sonner
      theme={theme}
      richColors
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--color-popover)",
          "--normal-text": "var(--color-popover-foreground)",
          "--normal-border": "var(--color-border)",
          "--border-radius": "var(--radius)",
          // Status toasts use the status triples, so a saved toast reads as success in colour and icon.
          "--success-bg": "var(--color-success-bg)",
          "--success-text": "var(--color-success)",
          "--success-border": "var(--color-success-line)",
          "--error-bg": "var(--color-danger-bg)",
          "--error-text": "var(--color-danger)",
          "--error-border": "var(--color-danger-line)",
          "--warning-bg": "var(--color-warning-bg)",
          "--warning-text": "var(--color-warning)",
          "--warning-border": "var(--color-warning-line)",
          "--info-bg": "var(--color-info-bg)",
          "--info-text": "var(--color-info)",
          "--info-border": "var(--color-info-line)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
