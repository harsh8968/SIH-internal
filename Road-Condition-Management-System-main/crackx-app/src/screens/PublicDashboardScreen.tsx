import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Dimensions,
    ActivityIndicator,
    Platform
} from 'react-native';
import { useTranslation } from 'react-i18next';
import syncService from '../services/sync';

const { width } = Dimensions.get('window');

interface CityStats {
    totalReports: number;
    pending: number;
    inProgress: number;
    completed: number;
    zones: {
        zone1: { count: number; rhi: number };
        zone4: { count: number; rhi: number };
        zone8: { count: number; rhi: number };
    };
    severity: {
        low: number;
        medium: number;
        high: number;
    };
    recentReports: Array<{
        id: string;
        zone: string;
        damageType: string;
        severity: string;
        timestamp: string;
    }>;
}

export default function PublicDashboardScreen({ navigation }: any) {
    const { t, i18n } = useTranslation();
    const [stats, setStats] = useState<CityStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedZone, setSelectedZone] = useState<string | null>(null);

    useEffect(() => {
        loadCityStats();
        // Refresh every 30 seconds
        const interval = setInterval(loadCityStats, 30000);
        return () => clearInterval(interval);
    }, []);

    const loadCityStats = async () => {
        try {
            const analytics = await syncService.getAnalytics();

            // Calculate RHI for each zone
            const zoneRHI = {
                zone1: calculateZoneRHI('zone1', analytics),
                zone4: calculateZoneRHI('zone4', analytics),
                zone8: calculateZoneRHI('zone8', analytics),
            };

            const cityStats: CityStats = {
                totalReports: analytics.total || 0,
                pending: analytics.pending || 0,
                inProgress: analytics.in_progress || 0,
                completed: analytics.completed || 0,
                zones: {
                    zone1: { count: analytics.zones?.zone1 || 0, rhi: zoneRHI.zone1 },
                    zone4: { count: analytics.zones?.zone4 || 0, rhi: zoneRHI.zone4 },
                    zone8: { count: analytics.zones?.zone8 || 0, rhi: zoneRHI.zone8 },
                },
                severity: {
                    low: analytics.severity?.low || 0,
                    medium: analytics.severity?.medium || 0,
                    high: analytics.severity?.high || 0,
                },
                recentReports: []
            };

            setStats(cityStats);
            setLoading(false);
        } catch (error) {
            console.error('Error loading city stats:', error);
            setLoading(false);
        }
    };

    const calculateZoneRHI = (zone: string, analytics: any): number => {
        const zoneCount = analytics.zones?.[zone] || 0;
        const severityData = analytics.severity || { low: 0, medium: 0, high: 0 };

        // RHI Algorithm: 100 - weighted damage score
        const baseScore = 100;
        const damageScore = (zoneCount * 2) +
            (severityData.high * 15) +
            (severityData.medium * 8) +
            (severityData.low * 3);

        const rhi = Math.max(0, Math.min(100, baseScore - damageScore));
        return Math.round(rhi);
    };

    const getRHIColor = (rhi: number): string => {
        if (rhi >= 80) return '#10b981'; // Green - Excellent
        if (rhi >= 60) return '#f59e0b'; // Orange - Good
        if (rhi >= 40) return '#f97316'; // Dark Orange - Fair
        return '#ef4444'; // Red - Poor
    };

    const getRHILabel = (rhi: number): string => {
        if (rhi >= 80) return 'Excellent';
        if (rhi >= 60) return 'Good';
        if (rhi >= 40) return 'Fair';
        return 'Poor';
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2563eb" />
                <Text style={styles.loadingText}>Loading City Road Health Data...</Text>
            </View>
        );
    }

    if (!stats) {
        return (
            <View style={styles.errorContainer}>
                <Text style={styles.errorText}>Unable to load data</Text>
                <TouchableOpacity style={styles.retryButton} onPress={loadCityStats}>
                    <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const cityRHI = Math.round(
        (stats.zones.zone1.rhi + stats.zones.zone4.rhi + stats.zones.zone8.rhi) / 3
    );

    return (
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerGradient}>
                    <Text style={styles.headerTitle}>Solapur City Road Health</Text>
                    <Text style={styles.headerSubtitle}>Real-time Infrastructure Monitoring</Text>
                </View>
            </View>

            {/* City-Wide RHI */}
            <View style={styles.rhiCard}>
                <Text style={styles.rhiTitle}>City Road Health Index</Text>
                <View style={styles.rhiCircle}>
                    <Text style={[styles.rhiScore, { color: getRHIColor(cityRHI) }]}>
                        {cityRHI}
                    </Text>
                    <Text style={styles.rhiMaxScore}>/100</Text>
                </View>
                <Text style={[styles.rhiLabel, { color: getRHIColor(cityRHI) }]}>
                    {getRHILabel(cityRHI)}
                </Text>
                <Text style={styles.rhiDescription}>
                    Based on {stats.totalReports} citizen reports across all zones
                </Text>
            </View>

            {/* Quick Stats Grid */}
            <View style={styles.statsGrid}>
                <View style={[styles.statCard, { backgroundColor: '#3b82f6' }]}>
                    <Text style={styles.statValue}>{stats.totalReports}</Text>
                    <Text style={styles.statLabel}>Total Reports</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: '#f59e0b' }]}>
                    <Text style={styles.statValue}>{stats.pending}</Text>
                    <Text style={styles.statLabel}>Pending</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: '#8b5cf6' }]}>
                    <Text style={styles.statValue}>{stats.inProgress}</Text>
                    <Text style={styles.statLabel}>In Progress</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: '#10b981' }]}>
                    <Text style={styles.statValue}>{stats.completed}</Text>
                    <Text style={styles.statLabel}>Completed</Text>
                </View>
            </View>

            {/* Zone-wise Breakdown */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Zone-wise Health Status</Text>

                {Object.entries(stats.zones).map(([zoneName, zoneData]) => (
                    <TouchableOpacity
                        key={zoneName}
                        style={styles.zoneCard}
                        onPress={() => setSelectedZone(zoneName)}
                    >
                        <View style={styles.zoneHeader}>
                            <Text style={styles.zoneName}>
                                {zoneName === 'zone1' ? 'Zone 1' : zoneName === 'zone4' ? 'Zone 4' : 'Zone 8'}
                            </Text>
                            <View style={[styles.rhiBadge, { backgroundColor: getRHIColor(zoneData.rhi) }]}>
                                <Text style={styles.rhiBadgeText}>RHI: {zoneData.rhi}</Text>
                            </View>
                        </View>

                        <View style={styles.zoneStats}>
                            <Text style={styles.zoneStatsText}>{zoneData.count} Reports</Text>
                            <Text style={[styles.zoneStatsText, { color: getRHIColor(zoneData.rhi) }]}>
                                {getRHILabel(zoneData.rhi)}
                            </Text>
                        </View>

                        {/* RHI Progress Bar */}
                        <View style={styles.progressBarContainer}>
                            <View
                                style={[
                                    styles.progressBar,
                                    {
                                        width: `${zoneData.rhi}%`,
                                        backgroundColor: getRHIColor(zoneData.rhi)
                                    }
                                ]}
                            />
                        </View>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Severity Distribution */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Damage Severity Distribution</Text>

                <View style={styles.severityContainer}>
                    <View style={styles.severityBar}>
                        <View
                            style={[
                                styles.severitySegment,
                                {
                                    width: `${(stats.severity.high / stats.totalReports) * 100}%`,
                                    backgroundColor: '#ef4444'
                                }
                            ]}
                        />
                        <View
                            style={[
                                styles.severitySegment,
                                {
                                    width: `${(stats.severity.medium / stats.totalReports) * 100}%`,
                                    backgroundColor: '#f59e0b'
                                }
                            ]}
                        />
                        <View
                            style={[
                                styles.severitySegment,
                                {
                                    width: `${(stats.severity.low / stats.totalReports) * 100}%`,
                                    backgroundColor: '#10b981'
                                }
                            ]}
                        />
                    </View>

                    <View style={styles.severityLegend}>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendColor, { backgroundColor: '#ef4444' }]} />
                            <Text style={styles.legendText}>High ({stats.severity.high})</Text>
                        </View>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendColor, { backgroundColor: '#f59e0b' }]} />
                            <Text style={styles.legendText}>Medium ({stats.severity.medium})</Text>
                        </View>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendColor, { backgroundColor: '#10b981' }]} />
                            <Text style={styles.legendText}>Low ({stats.severity.low})</Text>
                        </View>
                    </View>
                </View>
            </View>

            {/* CTA - Join the Movement */}
            <View style={styles.ctaCard}>
                <Text style={styles.ctaTitle}>Help Build Better Roads</Text>
                <Text style={styles.ctaDescription}>
                    Report road damages in your area and track repairs in real-time
                </Text>
                <TouchableOpacity
                    style={styles.ctaButton}
                    onPress={() => navigation.navigate('Login')}
                >
                    <Text style={styles.ctaButtonText}>Get Started</Text>
                </TouchableOpacity>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
                <Text style={styles.footerText}>Powered by CrackX AI</Text>
                <Text style={styles.footerSubtext}>Solapur Municipal Corporation</Text>
                <Text style={styles.footerSubtext}>Last updated: {new Date().toLocaleTimeString()}</Text>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8fafc',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f8fafc',
    },
    loadingText: {
        marginTop: 16,
        fontSize: 16,
        color: '#64748b',
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f8fafc',
    },
    errorText: {
        fontSize: 18,
        color: '#ef4444',
        marginBottom: 16,
    },
    retryButton: {
        backgroundColor: '#2563eb',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
    },
    retryButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    header: {
        backgroundColor: '#1e293b',
        paddingTop: Platform.OS === 'web' ? 40 : 60,
        paddingBottom: 30,
        paddingHorizontal: 20,
    },
    headerGradient: {
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 8,
    },
    headerSubtitle: {
        fontSize: 16,
        color: '#94a3b8',
    },
    rhiCard: {
        backgroundColor: '#fff',
        margin: 20,
        padding: 24,
        borderRadius: 16,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 3,
    },
    rhiTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: '#1e293b',
        marginBottom: 20,
    },
    rhiCircle: {
        width: 160,
        height: 160,
        borderRadius: 80,
        backgroundColor: '#f1f5f9',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    rhiScore: {
        fontSize: 56,
        fontWeight: '700',
    },
    rhiMaxScore: {
        fontSize: 20,
        color: '#64748b',
    },
    rhiLabel: {
        fontSize: 24,
        fontWeight: '600',
        marginBottom: 8,
    },
    rhiDescription: {
        fontSize: 14,
        color: '#64748b',
        textAlign: 'center',
    },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: 20,
        marginBottom: 20,
        gap: 12,
    },
    statCard: {
        width: (width - 52) / 2,
        padding: 20,
        borderRadius: 12,
        alignItems: 'center',
    },
    statValue: {
        fontSize: 32,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 4,
    },
    statLabel: {
        fontSize: 14,
        color: '#fff',
        opacity: 0.9,
    },
    section: {
        paddingHorizontal: 20,
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: '#1e293b',
        marginBottom: 16,
    },
    zoneCard: {
        backgroundColor: '#fff',
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    zoneHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    zoneName: {
        fontSize: 18,
        fontWeight: '600',
        color: '#1e293b',
    },
    rhiBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    rhiBadgeText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    zoneStats: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    zoneStatsText: {
        fontSize: 14,
        color: '#64748b',
    },
    progressBarContainer: {
        height: 8,
        backgroundColor: '#e2e8f0',
        borderRadius: 4,
        overflow: 'hidden',
    },
    progressBar: {
        height: '100%',
        borderRadius: 4,
    },
    severityContainer: {
        backgroundColor: '#fff',
        padding: 16,
        borderRadius: 12,
    },
    severityBar: {
        height: 40,
        flexDirection: 'row',
        borderRadius: 8,
        overflow: 'hidden',
        marginBottom: 16,
    },
    severitySegment: {
        height: '100%',
    },
    severityLegend: {
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    legendColor: {
        width: 16,
        height: 16,
        borderRadius: 4,
        marginRight: 8,
    },
    legendText: {
        fontSize: 14,
        color: '#64748b',
    },
    ctaCard: {
        backgroundColor: '#2563eb',
        marginHorizontal: 20,
        padding: 24,
        borderRadius: 16,
        alignItems: 'center',
        marginBottom: 24,
    },
    ctaTitle: {
        fontSize: 24,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 8,
    },
    ctaDescription: {
        fontSize: 16,
        color: '#dbeafe',
        textAlign: 'center',
        marginBottom: 20,
    },
    ctaButton: {
        backgroundColor: '#fff',
        paddingHorizontal: 32,
        paddingVertical: 14,
        borderRadius: 8,
    },
    ctaButtonText: {
        color: '#2563eb',
        fontSize: 16,
        fontWeight: '600',
    },
    footer: {
        alignItems: 'center',
        paddingVertical: 32,
        paddingHorizontal: 20,
    },
    footerText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1e293b',
        marginBottom: 4,
    },
    footerSubtext: {
        fontSize: 14,
        color: '#64748b',
        marginBottom: 2,
    },
});
