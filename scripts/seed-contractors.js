/**
 * Contractor Seeding Script: Zone Distribution (1, 4, 8)
 * 
 * Contractors to register:
 * amit, amit_s, anil, ganesh, prakash, rahul, rajesh, rakesh, ramesh, suresh, suresh_p, vinod, vijay
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './crackx-app/.env' });

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Error: Supabase credentials not found in ./crackx-app/.env file');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const distribution = [
    // Zone 1 (North)
    { username: 'amit', zone: 'zone1', agency: 'Amit Road Solutions' },
    { username: 'amit_s', zone: 'zone1', agency: 'A.S. Infrastructure' },
    { username: 'anil', zone: 'zone1', agency: 'Anil Paving Works' },
    { username: 'ganesh', zone: 'zone1', agency: 'Ganesh Constructions' },

    // Zone 4 (South)
    { username: 'prakash', zone: 'zone4', agency: 'Prakash Buildtech' },
    { username: 'rahul', zone: 'zone4', agency: 'Rahul Maintenance Co' },
    { username: 'rajesh', zone: 'zone4', agency: 'Rajesh Earthmovers' },
    { username: 'rakesh', zone: 'zone4', agency: 'Rakesh Road Systems' },

    // Zone 8 (Central)
    { username: 'ramesh', zone: 'zone8', agency: 'Ramesh & Sons Infrastructure' },
    { username: 'suresh', zone: 'zone8', agency: 'Suresh Paving Specialist' },
    { username: 'suresh_p', zone: 'zone8', agency: 'S.P. Civil Works' },
    { username: 'vinod', zone: 'zone8', agency: 'Vinod Contractors' },
    { username: 'vijay', zone: 'zone8', agency: 'Vijay Municipal Maintenance' }
];

async function main() {
    console.log('🚀 Checking status and seeding contractors across zones 1, 4, 8...\n');

    for (const item of distribution) {
        try {
            // Check if user account exists (as mandated)
            const { data: userData, error: userError } = await supabase
                .from('users')
                .select('*')
                .eq('username', item.username)
                .single();

            if (!userData) {
                console.warn(`⚠️  User account for '${item.username}' does NOT exist in 'users' table.`);
                // In some setups, you might want to create the user account here.
                // Assuming we still add the contractor record referencing the expected username/ID.
            }

            const contractorId = `cont_${item.username}_${item.zone}`;
            const contractorName = item.username.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());

            // Prepare Contractor entry
            const contractorEntry = {
                id: contractorId,
                name: contractorName,
                agency_name: item.agency,
                license_number: `LIC-${item.zone.toUpperCase()}-${item.username.toUpperCase().replace('_', '')}`,
                rating: (Math.random() * (5.0 - 4.2) + 4.2).toFixed(1), // Random top-tier rating
                zone: item.zone
            };

            const { error: upsertError } = await supabase
                .from('contractors')
                .upsert(contractorEntry);

            if (upsertError) {
                console.error(`❌ Failed to seed ${item.username}: ${upsertError.message}`);
            } else {
                console.log(`✅ ${item.username} assigned to ${item.zone} [${item.agency}]`);
            }
        } catch (err) {
            console.error(`❌ Error processing ${item.username}:`, err.message);
        }
    }

    console.log('\n✨ Seeding process finished.');
}

main().catch(err => {
    console.error('FATAL ERROR:', err);
    process.exit(1);
});
