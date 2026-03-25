import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Alert,
    Platform,
    Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { COLORS, ZONES } from '../constants';
import { Report } from '../types';
import storageService from '../services/supabaseStorage';
import authService from '../services/supabaseAuth';
import { calculateRoadHealthIndex, formatDate, getSeverityColor } from '../utils';
import DashboardLayout from '../components/DashboardLayout';

interface AdminHomeScreenProps {
    onNavigate: (screen: string) => void;
    onLogout: () => void;
}

export default function AdminHomeScreen({ onNavigate, onLogout }: AdminHomeScreenProps) {
    const { t } = useTranslation();
    const [reports, setReports] = useState<Report[]>([]);
    const [zoneStats, setZoneStats] = useState<any>({});
    const [pendingRSOs, setPendingRSOs] = useState<any[]>([]);
    const [rsoMap, setRsoMap] = useState<Record<string, string>>({});
    const [contractorMap, setContractorMap] = useState<Record<string, string>>({});

    const [filter, setFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>('all');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const allReports = await storageService.getReports();
            setReports(allReports);

            // Load Users to find RSOs
            const users = await storageService.getRegisteredUsers();

            // Pending RSOs for approval list
            const pending = users.filter(u => u.role === 'rso' && u.isApproved === false);
            setPendingRSOs(pending);

            // Create Zone -> RSO Map
            const approvedRSOs = users.filter(u => u.role === 'rso' && u.isApproved === true && u.zone);
            const rsoMapping: Record<string, string> = {};

            approvedRSOs.forEach(rso => {
                const zone = rso.zone!;
                if (rsoMapping[zone]) {
                    rsoMapping[zone] += `, ${rso.username}`;
                } else {
                    rsoMapping[zone] = rso.username;
                }
            });
            setRsoMap(rsoMapping);

            // Load Contractors for all zones to build map
            const contractorMapping: Record<string, string> = {};
            for (const zone of ZONES) {
                const contractors = await storageService.getContractorsByZone(zone.id);
                contractors.forEach(c => {
                    contractorMapping[c.id] = c.agencyName;
                });
            }
            setContractorMap(contractorMapping);

            // Calculate zone-wise statistics
            const stats: any = {};
            ZONES.forEach(zone => {
                const zoneReports = allReports.filter(r => r.location.zone === zone.id);
                const completedCount = zoneReports.filter(r => r.status === 'completed').length;

                const severityDist = {
                    low: zoneReports.filter(r => r.aiDetection?.severity === 'low').length,
                    medium: zoneReports.filter(r => r.aiDetection?.severity === 'medium').length,
                    high: zoneReports.filter(r => r.aiDetection?.severity === 'high').length,
                };

                stats[zone.id] = {
                    total: zoneReports.length,
                    pending: zoneReports.filter(r => r.status === 'pending').length,
                    completed: completedCount,
                    severityDist,
                    // Pass completed repairs to boost RHI
                    healthIndex: calculateRoadHealthIndex(zoneReports.length, severityDist, completedCount),
                };
            });

            setZoneStats(stats);
        } catch (error) {
            console.error('Error loading data:', error);
        }
    };

    const approveRSO = async (username: string) => {
        try {
            await storageService.updateRegisteredUser(username, { isApproved: true });
            Alert.alert(t('success'), `RSO ${username} verified successfully`);
            loadData(); // Refresh list
        } catch (error) {
            Alert.alert(t('error'), 'Failed to approve user');
        }
    };

    const handleLogout = async () => {
        await authService.logout();
        onLogout();
    };

    // Filter Logic (Zone Only)
    const filteredReports = filter === 'all'
        ? reports
        : reports.filter(r => r.location.zone === filter);

    const displayedStats = {
        total: filteredReports.length,
        pending: filteredReports.filter(r => r.status !== 'completed').length,
        completed: filteredReports.filter(r => r.status === 'completed').length,
    };

    const displayedZones = filter === 'all'
        ? ZONES
        : ZONES.filter(z => z.id === filter);

    // List Logic (Zone + Status) - HARDENED
    const listedReports = filteredReports.filter(r => {
        if (statusFilter === 'all') return true;

        const normalizedStatus = (r.status || 'pending').toLowerCase().trim();

        if (statusFilter === 'completed') {
            return normalizedStatus === 'completed';
        } else {
            // 'pending' filter shows all active reports (pending, in-progress, verification-pending)
            return normalizedStatus !== 'completed';
        }
    });

    return (
        <DashboardLayout
            title={t('admin_dashboard')}
            role="admin"
            activeRoute="Dashboard"
            onNavigate={onNavigate}
            onLogout={handleLogout}
        >
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {/* Action Buttons */}
                <View style={styles.actionGrid}>
                    <View style={styles.actionRow}>
                        <TouchableOpacity
                            style={styles.actionButtonHalf}
                            onPress={() => onNavigate('UserManagement')}
                        >
                            <View style={styles.actionIconBadge}>
                                <Ionicons name="people" size={24} color={COLORS.primary} />
                                {pendingRSOs.length > 0 && (
                                    <View style={styles.badgeDot} />
                                )}
                            </View>
                            <View style={styles.actionTextContainer}>
                                <Text style={styles.actionButtonTitle}>Users</Text>
                                <Text style={styles.actionButtonSubtitle}>{pendingRSOs.length} Pending</Text>
                            </View>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.actionButtonHalf}
                            onPress={() => onNavigate('Points')}
                        >
                            <View style={[styles.actionIconBadge, { backgroundColor: '#fffbeb' }]}>
                                <Ionicons name="star" size={24} color="#f59e0b" />
                            </View>
                            <View style={styles.actionTextContainer}>
                                <Text style={styles.actionButtonTitle}>Points</Text>
                                <Text style={styles.actionButtonSubtitle}>Approvals</Text>
                            </View>
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                        style={styles.actionButtonFull}
                        onPress={() => onNavigate('Heatmap')}
                    >
                        <View style={[styles.actionIconBadge, { backgroundColor: '#fee2e2' }]}>
                            <Ionicons name="flame" size={24} color={COLORS.danger} />
                        </View>
                        <View style={styles.actionTextContainer}>
                            <Text style={styles.actionButtonTitle}>Disaster Heatmap</Text>
                            <Text style={styles.actionButtonSubtitle}>Critical vulnerability analysis</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={COLORS.gray} style={{ marginLeft: 'auto' }} />
                    </TouchableOpacity>
                </View>

                {/* Filters */}
                <View style={styles.filterSection}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContainer}>
                        {['all', 'zone1', 'zone4', 'zone8'].map(f => (
                            <TouchableOpacity
                                key={f}
                                style={[styles.filterButton, filter === f && styles.filterButtonActive]}
                                onPress={() => { setFilter(f); setStatusFilter('all'); }}
                            >
                                <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                                    {f === 'all' ? 'All Zones' : f.toUpperCase()}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                {/* Overall Stats (Interactive - Click to Filter) */}
                <View style={styles.statsCard}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <Text style={styles.cardTitle}>
                            {filter === 'all' ? 'Overall Statistics' : `Statistics: ${filter.toUpperCase()}`}
                        </Text>
                        <Text style={{ fontSize: 11, color: COLORS.gray, fontStyle: 'italic' }}>
                            Tap to filter ↓
                        </Text>
                    </View>
                    <View style={styles.statsRow}>
                        <TouchableOpacity
                            style={[styles.statItem, statusFilter === 'all' && styles.statItemActive]}
                            onPress={() => setStatusFilter('all')}
                            activeOpacity={0.7}
                        >
                            <View style={[styles.statIconBadge, { backgroundColor: '#f1f5f9' }]}>
                                <Ionicons name="document-text" size={20} color={COLORS.dark} />
                            </View>
                            <Text style={styles.statValue}>{displayedStats.total}</Text>
                            <Text style={[styles.statLabel, statusFilter === 'all' && styles.statLabelActive]}>{t('total_reports')}</Text>
                        </TouchableOpacity>
                        <View style={styles.divider} />
                        <TouchableOpacity
                            style={[styles.statItem, statusFilter === 'pending' && styles.statItemActive]}
                            onPress={() => setStatusFilter('pending')}
                            activeOpacity={0.7}
                        >
                            <View style={[styles.statIconBadge, { backgroundColor: '#fff7ed' }]}>
                                <Ionicons name="time" size={20} color={COLORS.warning} />
                            </View>
                            <Text style={[styles.statValue, { color: COLORS.warning }]}>
                                {displayedStats.pending}
                            </Text>
                            <Text style={[styles.statLabel, statusFilter === 'pending' && styles.statLabelActive]}>Pending</Text>
                        </TouchableOpacity>
                        <View style={styles.divider} />
                        <TouchableOpacity
                            style={[styles.statItem, statusFilter === 'completed' && styles.statItemActive]}
                            onPress={() => setStatusFilter('completed')}
                            activeOpacity={0.7}
                        >
                            <View style={[styles.statIconBadge, { backgroundColor: '#f0fdf4' }]}>
                                <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                            </View>
                            <Text style={[styles.statValue, { color: COLORS.success }]}>
                                {displayedStats.completed}
                            </Text>
                            <Text style={[styles.statLabel, statusFilter === 'completed' && styles.statLabelActive]}>Completed</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Filtered Reports List */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>
                        {statusFilter === 'all' ? 'All Reports' : `${statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)} Reports`} ({listedReports.length})
                    </Text>
                    {listedReports.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyText}>No reports found for this filter.</Text>
                        </View>
                    ) : (
                        listedReports.map(report => (
                            <View key={report.id} style={styles.reportCard}>
                                {/* DEBUG LINE - REMOVE LATER */}
                                {/* <Text style={{fontSize: 10, color: 'red'}}>Status: {JSON.stringify(report.status)}</Text> */}

                                <View style={styles.reportHeader}>
                                    <View>
                                        <Text style={styles.reportType}>{report.aiDetection?.damageType || 'Unknown'}</Text>
                                        <Text style={styles.reportLocation}>{report.location.roadName || 'Unknown Location'}</Text>
                                    </View>
                                    <View style={[styles.severityBadge, { backgroundColor: getSeverityColor(report.aiDetection?.severity || 'low') }]}>
                                        <Text style={styles.severityText}>{report.aiDetection?.severity || 'N/A'}</Text>
                                    </View>
                                </View>
                                {/* Photo Thumbnail */}
                                <View style={styles.imageContainer}>
                                    {report.photoUri ? (
                                        (Platform.OS === 'web' && report.photoUri.startsWith('file://')) ? (
                                            <View style={styles.placeholderContainer}>
                                                <Ionicons name="image-outline" size={32} color={COLORS.gray} />
                                                <Text style={styles.placeholderText}>Image stored locally (Legacy)</Text>
                                            </View>
                                        ) : (
                                            <Image
                                                source={{ uri: report.photoUri }}
                                                style={styles.reportImage}
                                                resizeMode="cover"
                                            />
                                        )
                                    ) : (
                                        <View style={styles.placeholderContainer}>
                                            <Ionicons name="image-outline" size={32} color={COLORS.gray} />
                                            <Text style={styles.placeholderText}>No Image Available</Text>
                                        </View>
                                    )}
                                </View>

                                {/* Repair Proof (Only for Completed Reports) */}
                                {report.status === 'completed' && report.repairProofUri && (
                                    <View style={styles.repairSection}>
                                        <View style={styles.repairHeader}>
                                            <Text style={styles.repairTitle}>✅ Repair Proof</Text>
                                            <Text style={styles.repairDate}>{formatDate(report.repairCompletedAt || report.updatedAt)}</Text>
                                        </View>

                                        {(Platform.OS === 'web' && report.repairProofUri.startsWith('file://')) ? (
                                            <View style={[styles.placeholderContainer, { height: 150, backgroundColor: '#f0fdf4', borderColor: COLORS.success, borderWidth: 1 }]}>
                                                <Ionicons name="phone-portrait-outline" size={32} color={COLORS.success} />
                                                <Text style={[styles.placeholderText, { color: COLORS.success }]}>Proof stored locally (Legacy)</Text>
                                            </View>
                                        ) : (
                                            <Image
                                                source={{ uri: report.repairProofUri }}
                                                style={styles.repairImage}
                                                resizeMode="cover"
                                            />
                                        )}

                                        {/* Materials Used (Optional) */}

                                    </View>
                                )}
                                <View style={styles.reportFooter}>
                                    <View>
                                        <Text style={styles.reportDate}>{formatDate(report.createdAt)}</Text>
                                        {report.status !== 'completed' && (
                                            <>
                                                <Text style={{ fontSize: 10, color: COLORS.primary, marginTop: 4, fontWeight: '500' }}>
                                                    Assigned RSO: {rsoMap[report.location.zone || ''] || 'Unassigned'}
                                                </Text>
                                                {report.contractorId && contractorMap[report.contractorId] && (
                                                    <Text style={{ fontSize: 10, color: COLORS.secondary, marginTop: 2, fontWeight: '500' }}>
                                                        Contractor: {contractorMap[report.contractorId]}
                                                    </Text>
                                                )}
                                            </>
                                        )}
                                    </View>
                                    <Text style={[styles.syncBadge, { color: report.status === 'completed' ? COLORS.success : COLORS.warning }]}>
                                        {report.status}
                                    </Text>
                                </View>
                            </View>
                        ))
                    )}
                </View>

                {/* Zone Performance (Only show if 'all' status or irrelevant context, but usually good to keep) */}
                <View style={[styles.section, { opacity: statusFilter === 'all' ? 1 : 0.5 }]}>
                    <Text style={styles.sectionTitle}>{t('zone_performance')}</Text>
                    {displayedZones.map(zone => {
                        const stats = zoneStats[zone.id] || {
                            total: 0,
                            pending: 0,
                            completed: 0,
                            healthIndex: 100,
                            severityDist: { low: 0, medium: 0, high: 0 },
                        };

                        return (
                            <View key={zone.id} style={styles.zoneCard}>
                                <View style={styles.zoneHeader}>
                                    <View>
                                        <Text style={styles.zoneName}>{zone.name}</Text>
                                        <Text style={styles.zoneSubtext}>{stats.total} Reports</Text>
                                    </View>
                                    <View style={[styles.healthBadge, { backgroundColor: stats.healthIndex < 70 ? COLORS.danger : stats.healthIndex < 85 ? COLORS.warning : COLORS.success }]}>
                                        <Text style={styles.healthValue}>{stats.healthIndex}</Text>
                                        <Text style={styles.healthLabel}>RHI</Text>
                                    </View>
                                </View>

                                {/* Severity Distribution */}
                                <View style={styles.severityBar}>
                                    {stats.total > 0 && (
                                        <>
                                            <View style={[styles.severitySegment, { flex: stats.severityDist.low + 0.1, backgroundColor: COLORS.severityLow }]} />
                                            <View style={[styles.severitySegment, { flex: stats.severityDist.medium + 0.1, backgroundColor: COLORS.severityMedium }]} />
                                            <View style={[styles.severitySegment, { flex: stats.severityDist.high + 0.1, backgroundColor: COLORS.severityHigh }]} />
                                        </>
                                    )}
                                    {stats.total === 0 && <View style={[styles.severitySegment, { flex: 1, backgroundColor: COLORS.light }]} />}
                                </View>

                                <View style={styles.severityLegend}>
                                    <Text style={styles.legendText}>Low: {stats.severityDist.low}</Text>
                                    <Text style={styles.legendText}>Med: {stats.severityDist.medium}</Text>
                                    <Text style={styles.legendText}>High: {stats.severityDist.high}</Text>
                                </View>
                            </View>
                        );
                    })}
                </View>
            </ScrollView>
        </DashboardLayout>
    );
}

