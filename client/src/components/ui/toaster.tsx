import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  toastIcons,
} from "@/components/ui/toast"

export function Toaster() {
  const { toast, toasts } = useToast();return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, icon: customIcon, ...props }) {
        const IconComponent = customIcon || (variant && toastIcons[variant as keyof typeof toastIcons])
        
        return (
          <Toast key={id} variant={variant} {...props}>
            <div className="flex flex-col gap-3 flex-1">
              <div className="flex items-start gap-3">
                {IconComponent && (
                  <div className="shrink-0 mt-0.5">
                    <IconComponent className={`h-5 w-5 ${variant === 'loading' ? 'animate-spin' : ''}`} />
                  </div>
                )}
                <div className="grid gap-1 flex-1">
                  {title && <ToastTitle>{title}</ToastTitle>}
                  {description && (
                    <ToastDescription>{description}</ToastDescription>
                  )}
                </div>
              </div>
              {action && <div className="w-full">{action}</div>}
            </div>
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
