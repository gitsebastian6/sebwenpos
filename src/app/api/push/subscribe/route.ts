import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';

// ─── POST /api/push/subscribe — Register a push subscription ──────────
export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authorized) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const { storeId, endpoint, keys } = body;

    if (!storeId || !endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: storeId, endpoint, keys.p256dh, keys.auth' },
        { status: 400 }
      );
    }

    // Validate store belongs to user
    const store = await prisma.store.findFirst({
      where: { id: storeId, userId: auth.userId },
    });
    if (!store) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 });
    }

    // Upsert subscription (update if endpoint already exists)
    const subscription = await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: {
        p256dh: keys.p256dh,
        auth: keys.auth,
        userId: auth.userId,
        storeId,
        userAgent: req.headers.get('user-agent') || undefined,
        updatedAt: new Date(),
      },
      create: {
        storeId,
        userId: auth.userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: req.headers.get('user-agent') || undefined,
      },
    });

    return NextResponse.json({ success: true, id: subscription.id });
  } catch (error) {
    console.error('[Push Subscribe] Error:', error);
    return NextResponse.json({ error: 'Error al guardar suscripción' }, { status: 500 });
  }
}

// ─── DELETE /api/push/subscribe — Remove a push subscription ──────────
export async function DELETE(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authorized) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { endpoint } = await req.json();
    if (!endpoint) {
      return NextResponse.json({ error: 'Endpoint requerido' }, { status: 400 });
    }

    await prisma.pushSubscription.deleteMany({
      where: { endpoint, userId: auth.userId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Push Unsubscribe] Error:', error);
    return NextResponse.json({ error: 'Error al eliminar suscripción' }, { status: 500 });
  }
}

// ─── GET /api/push/subscribe — Check subscription status ──────────────
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authorized) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const storeId = req.nextUrl.searchParams.get('storeId');
    if (!storeId) {
      return NextResponse.json({ error: 'storeId requerido' }, { status: 400 });
    }

    const count = await prisma.pushSubscription.count({
      where: { storeId: parseInt(storeId), userId: auth.userId },
    });

    return NextResponse.json({ subscribed: count > 0, count });
  } catch (error) {
    console.error('[Push Status] Error:', error);
    return NextResponse.json({ error: 'Error al consultar suscripción' }, { status: 500 });
  }
}
