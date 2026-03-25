import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../constants';
import { Report } from '../types';
import storageService from '../services/supabaseStorage';
import authService from '../services/supabaseAuth';
import { formatDate, getSeverityColor } from '../utils';
import DashboardLayout from '../components/DashboardLayout';

interface AdminFeedbackScreenProps {
    onNavigate: (screen: string) => void;
    onLogout: () => void;
}

export default function AdminFeedbackScreen({ onNavigate, onLogout }: AdminFeedbackScreenProps) {
    const { t } = useTranslation();
    const [reports, setReports] = useState<Report[]>([]);
    const [users, setUsers] = useState<any[]>([]);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const allReports = await storageService.getReports();
            // Filter only reports with citizen ratings
            const ratedReports = allReports.filter(r => r.citizenRating && r.citizenRating > 0);
            // Sort by rating (highest first)
            const sorted = ratedReports.sort((a, b) => (b.citizenRating || 0) - (a.citizenRating || 0));
            setReports(sorted);

            // Load users to show citizen names
            const allUsers = await storageService.getRegisteredUsers();
            setUsers(allUsers);
        } catch (error) {
            console.error('Error loading feedback:', error);
        }
    };

    const handleLogout = async () => {
        await authService.logout();
        onLogout();
    };

    const getAverageRating = () => {
        if (reports.length === 0) return 0;
        const sum = reports.reduce((acc, r) => acc + (r.citizenRating || 0), 0);
        return (sum / reports.length).toFixed(1);
    };

    const getRatingDistribution = () => {
        const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        reports.forEach(r => {
            if (r.citizenRating) {
                dist[r.citizenRating as keyof typeof dist]++;
            }
        });
        return dist;
    };

    const distribution = getRatingDistribution();

    return (
        <DashboardLayout
            title="Citizen Feedback"
            role="admin"
            activeRoute="Feedback"
            onNavigate={onNavigate}
            onLogout={handleLogout}
        >
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {/* Summary Stats */}
                <View style={styles.summaryCard}>
                    <Text style={styles.cardTitle}>Feedback Summary</Text>
                    <View style={styles.summaryRow}>
                        <View style={styles.summaryItem}>
                            <View style={styles.ratingCircle}>
                                <Ionicons name="star" size={32} color="#f59e0b" />
                                <Text style={styles.avgRating}>{getAverageRating()}</Text>
                            </View>
                            <Text style={styles.summaryLabel}>Average Rating</Text>
                        </View>
                        <View style={styles.divider} />
                        <View style={styles.summaryItem}>
                            <Text style={styles.summaryValue}>{reports.length}</Text>
                            <Text style={styles.summaryLabel}>Total Ratings</Text>
                        </View>
                    </View>
                </View>

                {/* Rating Distribution */}
                <View style={styles.distributionCard}>
                    <Text style={styles.cardTitle}>Rating Distribution</Text>
                    {[5, 4, 3, 2, 1].map(rating => (
                        <View key={rating} style={styles.distributionRow}>
                            <View style={styles.starsContainer}>
                                {[...Array(rating)].map((_, i) => (
                                    <Ionicons key={i} name="star" size={14} color="#f59e0b" />
                                ))}
                            </View>
                            <View style={styles.barContainer}>
                                <View
                                    style={[
                                        styles.bar,
                                        {
                                            width: reports.length > 0
                                                ? `${(distribution[rating as keyof typeof distribution] / reports.length) * 100}%`
                                                : '0%'
                                        }
                                    ]}
                                />
                            </View>
                            <Text style={styles.countText}>{distribution[rating as keyof typeof distribution]}</Text>
                        </View>
                    ))}
                </View>

                {/* Feedback List */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>All Feedback ({reports.length})</Text>
                    {reports.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Ionicons name="chatbox-outline" size={48} color={COLORS.gray} style={{ opacity: 0.5, marginBottom: 16 }} />
                            <Text style={styles.emptyText}>No feedback received yet</Text>
                            <Text style={styles.emptySubtext}>
                                Citizen feedback will appear here after they rate completed repairs
                            </Text>
                        </View>
                    ) : (
                        reports.map((report) => {
                            const citizen = users.find(u => u.id === report.citizenId);
                            return (
                                <View key={report.id} style={styles.feedbackCard}>
                                    {/* Header */}
                                    <View style={styles.feedbackHeader}>
                                        <View style={styles.citizenInfo}>
                                            <Ionicons name="person-circle" size={24} color={COLORS.primary} />
                                            <View style={{ marginLeft: 8 }}>
                                                <Text style={styles.citizenName}>
                                                    {citizen?.username || 'Unknown Citizen'}
                                                </Text>
                                                <Text style={styles.feedbackDate}>{formatDate(report.repairCompletedAt || report.updatedAt)}</Text>
                                            </View>
                                        </View>
                                        <View style={styles.ratingBadge}>
                                            <Ionicons name="star" size={16} color="#f59e0b" />
                                            <Text style={styles.ratingValue}>{report.citizenRating}/5</Text>
                                        </View>
                                    </View>

                                    {/* Stars Display */}
                                    <View style={styles.starsDisplay}>
                                        {[1, 2, 3, 4, 5].map((star) => (
                                            <Ionicons
                                                key={star}
                                                name={star <= (report.citizenRating || 0) ? "star" : "star-outline"}
                                                size={24}
                                                color="#f59e0b"
                                                style={{ marginRight: 4 }}
                                            />
                                        ))}
                                    </View>

                                    {/* Text Feedback */}
                                    {report.citizenFeedback && (
                                        <View style={styles.textFeedbackContainer}>
                                            <Text style={styles.feedbackLabel}>Citizen Comment:</Text>
                                            <Text style={styles.feedbackText}>{report.citizenFeedback}</Text>
                                        </View>
                                    )}

                                    {/* Report Details */}
                                    <View style={styles.reportDetails}>
                                        <Text style={styles.reportType}>
                                            {report.aiDetection?.damageType || 'Unknown'} - {report.location.roadName || 'Unknown Location'}
                                        </Text>
                                        <Text style={styles.reportZone}>
                                            Zone: {report.location.zone?.toUpperCase()}
                                        </Text>
                                    </View>

                                    {/* Repair Proof Thumbnail */}
                                    {report.repairProofUri && (
                                        <View style={styles.proofContainer}>
                                            <Text style={styles.proofLabel}>Repair Proof:</Text>
                                            <Image
                                                source={{ uri: report.repairProofUri }}
                                                style={styles.proofImage}
                                                resizeMode="cover"
                                            />
                                        </View>
                                    )}
                                </View>
                            );
                        })
                    )}
                </View>
            </ScrollView>
        </DashboardLayout>
    );
}

