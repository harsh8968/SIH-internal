/**
 * Demo Data Seeder
 *
 * Clustering, hotspots and priority ranking are invisible on three complaints.
 * This fills a zone map with a realistic spread so those features can actually
 * be seen and demonstrated.
 *
 *   node scripts/seed-demo-data.js          insert (skips if already seeded)
 *   node scripts/seed-demo-data.js --force  wipe demo rows and reinsert
 *   node scripts/seed-demo-data.js --clear  remove demo rows and stop
 *
 * Every row it creates has an id prefixed 'demo_', so --clear can never touch a
 * complaint filed by a real user.
 *
 * Departments come from the app's own classifier, compiled from source at run
 * time rather than reimplemented here: a seed that routed complaints by a
 * second, drifting copy of the rules would demo something the app does not do.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'crackx-app');

require(path.join(APP, 'node_modules', 'dotenv')).config({ path: path.join(APP, '.env') });
const { createClient } = require(path.join(APP, 'node_modules', '@supabase/supabase-js'));

const ID_PREFIX = 'demo_';

/** Depth-first search for an emitted file by name. */
function findFile(dir, name) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            const hit = findFile(full, name);
            if (hit) return hit;
        } else if (entry.name === name) {
            return full;
        }
    }
    return null;
}

/** Compile the real classifier to a temp dir and load it. */
function loadClassifier() {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'crackx-seed-'));
    const tsc = path.join(APP, 'node_modules', 'typescript', 'bin', 'tsc');
    execFileSync(
        process.execPath,
        [tsc, path.join(APP, 'src', 'services', 'classify.ts'),
            '--outDir', out, '--target', 'ES2020', '--module', 'commonjs',
            '--moduleResolution', 'node', '--skipLibCheck'],
        { stdio: 'pipe' }
    );
    // classify.ts imports ../types, so tsc mirrors the source tree under outDir
    // rather than emitting flat. Locate the file instead of guessing its depth.
    const emitted = findFile(out, 'classify.js');
    if (!emitted) throw new Error('classify.js was not emitted to ' + out);
    return require(emitted);
}

// Real photographs already in the project's storage bucket, so cards render
// with genuine road damage rather than placeholders.
const PHOTOS = [
    'https://fqovaczstxiulquorabv.supabase.co/storage/v1/object/public/report-images/damage-photos/1788241674677_mewlogahh_1788241674677.jpeg',
    'https://fqovaczstxiulquorabv.supabase.co/storage/v1/object/public/report-images/damage-photos/1788234483655_zj2rlqzkr_1788234483656.jpeg',
    'https://fqovaczstxiulquorabv.supabase.co/storage/v1/object/public/report-images/damage-photos/1774849481044_44kj9dzt3_1774849481054.jpeg',
];

/**
 * Citizen and RSO ids are read from the database at run time rather than
 * hardcoded: reports carry foreign keys to users, and the demo accounts differ
 * between environments. A stale id here fails the whole insert.
 */
async function loadActors(supabase) {
    const { data, error } = await supabase.from('users').select('id, role, zone');
    if (error) throw new Error('Could not read users: ' + error.message);

    const citizens = data.filter((u) => u.role === 'citizen').map((u) => u.id);
    if (citizens.length === 0) {
        throw new Error('No citizen accounts exist; create one before seeding.');
    }

    const rsoForZone = {};
    data.filter((u) => u.role === 'rso' && u.zone).forEach((u) => { rsoForZone[u.zone] = u.id; });

    return { citizens, rsoForZone };
}

/** Zone centres around Solapur. */
const ZONE_CENTRE = {
    zone1: { lat: 17.6820, lng: 75.8900 },
    zone4: { lat: 17.6599, lng: 75.9064 },
    zone8: { lat: 17.6400, lng: 75.9200 },
};

/**
 * Complaints that describe ONE physical defect, filed by different people.
 * Offsets are a few metres so they fall inside the 25 m duplicate radius.
 */
const CLUSTERS = [
    {
        zone: 'zone8', road: 'Ghodbunder Service Road', offset: [0.0009, 0.0011], ageDays: 12, severity: 'high', damageType: 'pothole',
        texts: [
            'Large pothole right outside the school gate. Water collects here after rain and two-wheelers keep skidding.',
            'Huge pothole near the school entrance, my child almost fell from the cycle yesterday.',
            'शाळेजवळ मोठा खड्डा आहे, दुचाकी घसरतात. लवकर दुरुस्ती करा.',
            'Same pothole outside school still not repaired, it has become deeper after the rain.',
        ],
    },
    {
        zone: 'zone4', road: 'Vijapur Road', offset: [-0.0007, 0.0006], ageDays: 5, severity: 'medium', damageType: 'other',
        texts: [
            'Water pipeline has burst near the junction and the whole road is flooded with drinking water.',
            'Pipeline leakage on Vijapur Road, water flowing on the road since two days.',
            'पाइपलाइन में रिसाव है, सड़क पर पानी भर गया है।',
        ],
    },
    {
        zone: 'zone1', road: 'Ashok Chowk', offset: [0.0004, -0.0008], ageDays: 8, severity: 'medium', damageType: 'other',
        texts: [
            'Garbage is dumped on the roadside and the drain is completely blocked, terrible stink all day.',
            'Blocked drain at Ashok Chowk, sewage overflowing onto the road near the market.',
        ],
    },
];

