package ni.whitesoftware.rider;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Handler;

import org.json.JSONObject;

import java.io.IOException;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class LocationSharingService extends Service implements LocationListener {
    static final String ACTION_START = "ni.whitesoftware.rider.action.START_LOCATION";
    static final String ACTION_STOP = "ni.whitesoftware.rider.action.STOP_LOCATION";
    static final String EXTRA_ORDER_ID = "order_id";
    private static final String CHANNEL_ID = "rider_live_location";
    private static final int NOTIFICATION_ID = 7401;
    private static final String PREF_ACTIVE = "location_active";
    private static final String PREF_ORDER = "location_order_id";

    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler();
    private LocationManager locationManager;
    private String orderId = "";
    private long lastSentAt;
    private boolean startRequestPending;
    private int currentStartId;

    static boolean isActive(Context context) {
        return ApiClient.prefs(context).getBoolean(PREF_ACTIVE, false);
    }

    static boolean isActiveFor(Context context, String orderId) {
        return isActive(context) && orderId.equals(ApiClient.prefs(context).getString(PREF_ORDER, ""));
    }

    static void start(Context context, String orderId) {
        Intent intent = new Intent(context, LocationSharingService.class);
        intent.setAction(ACTION_START);
        intent.putExtra(EXTRA_ORDER_ID, orderId);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent);
        else context.startService(intent);
    }

    static void stop(Context context, String orderId) {
        Intent intent = new Intent(context, LocationSharingService.class);
        intent.setAction(ACTION_STOP);
        intent.putExtra(EXTRA_ORDER_ID, orderId);
        context.startService(intent);
    }

    static void stopLocal(Context context) {
        context.stopService(new Intent(context, LocationSharingService.class));
        ApiClient.prefs(context).edit().putBoolean(PREF_ACTIVE, false).remove(PREF_ORDER).apply();
    }

    @Override public void onCreate() {
        super.onCreate();
        locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
        createNotificationChannel();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            stopSelf(startId);
            return START_NOT_STICKY;
        }
        String action = intent.getAction();
        orderId = intent.getStringExtra(EXTRA_ORDER_ID);
        if (ACTION_STOP.equals(action)) {
            stopSharing(true, startId);
            return START_NOT_STICKY;
        }
        if (!ACTION_START.equals(action) || orderId == null || orderId.isEmpty()) {
            stopSelf(startId);
            return START_NOT_STICKY;
        }
        currentStartId = startId;
        startForeground(NOTIFICATION_ID, buildNotification("Conectando GPS para " + orderId));
        ApiClient.prefs(this).edit().putBoolean(PREF_ACTIVE, true).putString(PREF_ORDER, orderId).apply();
        startRemoteSharing(startId);
        return START_NOT_STICKY;
    }

    private void startRemoteSharing(int startId) {
        if (orderId.isEmpty() || startRequestPending) return;
        String requestedOrder = orderId;
        startRequestPending = true;
        network.execute(() -> {
            try {
                JSONObject body = new JSONObject().put("order_id", requestedOrder);
                ApiClient.request(this, "POST", "/api/rider/location/start", body);
                startRequestPending = false;
                runOnMain(() -> {
                    if (!requestedOrder.equals(orderId)) return;
                    if (!hasLocationPermission()) {
                        stopSharing(false, startId);
                        return;
                    }
                    requestGpsUpdates();
                    updateNotification("Ubicación compartida · " + orderId);
                });
            } catch (Exception error) {
                startRequestPending = false;
                runOnMain(() -> {
                    if (!requestedOrder.equals(orderId)) return;
                    updateNotification("Sin conexión · se reintentará al recuperar señal");
                    if (error instanceof ApiClient.ApiException && (((ApiClient.ApiException) error).status == 401 || ((ApiClient.ApiException) error).status == 409)) {
                        stopSharing(false, startId);
                    } else {
                        main.postDelayed(() -> startRemoteSharing(currentStartId), 5000L);
                    }
                });
            }
        });
    }

    private void requestGpsUpdates() {
        if (!hasLocationPermission()) return;
        try {
            boolean fine = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
            String preferred = fine ? LocationManager.GPS_PROVIDER : LocationManager.NETWORK_PROVIDER;
            if (locationManager.isProviderEnabled(preferred)) {
                locationManager.requestLocationUpdates(preferred, 8000L, 5f, this, getMainLooper());
            } else if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 10000L, 10f, this, getMainLooper());
                updateNotification("Activá GPS para obtener una ubicación precisa");
            } else {
                updateNotification("Activá la ubicación del teléfono para compartirla");
            }
            String lastProvider = fine ? LocationManager.GPS_PROVIDER : LocationManager.NETWORK_PROVIDER;
            Location last = locationManager.getLastKnownLocation(lastProvider);
            if (last != null) onLocationChanged(last);
        } catch (SecurityException error) {
            stopSharing(false, 0);
        }
    }

    @Override public void onLocationChanged(Location location) {
        long now = System.currentTimeMillis();
        if (startRequestPending || now - lastSentAt < 9500L || location == null || orderId.isEmpty()) return;
        lastSentAt = now;
        network.execute(() -> {
            try {
                JSONObject body = new JSONObject()
                        .put("order_id", orderId)
                        .put("latitude", location.getLatitude())
                        .put("longitude", location.getLongitude())
                        .put("accuracy", location.hasAccuracy() ? location.getAccuracy() : 0);
                ApiClient.request(this, "POST", "/api/rider/location", body);
                updateNotification("Ubicación compartida · " + orderId);
            } catch (Exception error) {
                if (error instanceof ApiClient.ApiException && (((ApiClient.ApiException) error).status == 401 || ((ApiClient.ApiException) error).status == 409)) {
                    runOnMain(() -> stopSharing(false, 0));
                }
            }
        });
    }

    private void stopSharing(boolean notifyServer, int startId) {
        removeGpsUpdates();
        String stoppingOrder = orderId;
        orderId = "";
        ApiClient.prefs(this).edit().putBoolean(PREF_ACTIVE, false).remove(PREF_ORDER).apply();
        Runnable finish = () -> runOnMain(() -> {
            stopForeground(STOP_FOREGROUND_REMOVE);
            if (startId > 0) stopSelf(startId); else stopSelf();
        });
        if (notifyServer && stoppingOrder != null && !stoppingOrder.isEmpty() && ApiClient.hasCookie(this)) {
            network.execute(() -> {
                try { ApiClient.request(this, "POST", "/api/rider/location/stop", new JSONObject().put("order_id", stoppingOrder)); }
                catch (Exception ignored) { }
                finish.run();
            });
        } else {
            finish.run();
        }
    }

    private void removeGpsUpdates() {
        if (locationManager != null) {
            try { locationManager.removeUpdates(this); }
            catch (SecurityException ignored) { }
        }
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Ubicación del rider", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Aviso persistente mientras el rider comparte su ubicación durante una entrega activa.");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    private Notification buildNotification(String text) {
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent content = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent stop = new Intent(this, LocationSharingService.class);
        stop.setAction(ACTION_STOP);
        stop.putExtra(EXTRA_ORDER_ID, orderId);
        PendingIntent stopPending = PendingIntent.getService(this, 1, stop, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentTitle("White Rider · entrega activa")
                .setContentText(text)
                .setContentIntent(content)
                .setOngoing(true)
                .setCategory(Notification.CATEGORY_SERVICE)
                .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, "Detener ubicación", stopPending).build())
                .build();
    }

    private void updateNotification(String text) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null && !orderId.isEmpty()) manager.notify(NOTIFICATION_ID, buildNotification(text));
    }

    private void runOnMain(Runnable runnable) {
        new android.os.Handler(getMainLooper()).post(runnable);
    }

    @Override public void onProviderEnabled(String provider) { updateNotification("GPS activo · " + orderId); }
    @Override public void onProviderDisabled(String provider) { updateNotification("Activá GPS para compartir tu ubicación"); }
    @Override public void onStatusChanged(String provider, int status, Bundle extras) { }

    @Override public void onDestroy() {
        removeGpsUpdates();
        ApiClient.prefs(this).edit().putBoolean(PREF_ACTIVE, false).remove(PREF_ORDER).apply();
        network.shutdownNow();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
