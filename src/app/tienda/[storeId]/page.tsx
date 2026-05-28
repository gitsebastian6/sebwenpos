import { Metadata } from 'next'
import StorefrontPage from './storefront-page'

export const metadata: Metadata = {
  title: 'Tienda Virtual — Ventify POS',
  description: 'Explora nuestros productos y haz tu pedido por WhatsApp',
}

export default function Page({ params }: { params: Promise<{ storeId: string }> }) {
  return <StorefrontPage params={params} />
}