/** One-off complaints spread across the city. */
const SINGLES = [
    { zone: 'zone8', road: 'Hotgi Road', text: 'Deep pothole in the middle of the lane, buses jolt badly here.', severity: 'high', damageType: 'pothole', ageDays: 3 },
    { zone: 'zone8', road: 'Saat Rasta', text: 'The traffic signal at this junction is not working since Monday, very risky to cross.', severity: 'medium', damageType: 'other', ageDays: 3 },
    { zone: 'zone8', road: 'Jule Solapur Road', text: 'Long crack running along the road surface, widening every week.', severity: 'medium', damageType: 'crack', ageDays: 20 },
    { zone: 'zone8', road: 'Bhavani Peth', text: 'Street light near the bus stop is dead, the whole stretch is dark at night.', severity: 'low', damageType: 'other', ageDays: 6 },
    { zone: 'zone8', road: 'Murarji Peth', text: 'रस्त्यावर खड्डा आहे, रात्री दिसत नाही आणि अपघात होतात.', severity: 'high', damageType: 'pothole', ageDays: 9 },
    { zone: 'zone8', road: 'Shelgi Road', text: 'Speed breaker has broken apart, sharp edges damaging vehicles.', severity: 'medium', damageType: 'other', ageDays: 4 },
    { zone: 'zone8', road: 'Kumbhari Road', text: 'Cracked pavement outside the hospital gate, ambulances slow down here.', severity: 'medium', damageType: 'crack', ageDays: 11 },

    { zone: 'zone4', road: 'Ashok Nagar', text: 'A tree has fallen across the road after the storm, nobody can pass.', severity: 'high', damageType: 'other', ageDays: 1 },
    { zone: 'zone4', road: 'Railway Lines', text: 'Alligator cracking spread across the full width of the road.', severity: 'high', damageType: 'crack', ageDays: 25 },
    { zone: 'zone4', road: 'Modi Khana', text: 'Manhole cover is missing, open drain right in the middle of the road.', severity: 'high', damageType: 'other', ageDays: 2 },
    { zone: 'zone4', road: 'Navi Peth', text: 'सड़क पर कचरा पड़ा है और नाली जाम है।', severity: 'low', damageType: 'other', ageDays: 7 },
    { zone: 'zone4', road: 'Datta Nagar', text: 'Road divider damaged after an accident, debris still lying on the carriageway.', severity: 'medium', damageType: 'other', ageDays: 5 },
    { zone: 'zone4', road: 'Sakhar Peth', text: 'Uneven road surface near the market, elderly people struggle to walk.', severity: 'low', damageType: 'other', ageDays: 14 },
    { zone: 'zone4', road: 'Pachha Peth', text: 'Waterlogging at this spot every time it rains, the road has sunk.', severity: 'medium', damageType: 'other', ageDays: 18 },

    { zone: 'zone1', road: 'Vijapur Naka', text: 'Potholes all along the stretch, two-wheelers skidding daily.', severity: 'high', damageType: 'pothole', ageDays: 10 },
    { zone: 'zone1', road: 'Indira Nagar', text: 'Zebra crossing paint completely faded outside the school.', severity: 'low', damageType: 'other', ageDays: 22 },
    { zone: 'zone1', road: 'Shani Peth', text: 'ರಸ್ತೆಯಲ್ಲಿ ದೊಡ್ಡ ಗುಂಡಿ ಇದೆ, ಅಪಘಾತ ಆಗುತ್ತಿದೆ.', severity: 'high', damageType: 'pothole', ageDays: 6 },
    { zone: 'zone1', road: 'Budhwar Peth', text: 'Sewage overflowing from the manhole onto the road, unbearable smell.', severity: 'medium', damageType: 'other', ageDays: 4 },
    { zone: 'zone1', road: 'Saat Rasta Circle', text: 'Traffic signal timing broken, junction jams every evening.', severity: 'low', damageType: 'other', ageDays: 13 },
    { zone: 'zone1', road: 'Old Employment Chowk', text: 'Culvert edge collapsed, dangerous drop at the side of the road.', severity: 'high', damageType: 'other', ageDays: 16 },
    { zone: 'zone1', road: 'Rupa Bhavani Road', text: 'Footpath tiles broken near the bus stop, children trip over them.', severity: 'low', damageType: 'other', ageDays: 9 },
    { zone: 'zone1', road: 'Balives', text: 'Road washed away at the corner after heavy rain, only mud left.', severity: 'high', damageType: 'other', ageDays: 2 },
];

