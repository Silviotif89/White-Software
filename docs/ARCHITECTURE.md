# Arquitectura actual de White Software

## Diagrama de flujo

    Tienda del cliente ── POST pedido ──┐
                                       v
    PWA del rider <── API Python + SQLite ──> Panel del comercio
          │                  │
          └── GPS autorizado └── enlace privado de seguimiento

Las tres interfaces usan el mismo origen HTTP, la misma API y la misma base. El servidor de desarrollo usa solo la biblioteca estándar de Python. SQLite guarda los datos en disco para que un pedido no dependa del navegador que lo creó.

## Componentes implementados

- index.html carga la interfaz de tres vistas.
- connected.js maneja el panel, tienda, seguimiento y reparto.
- connected.css define el diseño responsive y mantiene la paleta azul aprobada.
- server.py implementa API, validación, sesiones, estados y acceso SQLite.
- manifest.webmanifest y sw.js permiten instalar la vista de reparto como PWA y guardar los recursos estáticos.
- tests/test_system.py recorre el flujo integrado con un servidor y base temporales.

## Límites de confianza y datos

Las rutas públicas solo permiten leer el catálogo o consultar un pedido con su token aleatorio de seguimiento. Crear pedidos acepta productos por identificador y cantidad; el servidor consulta los precios vigentes, calcula subtotal y tarifa y crea la orden en una transacción. No acepta montos enviados por el navegador.

Las rutas privadas obtienen el comercio desde la sesión. No aceptan tenant_id escogido por el navegador. Consultas de productos, pedidos, repartidores, pagos y coordenadas filtran por tenant_id. La prueba de integración crea un segundo comercio y comprueba que no lea el primer comercio ni actualice sus pedidos.

Las contraseñas se guardan con PBKDF2-HMAC-SHA256 y un salt por usuario. La cookie de sesión contiene un valor aleatorio; SQLite guarda su hash, rol, comercio y vencimiento. La cookie es HttpOnly y SameSite=Lax. En desarrollo local no tiene el atributo Secure porque el servidor usa HTTP.

La protección contra duplicados usa una clave de idempotencia por comercio y una restricción única en SQLite. Los cambios de escritura adquieren una transacción inmediata. Las transiciones de pedido y entrega se revisan en el servidor y vuelven a comprobar el estado al guardar.

## Modelo de datos implementado

- tenants: identificador, enlace, nombre, frase, color, moneda, tarifa de entrega y métodos habilitados.
- users: usuario, rol, hash de contraseña, comercio y estado.
- products: catálogo de un comercio, precio entero en centavos de córdobas y disponibilidad.
- orders y order_items: contacto y dirección para entrega, método y estado de pago, estado operativo, desglose y productos con precio histórico.
- deliveries: repartidor asignado, estado de la entrega y bandera de compartir ubicación.
- order_events: transiciones y verificaciones de pago con actor, fecha, valores y clave idempotente.
- system_audit: creación de productos, cambios de disponibilidad y configuración.
- locations: coordenadas asociadas a una entrega activa, accuracy, fecha y expiración.
- sessions: hash de sesión, usuario y vencimiento.

El ejemplo inicia un tenant ficticio, tres cuentas con roles owner, dispatcher y courier y seis productos inventados. Todavía no hay interfaz de alta de comercios, miembros ni contraseñas.

## Ciclo de pedido y entrega

### Pedido

received → confirmed → preparing → ready → in_delivery → delivered

Un comercio puede cancelar desde received, confirmed, preparing o ready. No puede saltar transiciones terminales ni marcar entregado desde el panel. El rider solo puede marcar recogido cuando el comercio haya puesto el pedido en ready. La API devuelve conflicto si el estado cambió en otra pantalla.

### Entrega

assigned → accepted → picked_up → on_route → delivered

El rider puede marcar incidencia desde una entrega no terminal. Una reasignación requiere una acción de despacho, registra el cambio y apaga la ubicación previa. Las acciones del rider requieren que el pedido siga asignado a ese usuario.

