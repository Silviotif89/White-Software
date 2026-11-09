"use strict";
var CACHE_NAME = "white-software-shell-v1";
var STATIC_FILES = ["/", "/connected.css", "/connected.js", "/manifest.webmanifest", "/icon.svg"];
self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(CACHE_NAME).then(function (cache) { return cache.addAll(STATIC_FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (key) { return key !== CACHE_NAME; }).map(function (key) { return caches.delete(key); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (event) {
  var request = event.request;
  var url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.indexOf("/api/") === 0) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(function () { return caches.match("/"); }));
  } else if (STATIC_FILES.indexOf(url.pathname) >= 0) {
    event.respondWith(caches.match(request).then(function (cached) {
      var network = fetch(request).then(function (response) {
        if (response.ok) caches.open(CACHE_NAME).then(function (cache) { cache.put(request, response.clone()); });
        return response;
      }).catch(function () { return cached; });
      return cached || network;
    }));
  }
});
