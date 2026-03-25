import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, Report } from '../types';
import { STORAGE_KEYS, HARDCODED_DEMO_USERS } from '../constants';
import supabase from '../config/supabase';
import notificationService from './notifications';

/**
 * Supabase-powered Storage Service
 * Replaces local AsyncStorage with cloud database
 * Falls back to AsyncStorage for offline support
 */
class SupabaseStorageService {
    private isOnline: boolean = true;

    constructor() {
        this.checkConnection();
        // Initialize notification service
        notificationService.setSupabase(supabase);
    }

    private async checkConnection(): Promise<void> {
        try {
            const { error } = await supabase.from('users').select('count').limit(1);
            this.isOnline = !error;
        } catch (e) {
            this.isOnline = false;
        }
    }

    // ==================== USER MANAGEMENT ====================

    /**
     * Save current logged-in user to local session
     */
    async saveUser(user: User): Promise<void> {
        await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    }

    /**
     * Get current logged-in user from local session
     */
    async getUser(): Promise<User | null> {
        const userStr = await AsyncStorage.getItem(STORAGE_KEYS.USER);
        return userStr ? JSON.parse(userStr) : null;
    }

    /**
     * Remove current user session
     */
    async removeUser(): Promise<void> {
        await AsyncStorage.removeItem(STORAGE_KEYS.USER);
    }

    // ==================== REGISTERED USERS ====================

    /**
     * Register a new user in Supabase
     */
    async saveRegisteredUser(user: any): Promise<void> {
        try {
            // Insert into Supabase
            const { data, error } = await supabase
                .from('users')
                .upsert({
                    id: user.id,
                    username: user.username,
                    password: user.password, // In production, hash this!
                    role: user.role,
                    zone: user.zone,
                    is_approved: user.isApproved !== false,
                    points: user.points || 0,
                    admin_points_pool: user.adminPointsPool || 0,
                    created_at: new Date().toISOString(),
                })
                .select()
                .single();

            if (error) throw error;

            console.log(`[Supabase] User ${user.username} saved successfully`);

            // Also save to local cache for offline access
            const users = await this.getLocalUsers();
            const index = users.findIndex(u => u.username === user.username);
            if (index >= 0) {
                users[index] = user;
            } else {
                users.push(user);
            }
            await AsyncStorage.setItem(STORAGE_KEYS.REGISTERED_USERS, JSON.stringify(users));
        } catch (error) {
            console.error('[Supabase] Error saving user:', error);
            // Fallback to local storage
            const users = await this.getLocalUsers();
            if (!users.find(u => u.username === user.username)) {
                users.push(user);
                await AsyncStorage.setItem(STORAGE_KEYS.REGISTERED_USERS, JSON.stringify(users));
            }
        }
    }

    /**
     * Get all registered users from Supabase
     */
    async getRegisteredUsers(): Promise<any[]> {
        try {
            // Try to fetch from Supabase first
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Transform Supabase data to app format
            const users = data.map(user => ({
                id: user.id,
                username: user.username,
                password: user.password,
                role: user.role,
                zone: user.zone,
                isApproved: user.is_approved,
                points: user.points || 0,
                adminPointsPool: user.admin_points_pool || 0,
                contractorId: user.contractor_id,
            }));

            // Update local cache
            await AsyncStorage.setItem(STORAGE_KEYS.REGISTERED_USERS, JSON.stringify(users));

            // Ensure demo users are included
            Object.values(HARDCODED_DEMO_USERS).forEach(demoUser => {
                if (!users.find(u => u.username === demoUser.username)) {
                    users.push(demoUser);
                }
            });

            return users;
        } catch (error) {
            console.error('[Supabase] Error fetching users, using local cache:', error);
            return this.getLocalUsers();
        }
    }

    /**
     * Get users from local AsyncStorage (offline fallback)
     */
    private async getLocalUsers(): Promise<any[]> {
        const usersStr = await AsyncStorage.getItem(STORAGE_KEYS.REGISTERED_USERS);
        let users = usersStr ? JSON.parse(usersStr) : [];

        Object.values(HARDCODED_DEMO_USERS).forEach(demoUser => {
            if (!users.find((u: any) => u.username === demoUser.username)) {
                users.push(demoUser);
            }
        });
        await AsyncStorage.setItem(STORAGE_KEYS.REGISTERED_USERS, JSON.stringify(users));

        return users;
    }

