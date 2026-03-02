import { supabase } from '../config/supabase';
import { Platform } from 'react-native';

/**
 * Upload image to Supabase Storage with enhanced error handling
 * @param uri - Local file URI (from ImagePicker)
 * @param folder - Folder name ('damage-photos' or 'repair-proofs')
 * @param reportId - Report ID for naming
 * @returns Public URL of uploaded image
 */
export const uploadImageToSupabase = async (
    uri: string,
    folder: 'damage-photos' | 'repair-proofs',
    reportId: string
): Promise<string> => {
    try {
        console.log('📤 Starting image upload process...');
        console.log('Platform:', Platform.OS);

        const timestamp = Date.now();
        let fileExt = 'jpg';

        // Handle file extension
        if (uri.startsWith('data:')) {
            const mime = uri.match(/:(.*?);/)?.[1];
            fileExt = mime ? mime.split('/')[1] : 'jpg';
        } else {
            const ext = uri.split('.').pop()?.split('?')[0];
            if (ext && ext.length < 5) {
                fileExt = ext;
            }
        }

        const fileName = `${reportId}_${timestamp}.${fileExt}`;
        const filePath = `${folder}/${fileName}`;
        const contentType = `image/${fileExt}`;

        console.log('📝 File details:', { fileName, filePath, contentType });

        // Prepare file body
        let fileBody: ArrayBuffer | Blob;

        if (uri.startsWith('data:')) {
            // Handle Base64 Data URI
            console.log('🔄 Converting base64 to Blob...');
            const parts = uri.split(',');
            const bstr = atob(parts[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) {
                u8arr[n] = bstr.charCodeAt(n);
            }
            fileBody = new Blob([u8arr], { type: contentType });
        } else {
            // Handle File URIs (Mobile/Web)
            console.log('🔄 Fetching file from URI...');
            const response = await fetch(uri);
            if (!response.ok) {
                throw new Error(`Failed to read file: ${response.statusText}`);
            }
            // Use ArrayBuffer for more reliable binary upload on Android
            fileBody = await response.arrayBuffer();
            console.log(`✅ File fetched successfully (${fileBody.byteLength} bytes)`);

            if (fileBody.byteLength === 0) {
                throw new Error('File is empty');
            }
        }

        // Upload to Supabase
        console.log('☁️ Uploading to Supabase Storage...');

        const { data, error } = await supabase.storage
            .from('report-images')
            .upload(filePath, fileBody, {
                contentType: contentType,
                cacheControl: '3600',
                upsert: false,
            });

        if (error) {
            console.error('❌ Supabase Storage Error:', error);
            throw error;
        }

        console.log('✅ Upload successful. Retrieving public URL...');

        const { data: urlData } = supabase.storage
            .from('report-images')
            .getPublicUrl(filePath);

        if (!urlData.publicUrl) {
            throw new Error('Failed to get public URL');
        }

        console.log('🔗 Public URL:', urlData.publicUrl);
        return urlData.publicUrl;

    } catch (error: any) {
        console.error('❌ Upload Failed:', error);

        // Enhance error message for user
        let message = error.message || 'Unknown upload error';
        if (message.includes('Network request failed') || message.includes('fetch')) {
            message = 'Network error: Unable to connect to storage server. Please check your internet connection.';
        }
        throw new Error(message);
    }
};

/**
 * Delete image from Supabase Storage
 * @param publicUrl - Public URL of the image to delete
 */
export const deleteImageFromSupabase = async (publicUrl: string): Promise<void> => {
    try {
        // Extract file path from public URL
        const urlParts = publicUrl.split('/report-images/');
        if (urlParts.length < 2) {
            console.warn('Invalid Supabase URL format');
            return;
        }

        const filePath = urlParts[1];

        const { error } = await supabase.storage
            .from('report-images')
            .remove([filePath]);

        if (error) {
            console.error('Failed to delete image:', error);
        } else {
            console.log('✅ Image deleted from Supabase:', filePath);
        }
    } catch (error) {
        console.error('Error deleting image:', error);
    }
};

/**
 * Check if URI is a Supabase URL
 * @param uri - URI to check
 * @returns true if it's a Supabase URL
 */
export const isSupabaseUrl = (uri: string): boolean => {
    return uri.includes('supabase.co/storage/v1/object/public/report-images/');
};

/**
 * Get optimized image URL with transformations
 * @param publicUrl - Original public URL
 * @param width - Desired width (optional)
 * @param height - Desired height (optional)
 * @returns Transformed URL
 */
export const getOptimizedImageUrl = (
    publicUrl: string,
    width?: number,
    height?: number
): string => {
    if (!isSupabaseUrl(publicUrl)) {
        return publicUrl;
    }

    // Supabase Image Transformations (if enabled)
    // Format: ?width=300&height=300&resize=cover
    const params = new URLSearchParams();
    if (width) params.append('width', width.toString());
    if (height) params.append('height', height.toString());
    if (width || height) params.append('resize', 'cover');

    return params.toString() ? `${publicUrl}?${params.toString()}` : publicUrl;
};