const styles = StyleSheet.create({
    content: {
        flex: 1,
        padding: 16,
    },
    summaryCard: {
        backgroundColor: COLORS.white,
        borderRadius: 16,
        padding: 24,
        marginBottom: 16,
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
    summaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
    },
    summaryItem: {
        alignItems: 'center',
    },
    ratingCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#fffbeb',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    avgRating: {
        position: 'absolute',
        fontSize: 20,
        fontWeight: 'bold',
        color: '#b45309',
        bottom: 8,
    },
    summaryValue: {
        fontSize: 32,
        fontWeight: 'bold',
        color: COLORS.dark,
    },
    summaryLabel: {
        fontSize: 14,
        color: COLORS.gray,
        marginTop: 8,
        fontWeight: '500',
    },
    divider: {
        width: 1,
        height: 60,
        backgroundColor: COLORS.border,
    },
    distributionCard: {
        backgroundColor: COLORS.white,
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    distributionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    starsContainer: {
        flexDirection: 'row',
        width: 80,
    },
    barContainer: {
        flex: 1,
        height: 20,
        backgroundColor: '#f1f5f9',
        borderRadius: 10,
        marginHorizontal: 12,
        overflow: 'hidden',
    },
    bar: {
        height: '100%',
        backgroundColor: '#f59e0b',
        borderRadius: 10,
    },
    countText: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.dark,
        width: 30,
        textAlign: 'right',
    },
    section: {
        marginTop: 8,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.dark,
        marginBottom: 16,
    },
    emptyState: {
        alignItems: 'center',
        padding: 40,
        backgroundColor: COLORS.white,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderStyle: 'dashed',
    },
    emptyText: {
        fontSize: 16,
        fontWeight: '600',
        color: COLORS.gray,
        marginBottom: 8,
    },
    emptySubtext: {
        fontSize: 14,
        color: COLORS.gray,
        textAlign: 'center',
    },
    feedbackCard: {
        backgroundColor: COLORS.white,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    feedbackHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    citizenInfo: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    citizenName: {
        fontSize: 16,
        fontWeight: 'bold',
        color: COLORS.dark,
        textTransform: 'capitalize',
    },
    feedbackDate: {
        fontSize: 12,
        color: COLORS.gray,
        marginTop: 2,
    },
    ratingBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fffbeb',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    ratingValue: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#b45309',
        marginLeft: 4,
    },
    starsDisplay: {
        flexDirection: 'row',
        marginBottom: 12,
    },
    reportDetails: {
        marginBottom: 12,
    },
    reportType: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.dark,
        textTransform: 'capitalize',
        marginBottom: 4,
    },
    reportZone: {
        fontSize: 12,
        color: COLORS.primary,
        fontWeight: '600',
    },
    proofContainer: {
        marginTop: 8,
    },
    proofLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: COLORS.gray,
        marginBottom: 6,
    },
    proofImage: {
        width: '100%',
        height: 150,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: COLORS.success,
    },
    textFeedbackContainer: {
        backgroundColor: '#f9fafb',
        padding: 12,
        borderRadius: 8,
        marginBottom: 12,
        borderLeftWidth: 3,
        borderLeftColor: COLORS.primary,
    },
    feedbackLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: COLORS.gray,
        marginBottom: 6,
        textTransform: 'uppercase',
    },
    feedbackText: {
        fontSize: 14,
        color: COLORS.dark,
        lineHeight: 20,
    },
});
