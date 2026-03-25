import { User, UserRole } from '../types';
import { DEMO_CREDENTIALS, HARDCODED_DEMO_USERS } from '../constants';
import supabaseStorage from './supabaseStorage';

/**
 * Authentication Service with Supabase Integration
 * Handles login, registration, and session management
 */
class SupabaseAuthService {
    /**
     * Login with Supabase Auth
     */
    async login(usernameOrEmail: string, password: string): Promise<User | null> {
        let user: User | null = null;
        
        // Supabase Auth usually prefers emails. 
        // If the user provided a username, we might need to find their email or allow username-as-email if configured.
        // For this demo, let's assume we use 'username@crackx.app' as a proxy email for Supabase Auth 
        // if they didn't provide a real email.
        const email = usernameOrEmail.includes('@') ? usernameOrEmail : `${usernameOrEmail.toLowerCase()}@crackx.app`;

        console.log(`[Auth] Supabase Login attempt for: ${email}`);

        try {
            // 1. Sign in via Supabase Auth
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (authError) {
                // Fallback for hardcoded demo users who might not be in auth.users yet
                const normalizedUsername = usernameOrEmail.trim().toLowerCase();
                const hardcoded = HARDCODED_DEMO_USERS[normalizedUsername];
                if (hardcoded && hardcoded.password === password) {
                    console.log(`[Auth] Detected legacy demo user. Auto-registering in Supabase Auth...`);
                    // We'll try to auto-register them for a seamless transition
                    await this.register(hardcoded.username, hardcoded.password, hardcoded.role, hardcoded.zone);
                    return this.login(usernameOrEmail, password);
                }
                throw authError;
            }

            if (authData.user) {
                // 2. Fetch profile from public.users table using the Auth UUID
                const { data: profile, error: profileError } = await supabase
                    .from('users')
                    .select('*')
                    .eq('id', authData.user.id)
                    .single();

                if (profileError) {
                    console.log('[Auth] Profile not found in public.users, creating one handle...');
                    // This might happen during migration or if record was deleted.
                    // We can try to recover by username from JWT metadata if we stored it.
                    throw new Error("User profile (public) not found. Contact Admin.");
                }

                if ((profile.role === 'rso' || profile.role === 'compliance_officer') && profile.is_approved === false) {
                    throw new Error(`Your ${profile.role === 'rso' ? 'RSO' : 'Compliance Officer'} account is pending Admin approval.`);
                }

                user = {
                    id: profile.id,
                    username: profile.username,
                    role: profile.role as any,
                    zone: profile.zone,
                    isApproved: profile.is_approved,
                    points: profile.points || 0,
                    adminPointsPool: profile.admin_points_pool || 0,
                    contractorId: profile.contractor_id
                };
            }
        } catch (error: any) {
            console.error('[Auth] Login error:', error.message);
            throw error;
        }

        if (user) {
            console.log(`[Auth] Login successful for: ${user.username} (${user.id})`);
            await supabaseStorage.saveUser(user);
            return user;
        }

        return null;
    }

    /**
     * Register a new user with Supabase Auth
     */
    async register(username: string, password: string, role: UserRole, zone?: string): Promise<boolean> {
        try {
            const email = `${username.toLowerCase()}@crackx.app`;
            
            // 1. Create User in Supabase Auth
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: { username, role, zone }
                }
            });

            if (authError) throw authError;

            if (authData.user) {
                // 2. Create User record in public.users table (linked by ID)
                const newUserRecord = {
                    id: authData.user.id, // Use the real Supabase Auth UUID
                    username,
                    password, // Still stored for app logic (should be omitted/hashed in production)
                    role,
                    zone: role === 'rso' ? zone : undefined,
                    is_approved: (role !== 'rso' && role !== 'compliance_officer'),
                    points: 0,
                    admin_points_pool: role === 'admin' ? 10000 : 0,
                    created_at: new Date().toISOString()
                };

                const { error: dbError } = await supabase
                    .from('users')
                    .insert(newUserRecord);

                if (dbError) throw dbError;
                
                console.log(`[Auth] Registered new user: ${username} with ID: ${authData.user.id}`);
                return true;
            }
            
            return false;
        } catch (error: any) {
            console.error('[Auth] Registration error:', error.message);
            throw error;
        }
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
