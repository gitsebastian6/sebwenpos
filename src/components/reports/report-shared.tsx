import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

// ── Skeleton ──
export function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full rounded" /></CardContent></Card>)}
      </div>
      <Card><CardContent className="p-6"><Skeleton className="h-[400px] w-full rounded" /></CardContent></Card>
    </div>
  )
}

// ── Empty State ──
export function EmptyState({ icon: Icon, title, desc }: { icon: React.ComponentType<{ className?: string }>; title: string; desc?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon className="h-10 w-10 text-muted-foreground/30 mb-3" />
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {desc && <p className="text-xs text-muted-foreground/70 mt-1 max-w-sm">{desc}</p>}
    </div>
  )
}

// ── Stat Card ──
export function Stat({ label, value, icon: Icon, color }: { label: string; value: string | number; icon?: React.ComponentType<{ className?: string }>; color?: string }) {
  return (
    <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl gap-2">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          {Icon && <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary/10 to-primary/5"><Icon className={`h-4 w-4 ${color || 'text-muted-foreground'}`} /></div>}
        </div>
        <p className={`text-lg font-bold mt-1 ${color || ''}`}>{value}</p>
      </CardContent>
    </Card>
  )
}
