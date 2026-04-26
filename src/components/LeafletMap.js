import React, { useRef, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { WebView } from 'react-native-webview';

const LEAFLET_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; }
    html, body, #map { width: 100%; height: 100%; }
    #map { background: #1C1C1E; }
    .leaflet-control-zoom { display: none; }
    .leaflet-popup-content-wrapper { background: #2C2C2E; color: #fff; border-radius: 8px; }
    .leaflet-popup-tip { background: #2C2C2E; }
    .leaflet-popup-content { margin: 8px 12px; font-size: 13px; }
    .offline-notice { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); background: rgba(255,152,0,0.9); color: #fff; padding: 4px 12px; border-radius: 12px; font-size: 11px; z-index: 1000; display: none; }
  </style>
</head>
<body>
  <div id="offlineNotice" class="offline-notice">Offline - showing cached tiles</div>
  <div id="map"></div>
  <script>
    var DB_NAME = 'flycom_tiles';
    var DB_VERSION = 1;
    var STORE_NAME = 'tiles';
    var tileDb = null;
    var isOffline = false;

    function openDb() {
      return new Promise(function(resolve, reject) {
        try {
          var req = indexedDB.open(DB_NAME, DB_VERSION);
          req.onupgradeneeded = function(e) {
            var db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
              db.createObjectStore(STORE_NAME, { keyPath: 'key' });
            }
          };
          req.onsuccess = function(e) { tileDb = e.target.result; resolve(tileDb); };
          req.onerror = function(e) { reject(e.target.error); };
        } catch(e) { reject(e); }
      });
    }

    function getCachedTile(key) {
      return new Promise(function(resolve) {
        if (!tileDb) { resolve(null); return; }
        try {
          var tx = tileDb.transaction(STORE_NAME, 'readonly');
          var store = tx.objectStore(STORE_NAME);
          var req = store.get(key);
          req.onsuccess = function() {
            var result = req.result;
            if (result && result.dataUrl) {
              resolve(result.dataUrl);
            } else {
              resolve(null);
            }
          };
          req.onerror = function() { resolve(null); };
        } catch(e) { resolve(null); }
      });
    }

    function cacheTile(key, dataUrl) {
      if (!tileDb) return;
      try {
        var tx = tileDb.transaction(STORE_NAME, 'readwrite');
        var store = tx.objectStore(STORE_NAME);
        store.put({ key: key, dataUrl: dataUrl, timestamp: Date.now() });
      } catch(e) {}
    }

    var LEAFLET_CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    var LEAFLET_JS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

    function loadScript(src, fallbackKey) {
      return new Promise(function(resolve, reject) {
        var script = document.createElement('script');
        script.src = src;
        script.onload = function() {
          try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', src, true);
            xhr.responseType = 'text';
            xhr.onload = function() {
              if (xhr.status === 200) {
                try { localStorage.setItem(fallbackKey, xhr.responseText); } catch(e) {}
              }
            };
            xhr.send();
          } catch(e) {}
          resolve();
        };
        script.onerror = function() {
          var cached = localStorage.getItem(fallbackKey);
          if (cached) {
            var inline = document.createElement('script');
            inline.textContent = cached;
            document.head.appendChild(inline);
            resolve();
          } else {
            reject('No Leaflet available');
          }
        };
        document.head.appendChild(script);
      });
    }

    function loadCSS(href, fallbackKey) {
      return new Promise(function(resolve) {
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.onload = function() {
          try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', href, true);
            xhr.responseType = 'text';
            xhr.onload = function() {
              if (xhr.status === 200) {
                try { localStorage.setItem(fallbackKey, xhr.responseText); } catch(e) {}
              }
            };
            xhr.send();
          } catch(e) {}
          resolve();
        };
        link.onerror = function() {
          var cached = localStorage.getItem(fallbackKey);
          if (cached) {
            var style = document.createElement('style');
            style.textContent = cached;
            document.head.appendChild(style);
          }
          resolve();
        };
        document.head.appendChild(link);
      });
    }

    openDb().catch(function() {}).then(function() {
      return loadCSS(LEAFLET_CSS_URL, 'flycom_leaflet_css');
    }).then(function() {
      return loadScript(LEAFLET_JS_URL, 'flycom_leaflet_js');
    }).then(function() {
      initMap();
    }).catch(function(err) {
      console.error('Map init failed:', err);
    });

    function initMap() {
      var map = L.map('map', {
        zoomControl: false,
        attributionControl: false
      }).setView([44.4268, 26.1025], 13);

      var OfflineTileLayer = L.TileLayer.extend({
        createTile: function(coords, done) {
          var tile = document.createElement('img');
          var key = coords.z + '/' + coords.x + '/' + coords.y;
          var url = this.getTileUrl(coords);

          getCachedTile(key).then(function(cachedDataUrl) {
            if (cachedDataUrl) {
              tile.onload = function() { done(null, tile); };
              tile.onerror = function() { fetchOnline(key, url, tile, done); };
              tile.src = cachedDataUrl;
            } else {
              fetchOnline(key, url, tile, done);
            }
          });

          return tile;
        }
      });

      function fetchOnline(key, url, tile, done) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'blob';
        xhr.timeout = 8000;
        xhr.onload = function() {
          if (xhr.status === 200) {
            var blob = xhr.response;
            var reader = new FileReader();
            reader.onloadend = function() {
              var dataUrl = reader.result;
              cacheTile(key, dataUrl);
              tile.onload = function() { done(null, tile); };
              tile.onerror = function() { done('error', tile); };
              tile.src = dataUrl;
            };
            reader.readAsDataURL(blob);
          } else {
            done('error', tile);
          }
        };
        xhr.onerror = xhr.ontimeout = function() {
          isOffline = true;
          document.getElementById('offlineNotice').style.display = 'block';
          done(null, tile);
        };
        xhr.send();
      }

      new OfflineTileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        subdomains: 'abc'
      }).addTo(map);

      window._map = map;
      window._L = L;

      window._markers = {};

      window.updateMarkers = function(data) {
        var newIds = new Set(data.map(function(m) { return m.id; }));

        Object.keys(window._markers).forEach(function(id) {
          if (!newIds.has(id)) {
            window._map.removeLayer(window._markers[id]);
            delete window._markers[id];
          }
        });

        data.forEach(function(m) {
          if (window._markers[m.id]) {
            window._markers[m.id].setLatLng([m.lat, m.lng]);
            window._markers[m.id].setPopupContent(m.popup || m.title);
          } else {
            var icon = L.divIcon({
              className: '',
              html: '<div style="background:' + (m.color || '#007AFF') + ';width:24px;height:24px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>',
              iconSize: [24, 24],
              iconAnchor: [12, 12]
            });
            window._markers[m.id] = L.marker([m.lat, m.lng], { icon: icon })
              .addTo(window._map)
              .bindPopup(m.popup || m.title || '');
          }
        });
      };

      window.setLocation = function(lat, lng, zoom) {
        window._map.setView([lat, lng], zoom || 14);
      };

      function handleMessage(e) {
        try {
          var msg = JSON.parse(e.data);
          if (msg.type === 'markers' && window.updateMarkers) window.updateMarkers(msg.data);
          if (msg.type === 'location' && window.setLocation) window.setLocation(msg.lat, msg.lng, msg.zoom);
        } catch(err) {}
      }

      window.addEventListener('message', handleMessage);
      document.addEventListener('message', handleMessage);
    }
  </script>
