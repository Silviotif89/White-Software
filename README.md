# White Software

Plataforma integrada de pedidos y reparto propio para comercios de Nicaragua. Esta rama convierte el prototipo visual aprobado en un MVP local con tres interfaces que consultan una misma API y una misma base SQLite:

1. **Panel del comercio:** pedidos, cambios de estado, asignación, catálogo, configuración y ubicación reciente.
2. **Tienda del cliente:** catálogo y compra desde un enlace web, sin instalar una aplicación.
3. **Reparto:** interfaz móvil instalable como PWA para asignaciones, estados e inicio voluntario de GPS durante la ruta.

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

1. Abrí la tienda: http://127.0.0.1:8000/?vista=tienda&comercio=mercadito-la-esquina.
2. Agregá productos y enviá un pedido con efectivo o transferencia.
3. En la vista admin, iniciá sesión y pasá el pedido por **Confirmado → Preparando → Listo para recoger**.
4. Asigná el rider. En la vista reparto, aceptá la entrega.
5. Cuando el comercio confirme que está listo, marcá **Recogida → Iniciar ruta**.
6. Tocá **Activar GPS para esta entrega** y concedé el permiso del navegador si querés compartir la posición. También podés completar la entrega sin activar el GPS.
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

La configuración local predeterminada sirve para explorar el MVP. Si se cambia el bind para aceptar conexiones fuera de localhost, el servidor exige claves de 12 caracteres o más para los tres roles y WHITE_COOKIE_SECURE=1. Para utilizar claves distintas desde el primer arranque, configuralas antes de crear la base; las cuentas de una base existente no se reemplazan automáticamente por variables de entorno.

Este servidor Python y SQLite no deben exponerse directamente en internet. Antes de una prueba pública hacen falta HTTPS y cookies seguras, un servidor de aplicación de producción, gestión de secretos, límites de acceso, política de respaldos y recuperación, monitoreo, revisión de seguridad y pruebas con teléfonos reales. Revisá los documentos Arquitectura y Seguridad y operación.

## Alcance que todavía requiere trabajo

- El ejemplo trae un comercio y cuentas ficticias. La creación de comercios, altas de usuarios y recuperación de contraseña aún no tienen pantalla.
- La interfaz de reparto es una PWA móvil; no es una app nativa Android/iOS ni garantiza GPS en segundo plano, notificaciones push o funcionamiento continuo con la pantalla bloqueada.
- El GPS se reporta mientras la página del rider está activa. Permisos, suspensión del navegador, batería y políticas de iOS/Android deben validarse en equipos reales antes de ofrecer seguimiento operativo.
- El mapa abre el punto reciente en OpenStreetMap; no hay geocodificación, zonas dibujadas, rutas ni cálculo de ETA.
- No hay proveedor real de tarjetas, reembolsos de pasarela, inventario por cantidad ni gestión avanzada de clientes.
- Las interfaces se actualizan por consultas periódicas a la API: panel cada 15 segundos, tienda cada 60 segundos y seguimiento cada 10 segundos. Todavía no hay WebSocket ni notificaciones push.

El prototipo anterior está guardado en prototype/. El código de esta rama es una base funcional para revisión, no una declaración de que el producto esté listo para producción.

