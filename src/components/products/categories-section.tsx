'use client'

import type { Category } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { getCategoryIconByName } from '@/components/ui/category-icon-picker'
import { Plus, Tags, Package, Pencil, Trash2 } from 'lucide-react'

// ─── Props ─────────────────────────────────────────────────────────────────

export interface CategoriesSectionProps {
  categories: Category[]
  categoriesLoading: boolean
  onNewCategory: () => void
  onEditCategory: (c: Category) => void
  onDeleteCategory: (c: Category) => void
}

// ─── Component ─────────────────────────────────────────────────────────────

export function CategoriesSection({
  categories,
  categoriesLoading,
  onNewCategory,
  onEditCategory,
  onDeleteCategory,
}: CategoriesSectionProps) {
  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {categories.length} categor{categories.length !== 1 ? 'ías' : 'ía'}
        </p>
        <Button onClick={onNewCategory} className="gap-2 active:scale-[0.98] transition-all">
          <Plus className="h-4 w-4" />
          Nueva Categoría
        </Button>
      </div>

      {categoriesLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-5 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : categories.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Tags className="h-16 w-16 text-muted-foreground/30 mb-4 animate-pulse" />
            <p className="text-muted-foreground font-medium">No hay categorías creadas</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Crea una categoría para organizar tus productos
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <Card key={category.id} className="group hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <div className="flex items-center gap-2.5">
                  {(() => {
                    const IconComp = getCategoryIconByName(category.icon)
                    return IconComp ? (
                      <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary/10 shrink-0">
                        <IconComp className="h-4.5 w-4.5 text-primary" />
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-muted shrink-0">
                        <Tags className="h-4.5 w-4.5 text-muted-foreground" />
                      </div>
                    )
                  })()}
                  <CardTitle className="text-base font-medium">{category.name}</CardTitle>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onEditCategory(category)}
                    aria-label="Editar categoría"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    <span className="sr-only">Editar</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => onDeleteCategory(category)}
                    aria-label="Eliminar categoría"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className="sr-only">Eliminar</span>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Package className="h-4 w-4" />
                  <span>
                    {category._count?.products || 0} producto
                    {(category._count?.products || 0) !== 1 ? 's' : ''}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
