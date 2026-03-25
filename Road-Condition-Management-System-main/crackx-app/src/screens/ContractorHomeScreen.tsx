import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Alert,
    Modal,
    Image,
    Platform,
    ActivityIndicator
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants';
import { Report, User } from '../types';
import storageService from '../services/supabaseStorage';
import authService from '../services/supabaseAuth';
import { formatDate, getSeverityColor } from '../utils';
import * as ImagePicker from 'expo-image-picker';
import { uploadImageToSupabase } from '../services/imageUpload';
import DashboardLayout from '../components/DashboardLayout';

interface ContractorHomeScreenProps {
    onNavigate: (screen: string) => void;
    onLogout: () => void;
}

export default function ContractorHomeScreen({ onNavigate, onLogout }: ContractorHomeScreenProps) {
    const { t } = useTranslation();
    const [reports, setReports] = useState<Report[]>([]);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<User | null>(null);
    const [filterStatus, setFilterStatus] = useState<string>('all');

    // Completion Modal State
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedReport, setSelectedReport] = useState<Report | null>(null);
    const [repairPhoto, setRepairPhoto] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const currentUser = await authService.getCurrentUser();
            if (currentUser && currentUser.contractorId) {
                console.log('[Contractor Dashboard] Current User:', currentUser.username, 'Contractor ID:', currentUser.contractorId);
                setUser(currentUser);

                // Fetch ALL reports and filter (since we don't have a direct ByContractor ID method yet, or we can add one)
                // Efficient way: storageService.getReports() then filter
                const allReports = await storageService.getReports();
                console.log('[Contractor Dashboard] Total Reports Fetched:', allReports.length);

                const myTasks = allReports.filter(r => {
                    // Debug each relevant report
                    if (r.status === 'in-progress' || r.status === 'verification-pending') {
                        console.log(`Report [${r.id}] Contractor: ${r.contractorId} vs Me: ${currentUser.contractorId} -> Match? ${r.contractorId === currentUser.contractorId}`);
                    }
                    return r.contractorId === currentUser.contractorId &&
                        (r.status === 'in-progress' || r.status === 'verification-pending' || r.status === 'completed');
                });

                console.log('[Contractor Dashboard] My Tasks Count:', myTasks.length);

                // Sort: In-Progress first, then Verification Pending, then Completed
                myTasks.sort((a, b) => {
                    const statusOrder = { 'in-progress': 1, 'verification-pending': 2, 'completed': 3, 'pending': 4 };
                    return (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
                });

                setReports(myTasks);
            } else {
                Alert.alert('Error', 'No contractor profile linked to this user.');
            }
        } catch (error) {
            console.error('Error loading contractor tasks:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        await authService.logout();
        onLogout();
    };

    const initiateCompletion = (report: Report) => {
        setSelectedReport(report);
        setRepairPhoto(null);
        setModalVisible(true);
    };

    const openCamera = async () => {
        try {
            const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
            if (permissionResult.granted === false) {
                Alert.alert('Permission Required', 'Camera access is needed to upload proof.');
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                quality: 0.5,
                allowsEditing: true,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                setRepairPhoto(result.assets[0].uri);
            }
        } catch (error) {
            console.log('Error opening camera:', error);
        }
    };

    const pickFromGallery = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                quality: 0.5,
                allowsEditing: true,
            });
            if (!result.canceled && result.assets && result.assets.length > 0) {
                setRepairPhoto(result.assets[0].uri);
            }
        } catch (error) {
            console.log('Error picking from gallery:', error);
        }
    };

    const submitForVerification = async () => {
        if (!selectedReport || !repairPhoto) {
            Alert.alert('Error', 'Please upload a photo of the completed repair.');
            return;
        }

        setUploading(true);
        try {
            // Upload photo
            const publicUrl = await uploadImageToSupabase(repairPhoto, 'repair-proofs', selectedReport.id);

            // Update Report
            const updatedReport = { ...selectedReport };
            updatedReport.status = 'verification-pending';
            updatedReport.repairProofUri = publicUrl;
            updatedReport.repairCompletedAt = new Date().toISOString(); // Technically "Work Done", pending approval

            await storageService.submitRepairProof(selectedReport.id, publicUrl);

            // Optimistic Update
            setReports(prev => prev.map(r => r.id === updatedReport.id ? updatedReport : r));

            setModalVisible(false);
            Alert.alert('Submitted', 'Work submitted for RSO verification.');
        } catch (error: any) {
            console.error('Error submitting work:', error);
            Alert.alert('Error', `Failed to submit work: ${error.message || JSON.stringify(error)}`);
        } finally {
            setUploading(false);
        }
    };

    const stats = {
        total: reports.length,
        inProgress: reports.filter(r => r.status === 'in-progress').length,
        pendingVerify: reports.filter(r => r.status === 'verification-pending').length,
        completed: reports.filter(r => r.status === 'completed').length,
    };

    return (
        <DashboardLayout
            title="Contractor Portal"
            role="contractor"
            activeRoute="Dashboard"
            onNavigate={onNavigate}
            onLogout={handleLogout}
        >
            <View style={styles.headerBar}>
                <Text style={styles.welcomeText}>Agency: Solapur Infra Solutions</Text>
                {/* In real app, fetch agency name from Contractor table */}
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {/* Stats */}
                {/* Stats */}
                <View style={styles.statsCard}>
                    <TouchableOpacity
                        style={[styles.statItem, filterStatus === 'in-progress' && styles.activeStatItem]}
                        onPress={() => setFilterStatus('in-progress')}
                    >
                        <Text style={[styles.statValue, { color: COLORS.secondary }]}>{stats.inProgress}</Text>
                        <Text style={[styles.statLabel, filterStatus === 'in-progress' && styles.activeStatLabel]}>Active</Text>
                    </TouchableOpacity>
                    <View style={styles.divider} />
                    <TouchableOpacity
                        style={[styles.statItem, filterStatus === 'verification-pending' && styles.activeStatItem]}
                        onPress={() => setFilterStatus('verification-pending')}
                    >
                        <Text style={[styles.statValue, { color: COLORS.warning }]}>{stats.pendingVerify}</Text>
                        <Text style={[styles.statLabel, filterStatus === 'verification-pending' && styles.activeStatLabel]}>Reviewing</Text>
                    </TouchableOpacity>
                    <View style={styles.divider} />
                    <TouchableOpacity
                        style={[styles.statItem, filterStatus === 'completed' && styles.activeStatItem]}
                        onPress={() => setFilterStatus('completed')}
                    >
                        <Text style={[styles.statValue, { color: COLORS.success }]}>{stats.completed}</Text>
                        <Text style={[styles.statLabel, filterStatus === 'completed' && styles.activeStatLabel]}>Approved</Text>
                    </TouchableOpacity>
                </View>

                {/* Tasks List */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <Text style={styles.sectionTitle}>My Work Orders</Text>
                    {filterStatus !== 'all' && (
                        <TouchableOpacity onPress={() => setFilterStatus('all')} style={{ backgroundColor: '#eee', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
                            <Text style={{ fontSize: 12, color: '#666' }}>Clear Filter: {filterStatus}</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {loading ? (
                    <ActivityIndicator size="large" color={COLORS.primary} />
                ) : reports.filter(r => filterStatus === 'all' || r.status === filterStatus).length === 0 ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyText}>
                            {filterStatus === 'all' ? 'No assigned work orders.' : `No items in ${filterStatus}`}
                        </Text>
                    </View>
                ) : (
                    reports
                        .filter(r => filterStatus === 'all' || r.status === filterStatus)
                        .map(report => (
                            <View key={report.id} style={styles.taskCard}>
                                <View style={styles.cardHeader}>
                                    <View>
                                        <Text style={styles.taskType}>{report.rootCause || 'Road Repair'}</Text>
                                        <Text style={styles.taskLocation}>{report.location.roadName || 'Unknown Location'}</Text>
                                    </View>
                                    <View style={[
                                        styles.statusBadge,
                                        { backgroundColor: report.status === 'in-progress' ? '#eef2ff' : report.status === 'verification-pending' ? '#fff7ed' : '#f0fdf4' }
                                    ]}>
                                        <Text style={[
                                            styles.statusText,
                                            { color: report.status === 'in-progress' ? COLORS.primary : report.status === 'verification-pending' ? COLORS.warning : COLORS.success }
                                        ]}>
                                            {report.status === 'verification-pending' ? 'IN REVIEW' : report.status.toUpperCase().replace('-', ' ')}
                                        </Text>
                                    </View>
                                </View>

                                <View style={styles.cardBody}>
                                    <Text style={styles.metaText}>📅 Assigned: {formatDate(report.workOrderGeneratedAt || report.createdAt)}</Text>
                                    <Text style={styles.metaText}>🔧 Dept: {report.assignedDepartment}</Text>
                                </View>

                                {report.status === 'in-progress' && (
                                    <TouchableOpacity
                                        style={styles.actionBtn}
                                        onPress={() => initiateCompletion(report)}
                                    >
                                        <Ionicons name="camera" size={20} color={COLORS.white} />
                                        <Text style={styles.actionBtnText}>Upload Proof & Finish</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        ))
                )}
                <View style={{ height: 40 }} />
            </ScrollView>

            {/* Proof Upload Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={modalVisible}
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Complete Work Order</Text>
                        <Text style={styles.modalSubtitle}>Please upload a clear photo of the repaired site.</Text>

                        {repairPhoto ? (
                            <View style={styles.previewContainer}>
                                <Image source={{ uri: repairPhoto }} style={styles.previewImage} />
                                <TouchableOpacity onPress={() => setRepairPhoto(null)} style={styles.retakeButton}>
                                    <Text style={styles.retakeText}>Retake Photo</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={styles.uploadOptions}>
                                <TouchableOpacity onPress={openCamera} style={styles.uploadOption}>
                                    <Ionicons name="camera" size={32} color={COLORS.primary} />
                                    <Text style={styles.uploadText}>Camera</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={pickFromGallery} style={styles.uploadOption}>
                                    <Ionicons name="images" size={32} color={COLORS.success} />
                                    <Text style={styles.uploadText}>Gallery</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        <View style={styles.modalActions}>
                            <TouchableOpacity onPress={() => setModalVisible(false)} style={[styles.modalBtn, styles.cancelBtn]}>
                                <Text style={styles.cancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={submitForVerification}
                                style={[styles.modalBtn, styles.submitBtn, (!repairPhoto || uploading) && { opacity: 0.5 }]}
                                disabled={!repairPhoto || uploading}
                            >
                                <Text style={styles.submitText}>{uploading ? 'Uploading...' : 'Submit for Review'}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </DashboardLayout>
    );
}

const styles = StyleSheet.create({
    content: { flex: 1, padding: 16 },
    headerBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: COLORS.white,
        padding: 12,
        borderRadius: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: COLORS.secondary,
    },
    welcomeText: { fontWeight: '600', color: COLORS.dark },
    statsCard: {
        flexDirection: 'row',
        backgroundColor: COLORS.white,
        padding: 20,
        borderRadius: 16,
        marginBottom: 20,
        shadowColor: '#000',
        elevation: 2,
    },
    statItem: { flex: 1, alignItems: 'center' },
    divider: { width: 1, height: '100%', backgroundColor: COLORS.border },
    statValue: { fontSize: 22, fontWeight: 'bold' },
    statLabel: { fontSize: 12, color: COLORS.gray, marginTop: 4 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12, color: COLORS.dark },
    emptyState: { padding: 40, alignItems: 'center' },
    emptyText: { color: COLORS.gray },
    taskCard: {
        backgroundColor: COLORS.white,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    taskType: { fontSize: 16, fontWeight: 'bold', color: COLORS.dark },
    taskLocation: { fontSize: 13, color: COLORS.gray },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    statusText: { fontSize: 10, fontWeight: 'bold' },
    cardBody: { marginBottom: 16 },
    metaText: { fontSize: 12, color: COLORS.gray, marginBottom: 4 },
    actionBtn: {
        backgroundColor: COLORS.primary,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        borderRadius: 8,
        gap: 8,
    },
    actionBtnText: { color: COLORS.white, fontWeight: 'bold' },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
    modalSubtitle: { color: COLORS.gray, marginBottom: 20 },
    uploadOptions: { flexDirection: 'row', gap: 16, marginBottom: 24 },
    uploadOption: { flex: 1, backgroundColor: '#f8fafc', padding: 20, borderRadius: 12, alignItems: 'center' },
    uploadText: { marginTop: 8, fontWeight: '600', color: COLORS.dark },
    previewContainer: { alignItems: 'center', marginBottom: 24 },
    previewImage: { width: '100%', height: 200, borderRadius: 12, marginBottom: 12 },
    retakeButton: { padding: 8 },
    retakeText: { color: COLORS.primary, fontWeight: '600' },
    modalActions: { flexDirection: 'row', gap: 12 },
    modalBtn: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center' },
    cancelBtn: { backgroundColor: '#f1f5f9' },
    submitBtn: { backgroundColor: COLORS.primary },
    cancelText: { color: COLORS.dark, fontWeight: '600' },
    submitText: { color: COLORS.white, fontWeight: 'bold' },
    activeStatItem: {
        backgroundColor: '#f0f9ff',
        borderRadius: 8,
        paddingHorizontal: 4
    },
    activeStatLabel: {
        fontWeight: 'bold',
        color: COLORS.primary,
        textDecorationLine: 'underline'
    }
});
