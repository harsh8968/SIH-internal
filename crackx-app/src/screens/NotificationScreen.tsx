import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../components/DashboardLayout';
import { COLORS } from '../constants';
import notificationService, { AppNotification } from '../services/notifications';
import authService from '../services/supabaseAuth';
import { formatDate } from '../utils';

interface NotificationScreenProps {
    onNavigate: (screen: string) => void;
    onLogout: () => void;
}

export default function NotificationScreen({ onNavigate, onLogout }: NotificationScreenProps) {
    const { t } = useTranslation();
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [loading, setLoading] = useState(true);
    const [userRole, setUserRole] = useState('');

    useEffect(() => {
        loadNotifications();
    }, []);

    const loadNotifications = async () => {
        setLoading(true);
        try {
            const user = await authService.getCurrentUser();
            if (user) {
                setUserRole(user.role);
                const data = await notificationService.getInAppNotifications(user.id);
                setNotifications(data);
            }
        } catch (error) {
            console.error('Error loading notifications:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleNotificationPress = async (notification: AppNotification) => {
        // Mark as read
        if (!notification.read) {
            await notificationService.markInAppRead(notification.id);
            // Update local state to reflect read status
            setNotifications(curr =>
                curr.map(n => n.id === notification.id ? { ...n, read: true } : n)
            );
        }

        // Handle navigation based on data
        if (notification.data && notification.data.reportId) {
            // For now, simple navigation. 
            // Ideally we'd pass reportId to a detail view.
            // But since our navigation is simple state-based, we might just go to 'MyReports' or 'Dashboard'
            // If we implemented a 'ReportDetail' screen, we'd go there.
            // Let's just alert for now or go to relevant dashboard.
            if (userRole === 'citizen') {
                onNavigate('MyReports');
            } else if (userRole === 'rso' || userRole === 'admin') {
                onNavigate('Dashboard');
            }
        }
    };

    const renderItem = ({ item }: { item: AppNotification }) => (
        <TouchableOpacity
            style={[styles.notificationCard, !item.read && styles.unreadCard]}
            onPress={() => handleNotificationPress(item)}
        >
            <View style={[styles.iconContainer, !item.read && styles.unreadIcon]}>
                <Ionicons
                    name={item.title.includes('Success') || item.title.includes('Completed') ? "checkmark-circle" : "notifications"}
                    size={24}
                    color={!item.read ? COLORS.primary : COLORS.gray}
                />
            </View>
            <View style={styles.textContainer}>
                <Text style={[styles.title, !item.read && styles.unreadText]}>{item.title}</Text>
                <Text style={styles.body}>{item.body}</Text>
                <Text style={styles.timestamp}>{formatDate(item.created_at)}</Text>
            </View>
            {!item.read && <View style={styles.unreadDot} />}
        </TouchableOpacity>
    );

    return (
        <DashboardLayout
            title={t('notifications')}
            role={userRole as any}
            activeRoute="Notifications"
            onNavigate={onNavigate}
            onLogout={onLogout}
        >
            <FlatList
                data={notifications}
                renderItem={renderItem}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listContent}
                refreshControl={
                    <RefreshControl refreshing={loading} onRefresh={loadNotifications} />
                }
                ListEmptyComponent={
                    !loading ? (
                        <View style={styles.emptyState}>
                            <Ionicons name="notifications-off-outline" size={64} color={COLORS.gray} />
                            <Text style={styles.emptyText}>{t('no_notifications') || 'No notifications yet'}</Text>
                        </View>
                    ) : null
                }
            />
        </DashboardLayout>
    );
}

const styles = StyleSheet.create({
    listContent: {
        padding: 16,
    },
    notificationCard: {
        flexDirection: 'row',
        backgroundColor: COLORS.white,
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
        alignItems: 'center', // Align items vertically center
        borderWidth: 1,
        borderColor: COLORS.border,
        // Shadow
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    unreadCard: {
        backgroundColor: '#eff6ff', // Light blue tint
        borderColor: COLORS.primary,
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#f1f5f9',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    unreadIcon: {
        backgroundColor: COLORS.white,
    },
    textContainer: {
        flex: 1,
    },
    title: {
        fontSize: 16,
        fontWeight: '600',
        color: COLORS.dark,
        marginBottom: 4,
    },
    unreadText: {
        fontWeight: 'bold',
        color: COLORS.primary,
    },
    body: {
        fontSize: 14,
        color: COLORS.gray,
        marginBottom: 6,
    },
    timestamp: {
        fontSize: 12,
        color: '#94a3b8',
    },
    unreadDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: COLORS.primary,
        marginLeft: 8,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 100,
        opacity: 0.5,
    },
    emptyText: {
        marginTop: 16,
        fontSize: 16,
        color: COLORS.gray,
    },
});
