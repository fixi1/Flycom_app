import React, { useRef, useCallback, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { WebView } from 'react-native-webview';

function buildMapHtml() {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin=""/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
<style>
*{margin:0;padding:0;}
html,body,#map{width:100%;height:100%;}
#map{background:#1a1a2e;}
.leaflet-control-zoom{display:none;}
.leaflet-popup-content-wrapper{background:#2C2C2E;color:#fff;border-radius:8px;}
.leaflet-popup-tip{background:#2C2C2E;}
.leaflet-popup-content{margin:8px 12px;font-size:13px;}
.status{position:fixed;top:4px;left:50%;transform:translateX(-50%);color:#fff;font-size:11px;background:rgba(0,0,0,0.6);padding:2px 10px;border-radius:10px;z-index:9999;}
</style>
</head>
<body>
<div id="status" class="status">Loading map...</div>
<div id="map"></div>
<script>
var mapReady = false;
var pendingMessages = [];

function tryInit() {
  if (typeof L === 'undefined') {
    document.getElementById('status').textContent = 'Loading Leaflet...';
    setTimeout(tryInit, 300);
    return;
  }
  initMap();
}

function initMap() {
  var map = L.map('map', { zoomControl: false, attributionControl: false }).setView([44.4268, 26.1025], 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, subdomains: 'abc',
    errorTileUrl: ''
  }).addTo(map);

  window._map = map;
  window._markers = {};

  window.updateMarkers = function(data) {
    var newIds = {};
    data.forEach(function(m) { newIds[m.id] = true; });
    Object.keys(window._markers).forEach(function(id) {
      if (!newIds[id]) { window._map.removeLayer(window._markers[id]); delete window._markers[id]; }
    });
    data.forEach(function(m) {
      if (window._markers[m.id]) {
        window._markers[m.id].setLatLng([m.lat, m.lng]);
        window._markers[m.id].setPopupContent(m.popup || m.title);
      } else {
        var icon = L.divIcon({
          className: '',
          html: '<div style="background:' + (m.color || '#007AFF') + ';width:24px;height:24px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>',
          iconSize: [24, 24], iconAnchor: [12, 12]
        });
        window._markers[m.id] = L.marker([m.lat, m.lng], { icon: icon }).addTo(window._map).bindPopup(m.popup || m.title || '');
      }
    });
  };

  window.setLocation = function(lat, lng, zoom) {
    window._map.setView([lat, lng], zoom || 14);
  };

  function handleMessage(e) {
    try {
      var msg = JSON.parse(e.data);
      if (msg.type === 'markers') window.updateMarkers(msg.data);
      if (msg.type === 'location') window.setLocation(msg.lat, msg.lng, msg.zoom);
    } catch(err) {}
  }
  window.addEventListener('message', handleMessage);
  document.addEventListener('message', handleMessage);

  mapReady = true;
  document.getElementById('status').style.display = 'none';
  pendingMessages.forEach(function(m) { handleMessage({data: m}); });
  pendingMessages = [];

  window.ReactNativeWebView.postMessage(JSON.stringify({type:'ready'}));
}

tryInit();
</script>
</body>
</html>`;
}

const MAP_HTML = buildMapHtml();

export default function LeafletMap({ userLocation, markers, style, onMarkerPress }) {
  const webViewRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const pendingRef = useRef([]);

  const sendToMap = useCallback((data) => {
    const json = JSON.stringify(data);
    if (mapReady && webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        try {
          var msg = ${json};
          if (msg.type === 'markers' && window.updateMarkers) window.updateMarkers(msg.data);
          if (msg.type === 'location' && window.setLocation) window.setLocation(msg.lat, msg.lng, msg.zoom);
        } catch(e) {}
        true;
      `);
    } else {
      pendingRef.current.push(data);
    }
  }, [mapReady]);

  const flushPending = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = [];
    pending.forEach(data => {
      const json = JSON.stringify(data);
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          try {
            var msg = ${json};
            if (msg.type === 'markers' && window.updateMarkers) window.updateMarkers(msg.data);
            if (msg.type === 'location' && window.setLocation) window.setLocation(msg.lat, msg.lng, msg.zoom);
          } catch(e) {}
          true;
        `);
      }
    });
  }, []);

  const handleMessage = useCallback((event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'ready') {
        setMapReady(true);
        setTimeout(flushPending, 100);
      }
      if (data.type === 'markerPress' && onMarkerPress) {
        onMarkerPress(data.markerId);
      }
    } catch (e) {}
  }, [onMarkerPress, flushPending]);

  React.useEffect(() => {
    if (userLocation) {
      sendToMap({ type: 'location', lat: userLocation.latitude, lng: userLocation.longitude, zoom: 14 });
    }
  }, [userLocation, sendToMap]);

  React.useEffect(() => {
    if (markers && markers.length > 0) {
      sendToMap({ type: 'markers', data: markers });
    }
  }, [markers, sendToMap]);

  return (
    <View style={[localStyles.container, style]}>
      <WebView
        ref={webViewRef}
        source={{ html: MAP_HTML }}
        originWhitelist={['*']}
        style={localStyles.webview}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        allowFileAccess
        allowUniversalAccessFromFileURLs
        scrollEnabled={false}
        zoomEnabled={false}
        onMessage={handleMessage}
        onError={(e) => console.log('Map WebView error:', e.nativeEvent)}
        startInLoadingState
        renderLoading={() => (
          <View style={localStyles.loading}>
            <ActivityIndicator size="small" color="#007AFF" />
            <Text style={{ color: '#8E8E93', fontSize: 12, marginTop: 6 }}>Loading map...</Text>
          </View>
        )}
      />
    </View>
  );
}

const localStyles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: '#1a1a2e',
  },
  webview: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  loading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
  },
});