const styles = StyleSheet.create({
    pendingCard: {
        backgroundColor: '#fff7ed', // light orange
        padding: 16,
        borderRadius: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        borderWidth: 1,
        borderColor: COLORS.primary,
    },
    pendingName: {
        fontSize: 16,
        fontWeight: 'bold',
        color: COLORS.dark,
    },
    pendingZone: {
        fontSize: 14,
        color: COLORS.gray,
    },
    approveButton: {
        backgroundColor: COLORS.success,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
    },
    approveButtonText: {
        color: COLORS.white,
        fontWeight: 'bold',
        fontSize: 14,
    },
    content: {
        flex: 1,
    },
    statsCard: {
        backgroundColor: COLORS.white,
        margin: 16,
        padding: 24,
        borderRadius: 16,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 4,
        borderWidth: 1,
        borderColor: COLORS.secondary,
    },
    cardTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.dark,
        marginBottom: 20,
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
    },
    divider: {
        width: 1,
        height: 40,
        backgroundColor: COLORS.border,
    },
    statItem: {
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 12,
        minWidth: 90,
    },
    statIconBadge: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    statValue: {
        fontSize: 32,
        fontWeight: 'bold',
        color: COLORS.dark,
    },
    statLabel: {
        fontSize: 14,
        color: COLORS.gray,
        marginTop: 4,
        fontWeight: '500',
    },
    statItemActive: {
        backgroundColor: '#f8fafc',
        borderWidth: 2,
        borderColor: COLORS.primary,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    statLabelActive: {
        fontWeight: 'bold',
        color: COLORS.primary,
    },
    section: {
        padding: 16,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.dark,
        marginBottom: 12,
    },
    zoneCard: {
        backgroundColor: COLORS.white,
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    zoneHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    zoneName: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.dark,
    },
    zoneSubtext: {
        fontSize: 13,
        color: COLORS.gray,
        marginTop: 2,
    },
    healthBadge: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        alignItems: 'center',
        minWidth: 60,
    },
    healthValue: {
        fontSize: 20,
        fontWeight: '900',
        color: COLORS.white,
    },
    healthLabel: {
        fontSize: 10,
        color: COLORS.white,
        fontWeight: '700',
    },
    severityBar: {
        flexDirection: 'row',
        height: 12,
        borderRadius: 6,
        overflow: 'hidden',
        marginBottom: 12,
        backgroundColor: COLORS.light,
    },
    severitySegment: {
        height: '100%',
    },
    severityLegend: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
    },
    legendText: {
        fontSize: 12,
        color: COLORS.gray,
        fontWeight: '500',
    },
    actionGrid: {
        padding: 16,
        gap: 12,
    },
    actionRow: {
        flexDirection: 'row',
        gap: 12,
    },
    actionButtonHalf: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.white,
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    actionButtonFull: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.white,
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    actionTextContainer: {
        flex: 1,
    },
    actionIconBadge: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#f1f5f9',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
        position: 'relative',
    },
    badgeDot: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: 12,
        height: 12,
        backgroundColor: COLORS.danger,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: COLORS.white,
    },
    actionButtonTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: COLORS.dark,
    },
    actionButtonSubtitle: {
        fontSize: 12,
        color: COLORS.primary,
        fontWeight: '500',
    },
    actionArrow: {
        fontSize: 20,
        color: COLORS.gray,
        marginLeft: 'auto',
    },
    filterSection: {
        paddingHorizontal: 16,
        marginBottom: 8,
    },
    filterContainer: {
        gap: 8,
        paddingRight: 16,
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
    filterText: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.gray,
    },
    filterTextActive: {
        color: COLORS.white,
    },

    // Report Card Styles
    emptyState: {
        alignItems: 'center',
        padding: 30,
    },
    emptyText: {
        color: COLORS.gray,
        fontSize: 16,
    },
    reportCard: {
        backgroundColor: COLORS.white,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
        overflow: 'hidden',
    },
    reportHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    reportType: {
        fontSize: 16,
        fontWeight: 'bold',
        color: COLORS.dark,
        textTransform: 'capitalize',
    },
    reportLocation: {
        fontSize: 12,
        color: COLORS.gray,
        marginTop: 2,
    },
    severityBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        height: 22,
    },
    severityText: {
        color: COLORS.white,
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    imageContainer: {
        height: 150,
        backgroundColor: '#f1f5f9',
        borderRadius: 8,
        marginBottom: 12,
        marginTop: 8,
        overflow: 'hidden',
    },
    reportImage: {
        width: '100%',
        height: '100%',
    },
    reportFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 8,
        borderTopWidth: 1,
        borderTopColor: COLORS.light,
        paddingTop: 8,
        alignItems: 'center',
    },
    reportDate: {
        fontSize: 12,
        color: COLORS.gray,
    },
    syncBadge: {
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'capitalize',
    },
    repairSection: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: COLORS.secondary,
        backgroundColor: '#f0fdf4',
        padding: 8,
        borderRadius: 8,
    },
    repairHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    repairTitle: {
        fontSize: 12,
        fontWeight: 'bold',
        color: COLORS.success,
    },
    repairDate: {
        fontSize: 10,
        color: COLORS.gray,
    },
    repairImage: {
        width: '100%',
        height: 150,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: COLORS.success,
    },
    placeholderContainer: {
        width: '100%',
        height: 150,
        backgroundColor: '#f1f5f9',
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: COLORS.border,
        borderStyle: 'dashed',
    },
    placeholderText: {
        fontSize: 12,
        color: COLORS.gray,
        marginTop: 8,
        fontWeight: '500',
    },
});
