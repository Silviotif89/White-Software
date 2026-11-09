package ni.whitesoftware.rider;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

final class ApiClient {
    private static final String PREFS = "white_rider";
    private static final String KEY_URL = "server_url";
    private static final String KEY_COOKIE = "session_cookie";
    private static final String KEY_EVENT_CURSOR = "event_cursor";
    private ApiClient() { }

    static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static String baseUrl(Context context) {
        return normalize(prefs(context).getString(KEY_URL, "http://10.0.2.2:8000"));
    }

    static void setBaseUrl(Context context, String url) throws IOException {
        String clean = normalize(url);
        if (!(clean.startsWith("https://") || clean.startsWith("http://"))) {
            throw new IOException("La dirección debe iniciar con http:// o https://.");
        }
        prefs(context).edit().putString(KEY_URL, clean).apply();
    }

    static String cookie(Context context) {
        return prefs(context).getString(KEY_COOKIE, "");
    }

    static boolean hasCookie(Context context) {
        return !cookie(context).isEmpty();
    }

    static void clearSession(Context context) {
        prefs(context).edit().remove(KEY_COOKIE).remove(KEY_EVENT_CURSOR).apply();
    }

    static void saveEventCursor(Context context, String cursor) {
        prefs(context).edit().putString(KEY_EVENT_CURSOR, cursor).apply();
    }

    static String eventCursor(Context context) {
        return prefs(context).getString(KEY_EVENT_CURSOR, "latest");
    }

    static JSONObject request(Context context, String method, String path, JSONObject body) throws IOException {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(baseUrl(context) + path);
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod(method);
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(15000);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Connection", "close");
            String cookie = cookie(context);
            if (!cookie.isEmpty()) connection.setRequestProperty("Cookie", cookie);
            if (body != null) {
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                try (OutputStream output = connection.getOutputStream()) { output.write(bytes); }
            }
            int status = connection.getResponseCode();
            if (path.equals("/api/login") && status >= 200 && status < 300) {
                String setCookie = connection.getHeaderField("Set-Cookie");
                if (setCookie != null) {
                    String value = setCookie.split(";", 2)[0].trim();
                    if (value.startsWith("white_session=")) prefs(context).edit().putString(KEY_COOKIE, value).apply();
                }
            }
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            String response = stream == null ? "{}" : readAll(stream);
            JSONObject result;
            try { result = new JSONObject(response); }
            catch (Exception ignored) { result = new JSONObject(); }
            if (status < 200 || status >= 300) {
                String message = result.optJSONObject("error") == null ? "No se pudo conectar con White Software." : result.optJSONObject("error").optString("message", "La solicitud fue rechazada.");
                throw new ApiException(status, message);
            }
            return result;
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            if (e instanceof IOException) throw (IOException) e;
            throw new IOException("No se pudo conectar con el servidor: " + e.getMessage(), e);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static String readAll(InputStream stream) throws IOException {
        try (InputStream input = stream; ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int count;
            while ((count = input.read(buffer)) >= 0) bytes.write(buffer, 0, count);
            return bytes.toString(StandardCharsets.UTF_8.name());
        }
    }

    private static String normalize(String input) {
        String value = input == null ? "" : input.trim();
        while (value.endsWith("/")) value = value.substring(0, value.length() - 1);
        return value;
    }

    static final class ApiException extends IOException {
        final int status;
        ApiException(int status, String message) { super(message); this.status = status; }
    }
}