</body>
</html>
`;

export default function LeafletMap({ userLocation, markers, style, onMarkerPress }) {
  const webViewRef = useRef(null);

  const sendToMap = useCallback((data) => {
    if (webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify(data));
    }
  }, []);

  const handleLoad = useCallback(() => {
    if (userLocation) {
      sendToMap({
        type: 'location',
        lat: userLocation.latitude,
        lng: userLocation.longitude,
        zoom: 14,
      });
    }
    if (markers && markers.length > 0) {
      sendToMap({ type: 'markers', data: markers });
    }
  }, [userLocation, markers, sendToMap]);

  React.useEffect(() => {
    if (userLocation) {
      sendToMap({
        type: 'location',
        lat: userLocation.latitude,
        lng: userLocation.longitude,
        zoom: 14,
      });
    }
  }, [userLocation, sendToMap]);

  React.useEffect(() => {
    if (markers) {
      sendToMap({ type: 'markers', data: markers });
    }
  }, [markers, sendToMap]);

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webViewRef}
        source={{ html: LEAFLET_HTML }}
        style={styles.webview}
        onLoad={handleLoad}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        zoomEnabled={false}
        onError={(e) => console.log('Map WebView error:', e.nativeEvent)}
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'markerPress' && onMarkerPress) {
              onMarkerPress(data.markerId);
            }
          } catch (e) {}
        }}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator size="small" color="#007AFF" />
            <Text style={{ color: '#8E8E93', fontSize: 12, marginTop: 6 }}>Loading map...</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: '#1C1C1E',
  },
  webview: {
    flex: 1,
    backgroundColor: '#1C1C1E',
  },
  loading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
  },
});