    /**
     * Update a registered user in Supabase
     */
    async updateRegisteredUser(username: string, updates: any): Promise<void> {
        try {
            // Construct payload dynamically to avoid overwriting with undefined/null
            const updatePayload: any = { updated_at: new Date().toISOString() };
            if (updates.isApproved !== undefined) updatePayload.is_approved = updates.isApproved;
            if (updates.points !== undefined) updatePayload.points = updates.points;
            if (updates.adminPointsPool !== undefined) updatePayload.admin_points_pool = updates.adminPointsPool;
            if (updates.zone !== undefined) updatePayload.zone = updates.zone;

            // Update in Supabase
            const { data, error } = await supabase
                .from('users')
                .update(updatePayload)
                .eq('username', username)
                .select()
                .single();

            if (error) throw error;

            console.log(`[Supabase] User ${username} updated successfully`);

            // Update local cache
            const users = await this.getLocalUsers();
            const index = users.findIndex(u => u.username === username);
            if (index >= 0) {
                users[index] = { ...users[index], ...updates };
                await AsyncStorage.setItem(STORAGE_KEYS.REGISTERED_USERS, JSON.stringify(users));
            }
        } catch (error) {
            console.error(`[Supabase] Error updating user ${username}:`, error);
            // Fallback to local update
            const users = await this.getLocalUsers();
            const index = users.findIndex(u => u.username === username);
            if (index >= 0) {
                users[index] = { ...users[index], ...updates };
                await AsyncStorage.setItem(STORAGE_KEYS.REGISTERED_USERS, JSON.stringify(users));
            }
        }
    }

    /**
     * Delete a registered user from Supabase and cascade delete their data
     */
    async deleteRegisteredUser(username: string): Promise<void> {
        try {
            // 1. Get User ID first (needed for foreign key deletions)
            const { data: userData } = await supabase
                .from('users')
                .select('id')
                .eq('username', username)
                .single();

            if (userData?.id) {
                console.log(`[Supabase] Cascading delete for user ${username} (${userData.id})...`);

                // 2. Delete related Notifications
                await supabase.from('notifications').delete().eq('user_id', userData.id);

                // 3. Delete related Reports (Citizen Reports)
                await supabase.from('reports').delete().eq('citizen_id', userData.id);

                // 4. Delete related Reports (Assigned RSO) - Optional: Set to null instead?
                // For now, we just unassign them or let the frontend handle reassignment.
                // But to be safe, we'll leave RSO ID as is or nullify if your schema supports it.
                // If strict foreign key, we might need to update reports first:
                await supabase.from('reports').update({ rso_id: null }).eq('rso_id', userData.id);
            }

            // 5. Finally, Delete User
            const { error } = await supabase
                .from('users')
                .delete()
                .eq('username', username);

            if (error) throw error;

            console.log(`[Supabase] User ${username} deleted successfully`);

            // Delete from local cache
            const users = await this.getLocalUsers();
            const filtered = users.filter(u => u.username !== username);
            await AsyncStorage.setItem(STORAGE_KEYS.REGISTERED_USERS, JSON.stringify(filtered));
        } catch (error) {
            console.error(`[Supabase] Error deleting user ${username}:`, error);
            // Fallback to local delete
            const users = await this.getLocalUsers();
            const filtered = users.filter(u => u.username !== username);
            await AsyncStorage.setItem(STORAGE_KEYS.REGISTERED_USERS, JSON.stringify(filtered));
        }
    }

    // ==================== REPORTS MANAGEMENT ====================