/**
 * Give the board some finished work so the dashboards are not uniformly
 * "pending". Older complaints are the ones most plausibly resolved.
 */
// 'verification-pending' is deliberately absent: the database CHECK constraint
// still only allows pending/in-progress/completed (see migration_002), and the
// seed must work on an un-migrated database.
function statusFor(index, ageDays) {
    if (ageDays >= 20) return { status: 'completed', citizen_rating: 4 };
    if (index % 7 === 3) return { status: 'in-progress' };
    return { status: 'pending' };
}

function buildRows(classify, actors) {
    const rows = [];
    let i = 0;
    const now = Date.now();

    const push = ({ zone, road, text, severity, damageType, ageDays, offset, clusterIdx }) => {
        const centre = ZONE_CENTRE[zone];
        // Cluster members share one offset and jitter by a few metres; singles
        // are scattered across the zone.
        const jitter = () => (Math.random() - 0.5) * 0.00018;
        const lat = centre.lat + (offset ? offset[0] + jitter() : (Math.random() - 0.5) * 0.02);
        const lng = centre.lng + (offset ? offset[1] + jitter() : (Math.random() - 0.5) * 0.02);

        const confidence = damageType === 'pothole' || damageType === 'crack'
            ? 0.72 + Math.random() * 0.25
            : 0.15;
        const vision = { damageType, confidence, severity };
        const cls = classify(text, vision);
        const state = statusFor(i, ageDays);

        rows.push({
            id: `${ID_PREFIX}${String(i).padStart(3, '0')}`,
            citizen_id: actors.citizens[i % actors.citizens.length],
            reporting_mode: 'on-site',
            location: { latitude: lat, longitude: lng, roadName: road, area: 'Solapur', zone },
            photo_uri: PHOTOS[i % PHOTOS.length],
            ai_detection: {
                damageType, confidence, severity,
                boundingBox: { x: 0.2, y: 0.25, width: 0.4, height: 0.35 },
                management: {
                    description: text,
                    classification: {
                        department: cls.department,
                        confidence: cls.confidence,
                        matchedTerms: cls.matchedTerms,
                        needsReview: cls.needsReview,
                    },
                    assignedDepartment: cls.department,
                },
            },
            assigned_department: cls.department,
            origin_department: 'Engineering',
            // Null where a zone has no officer yet; the complaint still shows
            // on the city-wide heatmap and admin views.
            rso_id: actors.rsoForZone[zone] || null,
            status: state.status,
            citizen_rating: state.citizen_rating || null,
            sync_status: 'synced',
            created_at: new Date(now - ageDays * 86400000 - (i % 12) * 3600000).toISOString(),
            updated_at: new Date().toISOString(),
        });
        i++;
    };

    CLUSTERS.forEach((c, ci) => {
        c.texts.forEach((text) => push({ ...c, text, clusterIdx: ci }));
    });
    SINGLES.forEach((sgl) => push(sgl));

    return rows;
}

async function main() {
    const args = process.argv.slice(2);
    const clear = args.includes('--clear');
    const force = args.includes('--force');

    const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
        console.error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY in crackx-app/.env');
        process.exit(1);
    }
    const supabase = createClient(url, key);

    if (clear || force) {
        const { error } = await supabase.from('reports').delete().like('id', ID_PREFIX + '%');
        if (error) { console.error('Failed to clear demo rows:', error.message); process.exit(1); }
        console.log('Cleared demo rows.');
        if (clear) return;
    }

    const { data: existing } = await supabase.from('reports').select('id').like('id', ID_PREFIX + '%').limit(1);
    if (existing && existing.length > 0) {
        console.log('Demo data already present. Use --force to replace it, or --clear to remove it.');
        return;
    }

    console.log('Compiling the app classifier...');
    const { classifyComplaint } = loadClassifier();

    const actors = await loadActors(supabase);
    console.log(`Using ${actors.citizens.length} citizen account(s), RSOs for: ${Object.keys(actors.rsoForZone).join(', ') || 'none'}`);

    const rows = buildRows(classifyComplaint, actors);

    const { error } = await supabase.from('reports').upsert(rows);
    if (error) { console.error('Insert failed:', error.message); process.exit(1); }

    const byDept = {};
    const byZone = {};
    rows.forEach((r) => {
        byDept[r.assigned_department] = (byDept[r.assigned_department] || 0) + 1;
        byZone[r.location.zone] = (byZone[r.location.zone] || 0) + 1;
    });

    console.log(`\nSeeded ${rows.length} complaints.`);
    console.log('  by department:', JSON.stringify(byDept));
    console.log('  by zone      :', JSON.stringify(byZone));
    console.log(`\nRemove them again with: node scripts/seed-demo-data.js --clear`);
}

main().catch((e) => { console.error(e); process.exit(1); });
