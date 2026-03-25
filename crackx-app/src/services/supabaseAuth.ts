import { User, UserRole } from '../types';
import { DEMO_CREDENTIALS, HARDCODED_DEMO_USERS } from '../constants';
import supabaseStorage from './supabaseStorage';

/**
 * Authentication Service with Supabase Integration
 * Handles login, registration, and session management
 */
class SupabaseAuthService {
    /**
     * Login with demo credentials or registered users
     * Syncs with Supabase to get latest data (points, etc.)
     */
    async login(username: string, password: string): Promise<User | null> {
        let user: User | null = null;
        const normalizedUsername = username.trim().toLowerCase();

        console.log(`[Auth] Login attempt: ${normalizedUsername}`);

        // 0. Check Hardcoded Permanent Demo Users (Master Fallbacks)
        const hardcoded = HARDCODED_DEMO_USERS[normalizedUsername];
        if (hardcoded && hardcoded.password === password) {
            // Check if we have a persisted version in Supabase (with points)
            const registeredUsers = await supabaseStorage.getRegisteredUsers();
            const persisted = registeredUsers.find(u => u.username === normalizedUsername);

            if (persisted) {
                console.log(`[Auth] Using Supabase data for demo user: ${normalizedUsername}`);
                const { password: _, ...rest } = persisted;
                user = rest as User;
            } else {
                console.log(`[Auth] Hardcoded user found: ${normalizedUsername}`);
                const { password: _, ...userData } = hardcoded;
                user = userData as User;

                // Save to Supabase for future persistence
                await supabaseStorage.saveRegisteredUser(hardcoded);
            }
        }
        // 1. Check Generic Demo Credentials
        else if (normalizedUsername === DEMO_CREDENTIALS.username.toLowerCase() && password === DEMO_CREDENTIALS.password) {
            // NOTE: Generic demo user logic is tricky without role selection. 
            // Defaulting to citizen for safety unless we want to keep role selection just for demo user?
            // The user asked to remove account selection.
            // Let's assume generic demo login is now primarily for quick citizen access or we disable it.
            // For now, let's default 'demo' user to 'citizen'.
            console.log(`[Auth] Generic demo user found`);
            user = {
                id: `demo_citizen_${Date.now()}`,
                username: normalizedUsername,
                role: 'citizen',
                isApproved: true,
                points: 0,
                adminPointsPool: 0
            };
        } else {
            // 2. Check Registered Users from Supabase
            console.log(`[Auth] Checking registered users in Supabase...`);
            const registeredUsers = await supabaseStorage.getRegisteredUsers();
            const found = registeredUsers.find(u =>
                u.username.trim().toLowerCase() === normalizedUsername &&
                u.password === password
            );

            if (found) {
                console.log(`[Auth] Registered user found: ${normalizedUsername} with role: ${found.role}`);
                if ((found.role === 'rso' || found.role === 'compliance_officer') && found.isApproved === false) {
                    throw new Error(`Your ${found.role === 'rso' ? 'RSO' : 'Compliance Officer'} account is pending Admin approval.`);
                }
                const { password: _, ...rest } = found;
                user = rest as User;
            }
        }

        if (user) {
            console.log(`[Auth] Login successful for: ${user.username}`);

            // Save current session
            await supabaseStorage.saveUser(user);
            return user;
        }

        console.log(`[Auth] Login failed: Invalid credentials`);
        return null;
    }

    /**
     * Register a new user
     */
    async register(username: string, password: string, role: UserRole, zone?: string): Promise<boolean> {
        const users = await supabaseStorage.getRegisteredUsers();
        if (users.find(u => u.username === username)) {
            return false; // User already exists
        }

        const newUser = {
            id: `user_${Date.now()}`,
            username,
            password,
            role,
            zone: role === 'rso' ? zone : undefined,
            isApproved: (role !== 'rso' && role !== 'compliance_officer'), // RSO and Compliance Officer require approval
            points: 0,
            adminPointsPool: role === 'admin' ? 10000 : 0,
        };

        await supabaseStorage.saveRegisteredUser(newUser);
        return true;
    }

    /**
     * Logout current user
     */
    async logout(): Promise<void> {
        await supabaseStorage.removeUser();
    }

    /**
     * Get current logged-in user
     */
    async getCurrentUser(): Promise<User | null> {
        return await supabaseStorage.getUser();
    }

    /**
     * Check if user is authenticated
     */
    async isAuthenticated(): Promise<boolean> {
        const user = await this.getCurrentUser();
        return user !== null;
    }

    /**
     * Check if user has specific role
     */
    async hasRole(role: UserRole): Promise<boolean> {
        const user = await this.getCurrentUser();
        return user?.role === role;
    }

    /**
     * Refresh user data from Supabase
     * Useful for syncing points and other dynamic data
     */
    async refreshUserData(): Promise<User | null> {
        const currentUser = await this.getCurrentUser();
        if (!currentUser) return null;

        const registeredUsers = await supabaseStorage.getRegisteredUsers();
        const freshUser = registeredUsers.find(u => u.username === currentUser.username);

        if (freshUser) {
            const { password: _, ...userData } = freshUser;
            const user = userData as User;
            await supabaseStorage.saveUser(user);
            return user;
        }

        return currentUser;
    }
}

export default new SupabaseAuthService();
