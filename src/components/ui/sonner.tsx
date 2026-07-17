"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const TOASTER_FONT_FAMILY =
  'var(--font-ui, var(--font-vazirmatn)), ui-sans-serif, system-ui, sans-serif'

const Toaster = ({ dir = "rtl", ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      dir={dir}
      className="toaster group font-sans"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          fontFamily: TOASTER_FONT_FAMILY,
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast !font-sans",
          title: "cn-toast-title",
          description: "cn-toast-description",
          actionButton: "cn-toast-action",
          cancelButton: "cn-toast-cancel",
        },
        style: {
          fontFamily: TOASTER_FONT_FAMILY,
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
