import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Use environment variables from .env file
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://fqovaczstxiulquorabv.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxb3ZhY3pzdHhpdWxxdW9yYWJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMTMyNDIsImV4cCI6MjA4NTY4OTI0Mn0.3BaKpEGLdiSBmlSFVicdBm08QRTbMbJQWtMKqDMFuZs';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        storage: AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
    },
});

export default supabase;
