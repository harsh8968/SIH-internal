/**
 * Network Connectivity Utilities
 * Checks internet connection before making API calls
 */

/**
 * Check if device has internet connectivity
 * @returns Promise<boolean> - true if connected, false otherwise
 */
export const checkInternetConnection = async (): Promise<boolean> => {
    try {
        // Try to reach Supabase endpoint
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        const response = await fetch('https://fqovaczstxiulquorabv.supabase.co/rest/v1/', {
            method: 'HEAD',
            signal: controller.signal,
        });

        clearTimeout(timeoutId);
        return response.ok || response.status === 401; // 401 is fine, means server is reachable
    } catch (error) {
        console.error('❌ Network check failed:', error);
        return false;
    }
};

/**
 * Check if device has internet connectivity with user-friendly message
 * @returns Promise<{ connected: boolean; message: string }>
 */
export const checkConnectionWithMessage = async (): Promise<{ connected: boolean; message: string }> => {
    const connected = await checkInternetConnection();

    if (!connected) {
        return {
            connected: false,
            message: 'No internet connection detected. Please check your WiFi or mobile data and try again.',
        };
    }

    return {
        connected: true,
        message: 'Connected',
    };
};

/**
 * Wait for internet connection
 * @param maxRetries - Maximum number of retries
 * @param delayMs - Delay between retries in milliseconds
 * @returns Promise<boolean> - true if connected within retries
 */
export const waitForConnection = async (maxRetries: number = 3, delayMs: number = 2000): Promise<boolean> => {
    for (let i = 0; i < maxRetries; i++) {
        const connected = await checkInternetConnection();
        if (connected) {
            return true;
        }

        if (i < maxRetries - 1) {
            console.log(`⏳ Waiting for connection... Retry ${i + 1}/${maxRetries}`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    return false;
};
