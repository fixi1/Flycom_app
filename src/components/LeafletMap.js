import React, { useRef, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { WebView } from 'react-native-webview';

const LEAFLET_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; }
    html, body, #map { width: 100%; height: 100%; }
    #map { background: #1C1C1E; }
    .leaflet-control-zoom { display: none; }
    .leaflet-popup-content-wrapper { background: #2C2C2E; color: #fff; border-radius: 8px; }
    .leaflet-popup-tip { background: #2C2C2E; }
    .leaflet-popup-content { margin: 8px 12px; font-size: 13px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', {
      zoomControl: false,
      attributionControl: false
    }).setView([44.4268, 26.1025], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);

    var markers = {};

    function updateMarkers(data) {
      var newIds = new Set(data.map(function(m) { return m.id; }));

      // Remove old markers
      Object.keys(markers).forEach(function(id) {
        if (!newIds.has(id)) {
          map.removeLayer(markers[id]);
          delete markers[id];
        }
      });

      // Add/update markers
      data.forEach(function(m) {
        if (markers[m.id]) {
          markers[m.id].setLatLng([m.lat, m.lng]);
          markers[m.id].setPopupContent(m.popup || m.title);
        } else {
          var icon = L.divIcon({
            className: '',
            html: '<div style="background:' + (m.color || '#007AFF') + ';width:24px;height:24px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          });
          markers[m.id] = L.marker([m.lat, m.lng], { icon: icon })
            .addTo(map)
            .bindPopup(m.popup || m.title || '');
        }
      });
    }

    function setLocation(lat, lng, zoom) {
      map.setView([lat, lng], zoom || 14);
    }

    // Handle messages from React Native
    window.addEventListener('message', function(e) {
      try {
        var msg = JSON.parse(e.data);
        if (msg.type === 'markers') updateMarkers(msg.data);
        if (msg.type === 'location') setLocation(msg.lat, msg.lng, msg.zoom);
      } catch(err) {}
    });

    // Also listen for React Native WebView onMessage injection
    document.addEventListener('message', function(e) {
      try {
        var msg = JSON.parse(e.data);
        if (msg.type === 'markers') updateMarkers(msg.data);
        if (msg.type === 'location') setLocation(msg.lat, msg.lng, msg.zoom);
      } catch(err) {}
    });
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

  // Send updates when markers or location change
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
