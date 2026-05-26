'use client';

import { Bell, BellOff, BellRing, Loader2, ShieldAlert } from 'lucide-react';
import { usePushNotifications } from '@/lib/offline/use-push-notifications';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useState } from 'react';

/**
 * PushNotificationsSettings — settings card for managing push notifications.
 * Shows permission status and allows subscribe/unsubscribe toggle.
 */
export function PushNotificationsSettings() {
  const { isSupported, permission, isSubscribed, subscribe, unsubscribe, requestPermission } = usePushNotifications();
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    setLoading(true);
    try {
      if (isSubscribed) {
        await unsubscribe();
        toast.success('Notificaciones desactivadas');
      } else {
        // Request permission first if needed
        if (permission !== 'granted') {
          const result = await requestPermission();
          if (result !== 'granted') {
            toast.error('Permiso de notificaciones denegado', {
              description: 'Actívalo en la configuración de tu navegador',
              duration: 5000,
            });
            setLoading(false);
            return;
          }
        }
        await subscribe();
        toast.success('Notificaciones activadas');
      }
    } catch (error) {
      toast.error('Error al cambiar notificaciones');
    } finally {
      setLoading(false);
    }
  };

  // Not supported
  if (!isSupported) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BellOff className="h-4 w-4 text-muted-foreground" />
            Notificaciones Push
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Tu navegador no soporta notificaciones push. Prueba con Chrome, Edge o Firefox.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Permission denied
  const isDenied = permission === 'denied';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Notificaciones Push</CardTitle>
          </div>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Switch
              checked={isSubscribed}
              onCheckedChange={handleToggle}
              disabled={loading || isDenied}
            />
          )}
        </div>
        <CardDescription>
          Recibe alertas de stock bajo, ventas y recordatorios en tu dispositivo
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isDenied ? (
          <div className="flex items-start gap-3 rounded-md bg-red-500/10 border border-red-500/20 p-3">
            <ShieldAlert className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-600 dark:text-red-400">
                Notificaciones bloqueadas
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Debes permitir las notificaciones en la configuración de tu navegador.
                Haz clic en el ícono de candado en la barra de direcciones y cambia el permiso de notificaciones.
              </p>
            </div>
          </div>
        ) : isSubscribed ? (
          <div className="flex items-start gap-3 rounded-md bg-emerald-500/10 border border-emerald-500/20 p-3">
            <Bell className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                Notificaciones activadas
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Recibirás alertas de stock bajo, ventas completadas y recordatorios de suscripción en tu dispositivo.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Activa las notificaciones para recibir alertas importantes como:
            </p>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                Productos con stock bajo
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                Ventas completadas
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                Suscripción por vencer
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                Ventas offline sincronizadas
              </li>
            </ul>
            {!isSubscribed && permission !== 'granted' && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleToggle}
                disabled={loading}
                className="w-full"
              >
                <Bell className="h-3.5 w-3.5 mr-2" />
                Activar notificaciones
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
