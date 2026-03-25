import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, Report } from '../types';
import { STORAGE_KEYS, HARDCODED_DEMO_USERS } from '../constants';
import notificationService from './notifications';

class StorageService {
    // User Management
    async saveUser(user: User): Promise<void> {
        await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    }

    async getUser(): Promise<User | null> {
        const userStr = await AsyncStorage.getItem(STORAGE_KEYS.USER);
        return userStr ? JSON.parse(userStr) : null;
    }

    async removeUser(): Promise<void> {
        await AsyncStorage.removeItem(STORAGE_KEYS.USER);
    }

    // Registered Users
    async saveRegisteredUser(user: any): Promise<void> {
        // Was trying to save to backend, removed for now.


        const users = await this.getRegisteredUsers();
        if (!users.find(u => u.username === user.username)) {
            users.push(user);
            await AsyncStorage.setItem(STORAGE_KEYS.REGISTERED_USERS, JSON.stringify(users));
        }
    }

    async getRegisteredUsers(): Promise<any[]> {
        // DISABLE API OVERWRITE: Prioritize local storage to allow deletions/edits to persist.
        // The API sync should be additive or background only, not a hard overwrite.
        /*
        try {
            const onlineUsers = await apiService.fetchUsers();
            if (onlineUsers && onlineUsers.length > 0) {
                await AsyncStorage.setItem(STORAGE_KEYS.REGISTERED_USERS, JSON.stringify(onlineUsers));
                return onlineUsers;
            }
        } catch (e) {
            console.log('Offline: Loading local users');
        }
        */

        const usersStr = await AsyncStorage.getItem(STORAGE_KEYS.REGISTERED_USERS);
        let users = usersStr ? JSON.parse(usersStr) : [];

        // CHECK INITIALIZATION: Only seed demo users ONCE.
        const isInitialized = await AsyncStorage.getItem(STORAGE_KEYS.INITIALIZED);

        if (!isInitialized) {
            console.log('First Run: Seeding Demo Users');
            // Seed hardcoded users only on first run
            Object.values(HARDCODED_DEMO_USERS).forEach(demoUser => {
                if (!users.find((u: any) => u.username === demoUser.username)) {
                    users.push(demoUser);
                }
            });

            await AsyncStorage.setItem(STORAGE_KEYS.REGISTERED_USERS, JSON.stringify(users));
            await AsyncStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
        }

        return users;
    }

    async updateRegisteredUser(username: string, updates: any): Promise<void> {
        // 1. Save to local storage immediately (offline-first)
        const users = await this.getRegisteredUsers();
        const index = users.findIndex(u => u.username === username);
        if (index >= 0) {
            users[index] = { ...users[index], ...updates };
            await AsyncStorage.setItem(STORAGE_KEYS.REGISTERED_USERS, JSON.stringify(users));
            console.log(`[Storage] Updated user ${username} locally`);
        }

        // Backend sync removed (Legacy API).
        console.log(`[Storage] User ${username} saved locally.`);
    }


    async deleteRegisteredUser(username: string): Promise<void> {
        // Backend delete removed (Legacy API).

        // Get local users directly to avoid re-fetching stale data from backend
        const usersStr = await AsyncStorage.getItem(STORAGE_KEYS.REGISTERED_USERS);
        const users = usersStr ? JSON.parse(usersStr) : [];

        const filteredUsers = users.filter((u: any) => u.username !== username);
        await AsyncStorage.setItem(STORAGE_KEYS.REGISTERED_USERS, JSON.stringify(filteredUsers));
    }

    // Reports Management
    async saveReport(report: Report): Promise<void> {
        const reports = await this.getReports();
        const existingIndex = reports.findIndex(r => r.id === report.id);

        if (existingIndex >= 0) {
            reports[existingIndex] = report;
            // Notify if completed
            if (report.status === 'completed' && reports[existingIndex].status !== 'completed') {
                notificationService.scheduleCompletionNotification(report.id);
            }
        } else {
            reports.push(report);
            notificationService.scheduleReportSubmissionNotification(report.id);
        }

        await AsyncStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports));

        // Backend post removed (Legacy API).
    }

    async getReports(): Promise<Report[]> {
        // PREVENT AUTO-REFILL: Prioritize local storage. 
        // Only fetch from API if explicitly requested or via background sync.
        // The previous logic blindly overwrote local approvals with stale backend data.
        /*
        try {
            const onlineReports = await apiService.fetchReports();
            if (onlineReports && onlineReports.length > 0) {
                await AsyncStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(onlineReports));
                return onlineReports;
            }
        } catch (e) {
            console.log('Offline mode: Loading local reports');
        }
        */

        const reportsStr = await AsyncStorage.getItem(STORAGE_KEYS.REPORTS);
        return reportsStr ? JSON.parse(reportsStr) : [];
    }

    async getReportById(id: string): Promise<Report | null> {
        const reports = await this.getReports();
        return reports.find(r => r.id === id) || null;
    }

    async getReportsByZone(zone: string): Promise<Report[]> {
        const reports = await this.getReports();
        return reports.filter(r => r.location.zone === zone);
    }

    async getReportsByCitizen(citizenId: string): Promise<Report[]> {
        const reports = await this.getReports();
        return reports.filter(r => r.citizenId === citizenId);
    }

    async deleteReport(id: string): Promise<void> {
        const reports = await this.getReports();
        const filtered = reports.filter(r => r.id !== id);
        await AsyncStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(filtered));
    }

    // Sync Queue Management
    async addToSyncQueue(reportId: string): Promise<void> {
        const queue = await this.getSyncQueue();
        if (!queue.includes(reportId)) {
            queue.push(reportId);
            await AsyncStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify(queue));
        }
    }

    async getSyncQueue(): Promise<string[]> {
        const queueStr = await AsyncStorage.getItem(STORAGE_KEYS.SYNC_QUEUE);
        return queueStr ? JSON.parse(queueStr) : [];
    }

    async removeFromSyncQueue(reportId: string): Promise<void> {
        const queue = await this.getSyncQueue();
        const filtered = queue.filter(id => id !== reportId);
        await AsyncStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify(filtered));
    }

    async clearSyncQueue(): Promise<void> {
        await AsyncStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify([]));
    }

    // Location Permission
    async saveLocationPermission(granted: boolean): Promise<void> {
        await AsyncStorage.setItem(STORAGE_KEYS.LOCATION_PERMISSION, JSON.stringify(granted));
    }

    async getLocationPermission(): Promise<boolean | null> {
        const permStr = await AsyncStorage.getItem(STORAGE_KEYS.LOCATION_PERMISSION);
        return permStr ? JSON.parse(permStr) : null;
    }

    // Clear All Data
    async clearAll(): Promise<void> {
        await AsyncStorage.clear();
    }
}

export default new StorageService();
