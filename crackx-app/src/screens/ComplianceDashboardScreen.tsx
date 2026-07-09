import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    Alert,
    Image,
    Platform,
    Modal
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, ZONES } from '../constants';
import DashboardLayout from '../components/DashboardLayout';
import storageService from '../services/supabaseStorage';
import authService from '../services/supabaseAuth';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Report, User } from '../types';
import { isLocalMobileUri } from '../utils';

interface ComplianceDashboardScreenProps {
    onNavigate: (screen: string) => void;
    onLogout: () => void;
}

export default function ComplianceDashboardScreen({ onNavigate, onLogout }: ComplianceDashboardScreenProps) {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
    const [rsos, setRsos] = useState<User[]>([]);
    const [reports, setReports] = useState<Report[]>([]);
    const [selectedZone, setSelectedZone] = useState<string>('all');

    // Detailed View State
    const [selectedRso, setSelectedRso] = useState<User | null>(null);
    const [rsoReports, setRsoReports] = useState<Report[]>([]);
    const [detailModalVisible, setDetailModalVisible] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [allUsers, allReports] = await Promise.all([
                storageService.getRegisteredUsers(),
                storageService.getReports()
            ]);

            const rsoUsers = allUsers.filter(u => u.role === 'rso' && u.isApproved);
            setRsos(rsoUsers);
            setReports(allReports);
        } catch (error) {
            console.error('Error loading compliance data:', error);
            Alert.alert('Error', 'Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        await authService.logout();
        onLogout();
    };

    const getRsoStats = (rso: User) => {
        // Show ALL reports associated with this RSO
        // Include both zone-based and explicitly assigned reports
        const rsoWorkReports = reports.filter(r =>
            // Zone match (RSO responsible for zone)
            (rso.zone && r.location?.zone === rso.zone) ||
            // Explicitly assigned to this RSO
            (r.rsoId === rso.id)
        );

        // Sort by creation date (newest first)
        const sortedReports = rsoWorkReports.sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        const total = sortedReports.length;
        const completed = sortedReports.filter(r => r.status === 'completed').length;
        const pending = sortedReports.filter(r => ['pending', 'verification-pending'].includes(r.status)).length;
        const inProgress = sortedReports.filter(r => r.status === 'in-progress').length;

        console.log(`[Compliance] RSO ${rso.username} (${rso.zone}): ${total} total reports (${completed} completed, ${pending} pending, ${inProgress} in-progress)`);

        return { total, completed, pending, inProgress, reports: sortedReports };
    };

    const openRsoDetails = (rso: User) => {
        const stats = getRsoStats(rso);
        setSelectedRso(rso);
        setRsoReports(stats.reports);
        setDetailModalVisible(true);
    };

    const generateReport = async (rso: User) => {
        const stats = getRsoStats(rso);
        const zoneName = ZONES.find(z => z.id === rso.zone)?.name || rso.zone;
        const date = new Date().toLocaleDateString();

        const htmlContent = `
            <html>
            <head>
                <style>
                    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #333; }
                    h1 { color: #f97316; margin-bottom: 10px; border-bottom: 2px solid #f97316; padding-bottom: 10px; }
                    .header-info { margin-bottom: 30px; line-height: 1.6; }
                    .header-info strong { color: #555; }
                    .stats-box { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 30px; }
                    .stat-row { display: flex; justify-content: space-between; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px dashed #cbd5e1; }
                    .stat-row:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
                    .stat-label { font-weight: 600; color: #475569; }
                    .stat-value { font-weight: bold; font-size: 1.1em; }
                    .status-box { text-align: center; padding: 15px; background-color: #1e293b; color: white; border-radius: 8px; font-weight: bold; letter-spacing: 1px; margin-top: 20px; }
                    .footer { margin-top: 50px; text-align: center; color: #94a3b8; font-size: 0.8em; border-top: 1px solid #e2e8f0; padding-top: 20px; }
                </style>
            </head>
            <body>
                <h1>OFFICIAL COMPLIANCE REPORT</h1>
                
                <div class="header-info">
                    <div><strong>Officer Name:</strong> ${rso.username}</div>
                    <div><strong>Assigned Zone:</strong> ${zoneName}</div>
                    <div><strong>Report Date:</strong> ${date}</div>
                </div>

                <h2>Performance Summary</h2>
                <div class="stats-box">
                    <div class="stat-row">
                        <span class="stat-label">Total Assigned Complaints</span>
                        <span class="stat-value">${stats.total}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Successfully Completed</span>
                        <span class="stat-value" style="color: #16a34a">${stats.completed}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Work In Progress</span>
                        <span class="stat-value" style="color: #3b82f6">${stats.inProgress}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Pending Action</span>
                        <span class="stat-value" style="color: #ea580c">${stats.pending}</span>
                    </div>

                    <div class="stat-row">
                        <span class="stat-label">Completion Rate</span>
                        <span class="stat-value">${stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%</span>
                    </div>
                </div>

                <h2>Detailed Work Logs</h2>
                <div class="stats-box" style="padding: 0; overflow: hidden;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
                        <thead>
                            <tr style="background-color: #f1f5f9; text-align: left;">
                                <th style="padding: 12px; border-bottom: 2px solid #e2e8f0; color: #475569;">Date</th>
                                <th style="padding: 12px; border-bottom: 2px solid #e2e8f0; color: #475569;">Issue</th>
                                <th style="padding: 12px; border-bottom: 2px solid #e2e8f0; color: #475569;">Status</th>
                                <th style="padding: 12px; border-bottom: 2px solid #e2e8f0; color: #475569;">Location</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${stats.reports.map((r, index) => `
                                <tr style="background-color: ${index % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${new Date(r.createdAt).toLocaleDateString()}</td>
                                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${r.aiDetection?.damageType || 'Road Damage'}</td>
                                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">
                                        <span style="
                                            background-color: ${r.status === 'completed' ? '#dcfce7' : '#ffedd5'};
                                            color: ${r.status === 'completed' ? '#166534' : '#9a3412'};
                                            padding: 4px 8px;
                                            border-radius: 99px;
                                            font-size: 0.85em;
                                            font-weight: 600;
                                            display: inline-block;
                                        ">
                                            ${r.status.toUpperCase()}
                                        </span>
                                    </td>
                                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 0.85em; color: #64748b;">
                                        ${r.location.roadName || r.location.address || `${r.location.latitude.toFixed(4)}, ${r.location.longitude.toFixed(4)}`}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>

                <div class="status-box">
                    OVERALL STATUS: ${stats.pending === 0 && stats.total > 0 ? 'Exemplary' : stats.pending < 5 ? 'Good Standing' : 'Needs Attention'}
                </div>

                <div class="footer">
                    Generated by Solapur Municipal Corporation - Road Compliance Management System (RCMS)
                </div>
            </body>
            </html>
        `;

        try {
            if (Platform.OS === 'web') {
                // Manual iframe approach to ensure ONLY the report content is printed
                const iframe = document.createElement('iframe');
                iframe.style.position = 'absolute';
                iframe.style.width = '0px';
                iframe.style.height = '0px';
                iframe.style.border = 'none';
                document.body.appendChild(iframe);

                const iframeDoc = iframe.contentWindow?.document;
                if (iframeDoc) {
                    iframeDoc.open();
                    iframeDoc.write(htmlContent);
                    iframeDoc.close();

                    // Print after a short delay to ensure rendering
                    setTimeout(() => {
                        iframe.contentWindow?.focus();
                        iframe.contentWindow?.print();
                        // Clean up
                        setTimeout(() => document.body.removeChild(iframe), 1000);
                    }, 500);
                }
                return;
            }

            const { uri } = await Print.printToFileAsync({ html: htmlContent });
            await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
        } catch (error) {
            console.error('Error generating PDF:', error);
            Alert.alert('Error', 'Failed to generate PDF report');
        }
    };

    const filteredRsos = selectedZone === 'all'
        ? rsos
        : rsos.filter(r => r.zone === selectedZone);

    return (
        <DashboardLayout
            title="Compliance Dashboard"
            role="compliance_officer"
            activeRoute="Dashboard"
            onNavigate={onNavigate}
            onLogout={handleLogout}
        >
            <View style={styles.container}>
                {/* Zone Filter */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterContainer}>
                    <TouchableOpacity
                        style={[styles.filterChip, selectedZone === 'all' && styles.filterChipActive]}
                        onPress={() => setSelectedZone('all')}
                    >
                        <Text style={[styles.filterText, selectedZone === 'all' && styles.filterTextActive]}>All Zones</Text>
                    </TouchableOpacity>
                    {ZONES.map(z => (
                        <TouchableOpacity
                            key={z.id}
                            style={[styles.filterChip, selectedZone === z.id && styles.filterChipActive]}
                            onPress={() => setSelectedZone(z.id)}
                        >
                            <Text style={[styles.filterText, selectedZone === z.id && styles.filterTextActive]}>{z.name.split(' - ')[0]}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                {loading ? (
                    <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 50 }} />
                ) : (
                    <ScrollView style={styles.content}>
                        {filteredRsos.length === 0 ? (
                            <View style={styles.emptyState}>
                                <Text style={styles.emptyText}>No RSOs found in this zone.</Text>
                            </View>
                        ) : (
                            filteredRsos.map(rso => {
                                const stats = getRsoStats(rso);
                                return (
                                    <View key={rso.id} style={styles.card}>
                                        <View style={styles.cardHeader}>
                                            <View style={styles.rsoInfo}>
                                                <View style={styles.avatar}>
                                                    <Text style={styles.avatarText}>{rso.username.substring(0, 2).toUpperCase()}</Text>
                                                </View>
                                                <View>
                                                    <Text style={styles.rsoName}>{rso.username}</Text>
                                                    <Text style={styles.rsoZone}>{ZONES.find(z => z.id === rso.zone)?.name || rso.zone}</Text>
                                                </View>
                                            </View>
                                            <TouchableOpacity
                                                style={styles.reportBtn}
                                                onPress={() => generateReport(rso)}
                                            >
                                                <Ionicons name="document-text-outline" size={16} color={COLORS.white} />
                                                <Text style={styles.reportBtnText}>Generate Report</Text>
                                            </TouchableOpacity>
                                        </View>

                                        <View style={styles.statsRow}>
                                            <View style={styles.statItem}>
                                                <Text style={styles.statValue}>{stats.total}</Text>
                                                <Text style={styles.statLabel}>Total</Text>
                                            </View>
                                            <View style={styles.statItem}>
                                                <Text style={[styles.statValue, { color: COLORS.success }]}>{stats.completed}</Text>
                                                <Text style={styles.statLabel}>Done</Text>
                                            </View>
                                            <View style={styles.statItem}>
                                                <Text style={[styles.statValue, { color: COLORS.warning }]}>{stats.pending}</Text>
                                                <Text style={styles.statLabel}>Pending</Text>
                                            </View>
                                        </View>

                                        <TouchableOpacity
                                            style={styles.viewDetailsBtn}
                                            onPress={() => openRsoDetails(rso)}
                                        >
                                            <Text style={styles.viewDetailsText}>View Work Log</Text>
                                            <Ionicons name="arrow-forward" size={16} color={COLORS.primary} />
                                        </TouchableOpacity>
                                    </View>
                                );
                            })
                        )}
                        <View style={{ height: 40 }} />
                    </ScrollView>
                )}
            </View>

            {/* Detailed Work Log Modal */}
            <Modal
                visible={detailModalVisible}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setDetailModalVisible(false)}
            >
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <TouchableOpacity onPress={() => setDetailModalVisible(false)} style={styles.closeBtn}>
                            <Ionicons name="close" size={24} color={COLORS.dark} />
                        </TouchableOpacity>
                        <Text style={styles.modalTitle}>Work Log: {selectedRso?.username}</Text>
                        <TouchableOpacity
                            style={styles.modalReportBtn}
                            onPress={() => selectedRso && generateReport(selectedRso)}
                        >
                            <Ionicons name="download-outline" size={20} color={COLORS.primary} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.modalContent}>
                        {rsoReports.length === 0 ? (
                            <View style={styles.emptyState}>
                                <Text style={styles.emptyText}>No reports assigned to this RSO.</Text>
                            </View>
                        ) : (
                            rsoReports.map(report => (
                                <View key={report.id} style={styles.reportCard}>
                                    <View style={styles.reportHeader}>
                                        <View style={styles.tagContainer}>
                                            <View style={[styles.typeTag, { backgroundColor: report.status === 'completed' ? '#dcfce7' : '#fee2e2' }]}>
                                                <Text style={[styles.typeText, { color: report.status === 'completed' ? '#166534' : '#991b1b' }]}>
                                                    {report.status.toUpperCase()}
                                                </Text>
                                            </View>
                                            <Text style={styles.dateText}>{new Date(report.createdAt).toLocaleDateString()}</Text>
                                        </View>
                                    </View>

                                    <Text style={styles.complaintText}>
                                        Problem: {report.aiDetection?.damageType || 'Road Damage'}
                                    </Text>
                                    <Text style={styles.locationText}>
                                        <Ionicons name="location-outline" size={14} />
                                        {report.location.latitude.toFixed(5)}, {report.location.longitude.toFixed(5)}
                                    </Text>

                                    <View style={styles.imagesRow}>
                                        <View style={styles.imageWrapper}>
                                            <Text style={styles.imageLabel}>Before</Text>

                                            {/* Show Video if available, otherwise show Image */}
                                            {report.videoUri ? (
                                                <View style={styles.videoThumbnailContainer}>
                                                    <Video
                                                        source={{ uri: report.videoUri }}
                                                        style={styles.proofImage}
                                                        resizeMode={ResizeMode.COVER}
                                                        shouldPlay={false}
                                                        useNativeControls
                                                    />
                                                    <View style={styles.videoIndicator}>
                                                        <Ionicons name="videocam" size={16} color="white" />
                                                        <Text style={styles.videoIndicatorText}>Video</Text>
                                                    </View>
                                                </View>
                                            ) : (
                                                Platform.OS === 'web' && isLocalMobileUri(report.photoUri) ? (
                                                    <View style={[styles.proofImage, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#e2e8f0', borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed' }]}>
                                                        <Ionicons name="phone-portrait-outline" size={24} color={COLORS.gray} />
                                                        <Text style={{ fontSize: 9, color: COLORS.gray, marginTop: 2, textAlign: 'center' }}>On Mobile</Text>
                                                    </View>
                                                ) : imageErrors[report.id] ? (
                                                    <View style={[styles.proofImage, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#e2e8f0', borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed' }]}>
                                                        <Ionicons name="image-outline" size={24} color={COLORS.gray} />
                                                        <Text style={{ fontSize: 9, color: COLORS.gray, marginTop: 2, textAlign: 'center' }}>Unavailable</Text>
                                                    </View>
                                                ) : (
                                                    <Image
                                                        source={{ uri: report.photoUri }}
                                                        style={styles.proofImage}
                                                        onError={() => {
                                                            setImageErrors(prev => ({ ...prev, [report.id]: true }));
                                                        }}
                                                    />
                                                )
                                            )}

                                            <Text style={styles.timeText}>Reported: {new Date(report.createdAt).toLocaleDateString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                                        </View>

                                        {report.status === 'completed' && report.repairProofUri ? (
                                            <View style={styles.imageWrapper}>
                                                <Text style={styles.imageLabel}>After</Text>
                                                {Platform.OS === 'web' && isLocalMobileUri(report.repairProofUri) ? (
                                                    <View style={[styles.proofImage, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: COLORS.success, borderStyle: 'dashed' }]}>
                                                        <Ionicons name="phone-portrait-outline" size={24} color={COLORS.success} />
                                                        <Text style={{ fontSize: 9, color: COLORS.success, marginTop: 2, textAlign: 'center' }}>On Mobile</Text>
                                                    </View>
                                                ) : imageErrors[report.id + '_proof'] ? (
                                                    <View style={[styles.proofImage, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#e2e8f0', borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed' }]}>
                                                        <Ionicons name="image-outline" size={24} color={COLORS.gray} />
                                                        <Text style={{ fontSize: 9, color: COLORS.gray, marginTop: 2, textAlign: 'center' }}>Unavailable</Text>
                                                    </View>
                                                ) : (
                                                    <Image
                                                        source={{ uri: report.repairProofUri }}
                                                        style={styles.proofImage}
                                                        onError={() => {
                                                            setImageErrors(prev => ({ ...prev, [report.id + '_proof']: true }));
                                                        }}
                                                    />
                                                )}
                                                <Text style={styles.timeText}>Fixed: {new Date(report.repairCompletedAt!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                                            </View>
                                        ) : (
                                            <View style={[styles.imageWrapper, styles.placeholderWrapper]}>
                                                <Text style={styles.placeholderText}>Work Pending</Text>
                                            </View>
                                        )}
                                    </View>
                                </View>
                            ))
                        )}
                        <View style={{ height: 40 }} />
                    </ScrollView>
                </View>
            </Modal>
        </DashboardLayout>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8fafc',
    },
    filterContainer: {
        maxHeight: 60,
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: COLORS.white,
    },
    filterChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#f1f5f9',
        marginRight: 8,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    filterChipActive: {
        backgroundColor: '#eff6ff',
        borderColor: COLORS.primary,
    },
    filterText: {
        color: COLORS.gray,
        fontWeight: '600',
    },
    filterTextActive: {
        color: COLORS.primary,
    },
    content: {
        flex: 1,
        padding: 16,
    },
    card: {
        backgroundColor: COLORS.white,
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 3,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    rsoInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: COLORS.secondary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        color: COLORS.primary,
        fontWeight: 'bold',
    },
    rsoName: {
        fontSize: 16,
        fontWeight: 'bold',
        color: COLORS.dark,
    },
    rsoZone: {
        fontSize: 12,
        color: COLORS.gray,
    },
    reportBtn: {
        backgroundColor: COLORS.primary,
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 8,
        gap: 4,
    },
    reportBtnText: {
        color: COLORS.white,
        fontSize: 12,
        fontWeight: 'bold',
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        backgroundColor: '#f8fafc',
        borderRadius: 12,
        padding: 12,
        marginBottom: 16,
    },
    statItem: {
        alignItems: 'center',
        flex: 1,
    },
    statValue: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.dark,
    },
    statLabel: {
        fontSize: 12,
        color: COLORS.gray,
        marginTop: 4,
    },
    viewDetailsBtn: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 8,
        gap: 8,
        borderTopWidth: 1,
        borderTopColor: '#f1f5f9',
    },
    viewDetailsText: {
        color: COLORS.primary,
        fontWeight: '600',
        fontSize: 14,
    },
    emptyState: {
        alignItems: 'center',
        padding: 40,
    },
    emptyText: {
        color: COLORS.gray,
        fontSize: 14,
    },

    // Modal Styles
    modalContainer: {
        flex: 1,
        backgroundColor: '#f8fafc',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        backgroundColor: COLORS.white,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    closeBtn: {
        padding: 8,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.dark,
    },
    modalReportBtn: {
        padding: 8,
    },
    modalContent: {
        flex: 1,
        padding: 16,
    },
    reportCard: {
        backgroundColor: COLORS.white,
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    reportHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    tagContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        justifyContent: 'space-between',
    },
    typeTag: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    typeText: {
        fontSize: 10,
        fontWeight: 'bold',
    },
    dateText: {
        fontSize: 12,
        color: COLORS.gray,
    },
    complaintText: {
        fontSize: 16,
        fontWeight: '600',
        color: COLORS.dark,
        marginBottom: 4,
    },
    locationText: {
        fontSize: 12,
        color: COLORS.gray, // Using gray for location
        marginBottom: 12,
    },
    imagesRow: {
        flexDirection: 'row',
        gap: 12,
    },
    imageWrapper: {
        flex: 1,
        height: 120,
        borderRadius: 8,
        overflow: 'hidden',
        position: 'relative',
    },
    proofImage: {
        width: '100%',
        height: '100%',
        borderRadius: 8,
    },
    imageLabel: {
        position: 'absolute',
        top: 6,
        left: 6,
        backgroundColor: 'rgba(0,0,0,0.6)',
        color: COLORS.white,
        fontSize: 10,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        zIndex: 1,
    },
    placeholderWrapper: {
        backgroundColor: '#f1f5f9',
        justifyContent: 'center',
        alignItems: 'center',
    },
    placeholderText: {
        color: COLORS.gray,
        fontSize: 12,
    },
    timeText: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        color: COLORS.white,
        fontSize: 10,
        padding: 4,
        textAlign: 'center',
        borderBottomLeftRadius: 8,
        borderBottomRightRadius: 8,
    },
    videoThumbnailContainer: {
        width: '100%',
        height: '100%',
        position: 'relative',
    },
    videoIndicator: {
        position: 'absolute',
        top: 6,
        right: 6,
        backgroundColor: 'rgba(220, 38, 38, 0.9)',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 4,
        zIndex: 2,
    },
    videoIndicatorText: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
});
