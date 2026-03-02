/**
 * Enhanced Push Notifications Service
 * Handles Expo Push Notifications for real-time alerts
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Report } from '../types';

export interface AppNotification {
    id: string;
    user_id: string;
    title: string;
    body: string;
    data?: any;
    read: boolean;
    created_at: string;
}

export interface PushNotification {
    id: string;
    title: string;
    body: string;
    data?: any;
    timestamp: string;
    read: boolean;
}

class NotificationService {
    private readonly STORAGE_KEY = '@crackx_notifications';
    private readonly TOKEN_KEY = '@crackx_push_token';
    private expoPushToken: string | null = null;
    private supabase: any = null;

    constructor() {
        this.configureNotifications();
    }

    setSupabase(client: any) {
        this.supabase = client;
    }

    private configureNotifications() {
        Notifications.setNotificationHandler({
            handleNotification: async () => ({
                shouldShowAlert: true,
                shouldPlaySound: true,
                shouldSetBadge: true,
                shouldShowBanner: true,
                shouldShowList: true,
            }),
        });

        if (Platform.OS === 'android') {
            Notifications.setNotificationChannelAsync('default', {
                name: 'default',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#FF231F7C',
            });

            // High priority channel
            Notifications.setNotificationChannelAsync('high-priority', {
                name: 'High Priority Alerts',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 500, 250, 500],
                lightColor: '#ef4444',
                sound: 'default',
            });
        }
    }

    async requestPermissions() {
        const { status } = await Notifications.requestPermissionsAsync();
        return status === 'granted';
    }

    /**
     * Register for push notifications and get Expo token
     */
    async registerForPushNotifications(): Promise<string | null> {
        try {
            if (!Device.isDevice) {
                console.log('Push notifications only work on physical devices');
                return null;
            }

            const { status: existingStatus } = await Notifications.getPermissionsAsync();
            let finalStatus = existingStatus;

            if (existingStatus !== 'granted') {
                const { status } = await Notifications.requestPermissionsAsync();
                finalStatus = status;
            }

            if (finalStatus !== 'granted') {
                console.log('Permission to receive notifications was denied');
                return null;
            }

            const token = (await Notifications.getExpoPushTokenAsync()).data;
            this.expoPushToken = token;
            await AsyncStorage.setItem(this.TOKEN_KEY, token);

            console.log('✅ Push notification token registered:', token);
            return token;
        } catch (error) {
            console.error('Error registering for push notifications:', error);
            return null;
        }
    }

    async scheduleReportSubmissionNotification(reportId: string) {
        // 1. Local Push
        const id = await Notifications.scheduleNotificationAsync({
            content: {
                title: "Report Submitted 🚀",
                body: `Your report #${reportId.slice(-4)} has been submitted successfully to the zone office.`,
                data: { reportId, type: 'submission' },
            },
            trigger: null,
        });

        // 2. Persist to Supabase (In-App Hub)
        const user = await import('./supabaseAuth').then(m => m.default.getCurrentUser());
        if (user) {
            await this.createInAppNotification(
                user.id,
                "Report Submitted 🚀",
                `Your report #${reportId.slice(-4)} has been submitted successfully`,
                { reportId, type: 'submission' }
            );
        }
    }

    async scheduleRSOAssignmentNotification(reportId: string, address: string) {
        const id = await Notifications.scheduleNotificationAsync({
            content: {
                title: "New Task Assigned 🚧",
                body: `New damage report at ${address} requires your attention.`,
                data: { reportId, type: 'assignment' },
            },
            trigger: null,
        });

        const user = await import('./supabaseAuth').then(m => m.default.getCurrentUser());
        if (user) {
            await this.createInAppNotification(
                user.id,
                "New Task Assigned 🚧",
                `New damage report at ${address}`,
                { reportId, type: 'assignment' }
            );
        }
    }

    async scheduleCompletionNotification(reportId: string) {
        const id = await Notifications.scheduleNotificationAsync({
            content: {
                title: "Repair Verified ✅",
                body: `Report #${reportId.slice(-4)} marked as completed. Great work!`,
                data: { reportId, type: 'completion' },
            },
            trigger: null,
        });

        const user = await import('./supabaseAuth').then(m => m.default.getCurrentUser());
        if (user) {
            await this.createInAppNotification(
                user.id,
                "Repair Verified ✅",
                `Report #${reportId.slice(-4)} completed`,
                { reportId, type: 'completion' }
            );
        }
    }

    async createInAppNotification(userId: string, title: string, body: string, data: any = {}) {
        if (!this.supabase) {
            console.error('[NotificationService] Supabase client not set');
            return;
        }

        try {
            const { error } = await this.supabase
                .from('notifications')
                .insert({
                    user_id: userId,
                    title,
                    body,
                    data,
                    read: false,
                    created_at: new Date().toISOString()
                });

            if (error) throw error;
            console.log(`[NotificationService] Created notification for user ${userId}`);
        } catch (error) {
            console.error('[NotificationService] Error creating notification:', error);
        }
    }

    async notifyAdmins(title: string, body: string, data: any = {}) {
        if (!this.supabase) return;
        try {
            const { data: admins } = await this.supabase
                .from('users')
                .select('id')
                .eq('role', 'admin');

            if (admins) {
                for (const admin of admins) {
                    await this.createInAppNotification(admin.id, title, body, data);
                }
            }
        } catch (error) {
            console.error('[NotificationService] Error notifying admins:', error);
        }
    }

    async notifyZoneRSOs(zone: string, title: string, body: string, data: any = {}) {
        if (!this.supabase) return;
        try {
            const { data: rsos } = await this.supabase
                .from('users')
                .select('id')
                .eq('role', 'rso')
                .eq('zone', zone);

            if (rsos) {
                for (const rso of rsos) {
                    await this.createInAppNotification(rso.id, title, body, data);
                }
            }
        } catch (error) {
            console.error('[NotificationService] Error notifying zone RSOs:', error);
        }
    }

    async getInAppNotifications(userId: string): Promise<AppNotification[]> {
        if (!this.supabase) return [];
        try {
            const { data, error } = await this.supabase
                .from('notifications')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('[NotificationService] Error fetching notifications:', error);
            return [];
        }
    }

    async markInAppRead(notificationId: string) {
        if (!this.supabase) return;
        try {
            await this.supabase
                .from('notifications')
                .update({ read: true })
                .eq('id', notificationId);
        } catch (error) {
            console.error('[NotificationService] Error marking read:', error);
        }
    }

    async notifyStatusChange(reportId: string, newStatus: string): Promise<void> {
        const statusMessages: Record<string, { title: string; body: string }> = {
            pending: {
                title: 'Report Received',
                body: 'Your road damage report is pending review.',
            },
            'in-progress': {
                title: 'Repair Started!',
                body: 'Repair work on your reported road damage has begun.',
            },
            completed: {
                title: '✅ Repair Completed',
                body: 'The road damage you reported has been fixed!',
            },
        };

        const message = statusMessages[newStatus];
        if (message) {
            // Local Push
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: message.title,
                    body: message.body,
                    data: { reportId, type: 'status_change', status: newStatus },
                },
                trigger: null,
            });

            // Persist to Supabase
            const user = await import('./supabaseAuth').then(m => m.default.getCurrentUser());
            if (user) {
                await this.createInAppNotification(
                    user.id,
                    message.title,
                    message.body,
                    { reportId, type: 'status_change', status: newStatus }
                );
            }
        }
    }

    async scheduleNotification(title: string, body: string, data: any = {}) {
        await Notifications.scheduleNotificationAsync({
            content: {
                title,
                body,
                data,
            },
            trigger: null,
        });

        const user = await import('./supabaseAuth').then(m => m.default.getCurrentUser());
        if (user) {
            await this.createInAppNotification(
                user.id,
                title,
                body,
                data
            );
        }
    }

    /**
     * Get all notifications
     */
    async getNotifications(): Promise<PushNotification[]> {
        try {
            const notificationsJson = await AsyncStorage.getItem(this.STORAGE_KEY);
            if (!notificationsJson) return [];
            const notifications: PushNotification[] = JSON.parse(notificationsJson);
            return notifications.sort(
                (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );
        } catch (error) {
            return [];
        }
    }

    /**
     * Get unread count
     */
    async getUnreadCount(): Promise<number> {
        const notifications = await this.getNotifications();
        return notifications.filter((n) => !n.read).length;
    }

    /**
     * Mark as read
     */
    async markAsRead(notificationId: string): Promise<void> {
        try {
            const notifications = await this.getNotifications();
            const updated = notifications.map((n) =>
                n.id === notificationId ? { ...n, read: true } : n
            );
            await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(updated));
        } catch (error) {
            console.error('Error marking notification as read:', error);
        }
    }

    /**
     * Mark all as read
     */
    async markAllAsRead(): Promise<void> {
        try {
            const notifications = await this.getNotifications();
            const updated = notifications.map((n) => ({ ...n, read: true }));
            await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(updated));
        } catch (error) {
            console.error('Error marking all as read:', error);
        }
    }

    /**
     * Save notification to storage
     */
    private async saveNotificationToStorage(notification: PushNotification): Promise<void> {
        try {
            const notifications = await this.getNotifications();
            notifications.unshift(notification);
            const trimmed = notifications.slice(0, 100);
            await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(trimmed));
        } catch (error) {
            console.error('Error saving notification:', error);
        }
    }

    /**
     * Get push token
     */
    async getPushToken(): Promise<string | null> {
        if (this.expoPushToken) return this.expoPushToken;
        try {
            const token = await AsyncStorage.getItem(this.TOKEN_KEY);
            this.expoPushToken = token;
            return token;
        } catch (error) {
            return null;
        }
    }
}

export default new NotificationService();
