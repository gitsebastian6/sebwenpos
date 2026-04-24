'use client'

import { Badge } from '@/components/ui/badge'
import { STATUS_CONFIG } from '@/components/quotations/quotation-types'

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status]
  if (!cfg) return <Badge variant="secondary">{status}</Badge>
  return (
    <Badge variant="outline" className={cfg.color}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </Badge>
  )
}
