import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TextInput,
    Alert,
    ActivityIndicator,
    Image,
    LayoutAnimation,
    UIManager,
    Platform,
    RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../constants';
import { Report, User } from '../types';
import storageService from '../services/supabaseStorage';
import authService from '../services/supabaseAuth';
import { formatDate } from '../utils';
import DashboardLayout from '../components/DashboardLayout';

interface AdminPointsManagementScreenProps {
    onNavigate: (screen: string) => void;
    onLogout: () => void;
}

export default function AdminPointsManagementScreen({ onNavigate, onLogout }: AdminPointsManagementScreenProps) {
    const { t } = useTranslation();
    const [reports, setReports] = useState<Report[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [adminUser, setAdminUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState<'pending' | 'users'>('pending');

    useEffect(() => {
        if (Platform.OS === 'android') {
            if (UIManager.setLayoutAnimationEnabledExperimental) {
                UIManager.setLayoutAnimationEnabledExperimental(true);
            }
        }
        loadData();
    }, []);

    const loadData = async (isRefreshing = false) => {
        try {
            if (isRefreshing) setRefreshing(true);
            else setLoading(true);

            // Seed Demo Users if missing to ensure points system works
            const currentUsers = await storageService.getRegisteredUsers();
            const DEMO_USERS = [
                { id: 'rso_rugved', username: 'rugved', password: 'rugved', role: 'rso', zone: 'zone1', isApproved: true, points: 0 },
                { id: 'rso_deep', username: 'deep', password: 'deep', role: 'rso', zone: 'zone4', isApproved: true, points: 0 },
                { id: 'rso_atharva', username: 'atharva', password: 'atharva', role: 'rso', zone: 'zone8', isApproved: true, points: 0 },
                { id: 'cit_arav', username: 'arav', password: 'arav', role: 'citizen', isApproved: true, points: 0 },
                { id: 'cit_abbas', username: 'abbas', password: 'abbas', role: 'citizen', isApproved: true, points: 0 },
            ];

            for (const demo of DEMO_USERS) {
                if (!currentUsers.find(u => u.username === demo.username)) {
                    await storageService.saveRegisteredUser(demo);
                }
            }

            const [allReports, allUsers, current] = await Promise.all([
                storageService.getReports(),
                storageService.getRegisteredUsers(),
                authService.getCurrentUser()
            ]);

            // IMPORTANT: Sync current user with registered users list
            if (current) {
                const updatedCurrentUser = allUsers.find(u => u.username === current.username);
                if (updatedCurrentUser) {
                    const syncedUser = {
                        ...current,
                        points: updatedCurrentUser.points !== undefined ? updatedCurrentUser.points : current.points,
                        adminPointsPool: updatedCurrentUser.adminPointsPool !== undefined ? updatedCurrentUser.adminPointsPool : current.adminPointsPool
                    };
                    await storageService.saveUser(syncedUser);
                    setAdminUser(syncedUser);
                } else {
                    setAdminUser(current);
                }
            }

            setReports(allReports);
            setUsers(allUsers);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const awardPoints = async (reportId: string, userId: string, points: number, type: 'report' | 'repair') => {
        if (!adminUser || (adminUser.adminPointsPool || 0) < points) {
            Alert.alert('Error', 'Insufficient points in Admin pool');
            return;
        }

        // --- Optimistic UI Update ---
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

        const targetUser = users.find(u => u.id === userId || u.username === userId);
        if (!targetUser) {
            Alert.alert('Error', 'User not found');
            return;
        }

        const newUserPoints = (Number(targetUser.points) || 0) + points;
        const newAdminPool = (Number(adminUser.adminPointsPool) || 0) - points;

        // 1. Update Admin Pool immediately
        const updatedAdmin = { ...adminUser, adminPointsPool: newAdminPool };
        setAdminUser(updatedAdmin);

        // 2. Update User Points immediately
        setUsers(prev => prev.map(u => {
            if (u.id === userId || u.username === userId) {
                return { ...u, points: newUserPoints };
            }
            return u;
        }));

        // 3. Remove from Pending List immediately
        setReports(prev => prev.map(r => {
            if (r.id === reportId) {
                return {
                    ...r,
                    reportApprovedForPoints: type === 'report' ? true : r.reportApprovedForPoints,
                    repairApprovedForPoints: type === 'repair' ? true : r.repairApprovedForPoints
                };
            }
            return r;
        }));

        try {
            // Save to backend
            await storageService.updateRegisteredUser(targetUser.username, { points: newUserPoints });
            await storageService.updateRegisteredUser(adminUser.username, { adminPointsPool: newAdminPool });
            await storageService.saveUser(updatedAdmin);

            const reportIndex = reports.findIndex(r => r.id === reportId);
            if (reportIndex >= 0) {
                const updatedReport = { ...reports[reportIndex] };
                if (type === 'report') updatedReport.reportApprovedForPoints = true;
                if (type === 'repair') updatedReport.repairApprovedForPoints = true;
                await storageService.saveReport(updatedReport);
            }

            // Background sync to ensure full consistency
            setTimeout(() => loadData(false), 500);

        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'Failed to save points. Please try again.');
            loadData();
        }
    };

    const disapprovePoints = async (reportId: string, type: 'report' | 'repair') => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

        setReports(prev => prev.map(r => {
            if (r.id === reportId) {
                return {
                    ...r,
                    reportApprovedForPoints: type === 'report' ? true : r.reportApprovedForPoints,
                    repairApprovedForPoints: type === 'repair' ? true : r.repairApprovedForPoints
                };
            }
            return r;
        }));

        try {
            const reportIndex = reports.findIndex(r => r.id === reportId);
            if (reportIndex >= 0) {
                const updatedReport = { ...reports[reportIndex] };
                if (type === 'report') updatedReport.reportApprovedForPoints = true;
                if (type === 'repair') updatedReport.repairApprovedForPoints = true;
                await storageService.saveReport(updatedReport);
            }
            await loadData();
        } catch (error) {
            console.error('Disapprove failed', error);
            loadData();
        }
    };

    const pendingPoints = reports.filter(r =>
        (r.status === 'pending' && !r.reportApprovedForPoints) ||
        (r.status === 'completed' && !r.repairApprovedForPoints)
    );

    return (
        <DashboardLayout
            title="Points Management"
            role="admin"
            activeRoute="Points"
            onNavigate={onNavigate}
            onLogout={onLogout}
        >
            <View style={styles.container}>
                <View style={styles.adminWallet}>
                    <View style={styles.walletMain}>
                        <View style={styles.walletInfo}>
                            <View style={styles.walletHeader}>
                                <Ionicons name="wallet-outline" size={24} color={COLORS.white} />
                                <Text style={styles.walletTitle}>Admin Point Pool</Text>
                            </View>
                            <Text style={styles.walletValue}>{adminUser?.adminPointsPool?.toLocaleString() || 0}</Text>
                        </View>
                        <TouchableOpacity
                            style={styles.rechargeBtn}
                            onPress={async () => {
                                if (!adminUser) return;
                                const newPool = (adminUser.adminPointsPool || 0) + 1000000;
                                const updatedAdmin = { ...adminUser, adminPointsPool: newPool };
                                await storageService.updateRegisteredUser(adminUser.username, { adminPointsPool: newPool });
                                await storageService.saveUser(updatedAdmin);
                                setAdminUser(updatedAdmin);
                                Alert.alert('Success', '1,000,000 points added to pool!');
                            }}
                        >
                            <Ionicons name="add-circle" size={32} color={COLORS.white} />
                            <Text style={styles.rechargeText}>Recharge</Text>
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.walletSubtext}>Remaining points available for distribution</Text>
                </View>

                <View style={styles.tabContainer}>
                    <TouchableOpacity
                        style={[styles.tab, activeTab === 'pending' && styles.activeTab]}
                        onPress={() => setActiveTab('pending')}
                    >
                        <Text style={[styles.tabText, activeTab === 'pending' && styles.activeTabText]}>Approvals</Text>
                        {pendingPoints.length > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{pendingPoints.length}</Text></View>}
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.tab, activeTab === 'users' && styles.activeTab]}
                        onPress={() => setActiveTab('users')}
                    >
                        <Text style={[styles.tabText, activeTab === 'users' && styles.activeTabText]}>User Wallets</Text>
                    </TouchableOpacity>
                </View>

                {loading && !refreshing ? (
                    <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
                ) : (
                    <ScrollView
                        style={styles.content}
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={() => loadData(true)}
                                colors={[COLORS.primary]}
                            />
                        }
                    >
                        {activeTab === 'pending' ? (
                            pendingPoints.length === 0 ? (
                                <View style={styles.emptyState}>
                                    <Ionicons name="checkmark-circle-outline" size={64} color={COLORS.gray} style={{ opacity: 0.5 }} />
                                    <Text style={styles.emptyText}>All point requests settled!</Text>
                                </View>
                            ) : (
                                [...pendingPoints].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(report => (
                                    <View key={report.id} style={styles.approvalCard}>
                                        <View style={styles.cardHeader}>
                                            <Text style={styles.reportId}>#{report.id.slice(-6).toUpperCase()}</Text>
                                            <Text style={styles.cardType}>{report.status === 'pending' ? 'Damage Reported' : 'Repair Solved'}</Text>
                                        </View>

                                        <View style={styles.cardUserInfo}>
                                            <Ionicons name="person-outline" size={16} color={COLORS.gray} />
                                            <Text style={styles.cardUser}>
                                                {(() => {
                                                    const u = users.find(user => user.id === report.citizenId || user.username === report.citizenId);
                                                    if (u) return u.username;
                                                    return 'Citizen';
                                                })()}
                                            </Text>
                                            <Text style={styles.cardDate}>{formatDate(report.createdAt)}</Text>
                                        </View>

                                        {report.location?.zone && (
                                            <View style={styles.zoneInfoContainer}>
                                                <View style={styles.zoneInfo}>
                                                    <Ionicons name="location-outline" size={14} color={COLORS.primary} />
                                                    <Text style={styles.zoneText}>
                                                        {report.location.zone.replace('zone', 'Zone ')}
                                                    </Text>
                                                </View>
                                                {(() => {
                                                    const rsoOfficer = users.find(u => u.role === 'rso' && u.zone === report.location.zone);
                                                    if (rsoOfficer) {
                                                        return (
                                                            <View style={styles.rsoInfo}>
                                                                <Ionicons name="shield-checkmark-outline" size={14} color={COLORS.success} />
                                                                <Text style={styles.rsoText}>
                                                                    RSO: {rsoOfficer.username.charAt(0).toUpperCase() + rsoOfficer.username.slice(1)}
                                                                </Text>
                                                            </View>
                                                        );
                                                    }
                                                    return null;
                                                })()}
                                            </View>
                                        )}

                                        <View style={styles.actionRow}>
                                            {report.status === 'pending' && !report.reportApprovedForPoints && (
                                                <>
                                                    <TouchableOpacity
                                                        style={styles.awardButton}
                                                        onPress={() => awardPoints(report.id, report.citizenId, 10, 'report')}
                                                    >
                                                        <Ionicons name="checkmark-circle" size={18} color={COLORS.white} style={{ marginRight: 6 }} />
                                                        <Text style={styles.awardButtonText}>Approve & Award 10 Pts</Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        style={[styles.awardButton, styles.disapproveButton]}
                                                        onPress={() => disapprovePoints(report.id, 'report')}
                                                    >
                                                        <Ionicons name="close-circle" size={18} color={COLORS.white} style={{ marginRight: 6 }} />
                                                        <Text style={styles.awardButtonText}>Disapprove</Text>
                                                    </TouchableOpacity>
                                                </>
                                            )}
                                            {report.status === 'completed' && !report.repairApprovedForPoints && (
                                                <>
                                                    <TouchableOpacity
                                                        style={[styles.awardButton, { backgroundColor: COLORS.success }]}
                                                        onPress={() => {
                                                            const citizenId = report.citizenId;
                                                            if (!citizenId) {
                                                                Alert.alert('Error', 'Could not identify the citizen who reported this.');
                                                                return;
                                                            }
                                                            awardPoints(report.id, citizenId, 20, 'repair');
                                                        }}
                                                    >
                                                        <Ionicons name="checkmark-circle" size={18} color={COLORS.white} style={{ marginRight: 6 }} />
                                                        <Text style={styles.awardButtonText}>Verify Repair</Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        style={[styles.awardButton, styles.disapproveButton]}
                                                        onPress={() => disapprovePoints(report.id, 'repair')}
                                                    >
                                                        <Ionicons name="close-circle" size={18} color={COLORS.white} style={{ marginRight: 6 }} />
                                                        <Text style={styles.awardButtonText}>Disapprove</Text>
                                                    </TouchableOpacity>
                                                </>
                                            )}
                                        </View>
                                    </View>
                                ))
                            )
                        ) : (
                            users.map(u => (
                                <View key={u.id || u.username} style={styles.userRow}>
                                    <View style={styles.userMain}>
                                        <View style={styles.avatar}>
                                            <Text style={styles.avatarText}>{u.username[0].toUpperCase()}</Text>
                                        </View>
                                        <View>
                                            <Text style={styles.userName}>{u.username}</Text>
                                            <Text style={styles.userRole}>{u.role.toUpperCase()}</Text>
                                        </View>
                                    </View>
                                    <View style={styles.userWallet}>
                                        {u.role === 'citizen' && (
                                            <>
                                                <Ionicons name="star" size={16} color="#f59e0b" />
                                                <Text style={styles.userPoints}>{u.points || 0}</Text>
                                            </>
                                        )}
                                        {u.role === 'rso' && (
                                            <Text style={[styles.userPoints, { color: COLORS.gray, fontSize: 12 }]}>-</Text>
                                        )}
                                    </View>
                                </View>
                            ))
                        )}
                    </ScrollView>
                )}
            </View>
        </DashboardLayout>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
    },
    adminWallet: {
        backgroundColor: COLORS.primary,
        padding: 24,
        borderRadius: 20,
        marginBottom: 24,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 6,
    },
    walletMain: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    walletInfo: {
        flex: 1,
    },
    rechargeBtn: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    rechargeText: {
        color: COLORS.white,
        fontSize: 10,
        fontWeight: 'bold',
        marginTop: 2,
    },
    walletHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    walletTitle: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
        fontWeight: '600',
        marginLeft: 8,
    },
    walletValue: {
        color: COLORS.white,
        fontSize: 36,
        fontWeight: '900',
    },
    walletSubtext: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 11,
        marginTop: 4,
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: '#f1f5f9',
        borderRadius: 12,
        padding: 4,
        marginBottom: 20,
    },
    tab: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        flexDirection: 'row',
    },
    activeTab: {
        backgroundColor: COLORS.white,
        elevation: 2,
    },
    tabText: {
        color: COLORS.gray,
        fontWeight: '600',
        fontSize: 14,
    },
    activeTabText: {
        color: COLORS.primary,
    },
    badge: {
        backgroundColor: COLORS.danger,
        borderRadius: 10,
        minWidth: 18,
        height: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 6,
    },
    badgeText: {
        color: COLORS.white,
        fontSize: 10,
        fontWeight: 'bold',
    },
    content: {
        flex: 1,
    },
    approvalCard: {
        backgroundColor: COLORS.white,
        padding: 16,
        borderRadius: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    reportId: {
        color: COLORS.gray,
        fontSize: 12,
        fontWeight: '600',
    },
    cardType: {
        backgroundColor: '#eff6ff',
        color: COLORS.primary,
        fontSize: 10,
        fontWeight: 'bold',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        overflow: 'hidden',
    },
    cardUserInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    cardUser: {
        color: COLORS.dark,
        fontWeight: '600',
        fontSize: 14,
        marginLeft: 4,
    },
    cardDate: {
        color: COLORS.gray,
        fontSize: 12,
        marginLeft: 'auto',
    },
    actionRow: {
        flexDirection: 'row',
        gap: 8,
    },
    awardButton: {
        flex: 1,
        backgroundColor: COLORS.primary,
        paddingVertical: 12,
        borderRadius: 10,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
    },
    disapproveButton: {
        backgroundColor: COLORS.danger,
    },
    awardButtonText: {
        color: COLORS.white,
        fontWeight: 'bold',
        fontSize: 14,
    },
    userRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: COLORS.white,
        padding: 16,
        borderRadius: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    userMain: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#f1f5f9',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    avatarText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.primary,
    },
    userName: {
        fontSize: 16,
        fontWeight: 'bold',
        color: COLORS.dark,
    },
    userRole: {
        fontSize: 10,
        color: COLORS.gray,
        fontWeight: '700',
    },
    userWallet: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fffbeb',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#fef3c7',
    },
    userPoints: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#b45309',
        marginLeft: 4,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 60,
    },
    emptyText: {
        color: COLORS.gray,
        fontSize: 16,
        marginTop: 12,
        fontWeight: '500',
    },
    zoneInfoContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        gap: 12,
    },
    zoneInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#eff6ff',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
    },
    zoneText: {
        color: COLORS.primary,
        fontSize: 12,
        fontWeight: '600',
        marginLeft: 4,
    },
    rsoInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f0fdf4',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
    },
    rsoText: {
        color: COLORS.success,
        fontSize: 12,
        fontWeight: '600',
        marginLeft: 4,
    },
});
