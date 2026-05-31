import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, Platform, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { MAP_CONFIG } from '../config/maps';

interface MapComponentProps {
    latitude: number;
    longitude: number;
    onLocationSelect?: (lat: number, lng: number) => void;
    interactive?: boolean;
    markers?: { id: string; latitude: number; longitude: number; color: string }[];
}

export const MapComponent: React.FC<MapComponentProps> = ({
    latitude,
    longitude,
    onLocationSelect,
    interactive = true,
    markers,
}) => {
    const webviewRef = useRef<WebView>(null);
    const [isMapReady, setIsMapReady] = useState(false);
    const [mapError, setMapError] = useState<string | null>(null);

    // Escape markers JSON safely to pass to WebView JS
    const markersJsonStr = JSON.stringify(markers || []).replace(/'/g, "\\'");

    // Leaflet HTML template loaded inside the mobile WebView
    const mapHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
            <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
            <style>
                html, body, #map {
                    margin: 0;
                    padding: 0;
                    width: 100%;
                    height: 100%;
                    background-color: #f8fafc;
                }
                .custom-leaflet-marker {
                    background-color: var(--marker-color, #f97316);
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    border: 2px solid white;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                    display: block;
                }
                .custom-leaflet-marker-user {
                    background-color: #f97316;
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    border: 3px solid white;
                    box-shadow: 0 3px 8px rgba(0,0,0,0.4);
                    display: block;
                }
                .leaflet-bar {
                    border: none !important;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
                    border-radius: 8px !important;
                    overflow: hidden;
                }
                .leaflet-bar a {
                    background-color: #ffffff !important;
                    color: #1e293b !important;
                    border-bottom: 1px solid #f1f5f9 !important;
                }
                .leaflet-control-attribution {
                    font-size: 8px !important;
                    background: rgba(255,255,255,0.85) !important;
                    padding: 2px 6px !important;
                    color: #64748b !important;
                    border: 1px solid #e2e8f0 !important;
                }
            </style>
            <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        </head>
        <body>
            <div id="map"></div>
            <script>
                var map;
                var activeMarkers = [];
                var userMarker = null;
                var isInteractive = ${interactive};

                function initMap(lat, lng) {
                    map = L.map('map', {
                        center: [lat, lng],
                        zoom: ${MAP_CONFIG.defaultZoom},
                        zoomControl: false,
                        attributionControl: true
                    });

                    L.tileLayer('${MAP_CONFIG.tileLayerUrl}', {
                        attribution: '${MAP_CONFIG.attribution}'
                    }).addTo(map);

                    if (isInteractive) {
                        L.control.zoom({ position: 'topright' }).addTo(map);

                        map.on('click', function(e) {
                            var lat = e.latlng.lat;
                            var lng = e.latlng.lng;
                            window.ReactNativeWebView.postMessage(JSON.stringify({
                                type: 'LOCATION_SELECT',
                                latitude: lat,
                                longitude: lng
                            }));
                        });
                    }

                    // Tell React Native the map is loaded and ready
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MAP_READY' }));
                }

                function updateCenter(lat, lng) {
                    if (map) {
                        map.setView([lat, lng], map.getZoom() || ${MAP_CONFIG.defaultZoom}, {
                            animate: true,
                            duration: 0.8
                        });
                    }
                }

                function updateUserMarker(lat, lng) {
                    if (!map) return;
                    if (userMarker) {
                        userMarker.setLatLng([lat, lng]);
                    } else {
                        var userIcon = L.divIcon({
                            className: 'custom-leaflet-marker-user',
                            iconSize: [20, 20],
                            iconAnchor: [10, 10]
                        });
                        userMarker = L.marker([lat, lng], { icon: userIcon }).addTo(map);
                    }
                }

                function updateMarkers(markersJsonStr, lat, lng) {
                    if (!map) return;

                    // Clear old markers
                    activeMarkers.forEach(function(m) { m.remove(); });
                    activeMarkers = [];

                    // Clear user marker if plotting external markers
                    if (userMarker && markersJsonStr && JSON.parse(markersJsonStr).length > 0) {
                        userMarker.remove();
                        userMarker = null;
                    }

                    var markers = [];
                    try {
                        if (markersJsonStr) {
                            markers = JSON.parse(markersJsonStr);
                        }
                    } catch(e) {}

                    if (markers && markers.length > 0) {
                        markers.forEach(function(m) {
                            var offsetLat = (Math.random() - 0.5) * 0.00015;
                            var offsetLng = (Math.random() - 0.5) * 0.00015;

                            var customIcon = L.divIcon({
                                className: 'custom-leaflet-marker',
                                html: '<div style="--marker-color: ' + m.color + '; width: 100%; height: 100%; border-radius: 50%;"></div>',
                                iconSize: [16, 16],
                                iconAnchor: [8, 8]
                            });

                            var markerInstance = L.marker([m.latitude + offsetLat, m.longitude + offsetLng], { icon: customIcon })
                                .addTo(map);
                            activeMarkers.push(markerInstance);
                        });
                    } else {
                        updateUserMarker(lat, lng);
                    }
                }

                // Auto initialize
                initMap(${latitude}, ${longitude});
                updateMarkers('${markersJsonStr}', ${latitude}, ${longitude});
            </script>
        </body>
        </html>
    `;

    // Handle map coordinates and markers updates smoothly inside the WebView
    useEffect(() => {
        if (!isMapReady || !webviewRef.current) return;
        const jsCode = `
            updateCenter(${latitude}, ${longitude});
            updateMarkers('${markersJsonStr}', ${latitude}, ${longitude});
        `;
        webviewRef.current.injectJavaScript(jsCode);
    }, [latitude, longitude, markersJsonStr, isMapReady]);

    // Handle incoming messages from WebView
    const handleMessage = (event: any) => {
        try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'MAP_READY') {
                setIsMapReady(true);
            } else if (data.type === 'LOCATION_SELECT' && onLocationSelect) {
                onLocationSelect(data.latitude, data.longitude);
            }
        } catch (e) {
            console.error('Error parsing WebView event data:', e);
        }
    };

    // Web Fallback (Should utilize MapComponent.web.tsx, but added here for safety)
    if (Platform.OS === 'web') {
        return (
            <View style={[styles.container, styles.fallbackContainer]}>
                <Text style={styles.fallbackText}>Maps are not available on Web via Native Component</Text>
                <Text style={styles.fallbackSubtext}>Use MapComponent.web.tsx</Text>
            </View>
        );
    }

    if (mapError) {
        return (
            <View style={[styles.container, styles.fallbackContainer]}>
                <Text style={styles.fallbackText}>Map Error</Text>
                <Text style={styles.fallbackSubtext}>{mapError}</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {!isMapReady && (
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color="#f97316" />
                    <Text style={styles.loadingText}>Loading Map...</Text>
                </View>
            )}
            <WebView
                ref={webviewRef}
                originWhitelist={['*']}
                source={{ html: mapHtml }}
                style={styles.map}
                onMessage={handleMessage}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                onError={(syntheticEvent) => {
                    const { nativeEvent } = syntheticEvent;
                    console.warn('WebView error: ', nativeEvent);
                    setMapError('Failed to load map WebView component.');
                }}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        height: 300,
        width: '100%',
        borderRadius: 12,
        overflow: 'hidden',
        marginTop: 16,
        marginBottom: 16,
        backgroundColor: '#f8fafc',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        position: 'relative',
    },
    map: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
    loadingOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#f8fafc',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
    },
    loadingText: {
        marginTop: 12,
        fontSize: 14,
        color: '#64748b',
        fontWeight: '600',
    },
    fallbackContainer: {
        backgroundColor: '#f8fafc',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#cbd5e1',
    },
    fallbackText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#64748b',
        marginBottom: 8,
    },
    fallbackSubtext: {
        fontSize: 14,
        color: '#94a3b8',
    }
});
