import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Image,
    Platform,
    TextInput,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants';
import { Report } from '../types';
import storageService from '../services/supabaseStorage';
import authService from '../services/supabaseAuth';
import { formatDate, getSeverityColor } from '../utils';
import DashboardLayout from '../components/DashboardLayout';

interface MyReportsScreenProps {
    onNavigate: (screen: string) => void;
    onBack: () => void;
    onLogout: () => void;
}

export default function MyReportsScreen({ onNavigate, onBack, onLogout }: MyReportsScreenProps) {
    const { t } = useTranslation();
    const [reports, setReports] = useState<Report[]>([]);
    const [users, setUsers] = useState<any[]>([]);
    const [feedbackText, setFeedbackText] = useState<{ [key: string]: string }>({});

    useEffect(() => {
        loadReports();
    }, []);

    const loadReports = async () => {
        try {
            const user = await authService.getCurrentUser();
            if (user) {
                const userReports = await storageService.getReportsByCitizen(user.id);
                setReports(userReports.sort((a, b) =>
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                ));

                // Initialize feedback text from existing reports
                const feedbackMap: { [key: string]: string } = {};
                userReports.forEach(report => {
                    if (report.citizenFeedback) {
                        feedbackMap[report.id] = report.citizenFeedback;
                    }
                });
                setFeedbackText(feedbackMap);
            }

            // Load all users to find RSO officers
            const allUsers = await storageService.getRegisteredUsers();
            setUsers(allUsers);
        } catch (error) {
            console.error('Error loading reports:', error);
        }
    };

    const handleRateReport = async (report: Report, rating: number) => {
        try {
            const updatedReport = {
                ...report,
                citizenRating: rating,
                citizenFeedback: feedbackText[report.id] || ''
            };
            await storageService.saveReport(updatedReport);

            // Update local state
            setReports(prev => prev.map(r => r.id === report.id ? updatedReport : r));
        } catch (error) {
            console.error('Failed to save rating:', error);
        }
    };

    const handleFeedbackChange = (reportId: string, text: string) => {
        setFeedbackText(prev => ({
            ...prev,
            [reportId]: text
        }));
    };

    const handleSubmitFeedback = async (report: Report) => {
        try {
            const updatedReport = {
                ...report,
                citizenFeedback: feedbackText[report.id] || '',
                citizenRating: report.citizenRating || 0
            };
            await storageService.saveReport(updatedReport);
            setReports(prev => prev.map(r => r.id === report.id ? updatedReport : r));
        } catch (error) {
            console.error('Failed to save feedback:', error);
        }
    };

    return (
        <DashboardLayout
            title={t('my_reports')}
            role="citizen"
            activeRoute="MyReports"
            onNavigate={onNavigate}
            onLogout={onLogout}
        >
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {/* Stats Summary */}
                <View style={styles.statsCard}>
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>{reports.length}</Text>
                        <Text style={styles.statLabel}>Total</Text>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.statItem}>
                        <Text style={[styles.statValue, { color: COLORS.warning }]}>
                            {reports.filter(r => r.status === 'pending').length}
                        </Text>
                        <Text style={styles.statLabel}>Pending</Text>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.statItem}>
                        <Text style={[styles.statValue, { color: COLORS.success }]}>
                            {reports.filter(r => r.status === 'completed').length}
                        </Text>
                        <Text style={styles.statLabel}>Fixed</Text>
                    </View>
                </View>
                {reports.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyIcon}>📭</Text>
                        <Text style={styles.emptyText}>{t('no_reports')}</Text>
                    </View>
                ) : (
                    reports.map((report) => (
                        <View key={report.id} style={styles.reportCard}>
                            {/* Photo */}
                            {report.photoUri && (
                                <View style={styles.imageContainer}>
                                    {Platform.OS === 'web' && report.photoUri.startsWith('file://') ? (
                                        <View style={{ alignItems: 'center', justifyContent: 'center', height: 200, backgroundColor: '#e2e8f0', borderRadius: 12 }}>
                                            <Ionicons name="phone-portrait-outline" size={40} color={COLORS.gray} />
                                            <Text style={{ fontSize: 12, color: COLORS.gray, marginTop: 8 }}>Image only available on Mobile</Text>
                                        </View>
                                    ) : (
                                        <Image
                                            source={{ uri: report.photoUri }}
                                            style={styles.reportImage}
                                            resizeMode="cover"
                                        />
                                    )}
                                </View>
                            )}

                            {/* Header */}
                            <View style={styles.reportHeader}>
                                <View>
                                    <Text style={styles.reportType}>
                                        {report.aiDetection?.damageType || 'Unknown'}
                                    </Text>
                                    <Text style={styles.reportMode}>
                                        {report.reportingMode === 'on-site' ? '📍 On-Site' : '🗺️ Remote'}
                                    </Text>
                                </View>
                                {report.aiDetection && (
                                    <View
                                        style={[
                                            styles.severityBadge,
                                            { backgroundColor: getSeverityColor(report.aiDetection.severity) },
                                        ]}
                                    >
                                        <Text style={styles.severityText}>
                                            {report.aiDetection.severity}
                                        </Text>
                                    </View>
                                )}
                            </View>

                            {/* Location */}
                            <View style={styles.locationSection}>
                                <Text style={styles.locationLabel}>Location:</Text>
                                <Text style={styles.locationText}>
                                    {report.location.roadName || report.location.address || 'Unknown location'}
                                </Text>
                                {report.location.zone && (
                                    <View style={styles.zoneContainer}>
                                        <Text style={styles.zoneText}>Zone: {report.location.zone.toUpperCase()}</Text>
                                        {(() => {
                                            const rsoOfficer = users.find(u => u.role === 'rso' && u.zone === report.location.zone);
                                            if (rsoOfficer) {
                                                return (
                                                    <Text style={styles.rsoOfficerText}>
                                                        • RSO: {rsoOfficer.username.charAt(0).toUpperCase() + rsoOfficer.username.slice(1)}
                                                    </Text>
                                                );
                                            }
                                            return null;
                                        })()}
                                    </View>
                                )}
                            </View>

                            {/* RSO Details (If Assigned) */}
                            {report.rsoId && (
                                <View style={styles.rsoSection}>
                                    <Text style={styles.rsoLabel}>Assigned Officer:</Text>
                                    <View style={styles.rsoRow}>
                                        <Ionicons name="person-circle-outline" size={20} color={COLORS.primary} />
                                        <Text style={styles.rsoName}>{report.rsoId}</Text>
                                    </View>
                                </View>
                            )}

                            {/* AI Detection Results */}
                            {report.aiDetection && (
                                <View style={styles.aiSection}>
                                    <Text style={styles.aiTitle}>AI Detection Results:</Text>
                                    <View style={styles.aiRow}>
                                        <Text style={styles.aiLabel}>Confidence:</Text>
                                        <Text style={styles.aiValue}>
                                            {(report.aiDetection.confidence * 100).toFixed(0)}%
                                        </Text>
                                    </View>
                                </View>
                            )}

                            {/* Repair Proof (Work Done) */}
                            {report.repairProofUri && (
                                <View style={styles.repairSection}>
                                    <View style={styles.repairHeader}>
                                        <Text style={styles.repairTitle}>✅ {t('repair_completed')}</Text>
                                        <Text style={styles.repairDate}>
                                            {report.repairCompletedAt ? formatDate(report.repairCompletedAt) : ''}
                                        </Text>
                                    </View>
                                    <Image source={{ uri: report.repairProofUri }} style={styles.repairImage} />

                                    {/* Citizen Feedback Section */}
                                    <View style={styles.feedbackSection}>
                                        <Text style={styles.feedbackTitle}>Your Feedback:</Text>

                                        {/* Star Rating */}
                                        <View style={styles.starsRow}>
                                            {[1, 2, 3, 4, 5].map((star) => (
                                                <TouchableOpacity
                                                    key={star}
                                                    disabled={!!report.citizenRating}
                                                    onPress={() => handleRateReport(report, star)}
                                                >
                                                    <Ionicons
                                                        name={star <= (report.citizenRating || 0) ? "star" : "star-outline"}
                                                        size={32}
                                                        color="#f59e0b"
                                                        style={{ marginRight: 8 }}
                                                    />
                                                </TouchableOpacity>
                                            ))}
                                        </View>

                                        {/* Text Feedback Input */}
                                        <TextInput
                                            style={[
                                                styles.feedbackInput,
                                                report.citizenFeedback && styles.feedbackInputDisabled
                                            ]}
                                            placeholder="Write your feedback about the repair work..."
                                            placeholderTextColor={COLORS.gray}
                                            multiline
                                            numberOfLines={3}
                                            value={feedbackText[report.id] || ''}
                                            onChangeText={(text) => handleFeedbackChange(report.id, text)}
                                            editable={!report.citizenFeedback}
                                        />

                                        {/* Submit Button (only show if not submitted) */}
                                        {!report.citizenFeedback && feedbackText[report.id] && (
                                            <TouchableOpacity
                                                style={styles.submitFeedbackButton}
                                                onPress={() => handleSubmitFeedback(report)}
                                            >
                                                <Text style={styles.submitFeedbackText}>Submit Feedback</Text>
                                            </TouchableOpacity>
                                        )}

                                        {report.citizenRating || report.citizenFeedback ? (
                                            <Text style={styles.startFeedbackText}>✓ Thank you for your feedback!</Text>
                                        ) : (
                                            <Text style={styles.ratingHint}>Rate and share your experience</Text>
                                        )}
                                    </View>
                                </View>
                            )}

                            {/* Footer */}
                            <View style={styles.reportFooter}>
                                <Text style={styles.reportDate}>{formatDate(report.createdAt)}</Text>
                                <View style={styles.badges}>
                                    <Text
                                        style={[
                                            styles.statusBadge,
                                            {
                                                color:
                                                    report.status === 'completed'
                                                        ? COLORS.success
                                                        : report.status === 'in-progress'
                                                            ? COLORS.primary
                                                            : COLORS.warning,
                                            },
                                        ]}
                                    >
                                        {report.status}
                                    </Text>
                                    <Text
                                        style={[
                                            styles.syncBadge,
                                            {
                                                color:
                                                    report.syncStatus === 'synced'
                                                        ? COLORS.success
                                                        : COLORS.warning,
                                            },
                                        ]}
                                    >
                                        {report.syncStatus}
                                    </Text>
                                </View>
                            </View>
                        </View>
                    ))
                )}
            </ScrollView>
        </DashboardLayout>
    );
}

