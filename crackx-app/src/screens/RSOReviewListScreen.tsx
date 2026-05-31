import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    Image,
    TouchableOpacity,
    RefreshControl
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants';
import { Report } from '../types';
import DashboardLayout from '../components/DashboardLayout';
import storageService from '../services/supabaseStorage';
import { formatDate, getSeverityColor } from '../utils';

interface RSOReviewListScreenProps {
    onNavigate: (screen: string) => void;
    onLogout: () => void;
    onReviewReport: (report: Report) => void;
}

export default function RSOReviewListScreen({ onNavigate, onLogout, onReviewReport }: RSOReviewListScreenProps) {
    const { t } = useTranslation();
    const [reports, setReports] = useState<Report[]>([]);
    const [refreshing, setRefreshing] = useState(false);

    const loadReports = async () => {
        setRefreshing(true);
        try {
            const allReports = await storageService.getReports();
            // Filter for reports that need review:
            // 1. Explicit 'verification-pending' status OR
            // 2. 'in-progress' status AND has a proof photo (handling legacy/enum constraints)
            const pendingReview = allReports.filter(r =>
                r.status === 'verification-pending' ||
                (r.status === 'in-progress' && !!r.repairProofUri)
            );
            setReports(pendingReview);
        } catch (error) {
            console.error('Error loading review list:', error);
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => {
        loadReports();

        const interval = setInterval(loadReports, 30000);
        return () => clearInterval(interval);
    }, []);

    const renderItem = ({ item }: { item: Report }) => (
        <TouchableOpacity
            style={styles.card}
            onPress={() => onReviewReport(item)}
        >
            <View style={styles.cardHeader}>
                <View style={[styles.badge, { backgroundColor: '#e0f2fe' }]}>
                    <Text style={[styles.badgeText, { color: '#0369a1' }]}>
                        {t('verification_pending') || 'Verification Pending'}
                    </Text>
                </View>
                <Text style={styles.date}>{formatDate(item.repairCompletedAt || item.updatedAt)}</Text>
            </View>

            <View style={styles.contentRow}>
                {/* Proof Thumbnail */}
                <Image
                    source={{ uri: item.repairProofUri || item.photoUri }} // Fallback to original if proof missing (shouldn't happen here)
                    style={styles.thumbnail}
                />

                <View style={styles.details}>
                    <Text style={styles.type}>
                        {item.aiDetection?.damageType ? t(item.aiDetection.damageType) : t('unknown')}
                    </Text>
                    <Text style={styles.location} numberOfLines={2}>
                        {item.location.roadName || item.location.address || 'Unknown Location'}
                    </Text>
                    <Text style={styles.contractor}>
                        Contractor ID: {item.contractorId?.slice(0, 8) || 'N/A'}
                    </Text>
                </View>

                <Ionicons name="chevron-forward" size={24} color={COLORS.gray} />
            </View>

            <View style={styles.actionRow}>
                <Text style={styles.actionText}>Review Submission</Text>
                <Ionicons name="arrow-forward" size={16} color={COLORS.primary} />
            </View>
        </TouchableOpacity>
    );

    return (
        <DashboardLayout
            title="Review Pending Reports"
            role="rso"
            activeRoute="rso-review-list"
            onNavigate={onNavigate}
            onLogout={onLogout}
        >
            <FlatList
                data={reports}
                renderItem={renderItem}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listContainer}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={loadReports} />
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Ionicons name="checkmark-circle-outline" size={80} color={COLORS.success} />
                        <Text style={styles.emptyTitle}>All Caught Up!</Text>
                        <Text style={styles.emptySubtitle}>No reports pending verification.</Text>
                    </View>
                }
            />
        </DashboardLayout>
    );
}

const styles = StyleSheet.create({
    listContainer: {
        padding: 16,
        paddingBottom: 80,
    },
    card: {
        backgroundColor: COLORS.white,
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    badgeText: {
        fontSize: 12,
        fontWeight: 'bold',
    },
    date: {
        fontSize: 12,
        color: COLORS.gray,
    },
    contentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    thumbnail: {
        width: 60,
        height: 60,
        borderRadius: 8,
        backgroundColor: '#f1f5f9',
    },
    details: {
        flex: 1,
        marginLeft: 12,
    },
    type: {
        fontSize: 16,
        fontWeight: 'bold',
        color: COLORS.dark,
    },
    location: {
        fontSize: 14,
        color: COLORS.gray,
        marginTop: 2,
    },
    contractor: {
        fontSize: 12,
        color: '#64748b',
        marginTop: 4,
    },
    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        borderTopWidth: 1,
        borderTopColor: '#f1f5f9',
        paddingTop: 12,
    },
    actionText: {
        color: COLORS.primary,
        fontWeight: 'bold',
        marginRight: 4,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 80,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: COLORS.dark,
        marginTop: 16,
    },
    emptySubtitle: {
        fontSize: 16,
        color: COLORS.gray,
        marginTop: 8,
    }
});
