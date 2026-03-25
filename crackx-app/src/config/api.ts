import { Platform } from 'react-native';

/**
 * API Configuration for CrackX Mobile App
 * Update these settings based on your deployment environment
 */

// Environment type
type Environment = 'development' | 'android_emulator' | 'local_network' | 'production';

// API URLs for different environments
const API_URLS = {
    development: {
        baseUrl: 'http://localhost:5000',
        apiUrl: 'http://localhost:5000/api',
    },
    android_emulator: {
        baseUrl: 'http://10.0.2.2:5000',
        apiUrl: 'http://10.0.2.2:5000/api',
    },
    local_network: {
        // Replace X.X with your computer's local IP
        // Find it: Windows (ipconfig), Mac/Linux (ifconfig)
        baseUrl: 'http://192.168.1.5:5000',
        apiUrl: 'http://192.168.1.5:5000/api',
    },
    production: {
        // Replace with your production server URL
        baseUrl: 'https://api.crackx.com',
        apiUrl: 'https://api.crackx.com/api',
    },
};

// Current environment - CHANGE THIS BASED ON YOUR SETUP
let CURRENT_ENV: Environment = 'local_network';

if (Platform.OS === 'web') {
    // If we're on web, check if we're on localhost or production
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
        CURRENT_ENV = 'development';
    } else {
        CURRENT_ENV = 'production';
    }
} else if (Platform.OS === 'android' && !__DEV__) {
    CURRENT_ENV = 'production';
}

// Export configuration
const config = API_URLS[CURRENT_ENV];

// Optional: Override with environment variables if provided (e.g., in Vercel or EAS)
// Note: process.env.EXPO_PUBLIC_API_URL is the standard way for Expo 49+
const ENV_API_URL = process.env.EXPO_PUBLIC_API_URL;

export const BASE_URL = Platform.OS === 'web' && CURRENT_ENV === 'production' && typeof window !== 'undefined'
    ? window.location.origin
    : (ENV_API_URL || config.baseUrl);

export const API_BASE_URL = `${BASE_URL}/api`;
export const API_CONFIG = { ...config, baseUrl: BASE_URL, apiUrl: API_BASE_URL };

// Feature flags
export const FEATURES = {
    USE_REAL_AI: true,        // Set to true only if you have a reachable backend server
    USE_REAL_SYNC: true,      // Use backend sync or local-only
    OFFLINE_FIRST: true,      // Always save locally first
    AUTO_SYNC: false,         // Auto-sync when online (not recommended)
};

// Timeout settings (milliseconds)
export const TIMEOUTS = {
    AI_DETECTION: 30000,      // 30 seconds for AI detection
    SYNC: 60000,              // 60 seconds for sync
    API_REQUEST: 10000,       // 10 seconds for regular API calls
};

// Debug mode
export const DEBUG = __DEV__;

// Log API configuration on app start
if (DEBUG) {
    console.log('🔧 API Configuration:', {
        environment: CURRENT_ENV,
        baseUrl: BASE_URL,
        apiUrl: API_BASE_URL,
        features: FEATURES,
    });
}