const styles = StyleSheet.create({
    content: {
        flex: 1,
        padding: 16,
    },
    emptyState: {
        backgroundColor: COLORS.white,
        borderRadius: 16,
        padding: 40,
        alignItems: 'center',
        marginTop: 40,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderStyle: 'dashed',
    },
    emptyIcon: {
        fontSize: 64,
        marginBottom: 16,
        opacity: 0.5,
    },
    emptyText: {
        fontSize: 16,
        color: COLORS.gray,
        fontWeight: '600',
    },
    reportCard: {
        backgroundColor: COLORS.white,
        borderRadius: 16,
        marginBottom: 16,
        overflow: 'hidden',
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
        borderWidth: 1,
        borderColor: COLORS.secondary,
    },
    imageContainer: {
        width: '100%',
        height: 200,
        backgroundColor: '#f1f5f9',
        justifyContent: 'center',
        alignItems: 'center',
    },
    reportImage: {
        width: '100%',
        height: '100%',
        position: 'absolute',
    },
    reportHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        padding: 16,
        paddingBottom: 8,
    },
    reportType: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.dark,
        textTransform: 'capitalize',
        marginBottom: 4,
    },
    reportMode: {
        fontSize: 12,
        color: COLORS.gray,
    },
    severityBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
    },
    severityText: {
        color: COLORS.white,
        fontSize: 11,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },
    locationSection: {
        paddingHorizontal: 16,
        paddingBottom: 12,
    },
    locationLabel: {
        fontSize: 12,
        color: COLORS.gray,
        marginBottom: 4,
    },
    locationText: {
        fontSize: 14,
        color: COLORS.dark,
        marginBottom: 4,
        fontWeight: '500',
    },
    zoneText: {
        fontSize: 12,
        color: COLORS.primary,
        fontWeight: '700',
    },
    zoneContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
    },
    rsoOfficerText: {
        fontSize: 12,
        color: COLORS.success,
        fontWeight: '600',
    },
    aiSection: {
        paddingHorizontal: 16,
        paddingBottom: 12,
        borderTopWidth: 1,
        borderTopColor: COLORS.secondary,
        paddingTop: 12,
        backgroundColor: '#fafafa',
    },
    aiTitle: {
        fontSize: 12,
        color: COLORS.gray,
        marginBottom: 8,
        fontWeight: '600',
    },
    aiRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    aiLabel: {
        fontSize: 14,
        color: COLORS.dark,
    },
    aiValue: {
        fontSize: 14,
        fontWeight: 'bold',
        color: COLORS.primary,
    },
    reportFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: COLORS.border,
    },
    reportDate: {
        fontSize: 12,
        color: COLORS.gray,
    },
    badges: {
        flexDirection: 'row',
        gap: 8,
    },
    statusBadge: {
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'capitalize',
    },
    syncBadge: {
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'capitalize',
    },
    repairSection: {
        marginTop: 12,
        paddingHorizontal: 16,
        paddingBottom: 16,
        backgroundColor: '#f0fdf4', // Light green bg for repair proof
        paddingTop: 12,
    },
    repairHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    repairTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: COLORS.success,
    },
    repairDate: {
        fontSize: 12,
        color: COLORS.gray,
    },
    repairImage: {
        width: '100%',
        height: 200,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: COLORS.success,
    },
    statsCard: {
        flexDirection: 'row',
        backgroundColor: COLORS.white,
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
        alignItems: 'center',
        justifyContent: 'space-between',
        borderWidth: 1,
        borderColor: COLORS.secondary,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    statItem: {
        flex: 1,
        alignItems: 'center',
    },
    divider: {
        width: 1,
        height: 30,
        backgroundColor: COLORS.border,
    },
    statValue: {
        fontSize: 20,
        fontWeight: 'bold',
        color: COLORS.dark,
        marginBottom: 4,
    },
    statLabel: {
        fontSize: 12,
        color: COLORS.gray,
        fontWeight: '600',
    },
    rsoSection: {
        paddingHorizontal: 16,
        paddingBottom: 12,
        marginTop: 4,
    },
    rsoLabel: {
        fontSize: 12,
        color: COLORS.gray,
        marginBottom: 4,
    },
    rsoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    rsoName: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.dark,
    },
    feedbackSection: {
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#d1fae5',
    },
    feedbackTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.dark,
        marginBottom: 12,
    },
    starsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    startFeedbackText: {
        fontSize: 12,
        color: COLORS.success,
        fontWeight: '600',
        marginTop: 4,
    },
    ratingHint: {
        fontSize: 12,
        color: COLORS.gray,
        fontStyle: 'italic',
        marginTop: 4,
    },
    feedbackInput: {
        backgroundColor: COLORS.white,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 8,
        padding: 12,
        fontSize: 14,
        color: COLORS.dark,
        marginTop: 12,
        minHeight: 80,
        textAlignVertical: 'top',
    },
    feedbackInputDisabled: {
        backgroundColor: '#f9fafb',
        color: COLORS.gray,
    },
    submitFeedbackButton: {
        backgroundColor: COLORS.primary,
        borderRadius: 8,
        padding: 12,
        alignItems: 'center',
        marginTop: 12,
    },
    submitFeedbackText: {
        color: COLORS.white,
        fontSize: 14,
        fontWeight: '600',
    },
});
