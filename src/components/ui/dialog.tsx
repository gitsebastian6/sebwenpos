"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { ChevronLeftIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  mobileFullscreen = false,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  /**
   * En móvil el diálogo ocupa toda la pantalla (hoja) — para formularios de
   * crear/editar. Por defecto es una tarjeta centrada también en móvil.
   */
  mobileFullscreen?: boolean
}) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 flex flex-col w-full max-w-[calc(100%-2rem)] max-h-[92dvh] overflow-y-auto overscroll-contain translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-4 shadow-lg duration-200 sm:max-w-lg sm:p-6",
          // Solo crear/editar: hoja a pantalla completa en móvil. El ! (sufijo,
          // Tailwind v4) gana a los anchos/altos que el diálogo pase por className.
          mobileFullscreen &&
            "max-sm:inset-0! max-sm:top-0! max-sm:left-0! max-sm:h-[100dvh]! max-sm:max-h-[100dvh]! max-sm:w-full! max-sm:max-w-none! max-sm:translate-x-0! max-sm:translate-y-0! max-sm:rounded-none!",
          className
        )}
        {...props}
      >
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            aria-label="Volver"
            className="sticky -top-4 z-20 -mx-4 -mt-4 flex shrink-0 items-center gap-1.5 self-stretch rounded-t-lg border-b border-border/60 bg-emerald-500/[0.07] px-4 py-2.5 text-sm font-medium text-emerald-600 transition-colors hover:bg-emerald-500/15 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/40 disabled:pointer-events-none dark:text-emerald-400 sm:-top-6 sm:-mx-6 sm:-mt-6 sm:px-6 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
          >
            <ChevronLeftIcon />
            <span>Volver</span>
          </DialogPrimitive.Close>
        )}
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        // En móvil los botones quedan pegados abajo, siempre alcanzables.
        "max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:mt-auto max-sm:-mx-4 max-sm:-mb-4 max-sm:border-t max-sm:bg-background max-sm:px-4 max-sm:py-3",
        className
      )}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
