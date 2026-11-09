package ni.whitesoftware.rider;

import android.content.Context;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;

final class EventStreamClient {
    interface Listener {
        void onUpdate(JSONObject event);
        void onUnauthorized();
    }

    private final Context context;
    private final Listener listener;
    private final AtomicBoolean running = new AtomicBoolean(false);
    private volatile HttpURLConnection connection;
    private Thread thread;

    EventStreamClient(Context context, Listener listener) {
        this.context = context.getApplicationContext();
        this.listener = listener;
    }

    void start() {
        if (!running.compareAndSet(false, true)) return;
        thread = new Thread(this::readLoop, "white-rider-events");
        thread.setDaemon(true);
        thread.start();
    }

    void close() {
        running.set(false);
        HttpURLConnection current = connection;
        if (current != null) current.disconnect();
        if (thread != null) thread.interrupt();
    }

    private void readLoop() {
        while (running.get()) {
            String cursor = ApiClient.eventCursor(context);
            try {
                URL url = new URL(ApiClient.baseUrl(context) + "/api/events?after=" + cursor);
                HttpURLConnection current = (HttpURLConnection) url.openConnection();
                connection = current;
                current.setRequestMethod("GET");
                current.setRequestProperty("Accept", "text/event-stream");
                current.setRequestProperty("Cache-Control", "no-cache");
                current.setRequestProperty("Connection", "keep-alive");
                String cookie = ApiClient.cookie(context);
                if (!cookie.isEmpty()) current.setRequestProperty("Cookie", cookie);
                current.setConnectTimeout(8000);
                current.setReadTimeout(65000);
                int status = current.getResponseCode();
                if (status == 401) {
                    listener.onUnauthorized();
                    running.set(false);
                    current.disconnect();
                    return;
                }
                if (status == 200) {
                    String eventId = "";
                    String data = "";
                    try (BufferedReader reader = new BufferedReader(new InputStreamReader(current.getInputStream(), StandardCharsets.UTF_8))) {
                        String line;
                        while (running.get() && (line = reader.readLine()) != null) {
                            if (line.startsWith("id: ")) {
                                eventId = line.substring(4).trim();
                                ApiClient.saveEventCursor(context, eventId);
                            } else if (line.startsWith("data: ")) {
                                data = line.substring(6).trim();
                            } else if (line.isEmpty() && !data.isEmpty()) {
                                try { listener.onUpdate(new JSONObject(data)); } catch (Exception ignored) { }
                                data = "";
                            }
                        }
                    }
                }
                current.disconnect();
                connection = null;
            } catch (Exception ignored) {
                HttpURLConnection current = connection;
                if (current != null) current.disconnect();
                connection = null;
            }
            if (running.get()) {
                try { Thread.sleep(1200); }
                catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
            }
        }
    }
}
