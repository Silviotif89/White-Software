package ni.whitesoftware.rider;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Typeface;
import android.graphics.Insets;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.text.NumberFormat;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final int NAVY = 0xFF102A43;
    private static final int INK = 0xFF243B53;
    private static final int MUTED = 0xFF627D98;
    private static final int GREEN = 0xFF176B5B;
    private static final int PALE = 0xFFF3F6F8;
    private static final int BORDER = 0xFFE1E8EF;
    private static final int REQ_LOCATION = 401;
    private static final int REQ_NOTIFICATIONS = 402;
    private static final int REQ_ROUTE_NO_GPS = 403;
    private static final String CHANNEL_ORDERS = "rider_orders";

    private final ExecutorService io = Executors.newFixedThreadPool(3);
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable poll = new Runnable() {
        @Override public void run() {
            if (isVisible && ApiClient.hasCookie(MainActivity.this)) loadTasks(false);
            handler.postDelayed(this, 20000L);
        }
    };
    private LinearLayout page;
    private LinearLayout taskList;
    private EditText serverInput;
    private EditText emailInput;
    private EditText passwordInput;
    private TextView messageText;
    private TextView summaryText;
    private EventStreamClient events;
    private String riderName = "Rider";
    private String pendingRouteOrder = "";
    private boolean isVisible;
    private boolean loading;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(PALE);
        getWindow().setNavigationBarColor(0xFFFFFFFF);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        createNotificationChannels();
        if (ApiClient.hasCookie(this)) restoreSession(); else renderLogin("");
    }

    @Override protected void onStart() {
        super.onStart();
        isVisible = true;
        handler.removeCallbacks(poll);
        handler.post(poll);
    }

    @Override protected void onStop() {
        isVisible = false;
        handler.removeCallbacks(poll);
        super.onStop();
    }

    @Override protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (events != null) events.close();
        io.shutdownNow();
        super.onDestroy();
    }

    private void restoreSession() {
        showLoading("Conectando con el comercio…");
        io.execute(() -> {
            try {
                JSONObject result = ApiClient.request(this, "GET", "/api/session", null);
                JSONObject user = result.optJSONObject("user");
                if (user == null || !"courier".equals(user.optString("role"))) throw new IOException("Esta cuenta no tiene perfil de rider.");
                riderName = user.optString("name", "Rider");
                runOnUiThread(() -> openDashboard());
            } catch (Exception error) {
                ApiClient.clearSession(this);
                runOnUiThread(() -> renderLogin("La sesión terminó. Ingresá de nuevo para recibir pedidos."));
            }
        });
    }

    private void renderLogin(String message) {
        ScrollView scroll = makePage();
        addBrand();
        TextView eyebrow = text("APLICACIÓN DE REPARTO · ANDROID", 12, MUTED, true);
        eyebrow.setLetterSpacing(0.08f);
        page.addView(eyebrow, margin(0, 0, 0, 8));
        page.addView(text("Tu jornada de entregas", 28, NAVY, true), margin(0, 0, 0, 8));
        page.addView(text("Los pedidos asignados a vos aparecen aquí. Al iniciar una ruta podés compartir tu ubicación en vivo con el comercio.", 15, MUTED, false), margin(0, 0, 0, 20));
        LinearLayout card = card();
        card.addView(text("Conectar al sistema", 19, NAVY, true), margin(0, 0, 0, 14));
        serverInput = field("Dirección del servidor", ApiClient.baseUrl(this), InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        serverInput.setSingleLine(true);
        serverInput.setImeOptions(EditorInfo.IME_ACTION_NEXT);
        card.addView(label("Servidor del comercio"));
        card.addView(serverInput, margin(0, 5, 0, 14));
        card.addView(text("En el emulador usá 10.0.2.2. En un teléfono real, usá la dirección segura HTTPS o la IP de la red de prueba.", 12, MUTED, false), margin(0, 0, 0, 16));
        emailInput = field("Correo", "rider@demo.white", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        emailInput.setSingleLine(true);
        emailInput.setImeOptions(EditorInfo.IME_ACTION_NEXT);
        card.addView(label("Correo del rider"));
        card.addView(emailInput, margin(0, 5, 0, 14));
        passwordInput = field("Contraseña", "", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        passwordInput.setSingleLine(true);
        passwordInput.setImeOptions(EditorInfo.IME_ACTION_DONE);
        card.addView(label("Contraseña"));
        card.addView(passwordInput, margin(0, 5, 0, 17));
        Button login = button("Ingresar a mis pedidos", GREEN, 0xFFFFFFFF);
        login.setOnClickListener(view -> signIn(login));
        card.addView(login, fullWidth());
        page.addView(card, margin(0, 0, 0, 16));
        if (message != null && !message.isEmpty()) page.addView(banner(message, 0xFFFFF4E5, 0xFF8A4B08), margin(0, 0, 0, 12));
        page.addView(banner("La ubicación solo se solicita al iniciar una ruta. Android muestra un aviso persistente mientras se comparte.", 0xFFEAF5F2, GREEN), margin(0, 0, 0, 18));
        page.addView(text("White Software · Rider", 12, MUTED, false), margin(0, 14, 0, 18));
        setContentView(scroll);
    }

    private void signIn(Button button) {
        button.setEnabled(false);
        button.setText("Conectando…");
        String server = serverInput.getText().toString().trim();
        String email = emailInput.getText().toString().trim();
        String password = passwordInput.getText().toString();
        hideKeyboard();
        io.execute(() -> {
            try {
                ApiClient.setBaseUrl(this, server);
                JSONObject login = new JSONObject().put("email", email).put("password", password);
                JSONObject result = ApiClient.request(this, "POST", "/api/login", login);
                JSONObject user = result.optJSONObject("user");
                if (user == null || !"courier".equals(user.optString("role"))) {
                    ApiClient.clearSession(this);
                    throw new IOException("Esta cuenta no es de rider. Pedile al comercio que te asigne un acceso de reparto.");
                }
                riderName = user.optString("name", "Rider");
                runOnUiThread(this::openDashboard);
            } catch (Exception error) {
                runOnUiThread(() -> {
                    button.setEnabled(true);
                    button.setText("Ingresar a mis pedidos");
                    renderLogin(error.getMessage());
                });
            }
        });
    }

    private void openDashboard() {
        ScrollView scroll = makePage();
        addBrand();
        LinearLayout titleRow = new LinearLayout(this);
        titleRow.setGravity(Gravity.CENTER_VERTICAL);
        titleRow.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout titleBlock = new LinearLayout(this);
        titleBlock.setOrientation(LinearLayout.VERTICAL);
        titleBlock.addView(text("REPARTO", 12, GREEN, true));
        titleBlock.addView(text("Hola, " + firstName(riderName), 27, NAVY, true), margin(0, 4, 0, 0));
        titleRow.addView(titleBlock, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        Button refresh = smallButton("Actualizar", NAVY);
        refresh.setOnClickListener(view -> loadTasks(true));
        titleRow.addView(refresh);
        page.addView(titleRow, margin(0, 0, 0, 14));
        page.addView(text("Los pedidos que despacho te asigne aparecen en esta bandeja.", 14, MUTED, false), margin(0, 0, 0, 16));
        page.addView(banner(LocationSharingService.isActive(this)
                ? "Ubicación activa. El comercio puede ver la ruta en vivo."
                : "Ubicación apagada. Se pedirá permiso solo cuando iniciés una ruta.", 0xFFEAF5F2, GREEN), margin(0, 0, 0, 17));
        LinearLayout heading = new LinearLayout(this);
        heading.setGravity(Gravity.CENTER_VERTICAL);
        heading.addView(text("Mis entregas", 20, NAVY, true), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        summaryText = text("Actualizando…", 12, MUTED, false);
        heading.addView(summaryText);
        page.addView(heading, margin(0, 0, 0, 10));
        taskList = new LinearLayout(this);
        taskList.setOrientation(LinearLayout.VERTICAL);
        page.addView(taskList, fullWidth());
        LinearLayout footer = new LinearLayout(this);
        footer.setGravity(Gravity.CENTER_VERTICAL);
        footer.addView(text("Conectado al servidor del comercio", 11, MUTED, false), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        Button logout = smallButton("Salir", 0xFF65758B);
        logout.setOnClickListener(view -> signOut());
        footer.addView(logout);
        page.addView(footer, margin(0, 18, 0, 18));
        setContentView(scroll);
        loadTasks(false);
        connectEvents();
    }

    private void loadTasks(boolean showToast) {
        if (loading || !ApiClient.hasCookie(this)) return;
        loading = true;
        io.execute(() -> {
            try {
                JSONObject result = ApiClient.request(this, "GET", "/api/rider/tasks", null);
                JSONArray tasks = result.optJSONArray("tasks");
                if (tasks == null) tasks = new JSONArray();
                JSONArray finalTasks = tasks;
                runOnUiThread(() -> {
                    loading = false;
                    renderTasks(finalTasks);
                    if (showToast) toast("Pedidos actualizados.");
                });
            } catch (Exception error) {
                runOnUiThread(() -> {
                    loading = false;
                    if (error instanceof ApiClient.ApiException && ((ApiClient.ApiException) error).status == 401) {
                        ApiClient.clearSession(this);
                        renderLogin("La sesión terminó. Ingresá de nuevo.");
                    } else if (showToast) toast(error.getMessage());
                    if (summaryText != null) summaryText.setText("Sin conexión");
                });
            }
        });
    }

    private void renderTasks(JSONArray tasks) {
        if (taskList == null) return;
        taskList.removeAllViews();
        int count = tasks.length();
        if (summaryText != null) summaryText.setText(count == 1 ? "1 pedido" : count + " pedidos");
        if (count == 0) {
            LinearLayout empty = card();
            TextView icon = text("✓", 28, GREEN, true);
            icon.setGravity(Gravity.CENTER);
            empty.addView(icon, margin(0, 2, 0, 8));
            TextView title = text("Todo al día", 20, NAVY, true);
            title.setGravity(Gravity.CENTER);
            empty.addView(title, margin(0, 0, 0, 6));
            TextView message = text("Cuando te asignen un pedido, aparecerá aquí. La lista se actualiza automáticamente.", 14, MUTED, false);
            message.setGravity(Gravity.CENTER);
            empty.addView(message);
            taskList.addView(empty, margin(0, 0, 0, 12));
            return;
        }
        for (int index = 0; index < count; index++) {
            JSONObject task = tasks.optJSONObject(index);
            if (task != null) taskList.addView(taskCard(task), margin(0, 0, 0, 12));
        }
    }

    private View taskCard(JSONObject task) {
        String id = task.optString("id", "");
        String delivery = task.optString("delivery_status", "assigned");
        String orderStatus = task.optString("order_status", "received");
        LinearLayout box = card();
        LinearLayout top = new LinearLayout(this);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.addView(text("PEDIDO " + id, 12, MUTED, true), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        TextView badge = text(statusLabel(delivery), 11, GREEN, true);
        badge.setPadding(dp(9), dp(5), dp(9), dp(5));
        badge.setBackground(round(0xFFEAF5F2, 20));
        top.addView(badge);
        box.addView(top, margin(0, 0, 0, 11));
        box.addView(text(task.optString("customer_name", "Cliente"), 20, NAVY, true), margin(0, 0, 0, 3));
        String phone = task.optString("phone", "");
        TextView phoneLink = text(phone.isEmpty() ? "" : "Llamar · " + phone, 14, GREEN, true);
        if (!phone.isEmpty()) phoneLink.setOnClickListener(view -> openPhone(phone));
        box.addView(phoneLink, margin(0, 0, 0, 12));
        box.addView(text("DIRECCIÓN", 10, MUTED, true), margin(0, 0, 0, 3));
        box.addView(text(task.optString("address", ""), 15, INK, false), margin(0, 0, 0, 4));
        String reference = task.optString("reference", "");
        if (!reference.isEmpty()) box.addView(text("Referencia: " + reference, 13, MUTED, false), margin(0, 0, 0, 9));
        Button map = smallButton("Abrir indicaciones", 0xFF286A9B);
        map.setOnClickListener(view -> openMap(task.optString("address", "")));
        box.addView(map, margin(0, 0, 0, 12));
        JSONArray items = task.optJSONArray("items");
        if (items != null) {
            StringBuilder summary = new StringBuilder("PRODUCTOS\n");
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.optJSONObject(i);
                if (item != null) summary.append("• ").append(item.optInt("quantity", 1)).append(" × ").append(item.optString("name_snapshot", "Producto")).append('\n');
            }
            box.addView(text(summary.toString().trim(), 13, INK, false), margin(0, 0, 0, 12));
        }
        String payment = task.optString("payment_method", "");
        int total = task.optInt("total", 0);
        box.addView(text(("cash".equals(payment) ? "Cobrar en efectivo" : "transfer".equals(payment) ? "Transferencia" : "Pago con tarjeta") + " · " + money(total), 14, NAVY, true), margin(0, 0, 0, 12));
        Button primary = null;
        if ("assigned".equals(delivery)) {
            primary = button("Aceptar entrega", GREEN, 0xFFFFFFFF);
            primary.setOnClickListener(view -> changeStatus(id, "accepted", null));
        } else if ("accepted".equals(delivery)) {
            if ("ready".equals(orderStatus)) {
                primary = button("Marcar pedido recogido", GREEN, 0xFFFFFFFF);
                primary.setOnClickListener(view -> changeStatus(id, "picked_up", null));
            } else {
                box.addView(banner("Esperá a que el comercio marque el pedido como listo para recoger.", 0xFFFFF4E5, 0xFF8A4B08), margin(0, 0, 0, 0));
            }
        } else if ("picked_up".equals(delivery)) {
            primary = button("Iniciar ruta", GREEN, 0xFFFFFFFF);
            primary.setOnClickListener(view -> beginRoute(id));
        } else if ("on_route".equals(delivery)) {
            boolean gpsActive = LocationSharingService.isActiveFor(this, id);
            Button gps = button(gpsActive ? "Pausar ubicación compartida" : "Activar GPS para esta entrega", gpsActive ? 0xFFEAF5F2 : 0xFFEDF3F8, gpsActive ? GREEN : NAVY);
            gps.setOnClickListener(view -> {
                if (gpsActive) LocationSharingService.stop(this, id);
                else requestLocationForCurrentRoute(id);
                handler.postDelayed(() -> loadTasks(false), 700L);
            });
            box.addView(gps, fullWidth());
            Button delivered = button("Confirmar entrega", GREEN, 0xFFFFFFFF);
            delivered.setOnClickListener(view -> confirmDelivery(id, payment));
            box.addView(delivered, margin(0, 9, 0, 0));
            Button incident = smallButton("Reportar una incidencia", 0xFF9B3C35);
            incident.setOnClickListener(view -> reportIncident(id));
            box.addView(incident, margin(0, 5, 0, 0));
        }
        if (primary != null) box.addView(primary, fullWidth());
        return box;
    }

    private void changeStatus(String orderId, String status, JSONObject extras) {
        changeStatus(orderId, status, extras, null);
    }

    private void changeStatus(String orderId, String status, JSONObject extras, Runnable afterSuccess) {
        setBusy(true);
        io.execute(() -> {
            try {
                JSONObject body = new JSONObject().put("status", status).put("event_id", "evt-" + UUID.randomUUID());
                if (extras != null) {
                    java.util.Iterator<String> keys = extras.keys();
                    while (keys.hasNext()) { String key = keys.next(); body.put(key, extras.get(key)); }
                }
                ApiClient.request(this, "POST", "/api/rider/tasks/" + Uri.encode(orderId) + "/event", body);
                runOnUiThread(() -> {
                    setBusy(false);
                    toast("Entrega actualizada: " + statusLabel(status));
                    loadTasks(false);
                    if (afterSuccess != null) afterSuccess.run();
                });
            } catch (Exception error) {
                runOnUiThread(() -> { setBusy(false); toast(error.getMessage()); });
            }
        });
    }

    private void beginRoute(String orderId) {
        pendingRouteOrder = orderId;
        if (hasLocationPermission()) {
            changeStatus(orderId, "on_route", null, () -> startServiceAfterRoute(orderId));
            return;
        }
        new AlertDialog.Builder(this)
                .setTitle("Compartir ubicación en esta entrega")
                .setMessage("White Rider usará el GPS solo mientras esta ruta esté activa. El comercio podrá ver una posición reciente y podés pausar el envío.")
                .setPositiveButton("Permitir ubicación", (dialog, which) -> requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOCATION))
                .setNegativeButton("Ahora no", (dialog, which) -> new AlertDialog.Builder(this)
                        .setTitle("Iniciar sin compartir GPS")
                        .setMessage("La entrega avanzará en el sistema, pero el comercio no verá tu ubicación en vivo.")
                        .setPositiveButton("Iniciar ruta", (d, w) -> changeStatus(orderId, "on_route", null))
                        .setNegativeButton("Cancelar", null).show())
                .show();
    }

    private void requestLocationForCurrentRoute(String orderId) {
        pendingRouteOrder = orderId;
        if (hasLocationPermission()) {
            requestNotificationPermissionThenStart(orderId);
        } else {
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_ROUTE_NO_GPS);
        }
    }

    private void startServiceAfterRoute(String orderId) {
        requestNotificationPermissionThenStart(orderId);
    }

    private void requestNotificationPermissionThenStart(String orderId) {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            pendingRouteOrder = orderId;
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS);
        } else {
            LocationSharingService.start(this, orderId);
            toast("Ubicación activa solo para esta entrega.");
            handler.postDelayed(() -> loadTasks(false), 900L);
        }
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_LOCATION) {
            if (hasLocationPermission()) {
                String order = pendingRouteOrder;
                changeStatus(order, "on_route", null, () -> startServiceAfterRoute(order));
            } else {
                String order = pendingRouteOrder;
                new AlertDialog.Builder(this).setTitle("Ubicación no permitida")
                        .setMessage("Podés continuar la entrega sin GPS. El comercio verá los cambios de estado, pero no tu posición.")
                        .setPositiveButton("Iniciar sin GPS", (dialog, which) -> changeStatus(order, "on_route", null))
                        .setNegativeButton("Cancelar", null).show();
            }
        } else if (requestCode == REQ_ROUTE_NO_GPS) {
            if (hasLocationPermission()) requestNotificationPermissionThenStart(pendingRouteOrder);
            else toast("No se activó la ubicación. Podés continuar la ruta sin GPS.");
        } else if (requestCode == REQ_NOTIFICATIONS) {
            String order = pendingRouteOrder;
            LocationSharingService.start(this, order);
            toast("Ubicación activa solo para esta entrega.");
            handler.postDelayed(() -> loadTasks(false), 900L);
        }
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void confirmDelivery(String orderId, String paymentMethod) {
        new AlertDialog.Builder(this)
                .setTitle("Confirmar pedido entregado")
                .setMessage("¿Ya entregaste el pedido " + orderId + "?")
                .setNegativeButton("Volver", null)
                .setPositiveButton("Sí, entregado", (dialog, which) -> {
                    if ("cash".equals(paymentMethod)) confirmCash(orderId);
                    else finishDelivery(orderId, false);
                }).show();
    }

    private void confirmCash(String orderId) {
        new AlertDialog.Builder(this).setTitle("Cobro en efectivo")
                .setMessage("¿Recibiste el total del pedido en efectivo?")
                .setPositiveButton("Sí, lo recibí", (dialog, which) -> finishDelivery(orderId, true))
                .setNegativeButton("Queda pendiente", (dialog, which) -> finishDelivery(orderId, false)).show();
    }

    private void finishDelivery(String orderId, boolean cashCollected) {
        LocationSharingService.stopLocal(this);
        io.execute(() -> {
            try {
                try { ApiClient.request(this, "POST", "/api/rider/location/stop", new JSONObject().put("order_id", orderId)); }
                catch (ApiClient.ApiException ignored) { }
                JSONObject body = new JSONObject().put("status", "delivered")
                        .put("event_id", "evt-" + UUID.randomUUID()).put("payment_collected", cashCollected);
                ApiClient.request(this, "POST", "/api/rider/tasks/" + Uri.encode(orderId) + "/event", body);
                runOnUiThread(() -> { toast("Entrega confirmada."); loadTasks(false); });
            } catch (Exception error) { runOnUiThread(() -> toast(error.getMessage())); }
        });
    }

    private void reportIncident(String orderId) {
        EditText note = field("Qué pasó", "", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        note.setMinLines(2);
        new AlertDialog.Builder(this).setTitle("Reportar incidencia").setMessage("Contale al comercio qué necesita resolver.")
                .setView(note)
                .setNegativeButton("Cancelar", null)
                .setPositiveButton("Enviar", (dialog, which) -> {
                    String description = note.getText().toString().trim();
                    if (description.length() < 3) { toast("Agregá una breve descripción."); return; }
                    LocationSharingService.stopLocal(this);
                    io.execute(() -> {
                        try {
                            try { ApiClient.request(this, "POST", "/api/rider/location/stop", new JSONObject().put("order_id", orderId)); }
                            catch (ApiClient.ApiException ignored) { }
                            JSONObject body = new JSONObject().put("status", "incident").put("note", description).put("event_id", "evt-" + UUID.randomUUID());
                            ApiClient.request(this, "POST", "/api/rider/tasks/" + Uri.encode(orderId) + "/event", body);
                            runOnUiThread(() -> { toast("Incidencia enviada a despacho."); loadTasks(false); });
                        } catch (Exception error) { runOnUiThread(() -> toast(error.getMessage())); }
                    });
                }).show();
    }

    private void connectEvents() {
        if (events != null) events.close();
        events = new EventStreamClient(this, new EventStreamClient.Listener() {
            @Override public void onUpdate(JSONObject event) {
                String type = event.optString("type", "");
                String orderId = event.optString("entity_id", "");
                runOnUiThread(() -> {
                    if (!isVisible && "courier_assigned".equals(type)) notifyNewOrder(orderId);
                    loadTasks(false);
                });
            }
            @Override public void onUnauthorized() {
                runOnUiThread(() -> {
                    if (!isFinishing() && ApiClient.hasCookie(MainActivity.this)) {
                        ApiClient.clearSession(MainActivity.this);
                        renderLogin("La sesión terminó. Ingresá de nuevo para continuar.");
                    }
                });
            }
        });
        events.start();
    }

    private void notifyNewOrder(String orderId) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent pending = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new Notification.Builder(this, CHANNEL_ORDERS)
                .setSmallIcon(android.R.drawable.ic_menu_view)
                .setContentTitle("Te asignaron un pedido")
                .setContentText(orderId.isEmpty() ? "Abrí White Rider para ver los detalles." : "Pedido " + orderId + " · Abrí la app para revisarlo.")
                .setContentIntent(pending)
                .setAutoCancel(true)
                .build();
        manager.notify(Math.abs(orderId.hashCode()), notification);
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(new NotificationChannel(CHANNEL_ORDERS, "Nuevos pedidos", NotificationManager.IMPORTANCE_HIGH));
                NotificationChannel location = new NotificationChannel("rider_live_location", "Ubicación del rider", NotificationManager.IMPORTANCE_LOW);
                manager.createNotificationChannel(location);
            }
        }
    }

    private void signOut() {
        if (LocationSharingService.isActive(this)) {
            String order = ApiClient.prefs(this).getString("location_order_id", "");
            new AlertDialog.Builder(this).setTitle("Detener ubicación y salir")
                    .setMessage("La ubicación compartida se detendrá para la entrega activa y después se cerrará tu sesión.")
                    .setNegativeButton("Seguir en la app", null)
                    .setPositiveButton("Detener y salir", (dialog, which) -> completeSignOut(order)).show();
        } else {
            completeSignOut("");
        }
    }

    private void completeSignOut(String activeOrder) {
        LocationSharingService.stopLocal(this);
        io.execute(() -> {
            if (activeOrder != null && !activeOrder.isEmpty()) {
                try { ApiClient.request(this, "POST", "/api/rider/location/stop", new JSONObject().put("order_id", activeOrder)); }
                catch (Exception ignored) { }
            }
            try { ApiClient.request(this, "POST", "/api/logout", new JSONObject()); }
            catch (Exception ignored) { }
            ApiClient.clearSession(this);
            runOnUiThread(() -> { if (events != null) events.close(); renderLogin(""); });
        });
    }

    private void openPhone(String phone) {
        try { startActivity(new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(phone)))); }
        catch (Exception error) { toast("No se pudo abrir la aplicación de llamadas."); }
    }

    private void openMap(String address) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=" + Uri.encode(address)))); }
        catch (Exception error) { toast("No se pudo abrir el mapa."); }
    }

    private void showLoading(String message) {
        ScrollView scroll = makePage();
        addBrand();
        TextView label = text(message, 16, MUTED, false);
        label.setGravity(Gravity.CENTER);
        page.addView(label, margin(0, 60, 0, 20));
        setContentView(scroll);
    }

    private ScrollView makePage() {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(PALE);
        page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setPadding(dp(20), dp(20), dp(20), dp(16));
        scroll.addView(page, new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        scroll.setOnApplyWindowInsetsListener((view, insets) -> {
            int top;
            int bottom;
            if (Build.VERSION.SDK_INT >= 30) {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                top = bars.top;
                bottom = bars.bottom;
            } else {
                top = insets.getSystemWindowInsetTop();
                bottom = insets.getSystemWindowInsetBottom();
            }
            page.setPadding(dp(20), dp(20) + top, dp(20), dp(16) + bottom);
            return insets;
        });
        messageText = null;
        taskList = null;
        summaryText = null;
        return scroll;
    }

    private void addBrand() {
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        TextView mark = text("W", 19, 0xFFFFFFFF, true);
        mark.setGravity(Gravity.CENTER);
        mark.setBackground(round(NAVY, 14));
        row.addView(mark, new LinearLayout.LayoutParams(dp(38), dp(38)));
        LinearLayout words = new LinearLayout(this);
        words.setOrientation(LinearLayout.VERTICAL);
        TextView white = text("WHITE", 12, NAVY, true);
        TextView software = text("SOFTWARE", 9, MUTED, true);
        words.addView(white);
        words.addView(software);
        row.addView(words, margin(9, 0, 0, 0));
        page.addView(row, margin(0, 0, 0, 26));
    }

    private LinearLayout card() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(17), dp(17), dp(17), dp(17));
        card.setBackground(round(0xFFFFFFFF, 18));
        return card;
    }

    private TextView banner(String message, int background, int foreground) {
        TextView view = text(message, 13, foreground, false);
        view.setPadding(dp(13), dp(12), dp(13), dp(12));
        view.setBackground(round(background, 13));
        return view;
    }

    private TextView label(String value) { return text(value, 12, INK, true); }

    private EditText field(String hint, String value, int type) {
        EditText edit = new EditText(this);
        edit.setSingleLine(false);
        edit.setTextSize(15);
        edit.setTextColor(NAVY);
        edit.setHintTextColor(0xFF829AB1);
        edit.setHint(hint);
        edit.setInputType(type);
        edit.setText(value);
        edit.setPadding(dp(13), dp(11), dp(13), dp(11));
        edit.setBackground(round(0xFFF8FAFC, 11));
        return edit;
    }

    private Button button(String title, int background, int foreground) {
        Button button = new Button(this);
        button.setText(title);
        button.setAllCaps(false);
        button.setTextSize(14);
        button.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        button.setTextColor(foreground);
        button.setMinHeight(dp(48));
        button.setPadding(dp(14), dp(8), dp(14), dp(8));
        button.setBackground(round(background, 12));
        return button;
    }

    private Button smallButton(String title, int color) {
        Button button = button(title, 0xFFF0F4F7, color);
        button.setTextSize(12);
        button.setMinHeight(dp(38));
        button.setPadding(dp(10), dp(3), dp(10), dp(3));
        return button;
    }

    private TextView text(String value, int size, int color, boolean bold) {
        TextView text = new TextView(this);
        text.setText(value);
        text.setTextSize(size);
        text.setTextColor(color);
        if (bold) text.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        text.setLineSpacing(dp(2), 1f);
        return text;
    }

    private GradientDrawable round(int color, int radius) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(radius));
        if (color == 0xFFFFFFFF) drawable.setStroke(dp(1), BORDER);
        return drawable;
    }

    private LinearLayout.LayoutParams margin(int left, int top, int right, int bottom) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.setMargins(dp(left), dp(top), dp(right), dp(bottom));
        return params;
    }

    private LinearLayout.LayoutParams fullWidth() {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private String firstName(String name) { return name == null || name.trim().isEmpty() ? "Rider" : name.trim().split("\\s+")[0]; }

    private String statusLabel(String status) {
        switch (status) {
            case "assigned": return "Asignada";
            case "accepted": return "Aceptada";
            case "picked_up": return "Recogida";
            case "on_route": return "En ruta";
            case "incident": return "Incidencia";
            default: return status;
        }
    }

    private String money(int cents) {
        return NumberFormat.getCurrencyInstance(new Locale("es", "NI")).format(cents / 100.0);
    }

    private void setBusy(boolean busy) {
        if (taskList != null) taskList.setAlpha(busy ? 0.55f : 1f);
    }

    private void hideKeyboard() {
        try {
            InputMethodManager manager = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
            if (manager != null) manager.hideSoftInputFromWindow(page.getWindowToken(), 0);
        } catch (Exception ignored) { }
    }

    private void toast(String message) { Toast.makeText(this, message == null ? "Ocurrió un error." : message, Toast.LENGTH_LONG).show(); }
}
