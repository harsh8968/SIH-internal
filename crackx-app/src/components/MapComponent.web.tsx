import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import mapboxgl from 'mapbox-gl';
import { MAPBOX_CONFIG } from '../config/mapbox';

// Set Access Token
mapboxgl.accessToken = MAPBOX_CONFIG.accessToken;

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
    const [isMounted, setIsMounted] = useState(false);

    // 1. Inject CSS and Set Mounting State
    useEffect(() => {
        setIsMounted(true);
        const linkId = 'mapbox-gl-css';
        if (!document.getElementById(linkId)) {
            const link = document.createElement('link');
            link.id = linkId;
            link.rel = 'stylesheet';
            link.href = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css';
            document.head.appendChild(link);
        }

        // Inject custom marker styles
        const styleId = 'custom-marker-styles';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                .custom-marker {
                    display: block !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                    position: relative !important;
                }
                .mapboxgl-marker {
                    z-index: 1000 !important;
                }
            `;
            document.head.appendChild(style);
        }
    }, []);

    // 2. Initialize Map
    useEffect(() => {
        if (!isMounted || !mapContainer.current) return;
        if (map.current) return; // Initialize only once

        map.current = new mapboxgl.Map({
            container: mapContainer.current,
            style: MAPBOX_CONFIG.styleUrl,
            center: [longitude, latitude],
            zoom: 12, // Default zoom
            interactive: interactive,
            attributionControl: false
        });

        // Add Navigation Controls
        if (interactive) {
            map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
        }

        // Cleanup
        return () => {
            map.current?.remove();
            map.current = null;
        };
    }, [isMounted]); // Run once when mounted

    // 3. Handle Updates (Center & Markers)
    useEffect(() => {
        if (!map.current) return;

        // Wait for map to be fully loaded
        map.current.on('load', () => {
            console.log('[MapComponent.web] Map loaded, adding markers');
        });

        // Fly to new center if changed
        try {
            map.current.flyTo({
                center: [longitude, latitude],
                essential: true,
                zoom: 13
            });
        } catch (e) {
            console.log('Mapbox fly error (ignore during init):', e);
        }

        // Small delay to ensure map is ready
        setTimeout(() => {
            // Clear existing markers (basic clean way for React update cycle)
            const markersOnMap = document.getElementsByClassName('mapboxgl-marker');
            // Convert HTMLCollection to array to iterate safely
            Array.from(markersOnMap).forEach(marker => marker.remove());

            // Add Markers
            if (markers && markers.length > 0) {
                console.log(`[MapComponent.web] Adding ${markers.length} markers`);
                markers.forEach((m, index) => {
                    const el = document.createElement('div');
                    el.className = 'custom-marker';
                    el.style.backgroundColor = m.color;
                    el.style.width = '16px';  // Reduced size for better clustering
                    el.style.height = '16px';
                    el.style.borderRadius = '50%';
                    el.style.border = '2px solid white';
                    el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.4)';
                    el.style.cursor = 'pointer';
                    el.style.transition = 'transform 0.2s';
                    el.style.zIndex = '1000';

                    // Add hover effect
                    el.addEventListener('mouseenter', () => {
                        el.style.transform = 'scale(1.5)';
                        el.style.zIndex = '2000';
                    });
                    el.addEventListener('mouseleave', () => {
                        el.style.transform = 'scale(1)';
                        el.style.zIndex = '1000';
                    });

                    // Add slight random offset to prevent perfect overlap
                    // (only for display, doesn't change actual coordinates)
                    const offsetLat = (Math.random() - 0.5) * 0.0001;
                    const offsetLng = (Math.random() - 0.5) * 0.0001;

                    const marker = new mapboxgl.Marker(el)
                        .setLngLat([m.longitude + offsetLng, m.latitude + offsetLat])
                        .addTo(map.current!);

                    console.log(`[MapComponent.web] Marker ${index + 1}: ${m.color} at [${m.latitude}, ${m.longitude}]`);
                });
            } else {
                // Default User Marker
                console.log('[MapComponent.web] Adding default marker');
                const el = document.createElement('div');
                el.className = 'custom-marker';
                el.style.backgroundColor = '#f97316'; // COLORS.primary
                el.style.width = '20px';
                el.style.height = '20px';
                el.style.borderRadius = '50%';
                el.style.border = '3px solid white';
                el.style.boxShadow = '0 3px 6px rgba(0,0,0,0.4)';
                el.style.cursor = 'pointer';
                el.style.zIndex = '1000';

                new mapboxgl.Marker(el)
                    .setLngLat([longitude, latitude])
                    .addTo(map.current!);
            }
        }, 300); // Small delay to ensure map is ready

    }, [latitude, longitude, markers]);


    // 4. Handle Click for Location Selection
    useEffect(() => {
        if (!map.current || !interactive || !onLocationSelect) return;

        const handleClick = (e: any) => {
            onLocationSelect(e.lngLat.lat, e.lngLat.lng);
        };

        map.current.on('click', handleClick);

        return () => {
            // map.current?.off('click', handleClick); // Cleanup handled by map removal usually
        };
    }, [interactive, onLocationSelect]);


    if (!isMounted) return <View style={styles.loading}><Text>Loading Mapbox...</Text></View>;

    return (
        <View style={styles.container}>
            {/* Map Container for DOM */}
            <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

            {interactive && (
                <View style={styles.webHint}>
                    <Text style={styles.webHintText}>Mapbox Active</Text>
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
        minHeight: 300, // Minimum height fallback
    },
    loading: {
        flex: 1,
        minHeight: 300,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f1f5f9',
        borderRadius: 12,
    },
    webHint: {
        position: 'absolute',
        bottom: 10,
        right: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        padding: 4,
        paddingHorizontal: 8,
        borderRadius: 4,
        zIndex: 10,
    },
    webHintText: {
        fontSize: 10,
        color: '#64748b',
        fontWeight: 'bold'
    }
});
