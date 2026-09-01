import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { MAP_CONFIG } from '../config/maps';

declare global {
    interface Window {
        L: any;
    }
}

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
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<any | null>(null);
    const activeMarkers = useRef<any[]>([]);
    const userMarker = useRef<any | null>(null);
    const [isMounted, setIsMounted] = useState(false);
    const [leafletLoaded, setLeafletLoaded] = useState(false);
    const [isMapReady, setIsMapReady] = useState(false);

    // 1. Inject Leaflet CDN Assets and Set Mounting State
    useEffect(() => {
        setIsMounted(true);

        const cssLinkId = 'leaflet-css';
        if (!document.getElementById(cssLinkId)) {
            const link = document.createElement('link');
            link.id = cssLinkId;
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(link);
        }

        const styleId = 'custom-leaflet-marker-styles';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                .custom-leaflet-marker {
                    background-color: var(--marker-color, #f97316);
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    border: 2px solid white;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                    cursor: pointer;
                    transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.2s ease;
                    display: block;
                }
                .custom-leaflet-marker:hover {
                    transform: scale(1.4);
                    box-shadow: 0 4px 10px rgba(0,0,0,0.4);
                    z-index: 9999 !important;
                }
                /* Wrapper carries Leaflet's positioning transform. Nothing here may
                   set a transform or an animation, or the marker loses its position. */
                .custom-leaflet-marker-user-wrapper {
                    background: transparent;
                    border: 0;
                }
                .custom-leaflet-marker-user {
                    background-color: #f97316;
                    width: 20px;
                    height: 20px;
                    box-sizing: border-box;
                    border-radius: 50%;
                    border: 3px solid white;
                    box-shadow: 0 3px 8px rgba(0,0,0,0.4);
                    cursor: pointer;
                    display: block;
                    animation: pulse 2s infinite;
                }
                @keyframes pulse {
                    0% {
                        transform: scale(1);
                        box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.5);
                    }
                    70% {
                        transform: scale(1.1);
                        box-shadow: 0 0 0 10px rgba(249, 115, 22, 0);
                    }
                    100% {
                        transform: scale(1);
                        box-shadow: 0 0 0 0 rgba(249, 115, 22, 0);
                    }
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
                    transition: background-color 0.2s;
                }
                .leaflet-bar a:hover {
                    background-color: #f8fafc !important;
                }
                .leaflet-control-zoom-in, .leaflet-control-zoom-out {
                    font-weight: 500 !important;
                }
                .leaflet-control-attribution {
                    font-size: 9px !important;
                    background: rgba(255,255,255,0.85) !important;
                    border-radius: 6px !important;
                    padding: 2px 6px !important;
                    margin: 4px !important;
                    color: #64748b !important;
                    border: 1px solid #e2e8f0 !important;
                }
            `;
            document.head.appendChild(style);
        }

        const jsScriptId = 'leaflet-js';
        if (!document.getElementById(jsScriptId)) {
            const script = document.createElement('script');
            script.id = jsScriptId;
            script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            script.async = true;
            script.onload = () => {
                setLeafletLoaded(true);
            };
            document.head.appendChild(script);
        } else if (window.L) {
            setLeafletLoaded(true);
        } else {
            const interval = setInterval(() => {
                if (window.L) {
                    setLeafletLoaded(true);
                    clearInterval(interval);
                }
            }, 50);
            return () => clearInterval(interval);
        }
    }, []);

    // 2. Initialize Leaflet Map
    useEffect(() => {
        if (!leafletLoaded || !isMounted || !mapContainer.current) return;
        if (map.current) return;

        const L = window.L;

        map.current = L.map(mapContainer.current, {
            center: [latitude, longitude],
            zoom: MAP_CONFIG.defaultZoom,
            zoomControl: false,
            attributionControl: true
        });

        L.tileLayer(MAP_CONFIG.tileLayerUrl, {
            attribution: MAP_CONFIG.attribution
        }).addTo(map.current);

        if (interactive) {
            L.control.zoom({ position: 'topright' }).addTo(map.current);
        }

        setIsMapReady(true);

        return () => {
            if (map.current) {
                map.current.remove();
                map.current = null;
                setIsMapReady(false);
            }
        };
    }, [leafletLoaded, isMounted]);

    // 3. Handle Map Click for Location Selection
    useEffect(() => {
        if (!map.current || !isMapReady || !interactive || !onLocationSelect) return;

        const handleMapClick = (e: any) => {
            const { lat, lng } = e.latlng;
            onLocationSelect(lat, lng);
        };

        map.current.on('click', handleMapClick);

        return () => {
            if (map.current) {
                map.current.off('click', handleMapClick);
            }
        };
    }, [isMapReady, interactive, onLocationSelect]);

    // 4. Update Map Center and User Marker smoothly
    useEffect(() => {
        if (!map.current || !isMapReady) return;

        const L = window.L;

        // Pan smoothly to the new coordinates
        map.current.setView([latitude, longitude], map.current.getZoom() || MAP_CONFIG.defaultZoom, {
            animate: true,
            duration: 0.8
        });

        // Manage User Location Marker (only if there are no external heatmap markers)
        const hasExternalMarkers = markers && markers.length > 0;
        
        if (hasExternalMarkers) {
            if (userMarker.current) {
                userMarker.current.remove();
                userMarker.current = null;
            }
        } else {
            if (userMarker.current) {
                userMarker.current.setLatLng([latitude, longitude]);
            } else {
                // The pulse animation MUST live on an inner div. Leaflet positions
                // the icon root with an inline transform: translate3d(x,y,0), and a
                // CSS animation on that same element outranks inline styles, so
                // `transform: scale()` in the keyframes wipes out the translation
                // and pins the marker to the map pane origin instead of the user.
                const userIcon = L.divIcon({
                    className: 'custom-leaflet-marker-user-wrapper',
                    html: '<div class="custom-leaflet-marker-user"></div>',
                    iconSize: [20, 20],
                    iconAnchor: [10, 10]
                });

                userMarker.current = L.marker([latitude, longitude], { icon: userIcon })
                    .addTo(map.current);
            }
        }
    }, [isMapReady, latitude, longitude, markers]);

    // 5. Update external heat/defect markers list
    useEffect(() => {
        if (!map.current || !isMapReady) return;

        const L = window.L;

        // Clean up previous external marker instances
        activeMarkers.current.forEach(m => m.remove());
        activeMarkers.current = [];

        if (markers && markers.length > 0) {
            markers.forEach((m) => {
                const offsetLat = (Math.random() - 0.5) * 0.00015;
                const offsetLng = (Math.random() - 0.5) * 0.00015;

                const customIcon = L.divIcon({
                    className: 'custom-leaflet-marker',
                    html: `<div style="--marker-color: ${m.color}; width: 100%; height: 100%; border-radius: 50%;"></div>`,
                    iconSize: [16, 16],
                    iconAnchor: [8, 8]
                });

                const markerInstance = L.marker([m.latitude + offsetLat, m.longitude + offsetLng], { icon: customIcon })
                    .addTo(map.current);
                
                activeMarkers.current.push(markerInstance);
            });
        }
    }, [isMapReady, markers]);

    if (!isMounted || !leafletLoaded) {
        return (
            <View style={styles.loading}>
                <Text style={styles.loadingText}>Loading Map...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <div ref={mapContainer} style={{ width: '100%', height: '100%', outline: 'none' }} />
            
            {interactive && (
                <View style={styles.webHint}>
                    <Text style={styles.webHintText}>Leaflet + OpenStreetMap Active</Text>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        width: '100%',
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        position: 'relative',
        minHeight: 300,
    },
    loading: {
        flex: 1,
        minHeight: 300,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f8fafc',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    loadingText: {
        fontSize: 14,
        color: '#64748b',
        fontWeight: '600',
    },
    webHint: {
        position: 'absolute',
        bottom: 10,
        left: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 6,
        zIndex: 1000,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
    },
    webHintText: {
        fontSize: 10,
        color: '#475569',
        fontWeight: '600',
    }
});
