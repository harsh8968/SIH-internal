import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Alert,
    ActivityIndicator
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants';
import { Report, User } from '../types';
import storageService from '../services/supabaseStorage';
import authService from '../services/supabaseAuth';
import DashboardLayout from '../components/DashboardLayout';
import { MapComponent } from '../components/MapComponent';
import { formatDate } from '../utils';

interface RSOHeatmapScreenProps {
    onNavigate: (screen: string) => void;
    onLogout: () => void;
}

export default function RSOHeatmapScreen({ onNavigate, onLogout }: RSOHeatmapScreenProps) {
    const { t } = useTranslation();
    const [reports, setReports] = useState<Report[]>([]);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<User | null>(null);
    const [userZone, setUserZone] = useState<string>('');
    const [selectedSeverity, setSelectedSeverity] = useState<'all' | 'high' | 'medium' | 'low'>('all');

    useEffect(() => {
        console.log('[RSO Heatmap] Screen mounted, loading data...');
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const currentUser = await authService.getCurrentUser();
            if (currentUser && currentUser.zone) {
                setUser(currentUser);
                setUserZone(currentUser.zone);

                // Get reports for RSO's specific zone
                const zoneReports = await storageService.getReportsByZone(currentUser.zone);
                setReports(zoneReports);
            }
        } catch (error) {
            console.error('Failed to load heatmap data:', error);
            Alert.alert('Error', 'Failed to load heatmap data');
        } finally {
            setLoading(false);
        }
    };

    // Filter reports by severity
    const getFilteredReports = () => {
        if (selectedSeverity === 'all') return reports;
        return reports.filter(r => r.aiDetection?.severity === selectedSeverity);
    };

    const filteredReports = getFilteredReports();
    const highSeverityReports = reports.filter(r => r.aiDetection?.severity === 'high');
    const mediumSeverityReports = reports.filter(r => r.aiDetection?.severity === 'medium');
    const lowSeverityReports = reports.filter(r => r.aiDetection?.severity === 'low');

    // Prepare Markers for Heatmap
    const mapMarkers = filteredReports.map(r => ({
        id: r.id,
        latitude: r.location?.latitude || 0,
        longitude: r.location?.longitude || 0,
        color: r.aiDetection?.severity === 'high' ? COLORS.danger :
            r.aiDetection?.severity === 'medium' ? COLORS.warning : '#fbbf24'
    }));

    // Get center point (average of all coordinates or default to zone center)
    const getMapCenter = () => {
        if (mapMarkers.length === 0) {
            return { latitude: 17.6599, longitude: 75.9064 }; // Default Solapur
        }
        const avgLat = mapMarkers.reduce((sum, m) => sum + m.latitude, 0) / mapMarkers.length;
        const avgLng = mapMarkers.reduce((sum, m) => sum + m.longitude, 0) / mapMarkers.length;
        return { latitude: avgLat, longitude: avgLng };
    };

    const mapCenter = getMapCenter();

    // Statistics
    const stats = {
        total: reports.length,
        high: highSeverityReports.length,
        medium: mediumSeverityReports.length,
        low: lowSeverityReports.length,
        pending: reports.filter(r => r.status === 'pending').length,
        inProgress: reports.filter(r => r.status === 'in-progress').length,
        completed: reports.filter(r => r.status === 'completed').length,
    };

    return (
        <DashboardLayout
            title={`${t('Zone')} ${userZone.toUpperCase()} - Heatmap`}
            role="rso"
            activeRoute="Heatmap"
            onNavigate={onNavigate}
            onLogout={onLogout}
        >
            {loading ? (
                <View style={[styles.container, styles.centerContent]}>
                    <ActivityIndicator size="large" color={COLORS.primary} />
                </View>
            ) : (
                <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
                    <View style={styles.mapHeader}>
                        <Text style={styles.mapTitle}>Zone {userZone.toUpperCase()} Heat Map</Text>
                        <Text style={styles.mapSubtitle}>
                            Visual overview of road damage reports in your zone
                        </Text>
                    </View>

                    {/* Statistics Cards */}
                    <View style={styles.statsContainer}>
                        <View style={[styles.statCard, { borderLeftColor: COLORS.primary }]}>
                            <Text style={styles.statValue}>{stats.total}</Text>
                            <Text style={styles.statLabel}>Total Reports</Text>
                        </View>
                        <View style={[styles.statCard, { borderLeftColor: COLORS.danger }]}>
                            <Text style={[styles.statValue, { color: COLORS.danger }]}>
                                {stats.high}
                            </Text>
                            <Text style={styles.statLabel}>High Severity</Text>
                        </View>
                        <View style={[styles.statCard, { borderLeftColor: COLORS.warning }]}>
                            <Text style={[styles.statValue, { color: COLORS.warning }]}>
                                {stats.medium}
                            </Text>
                            <Text style={styles.statLabel}>Medium</Text>
                        </View>
                        <View style={[styles.statCard, { borderLeftColor: '#fbbf24' }]}>
                            <Text style={[styles.statValue, { color: '#fbbf24' }]}>
                                {stats.low}
                            </Text>
                            <Text style={styles.statLabel}>Low</Text>
                        </View>
                    </View>

                    {/* Severity Filter */}
                    <View style={styles.filterContainer}>
                        <Text style={styles.filterLabel}>Filter by Severity:</Text>
                        <View style={styles.filterButtons}>
                            <TouchableOpacity
                                style={[styles.filterButton, selectedSeverity === 'all' && styles.filterButtonActive]}
                                onPress={() => setSelectedSeverity('all')}
                            >
                                <Text style={[styles.filterButtonText, selectedSeverity === 'all' && styles.filterButtonTextActive]}>
                                    All ({stats.total})
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.filterButton, selectedSeverity === 'high' && styles.filterButtonActive]}
                                onPress={() => setSelectedSeverity('high')}
                            >
                                <Text style={[styles.filterButtonText, selectedSeverity === 'high' && styles.filterButtonTextActive]}>
                                    High ({stats.high})
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.filterButton, selectedSeverity === 'medium' && styles.filterButtonActive]}
                                onPress={() => setSelectedSeverity('medium')}
                            >
                                <Text style={[styles.filterButtonText, selectedSeverity === 'medium' && styles.filterButtonTextActive]}>
                                    Medium ({stats.medium})
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.filterButton, selectedSeverity === 'low' && styles.filterButtonActive]}
                                onPress={() => setSelectedSeverity('low')}
                            >
                                <Text style={[styles.filterButtonText, selectedSeverity === 'low' && styles.filterButtonTextActive]}>
                                    Low ({stats.low})
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Heatmap Legend */}
                    <View style={styles.legend}>
                        <View style={styles.legendItem}>
                            <View style={[styles.dot, { backgroundColor: COLORS.danger }]} />
                            <Text style={styles.legendText}>High Severity</Text>
                        </View>
                        <View style={styles.legendItem}>
                            <View style={[styles.dot, { backgroundColor: COLORS.warning }]} />
                            <Text style={styles.legendText}>Medium Severity</Text>
                        </View>
                        <View style={styles.legendItem}>
                            <View style={[styles.dot, { backgroundColor: '#fbbf24' }]} />
                            <Text style={styles.legendText}>Low Severity</Text>
                        </View>
                    </View>

                    <View style={styles.mapContainer}>
                        {mapMarkers.length > 0 ? (
                            <MapComponent
                                latitude={mapCenter.latitude}
                                longitude={mapCenter.longitude}
                                interactive={true}
                                markers={mapMarkers}
                            />
                        ) : (
                            <View style={styles.emptyMapState}>
                                <Ionicons name="map-outline" size={64} color={COLORS.gray} />
                                <Text style={styles.emptyMapText}>No reports to display</Text>
                            </View>
                        )}
                    </View>

                    {/* Hotspots List */}
                    <View style={styles.hotspotSection}>
                        <Text style={styles.sectionTitle}>
                            {selectedSeverity === 'all' ? 'All Reports' : `${selectedSeverity.charAt(0).toUpperCase() + selectedSeverity.slice(1)} Severity Reports`}
                            <Text style={styles.countBadge}> ({filteredReports.length})</Text>
                        </Text>

                        {filteredReports.length === 0 ? (
                            <View style={styles.emptyState}>
                                <Ionicons name="folder-open-outline" size={48} color={COLORS.gray} />
                                <Text style={styles.emptyText}>
                                    No {selectedSeverity === 'all' ? '' : selectedSeverity} reports found
                                </Text>
                            </View>
                        ) : (
                            filteredReports.map(report => {
                                const severityColor =
                                    report.aiDetection?.severity === 'high' ? COLORS.danger :
                                        report.aiDetection?.severity === 'medium' ? COLORS.warning : '#fbbf24';

                                return (
                                    <View key={report.id} style={styles.hotspotCard}>
                                        <View style={[styles.hotspotIcon, { backgroundColor: severityColor + '20' }]}>
                                            <Ionicons
                                                name={
                                                    report.aiDetection?.severity === 'high' ? 'warning' :
                                                        report.aiDetection?.severity === 'medium' ? 'alert-circle' : 'information-circle'
                                                }
                                                size={24}
                                                color={severityColor}
                                            />
                                        </View>
                                        <View style={styles.hotspotInfo}>
                                            <Text style={styles.hotspotRoad}>
                                                {report.location?.roadName || 'Unknown Road'}
                                            </Text>
                                            <Text style={styles.hotspotAddress}>
                                                {report.location?.address || 'No address'}
                                            </Text>
                                            <View style={styles.hotspotMeta}>
                                                <Text style={styles.hotspotDate}>
                                                    {formatDate(report.createdAt)}
                                                </Text>
                                                <View style={[styles.statusChip, { backgroundColor: getStatusColor(report.status) + '20' }]}>
                                                    <Text style={[styles.statusText, { color: getStatusColor(report.status) }]}>
                                                        {report.status}
                                                    </Text>
                                                </View>
                                            </View>
                                        </View>
                                        <View style={[styles.severityBadge, { backgroundColor: severityColor }]}>
                                            <Text style={styles.severityText}>
                                                {report.aiDetection?.severity?.toUpperCase() || 'N/A'}
                                            </Text>
                                        </View>
                                    </View>
                                );
                            })
                        )}
                    </View>

                    {/* Status Breakdown */}
                    <View style={styles.statusBreakdown}>
                        <Text style={styles.sectionTitle}>Status Overview</Text>
                        <View style={styles.statusGrid}>
                            <View style={[styles.statusCard, { borderLeftColor: COLORS.warning }]}>
                                <Text style={styles.statusCount}>{stats.pending}</Text>
                                <Text style={styles.statusLabel}>Pending</Text>
                            </View>
                            <View style={[styles.statusCard, { borderLeftColor: COLORS.secondary }]}>
                                <Text style={styles.statusCount}>{stats.inProgress}</Text>
                                <Text style={styles.statusLabel}>In Progress</Text>
                            </View>
                            <View style={[styles.statusCard, { borderLeftColor: COLORS.success }]}>
                                <Text style={styles.statusCount}>{stats.completed}</Text>
                                <Text style={styles.statusLabel}>Completed</Text>
                            </View>
                        </View>
                    </View>

                    <View style={{ height: 40 }} />
                </ScrollView>
            )}
        </DashboardLayout>
    );
}

