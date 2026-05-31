import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Alert,
    Platform,
    Dimensions,
    ActivityIndicator
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants';
import aiService from '../services/ai';
import { AIDetectionResult, Report } from '../types';
import locationService from '../services/location';
import storageService from '../services/supabaseStorage';
import authService from '../services/supabaseAuth';
import { uploadImageToSupabase } from '../services/imageUpload';
import { uploadVideoToSupabase } from '../services/videoUpload';
import { generateId } from '../utils';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface LiveDetectionScreenProps {
    onCapture: (photoUri: string, detection: AIDetectionResult) => void;
    onClose: () => void;
}

export default function LiveDetectionScreen({ onCapture, onClose }: LiveDetectionScreenProps) {
    const [permission, requestPermission] = useCameraPermissions();
    const [micPermission, requestMicPermission] = useMicrophonePermissions();
    const [facing, setFacing] = useState<CameraType>('back');
    const [mode, setMode] = useState<'picture' | 'video'>('picture'); // Explicitly manage mode
    const [isScanning, setIsScanning] = useState(true);
    const [isRecording, setIsRecording] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [detection, setDetection] = useState<AIDetectionResult | null>(null);
    const [lastScanTime, setLastScanTime] = useState(0);

    // Refs for state accessible in loops/callbacks
    const isRecordingRef = useRef(false);
    const bestDetectionRef = useRef<{ detection: AIDetectionResult; uri: string } | null>(null);
    const cameraRef = useRef<CameraView>(null);

    useEffect(() => {
        if (permission && !permission.granted) {
            requestPermission();
        }
        if (micPermission && !micPermission.granted) {
            requestMicPermission();
        }
    }, [permission, micPermission]);

    // Continuous scanning loop (runs ONLY when NOT recording)
    useEffect(() => {
        let intervalId: NodeJS.Timeout;

        const scanFrame = async () => {
            // STOP scanning if recording or uploading
            if (isRecordingRef.current || isUploading || !cameraRef.current) return;

            // Only scan if in 'picture' mode (scanning mode)
            if (mode !== 'picture') return;

            const now = Date.now();
            if (now - lastScanTime < 1000) return; // Limit to 1 FPS

            try {
                // Take a silent snapshot for analysis
                const photo = await cameraRef.current.takePictureAsync({
                    quality: 0.4,
                    base64: false,
                    skipProcessing: true,
                    shutterSound: false,
                });

                if (photo && photo.uri) {
                    setLastScanTime(Date.now());

                    // Send to AI
                    const result = await aiService.detectDamage(photo.uri);

                    if (result && result.confidence > 0.5) {
                        setDetection(result);
                    } else {
                        setDetection(null);
                    }
                }
            } catch (error) {
                // Ignore errors (e.g. camera busy)
            }
        };

        if (isScanning && !isRecording) {
            intervalId = setInterval(scanFrame, 1500);
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [isScanning, isRecording, lastScanTime, isUploading, mode]);

    const handleStartRecording = async () => {
        if (Platform.OS === ('web' as any)) {
            window.alert('Video recording is not currently supported on the Web version. Please use the mobile app for this feature.');
            return;
        }

        if (cameraRef.current) {
            try {
                // 1. Switch to Video Mode explicitly
                setMode('video');
                setIsScanning(false);
                setDetection(null); // Clear previous detections

                // Allow state to update and camera to reconfigure
                await new Promise(resolve => setTimeout(resolve, 500));

                if (!cameraRef.current) return;

                console.log('🎥 Starting Recording...');
                isRecordingRef.current = true;
                setIsRecording(true);
                bestDetectionRef.current = null;

                const video = await cameraRef.current.recordAsync({
                    maxDuration: 60,
                });

                console.log('🛑 Recording finished. Video URI:', video?.uri);
                handleRecordingFinished(video?.uri);

            } catch (error: any) {
                console.error('Recording error:', error);

                if (Platform.OS === ('web' as any)) {
                    window.alert(`Recording Failed: ${error.message || 'Unknown error'}`);
                } else {
                    Alert.alert('Error', `Failed to record video: ${error.message || 'Unknown error'}`);
                }

                // Reset state on error
                isRecordingRef.current = false;
                setIsRecording(false);
                setMode('picture');
                setIsScanning(true);
            }
        }
    };

    const handleStopRecording = () => {
        if (cameraRef.current && isRecording) {
            cameraRef.current.stopRecording();
            // State update happens in recordAsync promise resolution (handleRecordingFinished)
        }
    };

    const handleRecordingFinished = async (videoUri?: string) => {
        isRecordingRef.current = false;
        setIsRecording(false);

        // Switch back to picture mode for scanning (unless we are uploading)
        if (!videoUri) {
            setMode('picture');
            setIsScanning(true);
            Alert.alert('Error', 'Video recording failed.');
            return;
        }

        // Simulating "Best Detection" logic since we couldn't scan DURING recording
        // In a real app, you'd frame-grab from the video or run a lightweight model.
        // For this demo, we'll assume if they recorded, they saw something.
        // We can either ask them to confirm, or just upload.

        Alert.alert(
            'Recording Complete',
            'Video captured successfully. Analyze and submit?',
            [
                {
                    text: 'Cancel',
                    style: 'cancel',
                    onPress: () => {
                        setMode('picture');
                        setIsScanning(true);
                    }
                },
                {
                    text: 'Submit Report',
                    onPress: () => submitAutoReport(videoUri)
                }
            ]
        );
    };

    const submitAutoReport = async (videoUri: string) => {
        setIsUploading(true);
        try {
            console.log('[LiveDetection] 📹 Starting video report submission...');
            console.log('[LiveDetection] Video URI:', videoUri);

            // 1. Get User & Location
            const user = await authService.getCurrentUser();
            if (!user) throw new Error('User not logged in');
            console.log('[LiveDetection] ✓ User verified:', user.username);

            const location = await locationService.getCurrentLocation();
            if (!location) throw new Error('Could not get location. Enable GPS.');
            console.log('[LiveDetection] ✓ Location obtained:', location.zone);

            const reportId = generateId();
            console.log('[LiveDetection] ✓ Report ID generated:', reportId);

            // 2. Upload Video
            console.log('[LiveDetection] 📤 Starting video upload to Supabase...');
            const videoUrl = await uploadVideoToSupabase(videoUri, reportId);
            console.log('[LiveDetection] ✅ Video uploaded successfully!');
            console.log('[LiveDetection] Video URL:', videoUrl);

            // 3. Generate Thumbnail (since we didn't scan during record)
            // Ideally we'd generate a thumbnail from video. 
            // For now, we'll use a placeholder or reuse 'videoUri' if the API supports it
            // Or we just skip the photoUri for video-only reports (if allowed)
            // Let's rely on the backend or just send the video.

            // 4. Create Report
            const report: Report = {
                id: reportId,
                citizenId: user.id,
                reportingMode: 'on-site',
                location: {
                    ...location,
                    zone: location.zone || 'zone1'
                },
                photoUri: '', // No photo, just video
                videoUri: videoUrl,
                // We don't have AI detection from the recording stream since we disabled scanning.
                // We'll mark it as 'pending' analysis.
                aiDetection: {
                    damageType: 'other',
                    confidence: 0.0,
                    severity: 'medium',
                    boundingBox: { x: 0, y: 0, width: 0, height: 0 }
                },
                status: 'pending',
                syncStatus: 'synced',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            console.log('[LiveDetection] 💾 Saving report to database...');
            await storageService.saveReport(report);
            console.log('[LiveDetection] ✅ Report saved successfully!');

            setIsUploading(false);
            Alert.alert('Success', 'Report submitted! Our AI will analyze the video.', [
                { text: 'OK', onPress: onClose }
            ]);

        } catch (error: any) {
            console.error('[LiveDetection] ❌ Upload failed:', error);
            console.error('[LiveDetection] Error message:', error.message);

            setIsUploading(false);

            Alert.alert(
                'Upload Failed',
                error.message || 'Could not submit video report. Please try again.',
                [
                    {
                        text: 'Cancel',
                        style: 'cancel',
                        onPress: () => {
                            // Go back to picture mode, video is lost
                            setMode('picture');
                            setTimeout(() => setIsScanning(true), 500);
                        }
                    },
                    {
                        text: 'Retry Upload',
                        onPress: () => {
                            // Retry with the same video
                            console.log('[LiveDetection] 🔄 Retrying upload...');
                            submitAutoReport(videoUri);
                        }
                    }
                ]
            );
        } finally {
            // Note: setIsUploading is now in the catch block before alert
            // to prevent stuck loading state
        }
    };

    if (!permission || !micPermission) return <View style={styles.container} />;
    if (!permission.granted || !micPermission.granted) {
        return (
            <View style={styles.container}>
                <Text style={styles.text}>Camera & Microphone Permission required</Text>
                <TouchableOpacity onPress={() => { requestPermission(); requestMicPermission(); }} style={styles.button}>
                    <Text style={styles.buttonText}>Grant Permissions</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <CameraView
                style={styles.camera}
                facing={facing}
                ref={cameraRef}
                mode={mode} // Dynamic mode switching
            >
                {/* Overlay for detections (Only in Scanning Mode) */}
                {isScanning && detection && (
                    <View style={styles.overlayContainer}>
                        <View style={[
                            styles.boundingBox,
                            {
                                top: detection.boundingBox.y * SCREEN_HEIGHT * 0.7,
                                left: detection.boundingBox.x * SCREEN_WIDTH,
                                width: detection.boundingBox.width * SCREEN_WIDTH,
                                height: detection.boundingBox.height * SCREEN_HEIGHT * 0.7,
                                borderColor: detection.severity === 'high' ? COLORS.danger : COLORS.warning,
                            }
                        ]}>
                            <View style={[styles.labelBadge, { backgroundColor: detection.severity === 'high' ? COLORS.danger : COLORS.warning }]}>
                                <Text style={styles.labelText}>
                                    {detection.damageType} ({Math.round(detection.confidence * 100)}%)
                                </Text>
                            </View>
                        </View>
                    </View>
                )}

                {/* Loading Overlay */}
                {isUploading && (
                    <View style={styles.loadingOverlay}>
                        <ActivityIndicator size="large" color={COLORS.white} />
                        <Text style={styles.loadingText}>Uploading Report & Video...</Text>
                    </View>
                )}

                {/* Controls */}
                {!isUploading && (
                    <View style={styles.controlsContainer}>
                        <View style={styles.topBar}>
                            <TouchableOpacity onPress={onClose} style={styles.iconButton}>
                                <Ionicons name="close-circle" size={40} color="white" />
                            </TouchableOpacity>
                            <View style={styles.statusBadge}>
                                <View style={[styles.statusDot, { backgroundColor: isRecording ? '#ef4444' : '#22c55e' }]} />
                                <Text style={styles.statusText}>
                                    {isRecording ? 'RECORDING REC' : 'LIVE ANALYSIS'}
                                </Text>
                            </View>
                            <TouchableOpacity onPress={() => setFacing(c => (c === 'back' ? 'front' : 'back'))} style={styles.iconButton}>
                                <Ionicons name="camera-reverse" size={32} color="white" />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.bottomBar}>
                            {detection && (
                                <View style={styles.detectionInfo}>
                                    <Text style={styles.detectionTitle}>{detection.damageType.toUpperCase()}</Text>
                                    <Text style={styles.detectionSubtitle}>{detection.severity.toUpperCase()} SEVERITY</Text>
                                </View>
                            )}

                            {!detection && (
                                <Text style={styles.hintText}>
                                    {isRecording ? 'Analyzing frames...' : 'Ready to analyze'}
                                </Text>
                            )}

                            {isRecording ? (
                                <TouchableOpacity style={styles.stopButton} onPress={handleStopRecording}>
                                    <View style={styles.stopInner} />
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity style={styles.recordButton} onPress={handleStartRecording}>
                                    <View style={styles.recordInner} />
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                )}
            </CameraView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'black' },
    camera: { flex: 1 },
    text: { color: 'white', textAlign: 'center' },
    button: { alignSelf: 'center', backgroundColor: COLORS.primary, padding: 15, borderRadius: 10, marginTop: 20 },
    buttonText: { color: 'white', fontWeight: 'bold' },
    overlayContainer: { ...StyleSheet.absoluteFillObject, zIndex: 1 },
    boundingBox: { position: 'absolute', borderWidth: 3, borderRadius: 4, zIndex: 10 },
    labelBadge: { position: 'absolute', top: -25, left: -2, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
    labelText: { color: 'white', fontWeight: 'bold', fontSize: 12, textTransform: 'uppercase' },
    loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 50 },
    loadingText: { color: 'white', marginTop: 10, fontSize: 16, fontWeight: 'bold' },
    controlsContainer: { flex: 1, justifyContent: 'space-between', padding: 20, paddingTop: 50, zIndex: 20 },
    topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    iconButton: { padding: 8 },
    statusBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
    statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
    statusText: { color: 'white', fontWeight: 'bold', fontSize: 12 },
    bottomBar: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 20, paddingBottom: 40 },
    recordButton: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: 'white', justifyContent: 'center', alignItems: 'center', marginTop: 20 },
    recordInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#ef4444' },
    stopButton: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: 'white', justifyContent: 'center', alignItems: 'center', marginTop: 20 },
    stopInner: { width: 40, height: 40, borderRadius: 4, backgroundColor: '#ef4444' },
    detectionInfo: { alignItems: 'center', marginBottom: 10 },
    detectionTitle: { color: 'white', fontWeight: 'bold', fontSize: 20, marginBottom: 4, textShadowColor: 'rgba(0,0,0,0.75)', textShadowRadius: 3 },
    detectionSubtitle: { color: '#fbbf24', fontWeight: 'bold', fontSize: 16 },
    hintText: { color: '#d1d5db', fontSize: 14, marginBottom: 20, fontStyle: 'italic' },
});
