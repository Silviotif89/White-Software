# Seguridad, privacidad y operación

## Información personal

El pedido guarda el nombre, teléfono, dirección, referencia, productos, precio, estado de pago y estado de entrega. El comercio y el rider asignado reciben la información necesaria para completar la entrega. El cliente consulta un token aleatorio con estado y total; el endpoint público no devuelve nombre, teléfono, dirección ni identificador interno del comercio.

El token del enlace de seguimiento es una credencial de acceso al estado de ese pedido. Compartilo solo con el cliente que hizo la compra. En una versión de producción debería poder revocarse y tener fecha de expiración.

## Permisos

- owner y admin: catálogo, configuración, ajustes de pagos manuales y consultas operativas.
- dispatcher: pedidos, asignación y ubicación reciente.
- courier: solo sus tareas activas, sus cambios de estado y GPS de una tarea activa.
- cliente: creación de pedido y seguimiento por token.

Las rutas de administración consultan el tenant desde la sesión del usuario. Los endpoints de rider comparan usuario, tenant, pedido y asignación antes de cambiar una entrega o guardar un punto GPS.

## Política GPS de este MVP

El rider necesita entrar en una ruta y pulsar Activar GPS. El navegador solicita permiso y el servidor solo acepta coordenadas si la entrega está asignada a esa cuenta, está en ruta y la persona mantuvo compartir ubicación activo. El rider puede pausar el envío, y finalizar o reportar una incidencia apaga ese permiso operativo. El cliente y despacho solo reciben coordenadas de hasta dos minutos de antigüedad. Los registros vencen a las seis horas; una tarea local de limpieza los elimina de la base periódicamente.

La autorización del navegador no garantiza GPS permanente. Cambiar de aplicación, apagar pantalla, restringir batería o suspender Safari/Chrome puede detener las actualizaciones. La PWA no ofrece garantías de seguimiento en segundo plano. No debe usarse para despachos reales hasta probar una solución móvil en campo y definir aviso, consentimiento, retención, acceso de supervisión y soporte.

## Pagos y conciliación

La demostración habilita efectivo y transferencia. Un rider puede registrar el efectivo recibido; despacho puede dejar constancia manual de efectivo o transferencia. La constancia queda en auditoría, pero no se conecta a una cuenta bancaria ni prueba que el dinero llegó.

El método tarjeta está desactivado en UI y API. Para habilitarlo, el equipo del comercio tendrá que contratar un adquirente o gateway que acepte su afiliación en Nicaragua. Confirmar por escrito:

- Marcas y tarjetas aceptadas, emisores y moneda.
- Comisión fija/variable, liquidación, reversos, reembolsos y contracargos.
- Checkout alojado o tokenización y estándares de seguridad aplicables.
- Firmas de webhook, reintentos, idempotencia y sandbox.
- Afiliación separada por comercio o modelo de marketplace.
- Conciliación y soporte ante una transacción en estado desconocido.

La integración debe almacenar referencia de proveedor y estado, nunca número completo de tarjeta ni CVV. Una respuesta del navegador no autoriza a marcar un pago como aprobado: hay que validar el callback firmado del proveedor.

## Datos de configuración local

El ejemplo crea un comercio ficticio y sus usuarios al primer inicio. Contraseñas de demo conocidas y datos que quedan en SQLite hacen que la instancia sea solo local. Para probar un usuario diferente, configura email y password antes de crear la base de datos. Cambiar variables después de creado el usuario no cambia su hash.

El servidor local escucha en 127.0.0.1. Para cualquier bind externo, server.py obliga a configurar contraseñas de 12 caracteres o más para owner, dispatcher y courier, y WHITE_COOKIE_SECURE=1. Aun así, no publiques directamente el servidor integrado de Python. Poné un servidor de aplicación compatible detrás de HTTPS, limitá el acceso, guardá secretos fuera del repositorio y utiliza una base y política de respaldo adecuadas.

## Lista de trabajo previa a un piloto

1. Crear una ruta de onboarding segura para comercios y usuarios, evitando contraseñas compartidas.
2. Definir quién puede ver datos de clientes, exportarlos, corregirlos y solicitar su eliminación.
3. Definir zonas, tarifas, horarios, reglas de cancelación y comprobante de entrega.
4. Elegir proveedor de pagos después de comparar opciones y contratos en Nicaragua.
5. Elegir entre una app móvil nativa y un servicio PWA limitado; verificar Android y iOS en equipos físicos.
6. Configurar HTTPS, gestión de secretos, recuperación de acceso, limitación de intentos, respaldos, restauración y monitoreo.
7. Hacer revisión de seguridad y privacidad, y simular fallos de red, reintentos, cobro incierto y reasignación.
8. Ejecutar una prueba piloto con pedidos de bajo riesgo y procedimiento de soporte antes de abrir al público.