### Pago

Los estados de efectivo y transferencia son distintos. El sistema puede registrar que el rider recibió efectivo o que despacho verificó manualmente un movimiento. Esas acciones son declaraciones del comercio; no reemplazan una conciliación con la cuenta bancaria ni una confirmación de adquirente.

## Ubicación

1. La persona repartidora acepta y recoge la entrega.
2. Inicia la ruta y, desde un botón explícito, permite al navegador usar su ubicación.
3. Tras obtener una coordenada, la PWA activa el indicador compartir y envía puntos durante la ruta.
4. El servidor acepta puntos solo para un usuario asignado, una entrega on_route y compartir ubicación activo.
5. El cliente y el panel reciben solo puntos recientes; la coordenada no se incluye en otros pedidos.
6. Pausar GPS, entregar, reportar incidencia o cancelar apaga la bandera de compartir. Los puntos vencen a las seis horas y un proceso los elimina de SQLite cada cinco minutos.

Este mecanismo describe ubicación por navegador mientras la PWA está funcionando. No garantiza ejecución en segundo plano, ubicación con pantalla bloqueada ni tiempos de notificación en iOS o Android. La operación real necesita una app móvil probada en los modelos objetivo, permisos y política de privacidad definidos, manejo de batería y pruebas sin señal.

## Sincronización

La interfaz consulta datos cada 15 segundos en el panel, 60 segundos en la tienda y 10 segundos en seguimiento. La PWA pone en una cola local los cambios de estado que el rider intenta hacer sin internet y los reenvía al recuperar conexión con una clave idempotente. Los puntos GPS no se guardan sin conexión. No hay WebSockets ni servicio de notificaciones.

## API disponible

- GET /api/health, GET /api/session, POST /api/login y POST /api/logout.
- GET /api/storefront?slug=..., POST /api/orders y GET /api/tracking?token=....
- GET /api/admin/overview, /api/admin/orders, /api/admin/products, /api/admin/couriers, /api/admin/locations, /api/admin/settings y /api/admin/audit.
- POST /api/admin/orders/{id}/status, /assign y /payment.
- POST /api/admin/products y /api/admin/products/{id}.
- GET /api/rider/tasks, POST /api/rider/tasks/{id}/event.
- POST /api/rider/location/start, /stop y /location.

## Pagos con tarjeta

La arquitectura aún no incluye un adaptador de pasarela. La tienda presenta tarjeta desactivada y la API rechaza ese método. No se guardan PAN, CVV, tokens de tarjeta ni claves de adquirente.

Antes de integrar, comparar proveedores disponibles para comercios nicaragüenses y confirmar con el proveedor los emisores, marcas, moneda, tarifas, liquidación, reembolsos, contracargos, webhooks firmados, modo sandbox y soporte multiempresa. Para cada comercio hay que definir si usa su propia afiliación y cómo se aislarán sus credenciales. El checkout alojado o la tokenización deben mantener los datos de tarjeta fuera de esta aplicación.

## Cambios requeridos antes de producción

- Sustituir el servidor HTTP de desarrollo y SQLite por una arquitectura de despliegue mantenible con base administrada, copias de seguridad y restauración probada.
- Usar HTTPS, cookies Secure, rotación de sesiones, limitación de intentos de acceso, recuperación de cuenta y gestión de secretos.
- Añadir migraciones versionadas, backups, monitoreo, logs centralizados, límites y alarmas operativas.
- Añadir alta de comercios, altas y desactivación de usuarios, políticas de zonas, horarios e inventario.
- Integrar un proveedor real y validar callbacks firmados e idempotentes en sandbox y producción.
- Crear app nativa o solución móvil adecuada y probar GPS con permiso, pantalla bloqueada, segundo plano, batería y pérdida de red.
- Revisar privacidad, tratamiento de direcciones y retención de datos antes de usar pedidos reales.