// Helper function to get status color
function getStatusColor(status: string): string {
    switch (status) {
        case 'completed':
            return COLORS.success;
        case 'in-progress':
        case 'verification-pending':
            return COLORS.secondary;
        case 'pending':
        default:
            return COLORS.warning;
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    centerContent: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    mapHeader: {
        marginBottom: 20,
    },
    mapTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: COLORS.dark,
        marginBottom: 4,
    },
    mapSubtitle: {
        fontSize: 14,
        color: COLORS.gray,
    },
    statsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 20,
    },
    statCard: {
        flex: 1,
        minWidth: 150,
        backgroundColor: COLORS.white,
        padding: 16,
        borderRadius: 12,
        borderLeftWidth: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    statValue: {
        fontSize: 28,
        fontWeight: 'bold',
        color: COLORS.dark,
        marginBottom: 4,
    },
    statLabel: {
        fontSize: 12,
        color: COLORS.gray,
        fontWeight: '500',
    },
    filterContainer: {
        marginBottom: 16,
    },
    filterLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.dark,
        marginBottom: 8,
    },
    filterButtons: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    filterButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: COLORS.white,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    filterButtonActive: {
        backgroundColor: COLORS.primary,
        borderColor: COLORS.primary,
    },
    filterButtonText: {
        fontSize: 13,
        color: COLORS.gray,
        fontWeight: '500',
    },
    filterButtonTextActive: {
        color: COLORS.white,
        fontWeight: 'bold',
    },
    legend: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 16,
        gap: 16,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    dot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        marginRight: 6,
    },
    legendText: {
        fontSize: 12,
        color: COLORS.gray,
        fontWeight: '500',
    },
    mapContainer: {
        height: 350,
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: COLORS.border,
        marginBottom: 24,
        backgroundColor: COLORS.white,
    },
    emptyMapState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyMapText: {
        marginTop: 12,
        fontSize: 14,
        color: COLORS.gray,
    },
    hotspotSection: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.dark,
        marginBottom: 16,
    },
    countBadge: {
        fontSize: 16,
        color: COLORS.primary,
    },
    hotspotCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.white,
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    hotspotIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    hotspotInfo: {
        flex: 1,
    },
    hotspotRoad: {
        fontSize: 16,
        fontWeight: 'bold',
        color: COLORS.dark,
        marginBottom: 4,
    },
    hotspotAddress: {
        fontSize: 13,
        color: COLORS.gray,
        marginBottom: 6,
    },
    hotspotMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    hotspotDate: {
        fontSize: 11,
        color: COLORS.gray,
    },
    statusChip: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    statusText: {
        fontSize: 10,
        fontWeight: '600',
        textTransform: 'capitalize',
    },
    severityBadge: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 6,
    },
    severityText: {
        color: COLORS.white,
        fontSize: 10,
        fontWeight: 'bold',
    },
    emptyState: {
        padding: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyText: {
        textAlign: 'center',
        color: COLORS.gray,
        marginTop: 12,
        fontSize: 14,
    },
    statusBreakdown: {
        marginBottom: 24,
    },
    statusGrid: {
        flexDirection: 'row',
        gap: 12,
    },
    statusCard: {
        flex: 1,
        backgroundColor: COLORS.white,
        padding: 16,
        borderRadius: 12,
        borderLeftWidth: 4,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    statusCount: {
        fontSize: 24,
        fontWeight: 'bold',
        color: COLORS.dark,
        marginBottom: 4,
    },
    statusLabel: {
        fontSize: 11,
        color: COLORS.gray,
        fontWeight: '500',
    },
});
