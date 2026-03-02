import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Alert,
    FlatList,
    Platform,
    Modal,
    TextInput,
    KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { COLORS, ZONES } from '../constants';
import storageService from '../services/supabaseStorage';
import authService from '../services/supabaseAuth';
import DashboardLayout from '../components/DashboardLayout';

interface AdminUserManagementScreenProps {
    onNavigate: (screen: string) => void;
    onLogout: () => void;
}

export default function AdminUserManagementScreen({ onNavigate, onLogout }: AdminUserManagementScreenProps) {
    const { t } = useTranslation();
    const [pendingUsers, setPendingUsers] = useState<any[]>([]);
    const [activeUsers, setActiveUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        setLoading(true);
        try {
            const users = await storageService.getRegisteredUsers();
            const pending = users.filter(u => (u.role === 'rso' || u.role === 'compliance_officer') && u.isApproved === false);
            const active = users.filter(u => u.isApproved !== false); // Users who are approved or don't need approval

            setPendingUsers(pending);
            setActiveUsers(active);
        } catch (error) {
            console.error('Error loading users:', error);
            Alert.alert(t('error'), 'Failed to load users');
        } finally {
            setLoading(false);
        }
    };

    // --- Modal State for Add/Edit User ---
    const [modalVisible, setModalVisible] = useState(false);
    const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
    const [formLoader, setFormLoader] = useState(false);

    // Form Data
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<'citizen' | 'rso' | 'admin' | 'compliance_officer'>('citizen');
    const [zone, setZone] = useState('');

    const openAddUser = () => {
        setModalMode('add');
        setUsername('');
        setPassword('');
        setRole('citizen');
        setZone('');
        setModalVisible(true);
    };

    const openEditUser = (user: any) => {
        setModalMode('edit');
        setUsername(user.username);
        setPassword(user.password || ''); // Some loaded users might not expose password easily, but for demo we assume it's there
        setRole(user.role);
        setZone(user.zone || '');
        setModalVisible(true);
    };

    const handleSaveUser = async () => {
        if (!username || !password) {
            Alert.alert('Error', 'Username and Password are required');
            return;
        }

        if (role === 'rso' && !zone) {
            Alert.alert('Error', 'Zone is required for RSO');
            return;
        }

        setFormLoader(true);
        try {
            if (modalMode === 'add') {
                // Check if user exists
                const existing = [...activeUsers, ...pendingUsers].find(u => u.username === username);
                if (existing) {
                    Alert.alert('Error', 'Username already exists');
                    setFormLoader(false);
                    return;
                }

                const newUser = {
                    id: `${role}_${username}_${Date.now()}`,
                    username,
                    password,
                    role,
                    zone: role === 'rso' ? zone : undefined,
                    isApproved: true, // Auto-approve admin added users
                    points: 0
                };
                await storageService.saveRegisteredUser(newUser);
                Alert.alert('Success', 'User added successfully');

            } else {
                // Edit Mode
                if (username === 'admin') {
                    Alert.alert('Error', 'Cannot edit the main admin account');
                    setFormLoader(false);
                    return;
                }

                const updates: any = { password, role };

                // If switching TO RSO, update zone. 
                // If switching FROM RSO (to Admin/Citizen), clear zone by setting it undefined.
                if (role === 'rso') {
                    updates.zone = zone;
                } else {
                    updates.zone = undefined;
                }

                // Note: We are not allowing username changes easily because it's the key in many places

                await storageService.updateRegisteredUser(username, updates);
                Alert.alert('Success', 'User updated successfully');
            }

            setModalVisible(false);
            loadUsers();
        } catch (error) {
            Alert.alert('Error', 'Failed to save user');
        } finally {
            setFormLoader(false);
        }
    };

    const handleDeleteUser = (usernameToDelete: string) => {
        const userToDelete = [...activeUsers, ...pendingUsers].find(u => u.username === usernameToDelete);

        if (usernameToDelete === 'admin') {
            Alert.alert('Error', 'Cannot delete the main admin account');
            return;
        }

        const executeDelete = async () => {
            try {
                await storageService.deleteRegisteredUser(usernameToDelete);
                loadUsers(); // Refresh list

                if (Platform.OS === 'web') {
                    window.alert(`User ${usernameToDelete} deleted.`);
                } else {
                    Alert.alert('Success', 'User deleted');
                }
            } catch (error) {
                Alert.alert('Error', 'Failed to delete user');
            }
        };

        if (Platform.OS === 'web') {
            if (window.confirm(`Delete user ${usernameToDelete}?`)) {
                executeDelete();
            }
        } else {
            Alert.alert(
                'Delete User',
                `Are you sure you want to delete ${usernameToDelete}?`,
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: executeDelete }
                ]
            );
        }
    };

    const handleApprove = async (username: string) => {
        try {
            await storageService.updateRegisteredUser(username, { isApproved: true });
            Alert.alert(t('success'), `User ${username} approved successfully`);
            loadUsers();
        } catch (error) {
            Alert.alert(t('error'), 'Failed to approve user');
        }
    };

    const handleDisapprove = async (username: string) => {
        const executeDisapprove = async () => {
            try {
                // 1. Remove from storage/backend
                await storageService.deleteRegisteredUser(username);

                // 2. Update UI immediately
                setPendingUsers(prev => prev.filter(user => user.username !== username));

                if (Platform.OS === 'web') {
                    window.alert(`User ${username} disapproved and removed.`);
                } else {
                    Alert.alert(t('success'), `User ${username} disapproved and removed.`);
                }
            } catch (error) {
                console.error(error);
                if (Platform.OS === 'web') {
                    window.alert('Failed to disapprove user');
                } else {
                    Alert.alert(t('error'), 'Failed to disapprove user');
                }
            }
        };

        if (Platform.OS === 'web') {
            if (window.confirm(`Are you sure you want to disapprove and remove ${username}?`)) {
                await executeDisapprove();
            }
        } else {
            Alert.alert(
                'Disapprove User',
                `Are you sure you want to disapprove and remove ${username}?`,
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Disapprove',
                        style: 'destructive',
                        onPress: executeDisapprove
                    }
                ]
            );
        }
    };

    const handleLogout = async () => {
        await authService.logout();
        onLogout();
    };

    return (
        <DashboardLayout
            title={t('user_management')} // Ensure this key exists or fallback
            role="admin"
            activeRoute="UserManagement"
            onNavigate={onNavigate}
            onLogout={handleLogout}
        >
            <ScrollView style={styles.content}>

                {/* Pending Approvals Section */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>{t('pending_approvals')}</Text>
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>{pendingUsers.length}</Text>
                        </View>
                    </View>

                    {pendingUsers.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyText}>{t('no_pending_requests')}</Text>
                        </View>
                    ) : (
                        pendingUsers.map(user => (
                            <View key={user.username} style={styles.userCardPending}>
                                <View style={[styles.userInfo, styles.userInfoColumn]}>
                                    <View style={styles.avatarContainer}>
                                        <Text style={styles.avatarText}>{user.username.substring(0, 2).toUpperCase()}</Text>
                                    </View>
                                    <View style={styles.userDetails}>
                                        <Text style={styles.username}>{user.username}</Text>
                                        <View style={styles.roleTag}>
                                            <Text style={styles.roleTagText}>{t(user.role)}</Text>
                                            {user.zone && (
                                                <Text style={styles.zoneTagText}> • {ZONES.find(z => z.id === user.zone)?.name || user.zone}</Text>
                                            )}
                                        </View>
                                    </View>
                                </View>
                                <View style={styles.actionButtons}>
                                    <TouchableOpacity
                                        style={styles.approveButton}
                                        onPress={() => handleApprove(user.username)}
                                    >
                                        <Text style={styles.approveButtonText}>{t('approve')}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.disapproveButton}
                                        onPress={() => handleDisapprove(user.username)}
                                    >
                                        <Text style={styles.disapproveButtonText}>{t('disapprove')}</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))
                    )}
                </View>

                {/* Active Users Section */}
                <View style={styles.section}>
                    <View style={styles.sectionHeaderActive}>
                        <Text style={styles.sectionTitle}>{t('active_users')}</Text>
                        <TouchableOpacity style={styles.addUserButton} onPress={openAddUser}>
                            <Ionicons name="add" size={20} color={COLORS.white} />
                            <Text style={styles.addUserText}>{t('add_user')}</Text>
                        </TouchableOpacity>
                    </View>

                    {activeUsers.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyText}>{t('no_active_users')}</Text>
                        </View>
                    ) : (
                        activeUsers.map(user => (
                            <View key={user.username} style={styles.userCard}>
                                <View style={styles.userInfo}>
                                    <View style={[styles.avatarContainer, { backgroundColor: COLORS.secondary }]}>
                                        <Text style={[styles.avatarText, { color: COLORS.primary }]}>{user.username.substring(0, 2).toUpperCase()}</Text>
                                    </View>
                                    <View style={styles.userDetails}>
                                        <Text style={styles.username}>{user.username}</Text>
                                        <View style={styles.row}>
                                            <Text style={styles.userRole}>{t(user.role)}</Text>
                                            {user.zone && (
                                                <Text style={styles.userZone}> • {ZONES.find(z => z.id === user.zone)?.name || user.zone}</Text>
                                            )}
                                        </View>
                                    </View>
                                </View>

                                {/* Edit / Delete Actions */}
                                <View style={styles.actionIcons}>
                                    {user.username !== 'admin' && (
                                        <TouchableOpacity style={styles.iconBtn} onPress={() => openEditUser(user)}>
                                            <Ionicons name="create-outline" size={20} color={COLORS.primary} />
                                        </TouchableOpacity>
                                    )}
                                    {user.username !== 'admin' && (
                                        <TouchableOpacity style={styles.iconBtn} onPress={() => handleDeleteUser(user.username)}>
                                            <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>
                        ))
                    )}
                </View>

            </ScrollView>

            {/* Add/Edit User Modal */}
            <Modal
                transparent={true}
                visible={modalVisible}
                animationType="fade"
                onRequestClose={() => setModalVisible(false)}
            >
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>{modalMode === 'add' ? t('add_new_user') : t('edit_user')}</Text>

                        <View style={styles.inputContainer}>
                            <Text style={styles.label}>{t('username')}</Text>
                            <TextInput
                                style={[styles.input, modalMode === 'edit' && styles.disabledInput]}
                                value={username}
                                onChangeText={setUsername}
                                placeholder={t('enter_username')}
                                editable={modalMode === 'add'}
                            />
                        </View>

                        <View style={styles.inputContainer}>
                            <Text style={styles.label}>{t('password')}</Text>
                            <TextInput
                                style={styles.input}
                                value={password}
                                onChangeText={setPassword}
                                placeholder={t('enter_password')}
                            />
                        </View>

                        <View style={styles.inputContainer}>
                            <Text style={styles.label}>{t('account_type')}</Text>
                            <View style={styles.roleSelector}>
                                {['citizen', 'rso', 'admin', 'compliance_officer'].map((r) => (
                                    <TouchableOpacity
                                        key={r}
                                        style={[styles.roleOption, role === r && styles.roleOptionActive]}
                                        onPress={() => setRole(r as any)}
                                    >
                                        <Text style={[styles.roleOptionText, role === r && styles.roleOptionTextActive]}>{t(r)}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {role === 'rso' && (
                            <View style={styles.inputContainer}>
                                <Text style={styles.label}>{t('zone_required_rso')}</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.zoneSelector}>
                                    {ZONES.map((z) => (
                                        <TouchableOpacity
                                            key={z.id}
                                            style={[styles.zoneOption, zone === z.id && styles.zoneOptionActive]}
                                            onPress={() => setZone(z.id)}
                                        >
                                            <Text style={[styles.zoneOptionText, zone === z.id && styles.zoneOptionTextActive]}>{z.name.split(' - ')[0]}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        )}

                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                                <Text style={styles.cancelBtnText}>{t('cancel')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveUser} disabled={formLoader}>
                                <Text style={styles.saveBtnText}>{formLoader ? t('saving') : t('save_user')}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </DashboardLayout>
    );
}

const styles = StyleSheet.create({
    content: {
        flex: 1,
        padding: 16,
    },
    section: {
        marginBottom: 24,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        gap: 8,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.dark,
    },
    badge: {
        backgroundColor: COLORS.danger,
        borderRadius: 12,
        paddingHorizontal: 8,
        paddingVertical: 2,
    },
    badgeText: {
        color: COLORS.white,
        fontSize: 12,
        fontWeight: 'bold',
    },
    emptyState: {
        padding: 24,
        alignItems: 'center',
        backgroundColor: '#f8fafc',
        borderRadius: 12,
        borderStyle: 'dashed',
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    emptyText: {
        color: COLORS.gray,
        fontSize: 14,
    },
    userCardPending: {
        backgroundColor: '#fff7ed',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        flexDirection: 'column',
        gap: 12,
        borderWidth: 1,
        borderColor: COLORS.warning,
    },
    userCard: {
        backgroundColor: COLORS.white,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 2,
    },
    userInfo: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    userInfoColumn: {
        flex: 0,
        width: '100%',
    },
    userDetails: {
        flex: 1,
    },
    avatarContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: COLORS.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        color: COLORS.white,
        fontWeight: 'bold',
        fontSize: 14,
    },
    username: {
        fontSize: 16,
        fontWeight: 'bold',
        color: COLORS.dark,
    },
    roleTag: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
    },
    roleTagText: {
        fontSize: 12,
        color: COLORS.gray,
    },
    zoneTagText: {
        fontSize: 12,
        color: COLORS.gray,
    },
    row: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    userRole: {
        fontSize: 12,
        color: COLORS.gray,
        textTransform: 'capitalize',
    },
    userZone: {
        fontSize: 12,
        color: COLORS.gray,
    },
    approveButton: {
        flex: 1,
        backgroundColor: COLORS.success,
        paddingHorizontal: 10,
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    approveButtonText: {
        color: COLORS.white,
        fontWeight: 'bold',
        fontSize: 12,
    },
    disapproveButton: {
        flex: 1,
        backgroundColor: COLORS.danger,
        paddingHorizontal: 10,
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    disapproveButtonText: {
        color: COLORS.white,
        fontWeight: 'bold',
        fontSize: 12,
    },
    actionButtons: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
    },
    statusBadge: {
        backgroundColor: '#dcfce7',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    statusText: {
        color: '#166534',
        fontSize: 10,
        fontWeight: 'bold',
    },
    // New Styles
    sectionHeaderActive: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    addUserButton: {
        backgroundColor: COLORS.primary,
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        gap: 6,
    },
    addUserText: {
        color: COLORS.white,
        fontSize: 12,
        fontWeight: 'bold',
    },
    actionIcons: {
        flexDirection: 'row',
        gap: 12,
        flexShrink: 0,
    },
    iconBtn: {
        padding: 4,
    },
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: COLORS.white,
        borderRadius: 20,
        padding: 24,
        width: '100%',
        maxWidth: 400,
        elevation: 5,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: COLORS.dark,
        marginBottom: 20,
        textAlign: 'center',
    },
    inputContainer: {
        marginBottom: 16,
    },
    label: {
        fontSize: 12,
        color: COLORS.gray,
        fontWeight: '700',
        marginBottom: 8,
        textTransform: 'uppercase',
    },
    input: {
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 10,
        padding: 12,
        fontSize: 14,
        color: COLORS.dark,
    },
    disabledInput: {
        backgroundColor: '#f1f5f9',
        color: COLORS.gray,
    },
    roleSelector: {
        flexDirection: 'row',
        gap: 10,
        flexWrap: 'wrap',
    },
    roleOption: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.white,
    },
    roleOptionActive: {
        backgroundColor: COLORS.primary,
        borderColor: COLORS.primary,
    },
    roleOptionText: {
        fontSize: 12,
        color: COLORS.gray,
        fontWeight: '600',
    },
    roleOptionTextActive: {
        color: COLORS.white,
    },
    zoneSelector: {
        flexDirection: 'row',
    },
    zoneOption: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: COLORS.border,
        marginRight: 8,
    },
    zoneOptionActive: {
        backgroundColor: '#eff6ff',
        borderColor: COLORS.primary,
    },
    zoneOptionText: {
        fontSize: 12,
        color: COLORS.gray,
    },
    zoneOptionTextActive: {
        color: COLORS.primary,
        fontWeight: 'bold',
    },
    modalActions: {
        flexDirection: 'row',
        marginTop: 10,
        gap: 12,
    },
    cancelBtn: {
        flex: 1,
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
        alignItems: 'center',
    },
    cancelBtnText: {
        color: COLORS.gray,
        fontWeight: 'bold',
    },
    saveBtn: {
        flex: 1,
        padding: 14,
        borderRadius: 12,
        backgroundColor: COLORS.primary,
        alignItems: 'center',
    },
    saveBtnText: {
        color: COLORS.white,
        fontWeight: 'bold',
    },
});
