import React, { useState, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Image,
    TouchableOpacity,
    Alert,
    Dimensions,
    Platform
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants';
import { Report } from '../types';
import DashboardLayout from '../components/DashboardLayout';
import storageService from '../services/supabaseStorage';
import { formatDate } from '../utils';

interface RSOReviewScreenProps {
    report: Report;
    onBack: () => void;
    onComplete: () => void;
    onNavigate: (screen: string) => void;
    onLogout: () => void;
}

const { width } = Dimensions.get('window');

export default function RSOReviewScreen({ report, onBack, onComplete, onNavigate, onLogout }: RSOReviewScreenProps) {
    const [submitting, setSubmitting] = useState(false);
    const [isVideoPlaying, setIsVideoPlaying] = useState(false);
    const videoRef = useRef<Video>(null);

    const handleVerify = async (approved: boolean) => {
        const title = approved ? 'Approve Work?' : 'Reject Work?';
        const message = approved
            ? 'Mark this report as completed? This will finalize the report.'
            : 'This will reject the current proof and require the contractor to upload a new one.';

        const executeVerification = async () => {
            setSubmitting(true);
            try {
                let status: 'completed' | 'in-progress';
                let proofUri: string | null;

                if (approved) {
                    status = 'completed';
                    proofUri = report.repairProofUri || null;
                } else {
                    status = 'in-progress';
                    proofUri = null;
                }

                await storageService.reviewReport(report.id, status, proofUri);

                const successTitle = 'Success';
                const successMsg = approved ? 'Report completed and proof saved.' : 'Sent back to contractor for new proof.';

                if (Platform.OS === 'web') {
                    window.alert(successMsg);
                    onComplete();
                } else {
                    Alert.alert(successTitle, successMsg, [{ text: 'OK', onPress: onComplete }]);
                }
            } catch (e) {
                console.error(e);
                if (Platform.OS === 'web') {
                    window.alert('Error: Action failed');
                } else {
                    Alert.alert('Error', 'Action failed');
                }
            } finally {
                setSubmitting(false);
            }
        };

        if (Platform.OS === 'web') {
            if (window.confirm(`${title}\n\n${message}`)) {
                executeVerification();
            }
        } else {
            Alert.alert(
                title,
                message,
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Confirm', onPress: executeVerification }
                ]
            );
        }
    };

    const toggleVideoPlayback = async () => {
        if (videoRef.current) {
            if (isVideoPlaying) {
                await videoRef.current.pauseAsync();
            } else {
                await videoRef.current.playAsync();
            }
            setIsVideoPlaying(!isVideoPlaying);
        }
    };

    return (
        <DashboardLayout
            title="Review Repair Work"
            role="rso"
            activeRoute="rso-review"
            onNavigate={(screen) => screen === 'Dashboard' ? onBack() : onNavigate(screen)}
            onLogout={onLogout}
        >
            <View style={styles.header}>
                <TouchableOpacity onPress={onBack} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={COLORS.primary} />
                    <Text style={styles.backText}>Back to Dashboard</Text>
                </TouchableOpacity>
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {/* Status Banner */}
                <View style={styles.statusBanner}>
                    <Ionicons name="alert-circle-outline" size={24} color={COLORS.warning} />
                    <Text style={styles.statusText}>Contractor has submitted work for approval.</Text>
                </View>

                {/* Comparison View */}
                <View style={styles.comparisonContainer}>
                    <View style={styles.imageCard}>
                        <Text style={styles.imageLabel}>BEFORE (Reported)</Text>

                        {/* Show Video if available, otherwise show Image */}
                        {report.videoUri ? (
                            <View style={styles.videoContainer}>
                                <Video
                                    ref={videoRef}
                                    source={{ uri: report.videoUri }}
                                    style={styles.video}
                                    resizeMode={ResizeMode.CONTAIN}
                                    isLooping
                                    onPlaybackStatusUpdate={(status) => {
                                        if ('isPlaying' in status) {
                                            setIsVideoPlaying(status.isPlaying);
                                        }
                                    }}
                                />
                                <TouchableOpacity
                                    style={styles.videoPlayButton}
                                    onPress={toggleVideoPlayback}
                                >
                                    <Ionicons
                                        name={isVideoPlaying ? "pause-circle" : "play-circle"}
                                        size={48}
                                        color="white"
                                    />
                                </TouchableOpacity>
                                <View style={styles.videoLabel}>
                                    <Ionicons name="videocam" size={14} color="white" />
                                    <Text style={styles.videoLabelText}>Video Report</Text>
                                </View>
                            </View>
                        ) : (
                            <Image
                                source={{ uri: report.photoUri }}
                                style={styles.image}
                                resizeMode="cover"
                            />
                        )}

                        <Text style={styles.dateLabel}>{formatDate(report.createdAt)}</Text>
                    </View>

                    <View style={styles.arrowContainer}>
                        <Ionicons name="arrow-forward-circle" size={32} color={COLORS.primary} />
                    </View>

                    <View style={[styles.imageCard, styles.activeImageCard]}>
                        <Text style={styles.imageLabel}>AFTER (Proof)</Text>
                        {report.repairProofUri ? (
                            <Image
                                source={{ uri: report.repairProofUri }}
                                style={styles.image}
                                resizeMode="cover"
                            />
                        ) : (
                            <View style={[styles.image, styles.noImage]}>
                                <Text style={{ color: COLORS.danger }}>No Proof Image</Text>
                            </View>
                        )}
                        <Text style={styles.dateLabel}>{formatDate(report.repairCompletedAt || new Date().toISOString())}</Text>
                    </View>
                </View>

                {/* Details Card */}
                <View style={styles.detailsCard}>
                    <Text style={styles.sectionTitle}>Repair Details</Text>

                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Location:</Text>
                        <Text style={styles.detailValue}>{report.location.roadName || report.location.address}</Text>
                    </View>

                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Damage Type:</Text>
                        <Text style={styles.detailValue}>{report.aiDetection?.damageType || 'Unknown'}</Text>
                    </View>

                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Root Cause:</Text>
                        <Text style={styles.detailValue}>{report.rootCause || 'N/A'}</Text>
                    </View>

                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Contractor:</Text>
                        <Text style={styles.detailValue}>{report.contractorId || 'Assigned Contractor'}</Text>
                    </View>
                </View>

                {/* Actions */}
                <View style={styles.actionContainer}>
                    <TouchableOpacity
                        style={[styles.actionButton, styles.rejectButton, submitting && styles.disabledButton]}
                        onPress={() => handleVerify(false)}
                        disabled={submitting}
                    >
                        <Ionicons name="close-circle-outline" size={24} color={COLORS.danger} />
                        <Text style={styles.rejectText}>Reject & Retry</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.actionButton, styles.approveButton, submitting && styles.disabledButton]}
                        onPress={() => handleVerify(true)}
                        disabled={submitting}
                    >
                        <Ionicons name="checkmark-circle-outline" size={24} color={COLORS.success} />
                        <Text style={styles.approveText}>Approve & Close</Text>
                    </TouchableOpacity>
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>
        </DashboardLayout>
    );
}

