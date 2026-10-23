import { cn } from "@/lib/utils"
import type { InstanceStatus } from "@/lib/types"

const STATUS_CONFIG: Record<InstanceStatus, { label: string; dot: string; text: string }> = {
  running: { label: "Corriendo", dot: "bg-success", text: "text-success" },
  stopped: { label: "Detenido", dot: "bg-muted-foreground", text: "text-muted-foreground" },
  partial: { label: "Parcial", dot: "bg-warning", text: "text-warning" },
}

export function StatusDot({
  status,
  withLabel = false,
  className,
}: {
  status: InstanceStatus
  withLabel?: boolean
  className?: string
}) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className={cn("size-2 rounded-full", cfg.dot)}>
        {status === "running" && (
          <span className={cn("block size-2 rounded-full opacity-60", cfg.dot, "animate-ping")} />
        )}
      </span>
      {withLabel && <span className={cn("text-xs font-medium", cfg.text)}>{cfg.label}</span>}
    </span>
  )
}

export { STATUS_CONFIG }
