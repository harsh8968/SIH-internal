import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../config/supabase';
import authService from './supabaseAuth';
import notificationService from './notifications';
import { Report } from '../types';

class RealtimeListenerService {
    private channel: RealtimeChannel | null = null;
    private notifChannel: RealtimeChannel | null = null;
    private userId: string | null = null;
    private userRole: string | null = null;
    private userZone: string | null = null;
    private onNotifyListeners: ((notif: any) => void)[] = [];

    /**
     * Component subscription
     */
    subscribeToNotifications(callback: (notif: any) => void) {
        this.onNotifyListeners.push(callback);
        return () => {
            this.onNotifyListeners = this.onNotifyListeners.filter(l => l !== callback);
        };
    }

    /**
     * Start listening for real-time updates based on user role
     */
    async startListening() {
        const user = await authService.getCurrentUser();
        if (!user) return;

        this.userId = user.id;
        this.userRole = user.role;
        this.userZone = user.zone || null;

        if (this.channel) {
            await this.stopListening();
        }

        console.log(`📡 Starting Realtime Listener for ${this.userRole} (${this.userId})`);

        this.channel = supabase
            .channel('public:reports')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'reports',
                },
                (payload) => {
                    this.handleDatabaseEvent(payload);
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('✅ Realtime Connected to Reports Table');
                }
            });

        // 2. Listen to Notifications Table specifically for this user
        this.notifChannel = supabase
            .channel(`public:notifications:${this.userId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${this.userId}`
                },
                (payload) => {
                    console.log('🔔 New In-App Notification Received:', payload.new);
                    this.onNotifyListeners.forEach(l => l(payload.new));
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('✅ Realtime Connected to Notifications Table');
                }
            });
    }

    /**
     * Handle incoming database events
     */
    private handleDatabaseEvent(payload: any) {
        const { eventType, new: newRecord, old: oldRecord } = payload;
        const record = newRecord as any;

        console.log('Reatime Event:', eventType, record?.id);

        // 1. CITIZEN NOTIFICATIONS
        if (this.userRole === 'citizen') {
            if ((eventType === 'UPDATE' || eventType === 'INSERT') && record.citizen_id === this.userId) {
                if (record.status === 'completed' && oldRecord?.status !== 'completed') {
                    notificationService.notifyStatusChange(record.id, 'completed');
                }
                if (record.status === 'in-progress' && oldRecord?.status !== 'in-progress') {
                    notificationService.notifyStatusChange(record.id, 'in-progress');
                }
            }
        }

        // 2. RSO NOTIFICATIONS
        if (this.userRole === 'rso') {
            if (eventType === 'INSERT' && record.status === 'pending') {
                if (this.userZone && record.location?.zone === this.userZone) {
                    const address = record.location.roadName || record.location.address || 'Unknown Location';
                    const type = record.aiDetection?.damageType || 'Road Damage';
                    notificationService.scheduleRSOAssignmentNotification(
                        record.id,
                        `${type} at ${address}`
                    );
                }
            }
        }

        // 3. ADMIN NOTIFICATIONS
        if (this.userRole === 'admin') {
            if (eventType === 'INSERT') {
                const zone = record.location?.zone || 'Unknown Zone';
                notificationService.scheduleNotification(
                    'New Report Logged',
                    `New report in ${zone}. ID: ${record.id.slice(-4)}`
                );
            }

            if (eventType === 'UPDATE' && record.status === 'completed' && oldRecord?.status !== 'completed') {
                notificationService.scheduleNotification(
                    'Work Completed',
                    `RSO ${record.rsoId || 'Unknown'} completed report #${record.id.slice(-4)}`
                );
            }
        }
    }

    /**
     * Stop listening
     */
    async stopListening() {
        if (this.channel) {
            await supabase.removeChannel(this.channel);
            this.channel = null;
        }
        if (this.notifChannel) {
            await supabase.removeChannel(this.notifChannel);
            this.notifChannel = null;
        }
    }
}

export default new RealtimeListenerService();
