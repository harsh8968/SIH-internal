/**
 * Mapbox Configuration
 * 
 * INSTRUCTIONS:
 * 1. Get your Public Access Token from https://account.mapbox.com/
 * 2. Paste it below in MAPBOX_ACCESS_TOKEN
 * 
 * NOTE: If maps appear black, verify:
 * - Token is valid and starts with "pk."
 * - Internet connection is active
 * - Token has proper scopes enabled
 */

export const MAPBOX_CONFIG = {
    // REPLACE THIS STRING WITH YOUR ACTUAL KEY starting with "pk."
    accessToken: 'enter_your mapbox_access_token_here',

    // Style URL (Using standard Mapbox Streets style)
    styleUrl: 'mapbox://styles/mapbox/streets-v11',

    // Download settings for offline maps
    offline: {
        minZoom: 12,
        maxZoom: 16,
        styleUrl: 'mapbox://styles/mapbox/streets-v11',
    }
};
