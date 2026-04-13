'use client'

import { cn } from '@/lib/utils'
import {
  Wine,
  GlassWater,
  Cigarette,
  Coffee,
  CupSoda,
  Droplets,
  Citrus,
  IceCreamCone,
  Candy,
  Beef,
  Popcorn,
  Package,
  Beer,
  Martini,
  // ShotGlass: not available, using GlassWater
  // ShotGlass,
  BeerOff,
  Pizza,
  UtensilsCrossed,
  Cookie,
  Cherry,
  Apple,
  Carrot,
  Fish,
  EggFried,
  Sandwich,
  Soup,
  Flame,
  ThermometerSun,
  Snowflake,
  Music,
  Mic,
  Gamepad2,
  Dumbbell,
  Shield,
  Heart,
  Star,
  Crown,
  Gem,
  Zap,
  Trophy,
  Target,
  ShoppingCart,
  Truck,
  Store,
  BadgePercent,
  Gift,
  PartyPopper,
  Clock,
  Sun,
  Moon,
  Sparkles,
  DollarSign,
  Wallet,
  CreditCard,
  Banknote,
  HandCoins,
  PiggyBank,
  Receipt,
  FileText,
  ClipboardList,
  BookOpen,
  GraduationCap,
  Palette,
  Paintbrush,
  Scissors,
  Shirt,
  Footprints,
  Stethoscope,
  Pill,
  Leaf,
  TreePine,
  Flower2,
  Globe,
  MapPin,
  Home,
  Building,
  Hotel,
  Tent,
  Car,
  Bike,
  Fuel,
  Wrench,
  Hammer,
  Cog,
  Lightbulb,
  BatteryCharging,
  Wifi,
  Smartphone,
  Laptop,
  Monitor,
  Camera,
  Headphones,
  Tv,
  Radio,
  Layers,
  Archive,
  Folder,
  Boxes,
  Tag,
  Tags,
  Barcode,
  Scale,
} from 'lucide-react'

