import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Image,
    Alert,
    ActivityIndicator,
    Platform,
    TextInput,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { COLORS, ZONES } from '../constants';
import { ReportingMode, Report, Location as LocationType, AIDetectionResult } from '../types';
import locationService from '../services/location';
import aiService from '../services/ai';
import storageService from '../services/supabaseStorage';
import authService from '../services/supabaseAuth';
import { uploadImageToSupabase } from '../services/imageUpload';
import { generateId } from '../utils';
import { MapComponent } from '../components/MapComponent';
import DashboardLayout from '../components/DashboardLayout';
import { checkConnectionWithMessage } from '../utils/networkCheck';



interface ReportDamageScreenProps {
    onNavigate: (screen: string) => void;
    onBack: () => void;
    onSuccess: () => void;
    onLogout: () => void;
    initialData?: {
        photoUri: string;
        detection: AIDetectionResult;
    } | null;
}

export default function ReportDamageScreen({ onNavigate, onBack, onSuccess, onLogout, initialData }: ReportDamageScreenProps) {
    const { t } = useTranslation();

    // Initialize state based on initialData if present
    const [step, setStep] = useState<'mode' | 'photo' | 'location' | 'ai' | 'confirm'>(
        initialData ? 'confirm' : 'mode'
    );
    const [reportingMode, setReportingMode] = useState<ReportingMode>('on-site');
    const [photoUri, setPhotoUri] = useState<string>(initialData?.photoUri || '');
    const [location, setLocation] = useState<LocationType | null>(null);
    const [manualAddress, setManualAddress] = useState('');
    const [isEditingAddress, setIsEditingAddress] = useState(false);
    const [aiResult, setAiResult] = useState<any>(initialData?.detection || null);
    const [loading, setLoading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState('');

    // If initialData is provided, we need to ensure location is captured too
    useEffect(() => {
        if (initialData) {
            captureLocation();
        }
    }, []);

    const handleModeSelect = (mode: ReportingMode) => {
        setReportingMode(mode);
        setStep('photo');
    };

    const handleTakePhoto = async () => {
        if (Platform.OS !== 'web') {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert(t('error'), 'Camera permission is required');
                return;
            }
        }

        const result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.5,
            base64: true,
        });

        if (!result.canceled && result.assets && result.assets[0]) {
            const uri = Platform.OS === 'web' && result.assets[0].base64
                ? `data:image/jpeg;base64,${result.assets[0].base64}`
                : result.assets[0].uri;

            setPhotoUri(uri);
            setStep('location');
            // Always capture location to pre-fill coordinates/address
            captureLocation();
        }
    };

    const handleChooseFromGallery = async () => {
        if (Platform.OS !== 'web') {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert(t('error'), 'Media library permission is required');
                return;
            }
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.5,
            base64: true,
        });

        if (!result.canceled && result.assets && result.assets[0]) {
            const uri = Platform.OS === 'web' && result.assets[0].base64
                ? `data:image/jpeg;base64,${result.assets[0].base64}`
                : result.assets[0].uri;

            setPhotoUri(uri);
            setStep('location');
            // Always capture location to pre-fill coordinates/address
            captureLocation();
        }
    };

    const captureLocation = async () => {
        setLoading(true);
        try {
            const loc = await locationService.getCurrentLocation();
            if (loc) {
                setLocation(loc);
                // If reporting from elsewhere and no address entered yet, pre-fill with current location address
                if (reportingMode === 'from-elsewhere' && !manualAddress) {
                    const addr = loc.address || loc.roadName || '';
                    if (addr) {
                        setManualAddress(addr);
                    }
                }
            } else {
                Alert.alert(t('error'), 'Failed to get location. Please enable GPS.');
            }
        } catch (error) {
            Alert.alert(t('error'), 'Failed to capture location');
        } finally {
            setLoading(false);
        }
    };

    const handleLocationConfirm = () => {
        if (reportingMode === 'from-elsewhere' && !manualAddress) {
            Alert.alert(t('error'), 'Please enter an address');
            return;
        }
        setStep('ai');
        runAIDetection();
    };

    const runAIDetection = async () => {
        setLoading(true);
        try {
            const result = await aiService.detectDamage(photoUri);

            // Check if damage was actually detected or if confidence is extremely low
            if (!result || (result.damageType === 'other' && result.confidence < 0.3)) {
                if (Platform.OS === 'web') {
                    const confirmManual = window.confirm(
                        `${t('no_damage_detected')}\n${t('ai_no_damage_msg')}\n\n${t('report_anyway_question', 'Do you want to report it manually?')}`
                    );

                    if (confirmManual) {
                        setAiResult({
                            damageType: 'manual',
                            confidence: 1.0,
                            severity: 'medium',
                            boundingBox: { x: 0, y: 0, width: 0, height: 0 }
                        });
                        setStep('confirm');
                    } else {
                        setStep('photo');
                    }
                } else {
                    Alert.alert(
                        t('no_damage_detected'),
                        t('ai_no_damage_msg'),
                        [
                            { text: t('retake_photo'), onPress: () => setStep('photo') },
                            {
                                text: 'Report Anyway',
                                onPress: () => {
                                    setAiResult({
                                        damageType: 'manual',
                                        confidence: 1.0,
                                        severity: 'medium',
                                        boundingBox: { x: 0, y: 0, width: 0, height: 0 }
                                    });
                                    setStep('confirm');
                                }
                            },
                            { text: t('cancel'), style: 'cancel', onPress: onBack }
                        ]
                    );
                }
            } else {
                setAiResult(result);
                setStep('confirm');
            }
        } catch (error) {
            console.error('AI Detection Error:', error);
            Alert.alert(t('error'), 'AI detection failed to process image.');
            setStep('photo');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async () => {
        setLoading(true);
        try {
            // Check network connectivity first
            console.log('🌐 Checking network connectivity...');
            const connectionCheck = await checkConnectionWithMessage();

            if (!connectionCheck.connected) {
                Alert.alert(
                    'No Internet Connection',
                    connectionCheck.message,
                    [{ text: 'OK' }]
                );
                setLoading(false);
                return;
            }

            console.log('✅ Network connection verified');

            const user = await authService.getCurrentUser();
            if (!user) {
                Alert.alert(t('error'), 'User not found');
                setLoading(false);
                return;
            }

            // Generate report ID first
            const reportId = generateId();

            // Upload image to Supabase Storage
            setUploadProgress('Uploading image to cloud...');
            console.log('📤 Starting image upload...');
            const cloudPhotoUrl = await uploadImageToSupabase(photoUri, 'damage-photos', reportId);
            console.log('✅ Image uploaded:', cloudPhotoUrl);

            // Ensure we have a valid zone. If missing, try auto-detect.
            let finalZone = location?.zone;
            if (!finalZone && (location?.latitude || manualAddress)) {
                // Try to detect zone based on coordinates if they exist
                if (location?.latitude && location?.longitude) {
                    finalZone = locationService.detectZone(location.latitude, location.longitude);
                } else {
                    // Fallback to zone1 if completely manual without coords
                    finalZone = 'zone1';
                }
            }

            const finalLocation: LocationType = location ? {
                ...location,
                address: manualAddress || location.address || location.roadName || '',
                zone: finalZone || 'zone1'
            } : {
                latitude: 0,
                longitude: 0,
                address: manualAddress,
                zone: finalZone || 'zone1',
            };

            setUploadProgress('Saving report to database...');
            console.log('💾 Saving report to database...');
            const report: Report = {
                id: reportId,
                citizenId: user.id,
                reportingMode,
                location: finalLocation,
                photoUri: cloudPhotoUrl, // Use Supabase URL instead of local URI
                aiDetection: aiResult,
                status: 'pending',
                syncStatus: 'synced', // Already in cloud
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            await storageService.saveReport(report);
            console.log('✅ Report saved successfully!');

            setUploadProgress('');
            Alert.alert(t('success'), t('report_submitted'));
            onSuccess();
        } catch (error: any) {
            console.error('❌ Submit error:', error);

            // Show detailed error message
            const errorMessage = error?.message || error?.toString() || 'Unknown error occurred';

            // Provide user-friendly error messages
            let userMessage = errorMessage;
            if (errorMessage.includes('Network') || errorMessage.includes('network')) {
                userMessage = 'Network connection failed. Please check your internet connection and try again.';
            } else if (errorMessage.includes('timeout')) {
                userMessage = 'Request timed out. Please check your internet speed and try again.';
            } else if (errorMessage.includes('unauthorized') || errorMessage.includes('auth')) {
                userMessage = 'Authentication error. Please log out and log in again.';
            }

            Alert.alert(
                t('error'),
                userMessage
            );
        } finally {
            setLoading(false);
            setUploadProgress('');
        }
    };

    return (
        <DashboardLayout
            title={t('report_damage')}
            role="citizen" // Assuming citizen for now
            activeRoute="ReportDamage"
            onNavigate={onNavigate}
            onLogout={onLogout}
        >
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {/* Step: Mode Selection */}
                {step === 'mode' && (
                    <View style={styles.stepContainer}>
                        <Text style={styles.stepTitle}>{t('reporting_mode')}</Text>
                        <TouchableOpacity
                            style={styles.modeCard}
                            onPress={() => handleModeSelect('on-site')}
                        >
                            <Ionicons name="location-outline" size={48} color={COLORS.primary} style={{ marginBottom: 12 }} />
                            <Text style={styles.modeTitle}>{t('on_site')}</Text>
                            <Text style={styles.modeDesc}>{t('on_site_desc')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.modeCard}
                            onPress={() => handleModeSelect('from-elsewhere')}
                        >
                            <Ionicons name="map-outline" size={48} color={COLORS.primary} style={{ marginBottom: 12 }} />
                            <Text style={styles.modeTitle}>{t('from_elsewhere')}</Text>
                            <Text style={styles.modeDesc}>{t('from_elsewhere_desc')}</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Step: Photo */}
                {step === 'photo' && (
                    <View style={styles.stepContainer}>
                        <Text style={styles.stepTitle}>{t('take_photo')}</Text>
                        {photoUri ? (
                            <View>
                                <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                                <TouchableOpacity style={styles.button} onPress={handleTakePhoto}>
                                    <Text style={styles.buttonText}>{t('retake_photo')}</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View>
                                <TouchableOpacity style={styles.photoButton} onPress={handleTakePhoto}>
                                    <Ionicons name="camera" size={48} color={COLORS.white} style={{ marginBottom: 8 }} />
                                    <Text style={styles.photoButtonText}>{t('take_photo')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.photoButton, styles.photoButtonSecondary]}
                                    onPress={handleChooseFromGallery}
                                >
                                    <Ionicons name="images" size={48} color={COLORS.primary} style={{ marginBottom: 8 }} />
                                    <Text style={[styles.photoButtonText, { color: COLORS.primary }]}>{t('choose_from_gallery')}</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                )}

                {/* Step: Location */}
                {step === 'location' && (
                    <View style={styles.stepContainer}>
                        <Text style={styles.stepTitle}>
                            {reportingMode === 'on-site' ? t('current_location') : t('manual_location')}
                        </Text>
                        {loading ? (
                            <ActivityIndicator size="large" color={COLORS.primary} />
                        ) : reportingMode === 'on-site' ? (
                            <View>
                                {location && (
                                    <>
                                        <View style={styles.locationCard}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                                    <Ionicons name="pin" size={20} color={COLORS.primary} style={{ marginRight: 8 }} />
                                                    <Text style={[styles.locationText, { marginBottom: 0, flex: 1 }]}>
                                                        {manualAddress || location.roadName || 'Unknown Road'}
                                                    </Text>
                                                </View>
                                                <TouchableOpacity
                                                    onPress={() => setIsEditingAddress(!isEditingAddress)}
                                                    style={{ padding: 8 }}
                                                >
                                                    <Ionicons
                                                        name={isEditingAddress ? "close-circle" : "create-outline"}
                                                        size={24}
                                                        color={isEditingAddress ? COLORS.danger : COLORS.primary}
                                                    />
                                                </TouchableOpacity>
                                            </View>
                                            <Text style={styles.locationSubtext}>
                                                {location.area || 'Unknown Area'}
                                            </Text>
                                            <Text style={styles.locationSubtext}>
                                                Zone: {location.zone}
                                            </Text>
                                        </View>

                                        {/* Manual Address Input */}
                                        {isEditingAddress && (
                                            <View style={{ marginBottom: 16 }}>
                                                <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.dark, marginBottom: 8 }}>
                                                    {t('edit_address_details')}
                                                </Text>
                                                <TextInput
                                                    style={styles.input}
                                                    placeholder={t('enter_address_details')}
                                                    value={manualAddress}
                                                    onChangeText={setManualAddress}
                                                    multiline
                                                />
                                            </View>
                                        )}

                                        <View style={{ marginBottom: 16 }}>
                                            <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.dark, marginBottom: 8 }}>
                                                {t('detected_zone')}
                                            </Text>
                                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
                                                {ZONES.map((z) => (
                                                    <TouchableOpacity
                                                        key={z.id}
                                                        style={{
                                                            paddingVertical: 6,
                                                            paddingHorizontal: 12,
                                                            borderRadius: 20,
                                                            backgroundColor: location.zone === z.id ? COLORS.primary : COLORS.secondary,
                                                            marginRight: 8,
                                                            borderWidth: 1,
                                                            borderColor: location.zone === z.id ? COLORS.primary : COLORS.border,
                                                        }}
                                                        onPress={() => setLocation({ ...location, zone: z.id })}
                                                    >
                                                        <Text style={{
                                                            fontSize: 12,
                                                            fontWeight: '600',
                                                            color: location.zone === z.id ? COLORS.white : COLORS.gray
                                                        }}>
                                                            {z.name.split(' - ')[0]}
                                                        </Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </ScrollView>
                                        </View>

                                        {/* Map Component */}
                                        <View style={{ height: 300, marginBottom: 16 }}>
                                            <MapComponent
                                                latitude={location.latitude}
                                                longitude={location.longitude}
                                                interactive={false}
                                            />
                                        </View>
                                    </>
                                )}
                                <TouchableOpacity style={styles.button} onPress={handleLocationConfirm}>
                                    <Text style={styles.buttonText}>{t('confirm_address')}</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View>
                                <TouchableOpacity
                                    style={[styles.button, { backgroundColor: COLORS.secondary, marginBottom: 16, borderWidth: 1, borderColor: COLORS.primary, flexDirection: 'row', justifyContent: 'center' }]}
                                    onPress={captureLocation}
                                >
                                    <Ionicons name="navigate" size={20} color={COLORS.primary} style={{ marginRight: 8 }} />
                                    <Text style={[styles.buttonText, { color: COLORS.primary }]}>
                                        {t('use_current_location')}
                                    </Text>
                                </TouchableOpacity>

                                {location && (
                                    <Text style={{ marginBottom: 12, color: COLORS.success, fontWeight: 'bold', marginLeft: 4 }}>
                                        Coordinates: {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                                    </Text>
                                )}

                                <TextInput
                                    style={styles.input}
                                    placeholder={t('enter_location_details')}
                                    placeholderTextColor={COLORS.gray}
                                    value={manualAddress}
                                    onChangeText={setManualAddress}
                                    multiline
                                />

                                <View style={{ marginBottom: 20 }}>
                                    <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.dark, marginBottom: 8 }}>
                                        {t('select_zone')}
                                    </Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
                                        {ZONES.map((z) => {
                                            const isSelected = location?.zone === z.id || (!location && z.id === 'zone1'); // Default zone1 if no location
                                            return (
                                                <TouchableOpacity
                                                    key={z.id}
                                                    style={{
                                                        paddingVertical: 6,
                                                        paddingHorizontal: 12,
                                                        borderRadius: 20,
                                                        backgroundColor: isSelected ? COLORS.primary : COLORS.secondary,
                                                        marginRight: 8,
                                                        borderWidth: 1,
                                                        borderColor: isSelected ? COLORS.primary : COLORS.border,
                                                    }}
                                                    onPress={() => {
                                                        if (location) {
                                                            setLocation({ ...location, zone: z.id });
                                                        } else {
                                                            // Initialize dummy location for manual entry so we can store the zone
                                                            setLocation({
                                                                latitude: 0,
                                                                longitude: 0,
                                                                address: manualAddress,
                                                                zone: z.id,
                                                                roadName: '',
                                                                area: ''
                                                            });
                                                        }
                                                    }}
                                                >
                                                    <Text style={{
                                                        fontSize: 12,
                                                        fontWeight: '600',
                                                        color: isSelected ? COLORS.white : COLORS.gray
                                                    }}>
                                                        {z.name.split(' - ')[0]}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </ScrollView>
                                </View>

                                <TouchableOpacity style={styles.button} onPress={handleLocationConfirm}>
                                    <Text style={styles.buttonText}>{t('continue')}</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                )}

                {/* Step: AI Detection */}
                {step === 'ai' && (
                    <View style={styles.stepContainer}>
                        <Text style={styles.stepTitle}>{t('analyzing_image')}</Text>
                        <ActivityIndicator size="large" color={COLORS.primary} />
                    </View>
                )}

                {/* Step: Confirm */}
                {step === 'confirm' && aiResult && (
                    <View style={styles.stepContainer}>
                        <Text style={styles.stepTitle}>{t('review_submit')}</Text>
                        <Image source={{ uri: photoUri }} style={styles.photoPreview} />

                        <View style={styles.resultCard}>
                            <Text style={styles.resultTitle}>{t('ai_detection')}</Text>
                            <View style={styles.resultRow}>
                                <Text style={styles.resultLabel}>{t('damage_type')}:</Text>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={styles.resultValue}>{aiResult.damageType}</Text>
                                    <TouchableOpacity
                                        onPress={() => setAiResult({ ...aiResult, isEditing: !aiResult.isEditing })}
                                        style={{ marginTop: 4 }}
                                    >
                                        <Text style={{ color: COLORS.primary, fontSize: 12, fontWeight: '600' }}>
                                            {t('change_detection', 'Change?')}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {/* Damage Type Selection (Visible when Change is clicked) */}
                            {aiResult.isEditing && (
                                <View style={{
                                    flexDirection: 'row',
                                    flexWrap: 'wrap',
                                    justifyContent: 'flex-end',
                                    marginBottom: 16,
                                    marginTop: -8,
                                    borderTopWidth: 1,
                                    borderTopColor: COLORS.border,
                                    paddingTop: 12
                                }}>
                                    {['crack', 'pothole', 'other'].map((type) => (
                                        <TouchableOpacity
                                            key={type}
                                            style={{
                                                backgroundColor: aiResult.damageType === type ? COLORS.primary : COLORS.secondary,
                                                paddingHorizontal: 12,
                                                paddingVertical: 6,
                                                borderRadius: 16,
                                                marginLeft: 8,
                                                marginBottom: 8,
                                                borderWidth: 1,
                                                borderColor: aiResult.damageType === type ? COLORS.primary : COLORS.border
                                            }}
                                            onPress={() => {
                                                setAiResult({
                                                    ...aiResult,
                                                    damageType: type,
                                                    isEditing: false,
                                                    // If user manually changes type, we might want to flag it or set confidence?
                                                    // Keeping confidence as is or setting to 1.0 (manual override) could be valid.
                                                    confidence: 1.0 // Assume manual override is 100% confident
                                                });
                                            }}
                                        >
                                            <Text style={{
                                                color: aiResult.damageType === type ? COLORS.white : COLORS.gray,
                                                fontSize: 12,
                                                fontWeight: '600',
                                                textTransform: 'capitalize'
                                            }}>
                                                {type}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}

                            <View style={styles.resultRow}>
                                <Text style={styles.resultLabel}>{t('confidence')}:</Text>
                                <Text style={styles.resultValue}>
                                    {(aiResult.confidence * 100).toFixed(0)}%
                                </Text>
                            </View>
                            <View style={styles.resultRow}>
                                <Text style={styles.resultLabel}>{t('severity')}:</Text>
                                <Text
                                    style={[
                                        styles.resultValue,
                                        {
                                            color:
                                                aiResult.severity === 'high'
                                                    ? COLORS.severityHigh
                                                    : aiResult.severity === 'medium'
                                                        ? COLORS.severityMedium
                                                        : COLORS.severityLow,
                                        },
                                    ]}
                                >
                                    {aiResult.severity}
                                </Text>
                            </View>
                        </View>

                        {/* Upload Progress Indicator */}
                        {uploadProgress && (
                            <View style={styles.progressContainer}>
                                <ActivityIndicator size="small" color={COLORS.primary} />
                                <Text style={styles.progressText}>{uploadProgress}</Text>
                            </View>
                        )}

                        <TouchableOpacity
                            style={[styles.button, loading && styles.buttonDisabled]}
                            onPress={handleSubmit}
                            disabled={loading}
                        >
                            <Text style={styles.buttonText}>
                                {loading ? t('loading') : t('submit')}
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>
        </DashboardLayout>
    );
}

const styles = StyleSheet.create({
    content: {
        flex: 1,
    },
    stepContainer: {
        padding: 24,
    },
    stepTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: COLORS.dark,
        marginBottom: 20,
    },
    modeCard: {
        backgroundColor: COLORS.white,
        borderRadius: 16,
        padding: 24,
        marginBottom: 16,
        alignItems: 'center',
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 4,
        borderWidth: 1,
        borderColor: COLORS.secondary,
    },
    modeIcon: {
        fontSize: 48,
        marginBottom: 12,
        color: COLORS.primary,
    },
    modeTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.dark,
        marginBottom: 8,
    },
    modeDesc: {
        fontSize: 14,
        color: COLORS.gray,
        textAlign: 'center',
    },
    photoButton: {
        backgroundColor: COLORS.primary,
        borderRadius: 12,
        padding: 24,
        alignItems: 'center',
        marginBottom: 16,
        shadowColor: COLORS.primary,
        shadowOpacity: 0.3,
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 8,
        elevation: 4,
    },
    photoButtonSecondary: {
        backgroundColor: COLORS.white,
        borderWidth: 2,
        borderColor: COLORS.primary,
    },
    photoButtonIcon: {
        fontSize: 48,
        marginBottom: 8,
    },
    photoButtonText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: COLORS.white,
    },
    photoPreview: {
        width: '100%',
        height: 300,
        borderRadius: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    locationCard: {
        backgroundColor: COLORS.white,
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    locationText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: COLORS.dark,
        marginBottom: 8,
    },
    locationSubtext: {
        fontSize: 14,
        color: COLORS.gray,
        marginBottom: 4,
    },
    input: {
        backgroundColor: COLORS.white,
        borderRadius: 12,
        padding: 16,
        fontSize: 16,
        marginBottom: 20,
        minHeight: 100,
        textAlignVertical: 'top',
        borderWidth: 1,
        borderColor: COLORS.border,
        color: COLORS.dark,
    },
    resultCard: {
        backgroundColor: COLORS.white,
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: COLORS.border,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 2,
    },
    resultTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.dark,
        marginBottom: 16,
    },
    resultRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    resultLabel: {
        fontSize: 14,
        color: COLORS.gray,
    },
    resultValue: {
        fontSize: 14,
        fontWeight: 'bold',
        color: COLORS.dark,
        textTransform: 'capitalize',
    },
    button: {
        backgroundColor: COLORS.primary,
        borderRadius: 12,
        padding: 18,
        alignItems: 'center',
        shadowColor: COLORS.primary,
        shadowOpacity: 0.3,
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 8,
        elevation: 4,
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    buttonText: {
        color: COLORS.white,
        fontSize: 16,
        fontWeight: 'bold',
    },
    progressContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        marginBottom: 12,
        backgroundColor: '#f0f9ff',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: COLORS.primary,
    },
    progressText: {
        marginLeft: 12,
        fontSize: 14,
        color: COLORS.primary,
        fontWeight: '600',
    },
});
