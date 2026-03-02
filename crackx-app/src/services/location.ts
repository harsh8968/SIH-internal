import * as Location from 'expo-location';
import { Location as LocationType, ZoneId } from '../types';
import { ZONES } from '../constants';
import storageService from './storage';

class LocationService {
    // Request location permission
    async requestPermission(): Promise<boolean> {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            const granted = status === 'granted';
            await storageService.saveLocationPermission(granted);
            return granted;
        } catch (error) {
            console.error('Error requesting location permission:', error);
            return false;
        }
    }

    // Check if location permission is granted
    async checkPermission(): Promise<boolean> {
        try {
            const { status } = await Location.getForegroundPermissionsAsync();
            return status === 'granted';
        } catch (error) {
            console.error('Error checking location permission:', error);
            return false;
        }
    }

    // Get current location
    async getCurrentLocation(): Promise<LocationType | null> {
        try {
            const hasPermission = await this.checkPermission();
            if (!hasPermission) {
                return null;
            }

            const location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.High,
            });

            const { latitude, longitude } = location.coords;

            // Get address using OpenStreetMap Nominatim (Free Reverse Geocoding)
            let address = '';
            let roadName = '';
            let area = '';

            try {
                // Fetch address from OSM
                const response = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
                    {
                        headers: {
                            'User-Agent': 'CrackX/1.0'
                        }
                    }
                );

                if (response.ok) {
                    const data = await response.json();

                    if (data && data.address) {
                        roadName = data.address.road || data.address.pedestrian || '';
                        area = data.address.suburb || data.address.neighbourhood || data.address.city_district || '';

                        // Construct full address
                        const parts = [];
                        if (roadName) parts.push(roadName);
                        if (area) parts.push(area);
                        if (data.address.city) parts.push(data.address.city);
                        if (data.address.state) parts.push(data.address.state);

                        address = parts.join(', ');

                        // Fallback if empty
                        if (!address) address = data.display_name;
                    }
                }
            } catch (error) {
                console.log('OSM Geocoding failed, using coordinates only:', error);
            }

            // Detect zone
            const zone = this.detectZone(latitude, longitude);

            return {
                latitude,
                longitude,
                address,
                roadName,
                area,
                zone,
            };
        } catch (error) {
            console.error('Error getting current location:', error);
            return null;
        }
    }

    // Detect zone based on coordinates
    detectZone(latitude: number, longitude: number): ZoneId {
        // Simple point-in-polygon check
        // For demo purposes, we'll use a simple distance-based approach

        let nearestZone: ZoneId = 'zone1';
        let minDistance = Infinity;

        ZONES.forEach(zone => {
            // Calculate centroid of zone
            const centroid = this.calculateCentroid(zone.boundaries);
            const distance = this.calculateDistance(
                latitude,
                longitude,
                centroid.latitude,
                centroid.longitude
            );

            if (distance < minDistance) {
                minDistance = distance;
                nearestZone = zone.id;
            }
        });

        return nearestZone;
    }

    // Calculate centroid of polygon
    private calculateCentroid(points: { latitude: number; longitude: number }[]) {
        const sum = points.reduce(
            (acc, point) => ({
                latitude: acc.latitude + point.latitude,
                longitude: acc.longitude + point.longitude,
            }),
            { latitude: 0, longitude: 0 }
        );

        return {
            latitude: sum.latitude / points.length,
            longitude: sum.longitude / points.length,
        };
    }

    // Calculate distance between two points (Haversine formula)
    private calculateDistance(
        lat1: number,
        lon1: number,
        lat2: number,
        lon2: number
    ): number {
        const R = 6371; // Earth's radius in km
        const dLat = this.toRad(lat2 - lat1);
        const dLon = this.toRad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRad(lat1)) *
            Math.cos(this.toRad(lat2)) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    private toRad(degrees: number): number {
        return degrees * (Math.PI / 180);
    }
}

export default new LocationService();
