/**
 * Data Migration Script: AsyncStorage → Supabase
 * 
 * This script migrates existing data from AsyncStorage to Supabase
 * Run this AFTER setting up your Supabase database
 * 
 * Usage:
 *   node scripts/migrate-data.js
 */

const AsyncStorage = require('@react-native-async-storage/async-storage').default;
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../crackx-app/.env' });

// Supabase configuration
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Error: Supabase credentials not found in .env file');
    console.log('Please run: node scripts/setup-supabase.js first');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Storage keys
const STORAGE_KEYS = {
    REGISTERED_USERS: '@crackx_registered_users',
    REPORTS: '@crackx_reports',
};

async function migrateUsers() {
    console.log('\n📦 Migrating Users...');

    try {
        const usersStr = await AsyncStorage.getItem(STORAGE_KEYS.REGISTERED_USERS);
        if (!usersStr) {
            console.log('ℹ️  No users found in AsyncStorage');
            return 0;
        }

        const users = JSON.parse(usersStr);
        let successCount = 0;
        let errorCount = 0;

        for (const user of users) {
            try {
                const { error } = await supabase.from('users').upsert({
                    id: user.id,
                    username: user.username,
                    password: user.password,
                    role: user.role,
                    zone: user.zone,
                    is_approved: user.isApproved !== false,
                    points: user.points || 0,
                    admin_points_pool: user.adminPointsPool || 0,
                    created_at: new Date().toISOString(),
                });

                if (error) {
                    console.error(`  ❌ Failed to migrate user: ${user.username}`, error.message);
                    errorCount++;
                } else {
                    console.log(`  ✅ Migrated user: ${user.username}`);
                    successCount++;
                }
            } catch (err) {
                console.error(`  ❌ Error migrating user ${user.username}:`, err.message);
                errorCount++;
            }
        }

        console.log(`\n📊 Users Migration Summary:`);
        console.log(`   Success: ${successCount}`);
        console.log(`   Failed: ${errorCount}`);
        console.log(`   Total: ${users.length}`);

        return successCount;
    } catch (error) {
        console.error('❌ Error during user migration:', error);
        return 0;
    }
}

async function migrateReports() {
    console.log('\n📦 Migrating Reports...');

    try {
        const reportsStr = await AsyncStorage.getItem(STORAGE_KEYS.REPORTS);
        if (!reportsStr) {
            console.log('ℹ️  No reports found in AsyncStorage');
            return 0;
        }

        const reports = JSON.parse(reportsStr);
        let successCount = 0;
        let errorCount = 0;

        for (const report of reports) {
            try {
                const { error } = await supabase.from('reports').upsert({
                    id: report.id,
                    citizen_id: report.citizenId,
                    reporting_mode: report.reportingMode,
                    location: report.location,
                    photo_uri: report.photoUri,
                    ai_detection: report.aiDetection,
                    status: report.status,
                    sync_status: 'synced',
                    created_at: report.createdAt || new Date().toISOString(),
                    updated_at: report.updatedAt || new Date().toISOString(),
                    repair_proof_uri: report.repairProofUri,
                    repair_completed_at: report.repairCompletedAt,
                    materials_used: report.materialsUsed,
                    report_approved_for_points: report.reportApprovedForPoints,
                    repair_approved_for_points: report.repairApprovedForPoints,
                    rso_id: report.rsoId,
                    citizen_rating: report.citizenRating,
                    citizen_feedback: report.citizenFeedback,
                });

                if (error) {
                    console.error(`  ❌ Failed to migrate report: ${report.id}`, error.message);
                    errorCount++;
                } else {
                    console.log(`  ✅ Migrated report: ${report.id}`);
                    successCount++;
                }
            } catch (err) {
                console.error(`  ❌ Error migrating report ${report.id}:`, err.message);
                errorCount++;
            }
        }

        console.log(`\n📊 Reports Migration Summary:`);
        console.log(`   Success: ${successCount}`);
        console.log(`   Failed: ${errorCount}`);
        console.log(`   Total: ${reports.length}`);

        return successCount;
    } catch (error) {
        console.error('❌ Error during report migration:', error);
        return 0;
    }
}

async function verifyMigration() {
    console.log('\n🔍 Verifying Migration...');

    try {
        // Check users
        const { data: users, error: usersError } = await supabase
            .from('users')
            .select('count');

        if (usersError) throw usersError;
        console.log(`  ✅ Users in Supabase: ${users.length}`);

        // Check reports
        const { data: reports, error: reportsError } = await supabase
            .from('reports')
            .select('count');

        if (reportsError) throw reportsError;
        console.log(`  ✅ Reports in Supabase: ${reports.length}`);

        return true;
    } catch (error) {
        console.error('❌ Verification failed:', error);
        return false;
    }
}

async function main() {
    console.log('🚀 CrackX Data Migration: AsyncStorage → Supabase\n');
    console.log('⚠️  WARNING: This will copy all data from AsyncStorage to Supabase');
    console.log('   Make sure you have:');
    console.log('   1. Created your Supabase project');
    console.log('   2. Run the database schema SQL');
    console.log('   3. Configured .env with your credentials\n');

    // Confirm before proceeding
    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });

    readline.question('Continue with migration? (yes/no): ', async (answer) => {
        readline.close();

        if (answer.toLowerCase() !== 'yes') {
            console.log('\n❌ Migration cancelled');
            process.exit(0);
        }

        console.log('\n🔄 Starting migration...\n');

        // Run migrations
        const usersMigrated = await migrateUsers();
        const reportsMigrated = await migrateReports();

        // Verify
        await verifyMigration();

        console.log('\n✅ Migration Complete!\n');
        console.log('📊 Summary:');
        console.log(`   Users migrated: ${usersMigrated}`);
        console.log(`   Reports migrated: ${reportsMigrated}`);
        console.log('\n💡 Next Steps:');
        console.log('   1. Verify data in Supabase dashboard');
        console.log('   2. Update your app to use Supabase services');
        console.log('   3. Test the app thoroughly');
        console.log('   4. Consider backing up AsyncStorage data before clearing\n');

        process.exit(0);
    });
}

main().catch(error => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
});
