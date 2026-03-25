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
// Auto-detect Android to use Emulator URL (10.0.2.2)
let CURRENT_ENV: Environment = 'local_network';

if (Platform.OS === 'web') {
    CURRENT_ENV = 'development';
} else if (Platform.OS === 'android' && !__DEV__) {
    // Maybe an APK? Stick to local_network or production
    CURRENT_ENV = 'local_network';
}

// Export configuration
export const API_CONFIG = API_URLS[CURRENT_ENV];

export const API_BASE_URL = API_CONFIG.apiUrl;
export const BASE_URL = API_CONFIG.baseUrl;

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
