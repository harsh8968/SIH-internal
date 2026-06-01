import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Alert,
    Platform,
    Dimensions,
    ActivityIndicator,
    Image,
    ScrollView
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants';
import aiService from '../services/ai';
import { AIDetectionResult, Report, AIVideoDetectionResult } from '../types';
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

type ScreenState = 'idle' | 'recording' | 'analyzing' | 'review' | 'done';

export default function LiveDetectionScreen({ onCapture, onClose }: LiveDetectionScreenProps) {
    const [permission, requestPermission] = useCameraPermissions();
    const [micPermission, requestMicPermission] = useMicrophonePermissions();
    const [facing, setFacing] = useState<CameraType>('back');
    const [mode, setMode] = useState<'picture' | 'video'>('picture');
    const [isRecording, setIsRecording] = useState(false);

    // State Machine for Video Analysis & Review UI
    const [screenState, setScreenState] = useState<ScreenState>('idle');
    const [videoUri, setVideoUri] = useState<string>('');
    const [videoUrl, setVideoUrl] = useState<string>('');
    const [detections, setDetections] = useState<AIVideoDetectionResult[]>([]);
    const [currentReviewIndex, setCurrentReviewIndex] = useState<number>(0);
    const [approvedCount, setApprovedCount] = useState<number>(0);
    const [rejectedCount, setRejectedCount] = useState<number>(0);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [submitProgress, setSubmitProgress] = useState<string>('');

    // Refs
    const isRecordingRef = useRef(false);
    const cameraRef = useRef<CameraView>(null);
    const webStreamRef = useRef<any>(null);
    const webRecorderRef = useRef<any>(null);

    // Clean up web stream tracks when unmounted
    useEffect(() => {
        return () => {
            if (webStreamRef.current) {
                webStreamRef.current.getTracks().forEach((track: any) => track.stop());
            }
        };
    }, []);

    useEffect(() => {
        if (permission && !permission.granted) {
            requestPermission();
        }
        if (micPermission && !micPermission.granted) {
            requestMicPermission();
        }
    }, [permission, micPermission]);

    const handleStartRecording = async () => {
        // Web Browser Video Recording Flow
        if (Platform.OS === 'web') {
            try {
                setScreenState('recording');
                setIsRecording(true);
                isRecordingRef.current = true;

                console.log('🎥 Web: Requesting camera stream for recording...');
                // Attempt to request video + audio, fallback to video-only if microphone blocked
                let stream: MediaStream;
                try {
                    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                } catch (err) {
                    console.log('🎙️ Web: No microphone or audio blocked, requesting video only...');
                    stream = await navigator.mediaDevices.getUserMedia({ video: true });
                }

                webStreamRef.current = stream;

                // Find a supported web-compatible video MIME type
                let options = { mimeType: 'video/webm;codecs=vp9' };
                if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                    options = { mimeType: 'video/webm;codecs=vp8' };
                    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                        options = { mimeType: 'video/webm' };
                        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                            options = { mimeType: 'video/mp4' }; // Safari fallback
                        }
                    }
                }

                console.log(`🎥 Web: Initializing MediaRecorder with MIME: ${options.mimeType}`);
                const mediaRecorder = new MediaRecorder(stream, options);
                webRecorderRef.current = mediaRecorder;

                const chunks: Blob[] = [];
                mediaRecorder.ondataavailable = (e) => {
                    if (e.data && e.data.size > 0) {
                        chunks.push(e.data);
                    }
                };

                mediaRecorder.onstop = () => {
                    console.log('🛑 Web: MediaRecorder stopped. Packaging blob...');
                    const blob = new Blob(chunks, { type: options.mimeType });
                    const blobUrl = URL.createObjectURL(blob);
                    console.log('🔗 Web: Video Blob URL:', blobUrl);
                    handleRecordingFinished(blobUrl);
                };

                mediaRecorder.start();
                console.log('🎥 Web: MediaRecorder started successfully!');
            } catch (error: any) {
                console.error('🎥 Web: Start recording error:', error);
                Alert.alert('Recording Failed', `Could not start web video recording: ${error.message || error}`);
                setIsRecording(false);
                isRecordingRef.current = false;
                setScreenState('idle');
            }
            return;
        }

        // Native Mobile Video Recording Flow
        if (cameraRef.current) {
            try {
                setMode('video');
                setScreenState('recording');

                // Allow state to update and camera to reconfigure
                await new Promise(resolve => setTimeout(resolve, 500));

                if (!cameraRef.current) return;

                console.log('🎥 Starting Recording...');
                isRecordingRef.current = true;
                setIsRecording(true);

                const video = await cameraRef.current.recordAsync({
                    maxDuration: 60,
                });

                console.log('🛑 Recording finished. Video URI:', video?.uri);
                handleRecordingFinished(video?.uri);

            } catch (error: any) {
                console.error('Recording error:', error);
                Alert.alert('Error', `Failed to record video: ${error.message || 'Unknown error'}`);
                
                isRecordingRef.current = false;
                setIsRecording(false);
                setMode('picture');
                setScreenState('idle');
            }
        }
    };

    const handleStopRecording = () => {
        // Web Browser Video Stopping Flow
        if (Platform.OS === 'web') {
            if (webRecorderRef.current && isRecording) {
                console.log('🛑 Web: Stopping MediaRecorder...');
                webRecorderRef.current.stop();
                
                // Stop all camera stream tracks to turn off camera hardware light
                if (webStreamRef.current) {
                    webStreamRef.current.getTracks().forEach((track: any) => track.stop());
                }
                
                setIsRecording(false);
                isRecordingRef.current = false;
            }
            return;
        }

        // Native Mobile Video Stopping Flow
        if (cameraRef.current && isRecording) {
            cameraRef.current.stopRecording();
        }
    };

    const handleRecordingFinished = async (recordedUri?: string) => {
        isRecordingRef.current = false;
        setIsRecording(false);

        if (!recordedUri) {
            setMode('picture');
            setScreenState('idle');
            Alert.alert('Error', 'Video recording failed.');
            return;
        }

        setVideoUri(recordedUri);
        setScreenState('analyzing');
        setSubmitProgress('Uploading and analyzing video...');

        try {
            // 1. Fetch Location and User
            console.log('[LiveDetection] 📍 Fetching user and location...');
            const user = await authService.getCurrentUser();
            if (!user) throw new Error('User not logged in');

            const location = await locationService.getCurrentLocation();
            if (!location) throw new Error('Could not get location. Enable GPS.');

            const reportId = generateId();

            // 2. Upload Video to Supabase Storage
            setSubmitProgress('Uploading video to cloud...');
            console.log('[LiveDetection] 📤 Uploading video...');
            const uploadedUrl = await uploadVideoToSupabase(recordedUri, reportId);
            setVideoUrl(uploadedUrl);
            console.log('[LiveDetection] ✓ Video URL:', uploadedUrl);

            // 3. Trigger frame-by-frame YOLO analysis on the backend
            setSubmitProgress('Extracting frames and checking with AI...');
            console.log('[LiveDetection] 🔍 Starting YOLO frame analysis...');
            const results = await aiService.detectVideo(recordedUri);
            
            console.log(`[LiveDetection] ✓ Frame analysis complete. Found ${results.length} detections.`);
            setDetections(results);
            setCurrentReviewIndex(0);
            setApprovedCount(0);
            setRejectedCount(0);
            setScreenState('review');

        } catch (error: any) {
            console.error('[LiveDetection] ❌ Video processing failed:', error);
            Alert.alert(
                'Analysis Failed',
                error.message || 'Could not analyze video. Please try again.',
                [
                    {
                        text: 'Cancel',
                        style: 'cancel',
                        onPress: () => {
                            setMode('picture');
                            setScreenState('idle');
                        }
                    },
                    {
                        text: 'Retry',
                        onPress: () => handleRecordingFinished(recordedUri)
                    }
                ]
            );
        }
    };

    const handleApprove = async () => {
        if (isSubmitting || detections.length === 0) return;
        const currentDetection = detections[currentReviewIndex];
        
        setIsSubmitting(true);
        setSubmitProgress(`Submitting report ${currentReviewIndex + 1} of ${detections.length}...`);
        
        try {
            const user = await authService.getCurrentUser();
            if (!user) throw new Error('User not logged in');

            const location = await locationService.getCurrentLocation();
            if (!location) throw new Error('Location not available');

            const reportId = generateId();
            
            // Upload specific frame image to Supabase
            console.log('[LiveDetection] 📤 Uploading frame image to Supabase...');
            const cloudPhotoUrl = await uploadImageToSupabase(currentDetection.frameImage, 'damage-photos', reportId);
            
            const report: Report = {
                id: reportId,
                citizenId: user.id,
                reportingMode: 'on-site',
                location: {
                    ...location,
                    zone: location.zone || 'zone1'
                },
                photoUri: cloudPhotoUrl,
                videoUri: videoUrl, // Link to original video URL
                aiDetection: {
                    damageType: currentDetection.damageType,
                    confidence: currentDetection.confidence,
                    severity: currentDetection.severity,
                    boundingBox: currentDetection.boundingBox
                },
                status: 'pending',
                syncStatus: 'synced',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            console.log('[LiveDetection] 💾 Saving report...');
            await storageService.saveReport(report);
            
            setApprovedCount(c => c + 1);
            advanceReview();
        } catch (error: any) {
            console.error('❌ Failed to approve report:', error);
            Alert.alert('Submission Error', `Could not submit report: ${error.message || 'Unknown error'}`);
        } finally {
            setIsSubmitting(false);
            setSubmitProgress('');
        }
    };

    const handleReject = () => {
        setRejectedCount(c => c + 1);
        advanceReview();
    };

    const handleAutoSubmitAll = async () => {
        if (isSubmitting || detections.length === 0) return;
        
        setIsSubmitting(true);
        const remainingDetections = detections.slice(currentReviewIndex);
        let successCount = 0;
        
        try {
            const user = await authService.getCurrentUser();
            if (!user) throw new Error('User not logged in');

            const location = await locationService.getCurrentLocation();
            if (!location) throw new Error('Location not available');

            for (let i = 0; i < remainingDetections.length; i++) {
                const detection = remainingDetections[i];
                const realIndex = currentReviewIndex + i;
                
                setSubmitProgress(`Auto-submitting report ${realIndex + 1} of ${detections.length}...`);
                
                const reportId = generateId();
                
                // Upload this frame's base64 image
                const cloudPhotoUrl = await uploadImageToSupabase(detection.frameImage, 'damage-photos', reportId);
                
                const report: Report = {
                    id: reportId,
                    citizenId: user.id,
                    reportingMode: 'on-site',
                    location: {
                        ...location,
                        zone: location.zone || 'zone1'
                    },
                    photoUri: cloudPhotoUrl,
                    videoUri: videoUrl,
                    aiDetection: {
                        damageType: detection.damageType,
                        confidence: detection.confidence,
                        severity: detection.severity,
                        boundingBox: detection.boundingBox
                    },
                    status: 'pending',
                    syncStatus: 'synced',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                };

                await storageService.saveReport(report);
                successCount++;
            }
            
            setApprovedCount(c => c + successCount);
            setScreenState('done');
        } catch (error: any) {
            console.error('❌ Auto-submit error:', error);
            Alert.alert('Auto-Submit Error', `Auto-submission failed midway: ${error.message || 'Unknown error'}`);
            setCurrentReviewIndex(c => c + successCount);
        } finally {
            setIsSubmitting(false);
            setSubmitProgress('');
        }
    };

    const advanceReview = () => {
        if (currentReviewIndex < detections.length - 1) {
            setCurrentReviewIndex(c => c + 1);
        } else {
            setScreenState('done');
        }
    };

    const handleRestartCamera = () => {
        setVideoUri('');
        setVideoUrl('');
        setDetections([]);
        setCurrentReviewIndex(0);
        setApprovedCount(0);
        setRejectedCount(0);
        setMode('picture');
        setScreenState('idle');
    };

    // Render loading/analyzing state
    if (screenState === 'analyzing') {
        return (
            <View style={styles.loadingContainer}>
                <View style={styles.loadingCard}>
                    <ActivityIndicator size="large" color={COLORS.primary} style={{ marginBottom: 20 }} />
                    <Text style={styles.loadingTitle}>Processing Live Video</Text>
                    <Text style={styles.loadingSubtitle}>{submitProgress}</Text>
                </View>
            </View>
        );
    }

    // Render done state
    if (screenState === 'done') {
        return (
            <View style={styles.loadingContainer}>
                <View style={styles.loadingCard}>
                    <View style={styles.successIcon}>
                        <Ionicons name="checkmark-circle" size={80} color={COLORS.success} />
                    </View>
                    <Text style={styles.loadingTitle}>Analysis Review Complete!</Text>
                    
                    <View style={styles.statsContainer}>
                        <View style={styles.statRow}>
                            <Text style={styles.statLabel}>Total AI Detections</Text>
                            <Text style={styles.statVal}>{detections.length}</Text>
                        </View>
                        <View style={styles.statRow}>
                            <Text style={styles.statLabel}>Approved & Submitted</Text>
                            <Text style={[styles.statVal, { color: COLORS.success }]}>{approvedCount}</Text>
                        </View>
                        <View style={styles.statRow}>
                            <Text style={styles.statLabel}>Rejected / Discarded</Text>
                            <Text style={[styles.statVal, { color: COLORS.danger }]}>{rejectedCount}</Text>
                        </View>
                    </View>

                    <TouchableOpacity style={styles.primaryDoneButton} onPress={onClose}>
                        <Text style={styles.primaryDoneButtonText}>Go to Home Screen</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity style={styles.secondaryDoneButton} onPress={handleRestartCamera}>
                        <Text style={styles.secondaryDoneButtonText}>Record Another Video</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    // Render review UI screen
    if (screenState === 'review') {
        // Case: No detections found
        if (detections.length === 0) {
            return (
                <View style={styles.loadingContainer}>
                    <View style={styles.loadingCard}>
                        <View style={styles.successIcon}>
                            <Ionicons name="alert-circle" size={80} color={COLORS.warning} />
                        </View>
                        <Text style={styles.loadingTitle}>No Damages Detected</Text>
                        <Text style={styles.noDetectionsText}>
                            Our AI frame analyzer did not detect any cracks or potholes in this video exceeding the 25% threshold.
                        </Text>
                        
                        <TouchableOpacity style={styles.primaryDoneButton} onPress={handleRestartCamera}>
                            <Text style={styles.primaryDoneButtonText}>Retake Video</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity style={styles.secondaryDoneButton} onPress={onClose}>
                            <Text style={styles.secondaryDoneButtonText}>Cancel & Go Home</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            );
        }

        const currentDetection = detections[currentReviewIndex];
        const box = currentDetection.boundingBox;
        const severityColor = currentDetection.severity === 'high' ? COLORS.danger : COLORS.warning;

        return (
            <View style={styles.reviewContainer}>
                <View style={styles.reviewHeader}>
                    <TouchableOpacity onPress={handleRestartCamera} style={styles.backButton}>
                        <Ionicons name="chevron-back" size={24} color="white" />
                    </TouchableOpacity>
                    <Text style={styles.reviewTitle}>
                        Detection {currentReviewIndex + 1} of {detections.length}
                    </Text>
                    <TouchableOpacity onPress={onClose} style={styles.backButton}>
                        <Ionicons name="close" size={24} color="white" />
                    </TouchableOpacity>
                </View>

                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                    {/* Bounding box image preview */}
                    <View style={styles.imageCard}>
                        <View style={styles.imageContainer}>
                            <Image 
                                source={{ uri: currentDetection.frameImage }} 
                                style={styles.frameImage} 
                                resizeMode="cover"
                            />
                            
                            {/* SVG-like absolute box overlay using percentages */}
                            <View style={styles.boundingBoxOverlay}>
                                <View style={[
                                    styles.reviewBoundingBox,
                                    {
                                        top: `${box.y * 100}%`,
                                        left: `${box.x * 100}%`,
                                        width: `${box.width * 100}%`,
                                        height: `${box.height * 100}%`,
                                        borderColor: severityColor,
                                    }
                                ]}>
                                    <View style={[styles.reviewLabelBadge, { backgroundColor: severityColor }]}>
                                        <Text style={styles.reviewLabelText}>
                                            {currentDetection.damageType} ({Math.round(currentDetection.confidence * 100)}%)
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        </View>
                    </View>

                    {/* Metadata Card */}
                    <View style={styles.metadataCard}>
                        <Text style={styles.metaTitle}>ROAD DAMAGE DETECTED</Text>
                        
                        <View style={styles.metaRow}>
                            <View style={styles.metaCol}>
                                <Text style={styles.metaLabel}>DAMAGE TYPE</Text>
                                <Text style={styles.metaVal}>{currentDetection.damageType.toUpperCase()}</Text>
                            </View>
                            <View style={styles.metaCol}>
                                <Text style={styles.metaLabel}>TIMESTAMP</Text>
                                <Text style={styles.metaVal}>{currentDetection.timestamp}</Text>
                            </View>
                        </View>

                        <View style={styles.metaRow}>
                            <View style={styles.metaCol}>
                                <Text style={styles.metaLabel}>CONFIDENCE</Text>
                                <Text style={styles.metaVal}>{Math.round(currentDetection.confidence * 100)}%</Text>
                            </View>
                            <View style={styles.metaCol}>
                                <Text style={styles.metaLabel}>SEVERITY LEVEL</Text>
                                <Text style={[styles.metaVal, { color: severityColor }]}>
                                    {currentDetection.severity.toUpperCase()}
                                </Text>
                            </View>
                        </View>
                    </View>
                </ScrollView>

                {/* Submit Loader */}
                {isSubmitting && (
                    <View style={styles.submittingOverlay}>
                        <ActivityIndicator size="large" color="white" style={{ marginBottom: 10 }} />
                        <Text style={styles.submittingText}>{submitProgress}</Text>
                    </View>
                )}

                {/* Action Buttons Footer */}
                {!isSubmitting && (
                    <View style={styles.reviewFooter}>
                        {/* Reject */}
                        <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} onPress={handleReject}>
                            <Ionicons name="close" size={28} color="white" />
                            <Text style={styles.actionBtnText}>Reject</Text>
                        </TouchableOpacity>

                        {/* Approve */}
                        <TouchableOpacity style={[styles.actionBtn, styles.approveBtn]} onPress={handleApprove}>
                            <Ionicons name="checkmark" size={28} color="white" />
                            <Text style={styles.actionBtnText}>Approve</Text>
                        </TouchableOpacity>

                        {/* Auto Submit All */}
                        <TouchableOpacity style={[styles.actionBtn, styles.autoSubmitBtn]} onPress={handleAutoSubmitAll}>
                            <Ionicons name="flash" size={28} color="white" />
                            <Text style={styles.actionBtnText}>Auto AI</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        );
    }

    // Default Camera Screen (ScreenState === 'idle' or 'recording')
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
                mode={mode}
            >
                {/* Clean Camera UI controls */}
                <View style={styles.controlsContainer}>
                    <View style={styles.topBar}>
                        <TouchableOpacity onPress={onClose} style={styles.iconButton}>
                            <Ionicons name="close-circle" size={40} color="white" />
                        </TouchableOpacity>
                        
                        <View style={styles.statusBadge}>
                            <View style={[styles.statusDot, { backgroundColor: isRecording ? '#ef4444' : '#22c55e' }]} />
                            <Text style={styles.statusText}>
                                {isRecording ? 'RECORDING VIDEO' : 'LIVE ANALYSIS'}
                            </Text>
                        </View>
                        
                        <TouchableOpacity onPress={() => setFacing(c => (c === 'back' ? 'front' : 'back'))} style={styles.iconButton}>
                            <Ionicons name="camera-reverse" size={32} color="white" />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.bottomBar}>
                        <Text style={styles.hintText}>
                            {isRecording ? 'Move slowly to capture road conditions...' : 'Press record to capture live road cracks/potholes'}
                        </Text>

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
            </CameraView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'black' },
    camera: { flex: 1 },
    text: { color: 'white', textAlign: 'center', marginTop: 100, fontSize: 16 },
    button: { alignSelf: 'center', backgroundColor: COLORS.primary, padding: 15, borderRadius: 10, marginTop: 20 },
    buttonText: { color: 'white', fontWeight: 'bold' },
    
    // Camera View controls
    controlsContainer: { flex: 1, justifyContent: 'space-between', padding: 20, paddingTop: 50, zIndex: 20 },
    topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    iconButton: { padding: 8 },
    statusBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
    statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
    statusText: { color: 'white', fontWeight: 'bold', fontSize: 12 },
    bottomBar: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 20, paddingBottom: 40 },
    recordButton: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: 'white', justifyContent: 'center', alignItems: 'center', marginTop: 10 },
    recordInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#ef4444' },
    stopButton: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: 'white', justifyContent: 'center', alignItems: 'center', marginTop: 10 },
    stopInner: { width: 40, height: 40, borderRadius: 4, backgroundColor: '#ef4444' },
    hintText: { color: '#d1d5db', fontSize: 14, marginBottom: 15, fontStyle: 'italic', textAlign: 'center' },

    // Analyzing/Done State UI Styles
    loadingContainer: { flex: 1, backgroundColor: '#090d16', justifyContent: 'center', alignItems: 'center', padding: 20 },
    loadingCard: { backgroundColor: '#131926', borderRadius: 24, padding: 30, width: '100%', maxWidth: 400, alignItems: 'center', alignSelf: 'center', borderWidth: 1, borderColor: '#1f2a40', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10 },
    loadingTitle: { fontSize: 22, fontWeight: 'bold', color: 'white', marginBottom: 10, textAlign: 'center' },
    loadingSubtitle: { fontSize: 15, color: '#9ca3af', textAlign: 'center', fontStyle: 'italic' },
    successIcon: { marginBottom: 20 },
    statsContainer: { width: '100%', backgroundColor: '#1c2538', borderRadius: 16, padding: 20, marginVertical: 20, borderWidth: 1, borderColor: '#2b3954' },
    statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#2b3954' },
    statLabel: { color: '#9ca3af', fontSize: 14, fontWeight: '600' },
    statVal: { color: 'white', fontSize: 15, fontWeight: 'bold' },
    primaryDoneButton: { width: '100%', backgroundColor: COLORS.primary, paddingVertical: 15, borderRadius: 12, alignItems: 'center', marginTop: 10 },
    primaryDoneButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    secondaryDoneButton: { width: '100%', backgroundColor: 'transparent', paddingVertical: 15, borderRadius: 12, alignItems: 'center', alignSelf: 'center', borderWidth: 1, borderColor: '#3b82f6', marginTop: 10 },
    secondaryDoneButtonText: { color: '#3b82f6', fontWeight: 'bold', fontSize: 15 },
    noDetectionsText: { color: '#9ca3af', textAlign: 'center', fontSize: 15, lineHeight: 22, marginBottom: 25 },

    // Review Screen Styles
    reviewContainer: { flex: 1, backgroundColor: '#090d16', paddingBottom: 30 },
    reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#1c2538' },
    backButton: { padding: 8 },
    reviewTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
    scrollContent: { padding: 20 },
    imageCard: { backgroundColor: '#131926', borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: '#1f2a40', marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 5 },
    imageContainer: { width: '100%', height: 350, position: 'relative' },
    frameImage: { width: '100%', height: '100%' },
    boundingBoxOverlay: { ...StyleSheet.absoluteFillObject },
    reviewBoundingBox: { position: 'absolute', borderWidth: 3, borderRadius: 4, zIndex: 10 },
    reviewLabelBadge: { position: 'absolute', top: -25, left: -2, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
    reviewLabelText: { color: 'white', fontWeight: 'bold', fontSize: 11, textTransform: 'uppercase' },

    metadataCard: { backgroundColor: '#131926', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#1f2a40', marginBottom: 20 },
    metaTitle: { color: '#3b82f6', fontWeight: 'bold', fontSize: 13, letterSpacing: 1.5, marginBottom: 15 },
    metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
    metaCol: { flex: 1 },
    metaLabel: { color: '#9ca3af', fontSize: 10, fontWeight: '700', marginBottom: 4 },
    metaVal: { color: 'white', fontSize: 16, fontWeight: 'bold' },

    // Footer actions
    reviewFooter: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, gap: 10 },
    actionBtn: { flex: 1, height: 60, borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 },
    actionBtnText: { color: 'white', fontWeight: 'bold', fontSize: 14, marginLeft: 6 },
    rejectBtn: { backgroundColor: '#ef4444' },
    approveBtn: { backgroundColor: '#22c55e' },
    autoSubmitBtn: { backgroundColor: '#3b82f6' },

    // Submit Loader Overlay
    submittingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(9, 13, 22, 0.85)', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
    submittingText: { color: 'white', marginTop: 15, fontSize: 15, fontWeight: '600' }
});
