# White Rider para Android

White Rider es la aplicación nativa para el personal de reparto. Se comunica con la misma API y base de datos que el panel del comercio y la tienda pública.

## Tres interfaces

- **Panel del comercio:** `/admin.html`. Recibe pedidos, administra el catálogo y asigna entregas.
- **Tienda del cliente:** `/tienda.html?comercio=mercadito-la-esquina`. El cliente compra sin instalar una aplicación.
- **White Rider:** aplicación Android en `android/`. El rider inicia sesión, ve los pedidos asignados, actualiza la entrega y comparte GPS durante una ruta activa.

La página `/seguimiento.html?token=...` es el enlace individual que recibe el cliente después de pedir.

## Compilar el APK de prueba

Se requiere JDK 17 o superior y Android SDK API 36. La configuración fija Android Gradle Plugin 8.13.2 y Gradle 8.13.

Desde la carpeta `android`:

```powershell
./gradlew.bat assembleDebug
```

El APK queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Se puede instalar con Android Debug Bridge:

```powershell
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

El emulador Android usa `http://10.0.2.2:8000` para llegar al servidor local de la computadora. En un teléfono físico se debe escribir la URL HTTPS del servidor o la IP LAN de la computadora en la pantalla de inicio de sesión.

## GPS y permisos

La app pide ubicación cuando el rider inicia una ruta. Si acepta, White Rider inicia un servicio Android de ubicación en primer plano y mantiene una notificación visible mientras comparte la posición. Los puntos se envían aproximadamente cada 10 segundos al pedido activo. El rider puede detener el seguimiento desde la app o desde el aviso persistente; el panel del comercio muestra la ubicación y los cambios de la entrega. Si el rider rechaza el permiso, puede registrar el avance de la entrega sin compartir GPS.

La app no solicita ubicación en segundo plano permanente. Android conserva el acceso mientras el servicio iniciado desde la app visible permanece activo. El servicio vuelve a intentar conectarse si la red falla, pero el sistema operativo o la persona pueden detenerlo.

## Pedidos y avisos

La app abre un canal de eventos autenticado para actualizar la bandeja cuando despacho asigna un pedido; además consulta la bandeja periódicamente mientras la aplicación sigue activa. Si el proceso de la app permanece conectado en segundo plano, una asignación puede generar un aviso local. Para avisos push confiables cuando Android cierre o suspenda el proceso, se debe configurar Firebase Cloud Messaging y sus credenciales de servidor; el repositorio no incluye un proyecto Firebase ni claves.

## Prueba en una red local

Para instalar en un teléfono físico, el servidor de desarrollo debe escuchar en la red LAN y el firewall de Windows debe permitir el puerto. El APK `debug` permite HTTP para esta prueba; el APK `release` no lo permite.

Variables de ejemplo para el servidor de desarrollo:

```powershell
$env:WHITE_HOST = '0.0.0.0'
$env:WHITE_PORT = '8000'
$env:WHITE_ALLOW_INSECURE_LAN = '1'
$env:WHITE_ADMIN_PASSWORD = 'Reemplazar-con-clave-privada-de-12-o-mas'
$env:WHITE_DISPATCHER_PASSWORD = 'Reemplazar-con-clave-privada-de-12-o-mas'
$env:WHITE_COURIER_PASSWORD = 'Reemplazar-con-clave-privada-de-12-o-mas'
python server.py
```

Reemplazá cada valor por una contraseña privada distinta antes de iniciar.

En White Rider se ingresa `http://IP-LAN-DE-LA-PC:8000`. El modo HTTP está destinado únicamente a una red privada de pruebas. En una instalación real, publicar la API detrás de HTTPS, configurar contraseñas únicas y retirar el acceso de demostración.

## Estado de esta entrega

La aplicación se conecta al backend de demostración ya creado. Los pagos con tarjeta siguen pendientes de un adquirente configurado. No se deben usar datos reales de pago ni exponer credenciales de demostración en internet.