const styles = StyleSheet.create({
    header: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: COLORS.white,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    backButton: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    backText: {
        marginLeft: 8,
        color: COLORS.primary,
        fontSize: 16,
        fontWeight: '600',
    },
    content: {
        flex: 1,
        padding: 16,
    },
    statusBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff7ed',
        padding: 12,
        borderRadius: 8,
        marginBottom: 20,
        borderLeftWidth: 4,
        borderLeftColor: COLORS.warning,
    },
    statusText: {
        marginLeft: 8,
        color: '#9a3412',
        fontWeight: '600',
    },
    comparisonContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    imageCard: {
        flex: 1,
        backgroundColor: COLORS.white,
        padding: 8,
        borderRadius: 12,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    activeImageCard: {
        borderWidth: 2,
        borderColor: COLORS.success,
        backgroundColor: '#f0fdf4',
    },
    image: {
        width: '100%',
        aspectRatio: 1,
        borderRadius: 8,
        marginVertical: 8,
        backgroundColor: '#f1f5f9',
    },
    noImage: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    imageLabel: {
        fontSize: 12,
        fontWeight: 'bold',
        color: COLORS.gray,
    },
    dateLabel: {
        fontSize: 10,
        color: COLORS.gray,
    },
    arrowContainer: {
        paddingHorizontal: 8,
    },
    detailsCard: {
        backgroundColor: COLORS.white,
        padding: 20,
        borderRadius: 16,
        marginBottom: 24,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 2,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.dark,
        marginBottom: 16,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
        paddingBottom: 8,
    },
    detailLabel: {
        color: COLORS.gray,
        fontWeight: '500',
    },
    detailValue: {
        color: COLORS.dark,
        fontWeight: '600',
        maxWidth: '60%',
        textAlign: 'right',
    },
    actionContainer: {
        flexDirection: 'row',
        gap: 16,
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 12,
        borderWidth: 1,
    },
    rejectButton: {
        backgroundColor: '#fff1f2',
        borderColor: COLORS.danger,
    },
    approveButton: {
        backgroundColor: '#f0fdf4',
        borderColor: COLORS.success,
    },
    rejectText: {
        marginLeft: 8,
        color: COLORS.danger,
        fontWeight: 'bold',
    },
    approveText: {
        marginLeft: 8,
        color: COLORS.success,
        fontWeight: 'bold',
    },
    disabledButton: {
        opacity: 0.5,
    },
    videoContainer: {
        width: '100%',
        aspectRatio: 1,
        borderRadius: 8,
        marginVertical: 8,
        backgroundColor: '#000',
        position: 'relative',
        overflow: 'hidden',
    },
    video: {
        width: '100%',
        height: '100%',
    },
    videoPlayButton: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: [{ translateX: -24 }, { translateY: -24 }],
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRadius: 50,
        padding: 8,
    },
    videoLabel: {
        position: 'absolute',
        top: 8,
        left: 8,
        backgroundColor: 'rgba(0,0,0,0.7)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    videoLabelText: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
});
