'use client'

import { useState } from 'react'
import {
  Package,
  Wine,
  Cigarette,
  Coffee,
  GlassWater,
  IceCreamCone,
  Candy,
  Beef,
  CupSoda,
  Droplets,
  Citrus,
  Popcorn,
  Beer,
  Martini,
  // ShotGlass: not available
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
import { cn } from '@/lib/utils'

// Full icon registry (must match category-icon-picker.tsx)
const ICON_REGISTRY: Record<string, React.ElementType> = {
  Wine, Beer, Martini, GlassWater, BeerOff,
  CupSoda, Coffee, Citrus, Droplets, IceCreamCone, Cigarette,
  Candy, Beef, Pizza, UtensilsCrossed, Cookie, Cherry, Apple, Carrot,
  Fish, EggFried, Sandwich, Soup, Popcorn,
  Flame, ThermometerSun, Snowflake,
  Music, Mic, Gamepad2, Dumbbell, Shield, Heart, Star, Crown, Gem,
  Zap, Trophy, Target, PartyPopper, Gift,
  DollarSign, Wallet, CreditCard, Banknote, HandCoins, PiggyBank, Receipt,
  ShoppingCart, Truck, Store, BadgePercent, Package, Layers, Archive, Boxes,
  Tag, Tags, Barcode, Scale, FileText, ClipboardList, BookOpen, Sparkles,
  Clock, Sun, Moon, Leaf, TreePine, Flower2, Globe, Home,
  Car, Bike, Fuel, Palette, Shirt, Stethoscope, Pill,
  Wrench, Lightbulb, Cog, MapPin, Building, Hotel, Tent,
  GraduationCap, Paintbrush, Scissors, Footprints,
  BatteryCharging, Wifi, Smartphone, Laptop, Monitor, Camera, Headphones, Tv, Radio, Folder,
}

// Category → icon mapping (partial match, checked via .includes()) — LEGACY fallback
const categoryIcons: Record<string, React.ElementType> = {
  cerveza: Wine, cervezas: Wine,
  licor: Wine, licores: Wine,
  cocktail: GlassWater, cocteles: GlassWater, tragos: GlassWater,
  cigarrillo: Cigarette, cigarrillos: Cigarette,
  snack: Candy, snacks: Candy, comida: Beef,
  gaseosa: CupSoda, soda: CupSoda,
  'bebida no alcohólica': CupSoda, 'bebidas no alcohólicas': CupSoda,
  cafe: Coffee, 'café': Coffee,
  jugo: Citrus, fruta: Citrus,
  agua: Droplets,
  helado: IceCreamCone, helados: IceCreamCone,
}

// Category → background tint
const categoryBg: Record<string, string> = {
  cerveza: 'bg-amber-50 dark:bg-amber-950/20', cervezas: 'bg-amber-50 dark:bg-amber-950/20',
  licor: 'bg-purple-50 dark:bg-purple-950/20', licores: 'bg-purple-50 dark:bg-purple-950/20',
  cocktail: 'bg-rose-50 dark:bg-rose-950/20', cocteles: 'bg-rose-50 dark:bg-rose-950/20', tragos: 'bg-rose-50 dark:bg-rose-950/20',
  cigarrillo: 'bg-stone-100 dark:bg-stone-800/30', cigarrillos: 'bg-stone-100 dark:bg-stone-800/30',
  snack: 'bg-orange-50 dark:bg-orange-950/20', snacks: 'bg-orange-50 dark:bg-orange-950/20', comida: 'bg-orange-50 dark:bg-orange-950/20',
  gaseosa: 'bg-sky-50 dark:bg-sky-950/20', soda: 'bg-sky-50 dark:bg-sky-950/20',
  'bebida no alcohólica': 'bg-sky-50 dark:bg-sky-950/20', 'bebidas no alcohólicas': 'bg-sky-50 dark:bg-sky-950/20',
  cafe: 'bg-yellow-50 dark:bg-yellow-950/20', 'café': 'bg-yellow-50 dark:bg-yellow-950/20',
  jugo: 'bg-lime-50 dark:bg-lime-950/20', fruta: 'bg-lime-50 dark:bg-lime-950/20',
  agua: 'bg-cyan-50 dark:bg-cyan-950/20',
  helado: 'bg-pink-50 dark:bg-pink-950/20', helados: 'bg-pink-50 dark:bg-pink-950/20',
}

// Category → icon color
const categoryIconColor: Record<string, string> = {
  cerveza: 'text-amber-600 dark:text-amber-400', cervezas: 'text-amber-600 dark:text-amber-400',
  licor: 'text-purple-600 dark:text-purple-400', licores: 'text-purple-600 dark:text-purple-400',
  cocktail: 'text-rose-600 dark:text-rose-400', cocteles: 'text-rose-600 dark:text-rose-400', tragos: 'text-rose-600 dark:text-rose-400',
  cigarrillo: 'text-stone-500 dark:text-stone-400', cigarrillos: 'text-stone-500 dark:text-stone-400',
  snack: 'text-orange-500 dark:text-orange-400', snacks: 'text-orange-500 dark:text-orange-400', comida: 'text-orange-600 dark:text-orange-400',
  gaseosa: 'text-sky-600 dark:text-sky-400', soda: 'text-sky-600 dark:text-sky-400',
  'bebida no alcohólica': 'text-sky-600 dark:text-sky-400', 'bebidas no alcohólicas': 'text-sky-600 dark:text-sky-400',
  cafe: 'text-yellow-700 dark:text-yellow-400', 'café': 'text-yellow-700 dark:text-yellow-400',
  jugo: 'text-lime-600 dark:text-lime-400', fruta: 'text-lime-600 dark:text-lime-400',
  agua: 'text-cyan-600 dark:text-cyan-400',
  helado: 'text-pink-500 dark:text-pink-400', helados: 'text-pink-500 dark:text-pink-400',
}

interface ProductImageProps {
  src?: string | null
  alt: string
  categoryName?: string
  /** If the category has a stored icon name, use this instead of keyword matching */
  categoryIcon?: string | null
  className?: string
  fallbackClassName?: string
  iconClassName?: string
}

/**
 * Resolve the best icon + colors for a product category.
 * Priority: categoryIcon (stored name) > keyword match on categoryName > default Package
 */
function resolveCategory(categoryName?: string, categoryIcon?: string | null): {
  icon: React.ElementType
  bg: string
  color: string
} {
  // 1. If category has a stored icon, use it
  if (categoryIcon && ICON_REGISTRY[categoryIcon]) {
    return { icon: ICON_REGISTRY[categoryIcon], bg: 'bg-primary/10', color: 'text-primary' }
  }

  // 2. Legacy: keyword match on category name
  if (categoryName) {
    const key = categoryName.toLowerCase()
    for (const [catKey, icon] of Object.entries(categoryIcons)) {
      if (key.includes(catKey)) {
        const bg =
          Object.entries(categoryBg).find(([k]) => key.includes(k))?.[1] || 'bg-muted'
        const color =
          Object.entries(categoryIconColor).find(([k]) => key.includes(k))?.[1] ||
          'text-muted-foreground'
        return { icon, bg, color }
      }
    }
  }

  // 3. Default
  return { icon: Package, bg: 'bg-muted', color: 'text-muted-foreground' }
}

export function ProductImage({
  src,
  alt,
  categoryName,
  categoryIcon,
  className = 'h-8 w-8 rounded object-cover',
  fallbackClassName = 'h-8 w-8 rounded bg-muted flex items-center justify-center',
  iconClassName = 'h-4 w-4 text-muted-foreground',
}: ProductImageProps) {
  const [imgError, setImgError] = useState(false)

  const { icon: IconComponent, bg, color } = resolveCategory(categoryName, categoryIcon)

  if (!src || imgError) {
    return (
      <div className={cn(fallbackClassName, bg)}>
        <IconComponent className={cn(iconClassName, color)} />
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setImgError(true)}
      loading="lazy"
    />
  )
}
