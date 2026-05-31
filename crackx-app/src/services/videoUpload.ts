import { supabase } from '../config/supabase';
import { Platform } from 'react-native';

/**
 * Upload video to Supabase Storage
 * @param uri - Local file URI (from Camera)
 * @param folder - Folder name ('report-videos')
 * @param reportId - Report ID for naming
 * @returns Public URL of uploaded video
 */
export const uploadVideoToSupabase = async (
    uri: string,
    reportId: string
): Promise<string> => {
    try {
        console.log('🎥 Starting video upload process...');

        const timestamp = Date.now();
        let fileExt = 'mp4';

        // Basic extension check
        if (Platform.OS === 'ios' && uri.includes('.mov')) {
            fileExt = 'mov';
        }

        const fileName = `${reportId}_${timestamp}.${fileExt}`;
        const filePath = `videos/${fileName}`;
        const contentType = `video/${fileExt}`;

        console.log('📝 Video details:', { fileName, filePath, contentType });

        // Prepare file body
        let fileBody: ArrayBuffer | Blob;

        console.log('🔄 Fetching video file from URI...');
        const response = await fetch(uri);
        if (!response.ok) {
            throw new Error(`Failed to read video file: ${response.statusText}`);
        }

        fileBody = await response.arrayBuffer();
        console.log(`✅ Video file fetched successfully (${fileBody.byteLength} bytes)`);

        if (fileBody.byteLength === 0) {
            throw new Error('Video file is empty');
        }

        // Upload to Supabase
        console.log('☁️ Uploading video to Supabase Storage...');

        const { data, error } = await supabase.storage
            .from('report-images') // Use the existing 'report-images' bucket
            .upload(filePath, fileBody, {
                contentType: contentType,
                cacheControl: '3600',
                upsert: false,
            });

        if (error) {
            console.error('❌ Supabase Video Upload Error:', error);
            throw error;
        }

        console.log('✅ Video upload successful. Retrieving public URL...');

        const { data: urlData } = supabase.storage
            .from('report-images')
            .getPublicUrl(filePath);

        if (!urlData.publicUrl) {
            throw new Error('Failed to get public video URL');
        }

        console.log('🔗 Public Video URL:', urlData.publicUrl);
        return urlData.publicUrl;

    } catch (error: any) {
        console.error('❌ Video Upload Failed:', error);
        throw new Error(error.message || 'Video upload failed');
    }
};
