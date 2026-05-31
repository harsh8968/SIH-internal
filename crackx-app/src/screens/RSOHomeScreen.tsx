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
    TextInput
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants';
import { Report, User, Contractor, Department } from '../types';
import storageService from '../services/supabaseStorage';
import authService from '../services/supabaseAuth';
import { formatDate, getSeverityColor } from '../utils';
import * as ImagePicker from 'expo-image-picker';
import notificationService from '../services/notifications';
import { uploadImageToSupabase } from '../services/imageUpload';
import DashboardLayout from '../components/DashboardLayout';

interface RSOHomeScreenProps {
    onNavigate: (screen: string) => void;
    onLogout: () => void;
    onReviewReport: (report: Report) => void;
}

export default function RSOHomeScreen({ onNavigate, onLogout, onReviewReport }: RSOHomeScreenProps) {
    const { t } = useTranslation();
    const [reports, setReports] = useState<Report[]>([]);
    const [sortBySeverity, setSortBySeverity] = useState(false);
    const [userZone, setUserZone] = useState<string>('');
    const [user, setUser] = useState<User | null>(null);
    const [filterStatus, setFilterStatus] = useState<string>('all');

    // Completion Modal State
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedReport, setSelectedReport] = useState<Report | null>(null);
    const [repairPhoto, setRepairPhoto] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);

    // Management Modal State
    const [manageModalVisible, setManageModalVisible] = useState(false);
    const [activeReport, setActiveReport] = useState<Report | null>(null);
    const [contractors, setContractors] = useState<Contractor[]>([]);

    // Proof View Modal State
    const [proofModalVisible, setProofModalVisible] = useState(false);
    const [viewProofUri, setViewProofUri] = useState<string | null>(null);

    // Form State
    const [selectedDept, setSelectedDept] = useState<Department>('Engineering');
    const [selectedCause, setSelectedCause] = useState<string>('');
    const [selectedContractor, setSelectedContractor] = useState<string>('');
    const [utilityType, setUtilityType] = useState<string>('');

    const DEPARTMENTS: Department[] = ['Engineering', 'Water Supply', 'Sanitation', 'Disaster Management', 'Traffic'];
    const CAUSES = ['Monsoon/Rain', 'Heavy Vehicle Load', 'Utility Excavation', 'Poor Workmanship', 'Aging/Wear', 'Other'];
    const UTILITIES = ['Telecom', 'Gas', 'Electric', 'Water', 'Sewage'];

    useEffect(() => {
        loadReports();

        // Poll for new reports every 30 seconds
        const interval = setInterval(() => {
            loadReports();
        }, 30000);

        return () => clearInterval(interval);
    }, [sortBySeverity]);

    const loadReports = async () => {
        try {
            const user = await authService.getCurrentUser();
            if (user && user.zone) {
                setUserZone(user.zone);
                setUser(user);
                let zoneReports = await storageService.getReportsByZone(user.zone);

                // Fetch Contractors
                const zoneContractors = await storageService.getContractorsByZone(user.zone);
                setContractors(zoneContractors);

                // Self-Healing: Deduplicate Reports by ID
                const uniqueReports = new Map();
                let hasDuplicates = false;

                zoneReports.forEach(r => {
                    if (uniqueReports.has(r.id)) {
                        hasDuplicates = true;
                        // Keep the one with later updatedAt or status completed
                        const existing = uniqueReports.get(r.id);
                        if (new Date(r.updatedAt) > new Date(existing.updatedAt) || r.status === 'completed') {
                            uniqueReports.set(r.id, r);
                        }
                    } else {
                        uniqueReports.set(r.id, r);
                    }
                });

                if (hasDuplicates) {
                    console.log('Found and removing duplicate reports...');
                    zoneReports = Array.from(uniqueReports.values());
                    // We should ideally save this back, but storageService does not expose saveAll.
                    // For now, the UI will just show clean data.
                }

                if (sortBySeverity) {
                    zoneReports = zoneReports.sort((a, b) => {
                        const severityOrder = { high: 3, medium: 2, low: 1 };
                        const aSeverity = a.aiDetection?.severity || 'low';
                        const bSeverity = b.aiDetection?.severity || 'low';
                        return severityOrder[bSeverity] - severityOrder[aSeverity];
                    });
                }

                setReports(zoneReports);
                // ... rest of the function

                // Check if there are any new pending reports to notify about
                const pending = zoneReports.filter(r => r.status === 'pending');
                if (pending.length > 0) {
                    notificationService.scheduleRSOAssignmentNotification(
                        pending[0].id,
                        pending[0].location.roadName || 'Assigned Zone'
                    );
                }
            }
        } catch (error) {
            console.error('Error loading reports:', error);
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

    const openManageModal = (report: Report) => {
        setActiveReport(report);
        setSelectedDept(report.assignedDepartment || 'Engineering');
        setSelectedCause(report.rootCause || '');
        setSelectedContractor(report.contractorId || '');
        setUtilityType(report.utilityType || '');
        setManageModalVisible(true);
    };

    const saveReportManagement = async () => {
        if (!activeReport) return;

        if (!selectedCause) {
            Alert.alert(t('error'), 'Please select a Root Cause for verification.');
            return;
        }

        /*
        if (selectedCause === 'Utility Excavation' && !utilityType) {
             Alert.alert(t('error'), 'Please select a Utility Type.');
             return;
        }
        */

        setUploading(true);
        try {
            const updatedReport = { ...activeReport };
            updatedReport.assignedDepartment = selectedDept;
            updatedReport.rootCause = selectedCause;
            // Ensure we send NULL if empty string, but Supabase expects ID or null
            updatedReport.contractorId = selectedContractor || undefined;
            updatedReport.utilityType = utilityType || undefined;

            // Force status change if contractor is assigned
            if (selectedContractor) {
                updatedReport.status = 'in-progress';
                if (!updatedReport.workOrderGeneratedAt) {
                    updatedReport.workOrderGeneratedAt = new Date().toISOString();
                }
            }

            console.log('[RSO] Updating report:', updatedReport); // Debug log

            await storageService.saveReport(updatedReport);

            // Optimistic Update: Update local state immediately
            setReports(prevReports =>
                prevReports.map(r => r.id === updatedReport.id ? updatedReport : r)
            );

            setManageModalVisible(false);
            Alert.alert(t('success'), 'Report updated successfully');

            // Reload to be sure
            loadReports();
        } catch (error) {
            console.error('Error updating report:', error);
            Alert.alert(t('error'), 'Failed to update report');
        } finally {
            setUploading(false);
        }
    };

    // takeRepairPhoto function removed in favor of direct buttons in UI


    const openCamera = async () => {
        try {
            const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
            if (permissionResult.granted === false) {
                Alert.alert(t('error'), 'Camera permission is required');
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
            Alert.alert('Error', 'Could not open camera.');
        }
    };

    const openProofModal = (uri: string) => {
        if (!uri) return;
        setViewProofUri(uri);
        setProofModalVisible(true);
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
            Alert.alert('Error', 'Could not open gallery.');
        }
    };

    const confirmCompletion = async () => {
        if (!selectedReport || !repairPhoto) {
            Alert.alert(t('error'), t('photo_required'));
            return;
        }

        setUploading(true);
        console.log(`[RSO] Starting completion for report ${selectedReport.id}`);
        try {
            const report = await storageService.getReportById(selectedReport.id);
            if (report) {
                // Upload photo to Supabase
                try {
                    console.log('[RSO] Uploading repair proof...');
                    const publicUrl = await uploadImageToSupabase(repairPhoto, 'repair-proofs', report.id);
                    console.log('[RSO] Repair proof uploaded:', publicUrl);

                    report.status = 'completed';
                    report.repairCompletedAt = new Date().toISOString();
                    report.repairProofUri = publicUrl;
                    report.rsoId = user?.id; // Use ID for foreign key

                    console.log('[RSO] Saving updated report to Supabase...');
                    await storageService.saveReport(report);
                    console.log('[RSO] Report saved successfully');

                    setModalVisible(false);
                    await loadReports(); // Refresh local list
                    Alert.alert(t('success'), t('repair_completed'));
                } catch (uploadError) {
                    console.error('[RSO] Upload failed:', uploadError);
                    Alert.alert(t('upload_failed'), 'Could not upload repair photo. Please check your connection and try again.');
                    setUploading(false); // Stop here
                    return;
                }
            } else {
                console.error('[RSO] Could not find report details for ID:', selectedReport.id);
                Alert.alert(t('error'), 'Could not find report details');
            }
        } catch (error) {
            console.error('[RSO] Error in confirmCompletion:', error);
            Alert.alert(t('error'), t('failed_update_report'));
        } finally {
            setUploading(false);
        }
    };

    const stats = {
        total: reports.length,
        pending: reports.filter(r => r.status === 'pending').length,
        inProgress: reports.filter(r => r.status === 'in-progress' && !r.repairProofUri).length,
        completed: reports.filter(r => r.status === 'completed').length,
        verification: reports.filter(r => r.status === 'verification-pending' || (r.status === 'in-progress' && r.repairProofUri)).length,
    };

    // verifyContractorWork removed - moved to RSOReviewScreen


    return (
        <DashboardLayout
            title={`${t('rso_dashboard')} - ${userZone.toUpperCase()}`}
            role="rso"
            activeRoute="Assigned"
            onNavigate={(screen) => onNavigate(screen)}
            onLogout={handleLogout}
        >
            <View style={styles.walletBar}>

                <Text style={styles.welcomeText}>RSO: {user?.username}</Text>
            </View>
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {/* Stats */}
                <View style={styles.statsCard}>
                    <TouchableOpacity
                        style={[styles.statItem, filterStatus === 'all' && styles.activeStatItem]}
                        onPress={() => setFilterStatus('all')}
                    >
                        <Text style={styles.statValue}>{stats.total}</Text>
                        <Text style={[styles.statLabel, filterStatus === 'all' && styles.activeStatLabel]}>{t('total')}</Text>
                    </TouchableOpacity>
                    <View style={styles.divider} />
                    <TouchableOpacity
                        style={[styles.statItem, filterStatus === 'pending' && styles.activeStatItem]}
                        onPress={() => setFilterStatus('pending')}
                    >
                        <Text style={[styles.statValue, { color: COLORS.warning }]}>
                            {stats.pending}
                        </Text>
                        <Text style={[styles.statLabel, filterStatus === 'pending' && styles.activeStatLabel]}>{t('pending')}</Text>
                    </TouchableOpacity>
                    <View style={styles.divider} />
                    <TouchableOpacity
                        style={[styles.statItem, filterStatus === 'completed' && styles.activeStatItem]}
                        onPress={() => setFilterStatus('completed')}
                    >
                        <Text style={[styles.statValue, { color: COLORS.success }]}>
                            {stats.completed}
                        </Text>
                        <Text style={[styles.statLabel, filterStatus === 'completed' && styles.activeStatLabel]}>{t('done')}</Text>
                    </TouchableOpacity>
                    <View style={styles.divider} />
                    <TouchableOpacity
                        style={[styles.statItem, filterStatus === 'in-progress' && styles.activeStatItem]}
                        onPress={() => setFilterStatus('in-progress')}
                    >
                        <Text style={[styles.statValue, { color: '#8b5cf6' }]}>
                            {stats.inProgress}
                        </Text>
                        <Text style={[styles.statLabel, filterStatus === 'in-progress' && styles.activeStatLabel]}>In Progress</Text>
                    </TouchableOpacity>
                    <View style={styles.divider} />
                    <TouchableOpacity
                        style={[styles.statItem, filterStatus === 'verification-pending' && styles.activeStatItem]}
                        onPress={() => setFilterStatus('verification-pending')}
                    >
                        <Text style={[styles.statValue, { color: COLORS.warning }]}>
                            {stats.verification}
                        </Text>
                        <Text style={[styles.statLabel, filterStatus === 'verification-pending' && styles.activeStatLabel]}>Verify</Text>
                    </TouchableOpacity>
                </View>

                {/* Controls */}
                <View style={styles.controls}>
                    <TouchableOpacity
                        style={[styles.sortButton, sortBySeverity && styles.sortButtonActive]}
                        onPress={() => setSortBySeverity(!sortBySeverity)}
                    >
                        <Text style={styles.sortButtonText}>
                            {t('sort_by_severity')}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Reports List */}
                <View style={styles.reportsSection}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <Text style={styles.sectionTitle}>{t('assigned_complaints')}</Text>
                        {filterStatus !== 'all' && (
                            <TouchableOpacity onPress={() => setFilterStatus('all')} style={{ backgroundColor: '#eee', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
                                <Text style={{ fontSize: 12, color: '#666' }}>Clear Filter: {filterStatus}</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {reports.filter(r => {
                        if (filterStatus === 'all') return true;
                        if (filterStatus === 'verification-pending') return r.status === 'verification-pending' || (r.status === 'in-progress' && !!r.repairProofUri);
                        if (filterStatus === 'in-progress') return r.status === 'in-progress' && !r.repairProofUri;
                        return r.status === filterStatus;
                    }).length === 0 ? (
                        <View style={styles.emptyState}>
                            <Ionicons name="folder-open-outline" size={64} color={COLORS.gray} style={{ marginBottom: 16, opacity: 0.5 }} />
                            <Text style={styles.emptyText}>
                                {filterStatus === 'all' ? t('no_complaints_assigned') : `No reports with status: ${filterStatus}`}
                            </Text>
                        </View>
                    ) : (
                        reports
                            .filter(r => {
                                if (filterStatus === 'all') return true;
                                if (filterStatus === 'verification-pending') return r.status === 'verification-pending' || (r.status === 'in-progress' && !!r.repairProofUri);
                                if (filterStatus === 'in-progress') return r.status === 'in-progress' && !r.repairProofUri;
                                return r.status === filterStatus;
                            })
                            .map((report) => (
                                <View key={report.id} style={styles.reportCard}>
                                    {/* Report Photo */}
                                    {report.photoUri && (
                                        <View style={styles.imageContainer}>
                                            {Platform.OS === 'web' && report.photoUri.startsWith('file://') ? (
                                                <View style={{ alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                                    <Ionicons name="phone-portrait-outline" size={48} color={COLORS.gray} />
                                                    <Text style={{ color: COLORS.gray, marginTop: 8 }}>{t('image_only_mobile')}</Text>
                                                </View>
                                            ) : (
                                                <Image
                                                    source={{ uri: report.photoUri }}
                                                    style={styles.reportImage}
                                                    resizeMode="cover"
                                                />
                                            )}
                                        </View>
                                    )}

                                    <View style={styles.reportHeader}>
                                        <View>
                                            <Text style={styles.reportType}>
                                                {report.aiDetection?.damageType ? t(report.aiDetection.damageType) : t('unknown')}
                                            </Text>
                                            <Text style={styles.reportLocation}>
                                                {report.location.roadName || report.location.address || t('unknown')}
                                            </Text>
                                        </View>
                                        <View
                                            style={[
                                                styles.severityBadge,
                                                {
                                                    backgroundColor: getSeverityColor(
                                                        report.aiDetection?.severity || 'low'
                                                    ),
                                                },
                                            ]}
                                        >
                                            <Text style={styles.severityText}>
                                                {report.aiDetection?.severity || 'N/A'}
                                            </Text>
                                        </View>
                                    </View>

                                    <View style={styles.reportMeta}>
                                        <View>
                                            <Text style={styles.reportDate}>
                                                {formatDate(report.createdAt)}
                                            </Text>
                                            {report.contractorId && (
                                                <Text style={{ fontSize: 11, color: COLORS.secondary, marginTop: 4, fontWeight: '600' }}>
                                                    Contractor: {contractors.find(c => c.id === report.contractorId)?.agencyName || 'Unknown'}
                                                </Text>
                                            )}
                                        </View>
                                        <Text
                                            style={[
                                                styles.statusBadge,
                                                {
                                                    color:
                                                        report.status === 'completed'
                                                            ? COLORS.success
                                                            : report.status === 'in-progress'
                                                                ? COLORS.secondary
                                                                : COLORS.warning,
                                                },
                                            ]}
                                        >
                                            {report.status}
                                        </Text>
                                    </View>

                                    {report.status !== 'completed' && (
                                        <View style={styles.actionButtonsRow}>
                                            <TouchableOpacity
                                                style={[styles.actionButton, styles.manageButton]}
                                                onPress={() => openManageModal(report)}
                                            >
                                                <Text style={styles.manageButtonText}>
                                                    Verify & Assign
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}

                                    {report.status === 'verification-pending' && (
                                        <View style={styles.verificationActionContainer}>
                                            <Text style={styles.verificationTitle}>Contractor submitted for review</Text>

                                            {report.repairProofUri ? (
                                                <TouchableOpacity
                                                    style={{ marginBottom: 12, alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 8, borderStyle: 'dashed', borderWidth: 1, borderColor: '#ccc' }}
                                                    onPress={() => onReviewReport(report)}
                                                >
                                                    <Image
                                                        source={{ uri: report.repairProofUri }}
                                                        style={{ width: '100%', height: 180, borderRadius: 8, resizeMode: 'cover' }}
                                                    />
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                                                        <Text style={{ color: COLORS.primary, fontWeight: 'bold', fontSize: 16 }}>🔍 Review Details</Text>
                                                    </View>
                                                </TouchableOpacity>
                                            ) : (
                                                <Text style={{ color: COLORS.danger, marginBottom: 8 }}>⚠️ No proof photo uploaded</Text>
                                            )}

                                            <TouchableOpacity
                                                style={[styles.actionButton, { backgroundColor: COLORS.primary, marginTop: 4, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }]}
                                                onPress={() => onReviewReport(report)}
                                            >
                                                <Ionicons name="clipboard-outline" size={20} color={COLORS.white} style={{ marginRight: 8 }} />
                                                <Text style={{ color: COLORS.white, fontWeight: 'bold' }}>Review to Approve/Reject</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}

                                    {report.status === 'completed' && report.repairProofUri && (
                                        <View style={{ marginTop: 12, padding: 12, backgroundColor: '#f0fdf4', borderRadius: 8, borderLeftWidth: 4, borderLeftColor: COLORS.success }}>
                                            <Text style={{ fontWeight: 'bold', color: '#166534', marginBottom: 8 }}>✅ Completed Repair Proof:</Text>
                                            <TouchableOpacity onPress={() => openProofModal(report.repairProofUri!)}>
                                                <Image
                                                    source={{ uri: report.repairProofUri }}
                                                    style={{ width: 100, height: 100, borderRadius: 8, backgroundColor: '#ddd' }}
                                                />
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                </View>
                            ))
                    )}
                </View>
            </ScrollView>

            {/* Completion Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={modalVisible}
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>{t('repair_completed')}?</Text>
                        <Text style={styles.modalSubtitle}>{t('upload_repair_proof')}</Text>

                        {repairPhoto ? (
                            <View style={styles.previewContainer}>
                                <Image source={{ uri: repairPhoto }} style={styles.previewImage} />
                                <TouchableOpacity onPress={() => setRepairPhoto(null)} style={styles.retakeButton}>
                                    <Text style={styles.retakeText}>{t('retake_photo')}</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={styles.uploadOptionsContainer}>
                                <TouchableOpacity onPress={openCamera} style={styles.uploadOptionButton}>
                                    <View style={[styles.iconCircle, { backgroundColor: '#eff6ff' }]}>
                                        <Ionicons name="camera" size={32} color={COLORS.primary} />
                                    </View>
                                    <Text style={styles.uploadOptionText}>{t('take_photo')}</Text>
                                </TouchableOpacity>

                                <TouchableOpacity onPress={pickFromGallery} style={styles.uploadOptionButton}>
                                    <View style={[styles.iconCircle, { backgroundColor: '#f0fdf4' }]}>
                                        <Ionicons name="images" size={32} color={COLORS.success} />
                                    </View>
                                    <Text style={styles.uploadOptionText}>{t('choose_from_gallery')}</Text>
                                </TouchableOpacity>
                            </View>
                        )}



                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.modalButtonCancel]}
                                onPress={() => setModalVisible(false)}
                            >
                                <Text style={styles.modalButtonTextCancel}>{t('cancel')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.modalButton,
                                    styles.modalButtonConfirm,
                                    (!repairPhoto) && styles.disabledButton
                                ]}
                                onPress={confirmCompletion}
                                disabled={!repairPhoto || uploading}
                            >
                                <Text style={styles.modalButtonTextConfirm}>
                                    {uploading ? t('loading') : t('confirm')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Management Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={manageModalVisible}
                onRequestClose={() => setManageModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            <Text style={styles.modalTitle}>Verify & Manage</Text>
                            <Text style={styles.modalSubtitle}>Report #{activeReport?.id.slice(0, 8)}</Text>

                            {/* Section 1: Root Cause (Mandatory) */}
                            <Text style={styles.inputLabel}>Root Cause Analysis *</Text>
                            <View style={styles.chipContainer}>
                                {CAUSES.map(cause => (
                                    <TouchableOpacity
                                        key={cause}
                                        style={[styles.chip, selectedCause === cause && styles.chipActive]}
                                        onPress={() => setSelectedCause(cause)}
                                    >
                                        <Text style={[styles.chipText, selectedCause === cause && styles.chipTextActive]}>{cause}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {selectedCause === 'Utility Excavation' && (
                                <>
                                    <Text style={styles.inputLabel}>Utility Type</Text>
                                    <View style={styles.chipContainer}>
                                        {UTILITIES.map(util => (
                                            <TouchableOpacity
                                                key={util}
                                                style={[styles.chip, utilityType === util && styles.chipActive]}
                                                onPress={() => setUtilityType(util)}
                                            >
                                                <Text style={[styles.chipText, utilityType === util && styles.chipTextActive]}>{util}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </>
                            )}

                            {/* Section 2: Department Routing */}
                            <Text style={styles.inputLabel}>Forward to Department</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
                                {DEPARTMENTS.map(dept => (
                                    <TouchableOpacity
                                        key={dept}
                                        style={[styles.deptCard, selectedDept === dept && styles.deptCardActive]}
                                        onPress={() => setSelectedDept(dept)}
                                    >
                                        <Ionicons
                                            name={dept === 'Engineering' ? 'construct' : dept === 'Water Supply' ? 'water' : 'alert-circle'}
                                            size={24}
                                            color={selectedDept === dept ? COLORS.primary : COLORS.gray}
                                        />
                                        <Text style={[styles.deptText, selectedDept === dept && styles.deptTextActive]}>{dept}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>

                            {/* Section 3: Contractor Assignment */}
                            <Text style={styles.inputLabel}>Assign Contractor</Text>
                            <ScrollView style={styles.contractorList}>
                                {contractors.length === 0 ? (
                                    <Text style={styles.emptyText}>No contractors found for this zone.</Text>
                                ) : (
                                    contractors.map(contractor => (
                                        <TouchableOpacity
                                            key={contractor.id}
                                            style={[styles.contractorItem, selectedContractor === contractor.id && styles.contractorItemActive]}
                                            onPress={() => setSelectedContractor(contractor.id)}
                                        >
                                            <View>
                                                <Text style={styles.contractorName}>{contractor.agencyName}</Text>
                                                <Text style={styles.contractorSub}>{contractor.name} • {contractor.rating}⭐</Text>
                                            </View>
                                            {selectedContractor === contractor.id && (
                                                <Ionicons name="checkmark-circle" size={24} color={COLORS.primary} />
                                            )}
                                        </TouchableOpacity>
                                    ))
                                )}
                            </ScrollView>

                            <View style={[styles.modalActions, { marginTop: 24 }]}>
                                <TouchableOpacity
                                    style={[styles.modalButton, styles.modalButtonCancel]}
                                    onPress={() => setManageModalVisible(false)}
                                >
                                    <Text style={styles.modalButtonTextCancel}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.modalButton, styles.modalButtonConfirm]}
                                    onPress={saveReportManagement}
                                    disabled={uploading}
                                >
                                    <Text style={styles.modalButtonTextConfirm}>
                                        {uploading ? 'Saving...' : 'Update & Assign'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                            <View style={{ height: 40 }} />
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Proof View Modal */}
            <Modal
                animationType="fade"
                transparent={true}
                visible={proofModalVisible}
                onRequestClose={() => setProofModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: 'black', minHeight: 'auto', padding: 0, justifyContent: 'center' }]}>
                        <TouchableOpacity
                            style={{ position: 'absolute', top: 40, right: 20, zIndex: 10, padding: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 }}
                            onPress={() => setProofModalVisible(false)}
                        >
                            <Ionicons name="close" size={30} color="white" />
                        </TouchableOpacity>

                        {viewProofUri && (
                            <Image
                                source={{ uri: viewProofUri }}
                                style={{ width: '100%', height: '100%', resizeMode: 'contain' }}
                            />
                        )}
                    </View>
                </View>
            </Modal>
        </DashboardLayout >
    );
}

const styles = StyleSheet.create({
    content: {
        flex: 1,
    },
    statsCard: {
        flexDirection: 'row',
        backgroundColor: COLORS.white,
        margin: 16,
        padding: 24,
        borderRadius: 16,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 4,
        borderWidth: 1,
        borderColor: COLORS.secondary,
        alignItems: 'center',
    },
    statItem: {
        flex: 1,
        alignItems: 'center',
    },
    divider: {
        width: 1,
        height: 40,
        backgroundColor: COLORS.border,
    },
    statValue: {
        fontSize: 24,
        fontWeight: 'bold',
        color: COLORS.dark,
    },
    statLabel: {
        fontSize: 12,
        color: COLORS.gray,
        marginTop: 4,
        fontWeight: '500',
    },
    controls: {
        paddingHorizontal: 16,
        marginBottom: 16,
    },
    sortButton: {
        backgroundColor: COLORS.white,
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    sortButtonActive: {
        backgroundColor: COLORS.secondary,
        borderColor: COLORS.primary,
    },
    sortButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.dark,
    },
    reportsSection: {
        padding: 16,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.dark,
        marginBottom: 12,
    },
    emptyState: {
        backgroundColor: COLORS.white,
        borderRadius: 12,
        padding: 40,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: COLORS.border,
        borderStyle: 'dashed',
    },
    emptyIcon: {
        fontSize: 64,
        marginBottom: 16,
    },
    emptyText: {
        fontSize: 16,
        color: COLORS.gray,
    },
    reportCard: {
        backgroundColor: COLORS.white,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
        overflow: 'hidden',
    },
    imageContainer: {
        marginHorizontal: -16,
        marginTop: -16,
        marginBottom: 12,
        height: 200,
        backgroundColor: '#f1f5f9',
        justifyContent: 'center',
        alignItems: 'center',
    },
    reportImage: {
        width: '100%',
        height: '100%',
        position: 'absolute',
    },
    reportHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    reportType: {
        fontSize: 16,
        fontWeight: 'bold',
        color: COLORS.dark,
        textTransform: 'capitalize',
        marginBottom: 4,
    },
    reportLocation: {
        fontSize: 14,
        color: COLORS.gray,
    },
    severityBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        height: 24,
    },
    severityText: {
        color: COLORS.white,
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    reportMeta: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    reportDate: {
        fontSize: 12,
        color: COLORS.gray,
    },
    statusBadge: {
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'capitalize',
    },
    actionButton: {
        backgroundColor: COLORS.success,
        borderRadius: 8,
        padding: 12,
        alignItems: 'center',
    },
    actionButtonText: {
        color: COLORS.white,
        fontSize: 14,
        fontWeight: '600',
    },

    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: COLORS.white,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 24,
        minHeight: 400,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: COLORS.dark,
        marginBottom: 8,
    },
    modalSubtitle: {
        fontSize: 14,
        color: COLORS.gray,
        marginBottom: 20,
    },
    photoPlaceholder: {
        height: 200,
        backgroundColor: COLORS.light,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: COLORS.border,
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    photoPlaceholderIcon: {
        fontSize: 48,
        marginBottom: 12,
    },
    photoPlaceholderText: {
        color: COLORS.gray,
        fontWeight: '600',
    },
    previewContainer: {
        marginBottom: 24,
        alignItems: 'center',
    },
    previewImage: {
        width: '100%',
        height: 200,
        borderRadius: 12,
        marginBottom: 12,
        resizeMode: 'cover',
    },
    retakeButton: {
        padding: 8,
        marginTop: 8,
    },
    retakeText: {
        color: COLORS.primary,
        fontWeight: '600',
        fontSize: 14,
    },
    modalActions: {
        flexDirection: 'row',
        gap: 12,
    },
    modalButton: {
        flex: 1,
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalButtonCancel: {
        backgroundColor: COLORS.light,
    },
    modalButtonConfirm: {
        backgroundColor: COLORS.success,
    },
    disabledButton: {
        opacity: 0.5,
    },
    modalButtonTextCancel: {
        color: COLORS.dark,
        fontWeight: '600',
        fontSize: 16,
    },
    modalButtonTextConfirm: {
        color: COLORS.white,
        fontWeight: 'bold',
        fontSize: 16,
    },

    walletBar: {
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
    pointsBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fffbeb',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#fef3c7',
    },
    pointsText: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#b45309',
        marginLeft: 6,
    },
    welcomeText: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.dark,
    },
    uploadOptionsContainer: {
        flexDirection: 'row',
        gap: 16,
        marginBottom: 24,
    },
    uploadOptionButton: {
        flex: 1,
        backgroundColor: COLORS.white,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
        padding: 20,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    iconCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    uploadOptionText: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.dark,
        textAlign: 'center',
    },
    // Management Modal Styles
    actionButtonsRow: {
        flexDirection: 'row',
        gap: 8,
    },
    manageButton: {
        backgroundColor: COLORS.secondary,
        borderWidth: 1,
        borderColor: COLORS.primary,
        flex: 1,
    },
    manageButtonText: {
        color: COLORS.primary,
        fontSize: 14,
        fontWeight: '600',
    },
    verificationActionContainer: {
        marginTop: 12,
        padding: 12,
        backgroundColor: '#fff7ed',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#fed7aa'
    },
    verificationTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#9a3412',
        marginBottom: 8
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: 'bold',
        color: COLORS.dark,
        marginBottom: 8,
        marginTop: 16,
    },
    chipContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    chip: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: COLORS.light,
        borderWidth: 1,
        borderColor: COLORS.light,
    },
    chipActive: {
        backgroundColor: '#eff6ff',
        borderColor: COLORS.primary,
    },
    chipText: {
        fontSize: 12,
        color: COLORS.gray,
        fontWeight: '600',
    },
    chipTextActive: {
        color: COLORS.primary,
    },
    horizontalScroll: {
        flexDirection: 'row',
        marginBottom: 8,
    },
    deptCard: {
        width: 100,
        height: 80,
        backgroundColor: COLORS.light,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
        padding: 8,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    deptCardActive: {
        backgroundColor: '#eff6ff',
        borderColor: COLORS.primary,
    },
    deptText: {
        fontSize: 10,
        fontWeight: '600',
        color: COLORS.gray,
        textAlign: 'center',
        marginTop: 4,
    },
    deptTextActive: {
        color: COLORS.primary,
    },
    contractorList: {
        maxHeight: 200,
        backgroundColor: COLORS.light,
        borderRadius: 12,
        padding: 8,
    },
    contractorItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 12,
        backgroundColor: COLORS.white,
        borderRadius: 8,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    contractorItemActive: {
        backgroundColor: '#f0fdf4',
        borderColor: COLORS.success,
    },
    contractorName: {
        fontWeight: 'bold',
        color: COLORS.dark,
        fontSize: 14,
    },
    contractorSub: {
        color: COLORS.gray,
        fontSize: 12,
        marginTop: 2,
    },
    activeStatItem: {
        backgroundColor: '#eefff0', // Slight green/blue tint
        borderRadius: 8,
        paddingHorizontal: 4,
    },
    activeStatLabel: {
        fontWeight: 'bold',
        color: COLORS.primary,
        textDecorationLine: 'underline'
    }
});
