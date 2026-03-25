import { Zone } from '../types';

// Demo Credentials
export const DEMO_CREDENTIALS = {
    username: 'demo',
    password: 'demo1234',
};

// Hardcoded Permanent Demo Users (Master Fallbacks)
export const HARDCODED_DEMO_USERS: Record<string, any> = {
    'admin': { id: 'admin_master', username: 'admin', password: 'admin123', role: 'admin', adminPointsPool: 100000 },
    'rugved': { id: 'rso_rugved', username: 'rugved', password: 'rugved', role: 'rso', zone: 'zone1', isApproved: true, points: 0 },
    'deep': { id: 'rso_deep', username: 'deep', password: 'deep', role: 'rso', zone: 'zone4', isApproved: true, points: 0 },
    'atharva': { id: 'rso_atharva', username: 'atharva', password: 'atharva', role: 'rso', zone: 'zone8', isApproved: true, points: 0 },
    'arav': { id: 'cit_arav', username: 'arav', password: 'arav', role: 'citizen', isApproved: true },
    'abbas': { id: 'cit_abbas', username: 'abbas', password: 'abbas', role: 'citizen', isApproved: true },
    'officer': { id: 'comp_officer', username: 'officer', password: 'officer', role: 'compliance_officer', isApproved: true },
};

// Zone Definitions for Solapur Municipal Corporation
export const ZONES: Zone[] = [
    {
        id: 'zone1',
        name: 'Zone 1 - North Solapur',
        boundaries: [
            { latitude: 17.6599, longitude: 75.9064 },
            { latitude: 17.6699, longitude: 75.9164 },
            { latitude: 17.6799, longitude: 75.9264 },
            { latitude: 17.6699, longitude: 75.9364 },
        ],
    },
    {
        id: 'zone4',
        name: 'Zone 4 - South Solapur',
        boundaries: [
            { latitude: 17.6499, longitude: 75.8964 },
            { latitude: 17.6599, longitude: 75.9064 },
            { latitude: 17.6699, longitude: 75.9164 },
            { latitude: 17.6599, longitude: 75.9264 },
        ],
    },
    {
        id: 'zone8', // CHANGED from zone18
        name: 'Zone 8 - Central Solapur',
        boundaries: [
            { latitude: 17.6399, longitude: 75.8864 },
            { latitude: 17.6499, longitude: 75.8964 },
            { latitude: 17.6599, longitude: 75.9064 },
            { latitude: 17.6499, longitude: 75.9164 },
        ],
    },
];

// Supported Languages
export const SUPPORTED_LANGUAGES = [
    { code: 'en', label: 'English' },
    { code: 'hi', label: 'हिंदी (Hindi)' },
    { code: 'mr', label: 'मराठी (Marathi)' },
    { code: 'kn', label: 'ಕನ್ನಡ (Kannada)' },
];

// Storage Keys
export const STORAGE_KEYS = {
    USER: '@crackx_user',
    REPORTS: '@crackx_reports',
    LOCATION_PERMISSION: '@crackx_location_permission',
    LANGUAGE: '@crackx_language',
    SYNC_QUEUE: '@crackx_sync_queue',
    REGISTERED_USERS: '@crackx_registered_users',
    INITIALIZED: '@crackx_initialized',
};

// Modern Municipal Theme (Orange & White)
export const COLORS = {
    primary: '#f97316',    // Vibrant Orange (Safety/Active)
    secondary: '#fff7ed',  // Light Orange/Cream (Backgrounds)
    accent: '#ea580c',     // Darker Orange (Borders/Text)

    success: '#10b981',    // Emerald (Success)
    warning: '#f59e0b',    // Amber (Warning)
    danger: '#ef4444',     // Red (Error)

    dark: '#1f2937',       // Gray 800 (Main Text)
    gray: '#6b7280',       // Gray 500 (Subtext)
    light: '#f9fafb',      // Gray 50 (App Background)
    white: '#ffffff',
    border: '#e5e7eb',     // Gray 200

    // Severity Colors
    severityLow: '#10b981',
    severityMedium: '#f59e0b',
    severityHigh: '#ef4444',

    // Gradient Colors
    gradientStart: '#fb923c',
    gradientEnd: '#ea580c',
};

// Severity Thresholds
export const SEVERITY_THRESHOLDS = {
    low: 0.3,
    medium: 0.6,
    high: 0.8,
};