// All available icons for category selection
const CATEGORY_ICONS: Record<string, { icon: React.ElementType; label: string }> = {
  Wine:            { icon: Wine,            label: 'Vino / Licor' },
  Beer:            { icon: Beer,            label: 'Cerveza' },
  Martini:         { icon: Martini,         label: 'Martini' },
  GlassWater:      { icon: GlassWater,      label: 'Coctel' },
  ShotGlass:       { icon: GlassWater,       label: 'Shot' },
  BeerOff:         { icon: BeerOff,         label: 'Sin alcohol' },
  CupSoda:         { icon: CupSoda,         label: 'Gaseosa' },
  Coffee:          { icon: Coffee,          label: 'Café' },
  Citrus:          { icon: Citrus,          label: 'Jugo / Fruta' },
  Droplets:        { icon: Droplets,        label: 'Agua' },
  IceCreamCone:    { icon: IceCreamCone,    label: 'Helado' },
  Cigarette:       { icon: Cigarette,       label: 'Cigarrillo' },
  Candy:           { icon: Candy,           label: 'Snack / Dulce' },
  Beef:            { icon: Beef,            label: 'Carne' },
  Pizza:           { icon: Pizza,           label: 'Pizza' },
  UtensilsCrossed: { icon: UtensilsCrossed, label: 'Comida' },
  Cookie:          { icon: Cookie,          label: 'Galleta' },
  Cherry:          { icon: Cherry,          label: 'Fruta' },
  Apple:           { icon: Apple,           label: 'Manzana' },
  Carrot:          { icon: Carrot,          label: 'Verdura' },
  Fish:            { icon: Fish,            label: 'Pescado' },
  EggFried:        { icon: EggFried,        label: 'Huevo' },
  Sandwich:        { icon: Sandwich,        label: 'Sandwich' },
  Soup:            { icon: Soup,            label: 'Sopa' },
  Popcorn:         { icon: Popcorn,         label: 'Popcorn' },
  Flame:           { icon: Flame,           label: 'Fuego' },
  ThermometerSun:  { icon: ThermometerSun,  label: 'Caliente' },
  Snowflake:       { icon: Snowflake,       label: 'Frío' },
  Music:           { icon: Music,           label: 'Música' },
  Mic:             { icon: Mic,             label: 'Karaoke' },
  Gamepad2:        { icon: Gamepad2,        label: 'Juegos' },
  Dumbbell:        { icon: Dumbbell,        label: 'Deporte' },
  Shield:          { icon: Shield,          label: 'Seguridad' },
  Heart:           { icon: Heart,           label: 'Corazón' },
  Star:            { icon: Star,            label: 'Estrella' },
  Crown:           { icon: Crown,           label: 'Premium' },
  Gem:              { icon: Gem,             label: 'Gema' },
  Zap:             { icon: Zap,             label: 'Energía' },
  Trophy:          { icon: Trophy,          label: 'Trofeo' },
  Target:          { icon: Target,          label: 'Blanco' },
  PartyPopper:     { icon: PartyPopper,     label: 'Fiesta' },
  Gift:            { icon: Gift,            label: 'Regalo' },
  DollarSign:      { icon: DollarSign,      label: 'Dólar' },
  Wallet:          { icon: Wallet,          label: 'Billetera' },
  CreditCard:      { icon: CreditCard,      label: 'Tarjeta' },
  Banknote:        { icon: Banknote,        label: 'Efectivo' },
  HandCoins:       { icon: HandCoins,       label: 'Monedas' },
  PiggyBank:       { icon: PiggyBank,       label: 'Ahorro' },
  Receipt:         { icon: Receipt,         label: 'Recibo' },
  ShoppingCart:    { icon: ShoppingCart,    label: 'Compra' },
  Truck:           { icon: Truck,           label: 'Transporte' },
  Store:           { icon: Store,           label: 'Tienda' },
  BadgePercent:    { icon: BadgePercent,    label: 'Descuento' },
  Package:         { icon: Package,         label: 'Paquete' },
  Layers:          { icon: Layers,          label: 'Capas' },
  Archive:         { icon: Archive,         label: 'Archivo' },
  Boxes:           { icon: Boxes,           label: 'Cajas' },
  Tag:             { icon: Tag,             label: 'Etiqueta' },
  Tags:            { icon: Tags,            label: 'Etiquetas' },
  Barcode:         { icon: Barcode,         label: 'Código' },
  Scale:           { icon: Scale,           label: 'Balanza' },
  FileText:        { icon: FileText,        label: 'Documento' },
  ClipboardList:   { icon: ClipboardList,   label: 'Lista' },
  BookOpen:        { icon: BookOpen,        label: 'Libro' },
  Sparkles:        { icon: Sparkles,        label: 'Destacado' },
  Clock:           { icon: Clock,           label: 'Tiempo' },
  Sun:             { icon: Sun,             label: 'Día' },
  Moon:            { icon: Moon,            label: 'Noche' },
  Leaf:            { icon: Leaf,            label: 'Ecológico' },
  TreePine:        { icon: TreePine,        label: 'Naturaleza' },
  Flower2:         { icon: Flower2,         label: 'Flores' },
  Globe:           { icon: Globe,           label: 'Mundo' },
  Home:            { icon: Home,            label: 'Casa' },
  Car:             { icon: Car,             label: 'Carro' },
  Bike:            { icon: Bike,            label: 'Bicicleta' },
  Fuel:            { icon: Fuel,            label: 'Gasolina' },
  Palette:         { icon: Palette,         label: 'Colores' },
  Shirt:           { icon: Shirt,           label: 'Ropa' },
  Stethoscope:     { icon: Stethoscope,     label: 'Salud' },
  Pill:            { icon: Pill,            label: 'Medicina' },
  Wrench:          { icon: Wrench,          label: 'Herramienta' },
  Lightbulb:       { icon: Lightbulb,       label: 'Idea' },
  Cog:             { icon: Cog,             label: 'Configuración' },
}

export const ICON_NAMES = Object.keys(CATEGORY_ICONS)

interface CategoryIconPickerProps {
  value: string
  onChange: (iconName: string) => void
}

export function CategoryIconPicker({ value, onChange }: CategoryIconPickerProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Ícono</span>
        {value && (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-destructive transition-colors"
            onClick={() => onChange('')}
          >
            Quitar ícono
          </button>
        )}
      </div>
      {value && CATEGORY_ICONS[value] ? (
        <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 border mb-2">
          <div className="flex items-center justify-center h-8 w-8 rounded bg-primary/10">
            {(() => {
              const Ic = CATEGORY_ICONS[value].icon
              return <Ic className="h-4 w-4 text-primary" />
            })()}
          </div>
          <span className="text-xs font-medium">{CATEGORY_ICONS[value].label}</span>
        </div>
      ) : null}
      <div className="grid grid-cols-8 sm:grid-cols-10 gap-1 max-h-[200px] overflow-y-auto rounded-md border p-2">
        {Object.entries(CATEGORY_ICONS).map(([name, { icon: Icon, label }]) => (
          <button
            key={name}
            type="button"
            title={label}
            className={cn(
              'flex items-center justify-center h-8 w-8 rounded-md transition-all',
              value === name
                ? 'bg-primary text-primary-foreground ring-2 ring-primary/30 scale-110'
                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
            )}
            onClick={() => onChange(name)}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
    </div>
  )
}

// Get the icon component by name (for use in ProductImage and other places)
export function getCategoryIconByName(iconName: string | null | undefined): React.ElementType | null {
  if (!iconName || !CATEGORY_ICONS[iconName]) return null
  return CATEGORY_ICONS[iconName].icon
}
