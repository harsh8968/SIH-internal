#!/usr/bin/env node

/**
 * Supabase Setup Helper Script
 * Run this after creating your Supabase project
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function setup() {
    console.log('\n🚀 CrackX Supabase Setup\n');
    console.log('This script will help you configure Supabase for your project.\n');

    // Get Supabase credentials
    console.log('📋 Please provide your Supabase project credentials:');
    console.log('   (Find these at: https://app.supabase.com → Your Project → Settings → API)\n');

    const supabaseUrl = await question('Supabase Project URL: ');
    const supabaseKey = await question('Supabase Anon/Public Key: ');

    if (!supabaseUrl || !supabaseKey) {
        console.error('\n❌ Error: Both URL and Key are required!');
        rl.close();
        process.exit(1);
    }

    // Create .env file
    const envPath = path.join(__dirname, '..', 'crackx-app', '.env');
    const envContent = `# Supabase Configuration
# Generated on ${new Date().toISOString()}
EXPO_PUBLIC_SUPABASE_URL=${supabaseUrl.trim()}
EXPO_PUBLIC_SUPABASE_ANON_KEY=${supabaseKey.trim()}
`;

    try {
        fs.writeFileSync(envPath, envContent);
        console.log('\n✅ Created .env file successfully!');
    } catch (error) {
        console.error('\n❌ Error creating .env file:', error.message);
        rl.close();
        process.exit(1);
    }

    // Update .gitignore
    const gitignorePath = path.join(__dirname, '..', 'crackx-app', '.gitignore');
    try {
        let gitignoreContent = '';
        if (fs.existsSync(gitignorePath)) {
            gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
        }

        if (!gitignoreContent.includes('.env')) {
            gitignoreContent += '\n# Environment variables\n.env\n.env.local\n.env.*.local\n';
            fs.writeFileSync(gitignorePath, gitignoreContent);
            console.log('✅ Updated .gitignore to exclude .env files');
        }
    } catch (error) {
        console.warn('⚠️  Warning: Could not update .gitignore:', error.message);
    }

    console.log('\n📊 Next Steps:\n');
    console.log('1. Go to Supabase SQL Editor: https://app.supabase.com');
    console.log('2. Run the SQL schema from: database/supabase_schema.sql');
    console.log('3. Update your imports to use Supabase services:');
    console.log('   - Replace: import storageService from "./services/storage"');
    console.log('   - With: import storageService from "./services/supabaseStorage"');
    console.log('   - Replace: import authService from "./services/auth"');
    console.log('   - With: import authService from "./services/supabaseAuth"');
    console.log('\n4. Start your app: npm start\n');
    console.log('📖 For detailed instructions, see: SUPABASE_MIGRATION_GUIDE.md\n');

    rl.close();
}

setup().catch(error => {
    console.error('\n❌ Setup failed:', error);
    rl.close();
    process.exit(1);
});