    /**
     * Save a report to Supabase
     */
    async saveReport(report: Report): Promise<void> {
        try {
            // Save to Supabase
            console.log(`[Supabase] Upserting report ${report.id} with status ${report.status}...`);
            const { data, error } = await supabase
                .from('reports')
                .upsert({
                    id: report.id,
                    citizen_id: report.citizenId,
                    reporting_mode: report.reportingMode,
                    location: report.location,
                    photo_uri: report.photoUri,
                    video_uri: report.videoUri,
                    ai_detection: report.aiDetection,
                    status: report.status,
                    sync_status: 'synced',
                    created_at: report.createdAt,
                    updated_at: new Date().toISOString(),
                    repair_proof_uri: report.repairProofUri,
                    repair_completed_at: report.repairCompletedAt,

                    report_approved_for_points: report.reportApprovedForPoints,
                    repair_approved_for_points: report.repairApprovedForPoints,
                    rso_id: report.rsoId,
                    citizen_feedback: report.citizenFeedback,
                    assigned_department: report.assignedDepartment,
                    origin_department: report.originDepartment || 'Engineering',
                    root_cause: report.rootCause,
                    utility_type: report.utilityType,
                    contractor_id: report.contractorId,
                    work_order_generated_at: report.workOrderGeneratedAt,
                })
                .select()
                .single();

            if (error) {
                console.error(`[Supabase] Upsert failed for report ${report.id}:`, error);
                throw error;
            }

            console.log(`[Supabase] Report ${report.id} saved successfully with status: ${report.status}`);

            // TRIGGER NOTIFICATIONS
            try {
                if (report.status === 'pending') {
                    // Notify Zone RSO and Admins about NEW report
                    const zone = report.location.zone;
                    const coords = `@ ${report.location.latitude.toFixed(4)}, ${report.location.longitude.toFixed(4)}`;
                    const road = report.location.roadName || 'Unknown Road';

                    if (zone) {
                        await notificationService.notifyZoneRSOs(
                            zone,
                            "New Complaint Assigned 🚨",
                            `New ${report.aiDetection?.damageType || 'damage'} reported at ${road} (${coords})`,
                            {
                                reportId: report.id,
                                latitude: report.location.latitude,
                                longitude: report.location.longitude
                            }
                        );
                    }

                    await notificationService.notifyAdmins(
                        "New Citizen Report 📑",
                        `A new report has been submitted in ${zone || 'Unknown Area'} at ${road}`,
                        { reportId: report.id }
                    );
                } else if (report.status === 'completed') {
                    // Notify Citizen and Admins about COMPLETED repair
                    await notificationService.createInAppNotification(
                        report.citizenId,
                        "Repair Complete! ✅",
                        `Your reported road issue at ${report.location.roadName || 'the site'} has been fixed by RSO.`,
                        { reportId: report.id, type: 'completion' }
                    );

                    await notificationService.notifyAdmins(
                        "Repair Solved 🛠️",
                        `RSO has uploaded a solution for report #${report.id.slice(-6).toUpperCase()}`,
                        { reportId: report.id }
                    );
                }
            } catch (notifError) {
                console.error('[Supabase] Notification trigger failed:', notifError);
            }

            // Update local cache
            const reports = await this.getLocalReports();
            const existingIndex = reports.findIndex(r => r.id === report.id);
            if (existingIndex >= 0) {
                reports[existingIndex] = { ...report, syncStatus: 'synced' };
                if (report.status === 'completed' && reports[existingIndex].status !== 'completed') {
                    notificationService.scheduleCompletionNotification(report.id);
                }
            } else {
                reports.push({ ...report, syncStatus: 'synced' });
                notificationService.scheduleReportSubmissionNotification(report.id);
            }
            await AsyncStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports));
        } catch (error) {
            console.error('[Supabase] Error saving report:', error);
            // Fallback to local storage with pending sync
            const reports = await this.getLocalReports();
            const existingIndex = reports.findIndex(r => r.id === report.id);
            if (existingIndex >= 0) {
                reports[existingIndex] = { ...report, syncStatus: 'pending' };
            } else {
                reports.push({ ...report, syncStatus: 'pending' });
            }
            await AsyncStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports));
            await this.addToSyncQueue(report.id);
        }
    }

    /**
     * Get all reports from Supabase
     */
    async getReports(): Promise<Report[]> {
        try {
            const { data, error } = await supabase
                .from('reports')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Transform Supabase data to app format
            const reports = data.map(report => ({
                id: report.id,
                citizenId: report.citizen_id,
                reportingMode: report.reporting_mode,
                location: report.location,
                photoUri: report.photo_uri,
                videoUri: report.video_uri,
                aiDetection: report.ai_detection,
                status: report.status,
                syncStatus: 'synced' as const,
                createdAt: report.created_at,
                updatedAt: report.updated_at,
                repairProofUri: report.repair_proof_uri,
                repairCompletedAt: report.repair_completed_at,

                reportApprovedForPoints: report.report_approved_for_points,
                repairApprovedForPoints: report.repair_approved_for_points,
                rsoId: report.rso_id,
                citizenRating: report.citizen_rating,
                citizenFeedback: report.citizen_feedback,
                assignedDepartment: report.assigned_department,
                originDepartment: report.origin_department,
                rootCause: report.root_cause,
                utilityType: report.utility_type,
                contractorId: report.contractor_id,
                workOrderGeneratedAt: report.work_order_generated_at,
            }));

            // Update local cache
            await AsyncStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports));

            return reports;
        } catch (error) {
            console.error('[Supabase] Error fetching reports, using local cache:', error);
            return this.getLocalReports();
        }
    }

    /**
     * Get reports from local AsyncStorage (offline fallback)
     */
    private async getLocalReports(): Promise<Report[]> {
        const reportsStr = await AsyncStorage.getItem(STORAGE_KEYS.REPORTS);
        return reportsStr ? JSON.parse(reportsStr) : [];
    }

    /**
     * Get a single report by ID
     */
    async getReportById(id: string): Promise<Report | null> {
        const reports = await this.getReports();
        return reports.find(r => r.id === id) || null;
    }

    /**
     * Get reports by zone
     */
    async getReportsByZone(zone: string): Promise<Report[]> {
        try {
            const { data, error } = await supabase
                .from('reports')
                .select('*')
                .eq('location->>zone', zone)
                .order('created_at', { ascending: false });

            if (error) throw error;

            return data.map(report => ({
                id: report.id,
                citizenId: report.citizen_id,
                reportingMode: report.reporting_mode,
                location: report.location,
                photoUri: report.photo_uri,
                videoUri: report.video_uri,
                aiDetection: report.ai_detection,
                status: report.status,
                syncStatus: 'synced' as const,
                createdAt: report.created_at,
                updatedAt: report.updated_at,
                repairProofUri: report.repair_proof_uri,
                repairCompletedAt: report.repair_completed_at,

                reportApprovedForPoints: report.report_approved_for_points,
                repairApprovedForPoints: report.repair_approved_for_points,
                rsoId: report.rso_id,
                citizenRating: report.citizen_rating,
                citizenFeedback: report.citizen_feedback,
                assignedDepartment: report.assigned_department,
                originDepartment: report.origin_department,
                rootCause: report.root_cause,
                utilityType: report.utility_type,
                contractorId: report.contractor_id,
                workOrderGeneratedAt: report.work_order_generated_at,
            }));
        } catch (error) {
            console.error('[Supabase] Error fetching reports by zone:', error);
            const reports = await this.getReports();
            return reports.filter(r => r.location.zone === zone);
        }
    }

    /**
     * Get reports by citizen
     */
    async getReportsByCitizen(citizenId: string): Promise<Report[]> {
        try {
            const { data, error } = await supabase
                .from('reports')
                .select('*')
                .eq('citizen_id', citizenId)
                .order('created_at', { ascending: false });

            if (error) throw error;

            return data.map(report => ({
                id: report.id,
                citizenId: report.citizen_id,
                reportingMode: report.reporting_mode,
                location: report.location,
                photoUri: report.photo_uri,
                videoUri: report.video_uri,
                aiDetection: report.ai_detection,
                status: report.status,
                syncStatus: 'synced' as const,
                createdAt: report.created_at,
                updatedAt: report.updated_at,
                repairProofUri: report.repair_proof_uri,
                repairCompletedAt: report.repair_completed_at,

                reportApprovedForPoints: report.report_approved_for_points,
                repairApprovedForPoints: report.repair_approved_for_points,
                rsoId: report.rso_id,
                citizenRating: report.citizen_rating,
                citizenFeedback: report.citizen_feedback,
                assignedDepartment: report.assigned_department,
                originDepartment: report.origin_department,
                rootCause: report.root_cause,
                utilityType: report.utility_type,
                contractorId: report.contractor_id,
                workOrderGeneratedAt: report.work_order_generated_at,
            }));
        } catch (error) {
            console.error('[Supabase] Error fetching reports by citizen:', error);
            const reports = await this.getReports();
            return reports.filter(r => r.citizenId === citizenId);
        }
    }

    /**
     * Delete a report
     */
    async deleteReport(id: string): Promise<void> {
        try {
            const { error } = await supabase
                .from('reports')
                .delete()
                .eq('id', id);

            if (error) throw error;

            console.log(`[Supabase] Report ${id} deleted successfully`);

            // Delete from local cache
            const reports = await this.getLocalReports();
            const filtered = reports.filter(r => r.id !== id);
            await AsyncStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(filtered));
        } catch (error) {
            console.error(`[Supabase] Error deleting report ${id}:`, error);
            // Fallback to local delete
            const reports = await this.getLocalReports();
            const filtered = reports.filter(r => r.id !== id);
            await AsyncStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(filtered));
        }
    }

    // ==================== SYNC QUEUE MANAGEMENT ====================

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

    // ==================== LOCATION PERMISSION ====================

    async saveLocationPermission(granted: boolean): Promise<void> {
        await AsyncStorage.setItem(STORAGE_KEYS.LOCATION_PERMISSION, JSON.stringify(granted));
    }

    async getLocationPermission(): Promise<boolean | null> {
        const permStr = await AsyncStorage.getItem(STORAGE_KEYS.LOCATION_PERMISSION);
        return permStr ? JSON.parse(permStr) : null;
    }

    // ==================== UTILITY ====================

    async clearAll(): Promise<void> {
        await AsyncStorage.clear();
    }


    // ==================== CONTRACTORS ====================

    /**
     * Get contractors by zone
     */
    async getContractorsByZone(zone: string): Promise<any[]> {
        try {
            const { data, error } = await supabase
                .from('contractors')
                .select('*')
                .eq('zone', zone)
                .order('rating', { ascending: false });

            if (error) throw error;

            return data.map(c => ({
                id: c.id,
                name: c.name,
                agencyName: c.agency_name,
                licenseNumber: c.license_number,
                rating: c.rating,
                zone: c.zone
            }));
        } catch (error) {
            console.error('[Supabase] Error fetching contractors:', error);
            return [];
        }
    }

    /**
     * Submit repair proof (Contractor specific functionality)
     * Uses UPDATE instead of UPSERT to avoid RLS issues on immutable columns
     */
    async submitRepairProof(reportId: string, proofUri: string): Promise<void> {
        try {
            console.log(`[Supabase] Submitting repair proof for ${reportId}...`);
            const { error } = await supabase
                .from('reports')
                .update({
                    status: 'in-progress', // Use in-progress + proofUri to indicate verification pending (avoid enum errors)
                    repair_proof_uri: proofUri,
                    repair_completed_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', reportId);

            if (error) throw error;
            console.log(`[Supabase] Repair proof submitted successfully`);

            // Update local cache
            const reports = await this.getLocalReports();
            const index = reports.findIndex(r => r.id === reportId);
            if (index >= 0) {
                reports[index] = {
                    ...reports[index],
                    status: 'in-progress',
                    repairProofUri: proofUri,
                    repairCompletedAt: new Date().toISOString()
                };
                await AsyncStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports));
            }
        } catch (error) {
            console.error('[Supabase] Error submitting repair proof:', error);
            throw error;
        }
    }

    /**
     * Review report (RSO functionality)
     * targeted update for status and proof verification
     */
    async reviewReport(reportId: string, status: 'completed' | 'in-progress', proofUri: string | null): Promise<void> {
        try {
            console.log(`[Supabase] RSO reviewing report ${reportId} -> ${status}`);
            const updatePayload: any = {
                status: status,
                repair_proof_uri: proofUri,
                updated_at: new Date().toISOString()
            };

            if (status === 'completed') {
                updatePayload.repair_completed_at = new Date().toISOString();
            }

            const { error } = await supabase
                .from('reports')
                .update(updatePayload)
                .eq('id', reportId);

            if (error) throw error;
            console.log(`[Supabase] Report review saved successfully`);

            // Update local cache
            const reports = await this.getLocalReports();
            const index = reports.findIndex(r => r.id === reportId);
            if (index >= 0) {
                reports[index] = {
                    ...reports[index],
                    status: status,
                    repairProofUri: proofUri as string, // Cast for local type
                    repairCompletedAt: status === 'completed' ? new Date().toISOString() : reports[index].repairCompletedAt
                };
                await AsyncStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports));
            }
        } catch (error) {
            console.error('[Supabase] Error reviewing report:', error);
            throw error;
        }
    }
}

export default new SupabaseStorageService();
