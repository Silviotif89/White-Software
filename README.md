# White Software

Plataforma integrada de pedidos y reparto propio para comercios de Nicaragua. Esta rama convierte el prototipo visual aprobado en un MVP local con tres interfaces conectadas a una misma API y una misma base SQLite:

1. **Panel del comercio:** pedidos, cambios de estado, asignación, catálogo, configuración y ubicación reciente.
2. **Tienda del cliente:** catálogo y compra desde un enlace web, sin instalar una aplicación.
3. **White Rider:** aplicación nativa Android para pedidos asignados, estados de entrega y ubicación GPS durante una ruta activa.

También se conserva una vista web de rider como alternativa de demostración.

## Acceso a las interfaces

- Panel del comercio: `http://127.0.0.1:8000/admin.html`
- Tienda del cliente: `http://127.0.0.1:8000/tienda.html?comercio=mercadito-la-esquina`
- Seguimiento individual: `http://127.0.0.1:8000/seguimiento.html?token=...`
- Aplicación rider: proyecto Android en [`android/`](android/) y pasos en [`docs/ANDROID_RIDER.md`](docs/ANDROID_RIDER.md)

## Ejecutar en Windows

Requiere Python 3.10 o posterior. No usa paquetes de terceros.

Desde PowerShell:

    cd "C:\ruta\White-Software"
    python server.py

Abrí http://127.0.0.1:8000. El servidor escucha solo en localhost por defecto y crea la base en data/white-software.sqlite3.

### Accesos demo locales

- Comercio: admin@demo.white / Demo123!
- Despacho: despacho@demo.white / Demo123!
- Repartidor: rider@demo.white / Demo123!

Son cuentas públicas de demostración. No expongas el servidor con esas claves ni agregues datos reales.

## Probar el recorrido

1. Abrí la tienda: http://127.0.0.1:8000/tienda.html?comercio=mercadito-la-esquina.
2. Agregá productos y enviá un pedido con efectivo o transferencia.
3. En la vista admin, iniciá sesión y pasá el pedido por **Confirmado → Preparando → Listo para recoger**.
4. Asigná el rider. En White Rider, iniciá sesión y aceptá la entrega.
5. Cuando el comercio confirme que está listo, marcá **Recogida → Iniciar ruta**.
6. Tocá **Activar GPS para esta entrega** y concedé el permiso de Android si querés compartir la posición. También podés completar la entrega sin activar el GPS.
7. Abrí el enlace de seguimiento que recibió el cliente. El pedido y la última ubicación autorizada se consultan desde la misma base.

El pedido obtiene un enlace privado de seguimiento. Este muestra el estado y el total; si el rider comparte una posición reciente, permite abrirla en un mapa. No expone nombre, teléfono ni dirección en la página de seguimiento.

## Pagos

- **Efectivo:** habilitado contra entrega. El rider puede indicar si recibió el efectivo y despacho puede registrar una verificación posterior.
- **Transferencia:** queda pendiente hasta que alguien del comercio verifique el movimiento bancario y deje una nota.
- **Tarjeta:** deshabilitada. La API rechaza el intento con payment_integration_pending; no simula aprobación ni almacena números o CVV.

Para habilitar tarjetas hay que contratar un adquirente o pasarela que opere con el comercio en Nicaragua y validar tarjetas, emisores, marcas, comisiones, liquidación, reembolsos, contracargos, webhooks, afiliación multiempresa y sandbox. El banco emisor del cliente no es necesariamente el adquirente del comercio. No se asumió BAC ni un proveedor específico.

## Pruebas

    python -m unittest discover -s tests -v
    node --check connected.js
    python -m py_compile server.py

La prueba de integración levanta un servidor temporal y valida pedido duplicado, flujo de estados, permisos, pago sin simulación, transferencia, ubicación autorizada y separación de datos entre comercios. Solo usa datos ficticios en una carpeta temporal.

## Configuración y despliegue

Variables opcionales: WHITE_HOST, WHITE_PORT, WHITESOFT_DATA, WHITE_ADMIN_EMAIL, WHITE_ADMIN_PASSWORD, WHITE_DISPATCHER_EMAIL, WHITE_DISPATCHER_PASSWORD, WHITE_COURIER_EMAIL, WHITE_COURIER_PASSWORD y WHITE_COOKIE_SECURE.

La configuración local predeterminada sirve para explorar el MVP. Si se cambia el bind para aceptar conexiones fuera de localhost, el servidor exige claves distintas de 12 caracteres o más para los tres roles. En producción debe usarse HTTPS con `WHITE_COOKIE_SECURE=1`; `WHITE_ALLOW_INSECURE_LAN=1` solo sirve para pruebas en una red Wi-Fi privada. Para utilizar claves distintas desde el primer arranque, configuralas antes de crear la base; las cuentas de una base existente no se reemplazan automáticamente por variables de entorno.

Este servidor Python y SQLite no deben exponerse directamente en internet. Antes de una prueba pública hacen falta HTTPS y cookies seguras, un servidor de aplicación de producción, gestión de secretos, límites de acceso, política de respaldos y recuperación, monitoreo, revisión de seguridad y pruebas con teléfonos reales. Revisá los documentos Arquitectura, Seguridad y operación y [White Rider para Android](docs/ANDROID_RIDER.md).

## Alcance que todavía requiere trabajo

- El ejemplo trae un comercio y cuentas ficticias. La creación de comercios, altas de usuarios y recuperación de contraseña aún no tienen pantalla.
- La app Android comparte GPS durante una ruta activa mediante un servicio de ubicación en primer plano y una notificación persistente; aún debe probarse con teléfonos reales y distintos fabricantes.
- La bandeja recibe asignaciones en vivo mientras el canal de eventos se mantiene conectado. Para notificaciones push garantizadas si Android suspende o cierra la app hay que configurar Firebase Cloud Messaging.
- El mapa abre el punto reciente en OpenStreetMap; no hay geocodificación, zonas dibujadas, rutas ni cálculo de ETA.
- No hay proveedor real de tarjetas, reembolsos de pasarela, inventario por cantidad ni gestión avanzada de clientes.
- El panel, la tienda, el seguimiento y White Rider reciben actualizaciones del servidor mediante eventos en vivo y consultas de respaldo. Las notificaciones push de fondo requieren configurar Firebase Cloud Messaging.

El prototipo anterior está guardado en prototype/. El código de esta rama es una base funcional para revisión, no una declaración de que el producto esté listo para producción.
