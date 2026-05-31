import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { UserRole } from '../types';
import { COLORS, ZONES } from '../constants';
import authService from '../services/supabaseAuth';

interface SignupScreenProps {
    onBackToLogin: () => void;
}

export default function SignupScreen({ onBackToLogin }: SignupScreenProps) {
    const { t } = useTranslation();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [selectedRole, setSelectedRole] = useState<UserRole>('citizen');
    const [selectedZone, setSelectedZone] = useState('zone8');

    // Dropdowns
    const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
    const [zoneDropdownOpen, setZoneDropdownOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const roles: { value: UserRole; label: string }[] = [
        { value: 'citizen', label: t('citizen') },
        { value: 'rso', label: t('rso') },
        { value: 'compliance_officer', label: 'Compliance Officer' },
    ];

    const handleSignup = async () => {
        console.log('[Signup] Button pressed');
        console.log('[Signup] Values:', { username, passwordLength: password.length, role: selectedRole });

        if (!username || !password || !confirmPassword) {
            console.log('[Signup] Validation failed: Empty fields');
            if (Platform.OS === 'web') {
                alert(t('error') + ': Please fill in all fields');
            } else {
                Alert.alert(t('error'), 'Please fill in all fields');
            }
            return;
        }

        if (password !== confirmPassword) {
            console.log('[Signup] Validation failed: Passwords mismatch');
            if (Platform.OS === 'web') {
                alert(t('error') + ': Passwords do not match');
            } else {
                Alert.alert(t('error'), 'Passwords do not match');
            }
            return;
        }

        setLoading(true);
        try {
            console.log('[Signup] Calling authService.register...');
            const success = await authService.register(
                username,
                password,
                selectedRole,
                selectedRole === 'rso' ? selectedZone : undefined
            );

            console.log('[Signup] Register success:', success);

            if (success) {
                const msg = (selectedRole === 'rso' || selectedRole === 'compliance_officer')
                    ? 'Registration successful! Waiting for Admin approval.'
                    : 'Account created successfully! Please login.';

                if (Platform.OS === 'web') {
                    alert(t('success') + ': ' + msg);
                    onBackToLogin();
                } else {
                    Alert.alert(
                        t('success'),
                        msg,
                        [{ text: 'OK', onPress: onBackToLogin }]
                    );
                }
            } else {
                const msg = 'Username already exists';
                if (Platform.OS === 'web') {
                    alert(t('error') + ': ' + msg);
                } else {
                    Alert.alert(t('error'), msg);
                }
            }
        } catch (error) {
            console.error('[Signup] Error:', error);
            if (Platform.OS === 'web') alert('Registration failed: ' + error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.header}>
                    <Text style={styles.title}>{t('create_account')}</Text>
                    <Text style={styles.subtitle}>Join {t('app_name')}</Text>
                </View>

                <View style={styles.form}>
                    {/* Username */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>{t('username')}</Text>
                        <TextInput
                            style={styles.input}
                            value={username}
                            onChangeText={setUsername}
                            placeholder="Choose a username"
                            placeholderTextColor={COLORS.gray}
                            autoCapitalize="none"
                        />
                    </View>

                    {/* Password */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>{t('password')}</Text>
                        <TextInput
                            style={styles.input}
                            value={password}
                            onChangeText={setPassword}
                            placeholder="Create a password"
                            placeholderTextColor={COLORS.gray}
                            secureTextEntry
                            autoCapitalize="none"
                        />
                    </View>

                    {/* Confirm Password */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>{t('confirm_password')}</Text>
                        <TextInput
                            style={styles.input}
                            value={confirmPassword}
                            onChangeText={setConfirmPassword}
                            placeholder="Repeat password"
                            placeholderTextColor={COLORS.gray}
                            secureTextEntry
                            autoCapitalize="none"
                        />
                    </View>

                    {/* Role Selection - High Z-Index to float above everything */}
                    <View style={[styles.inputGroup, { zIndex: 3000, position: 'relative' }]}>
                        <Text style={styles.label}>{t('account_type')}</Text>
                        <View>
                            <TouchableOpacity
                                style={styles.dropdownHeader}
                                onPress={() => {
                                    setRoleDropdownOpen(!roleDropdownOpen);
                                    setZoneDropdownOpen(false);
                                }}
                            >
                                <Text style={styles.dropdownHeaderText}>{t(selectedRole)}</Text>
                                <Text style={styles.dropdownArrow}>{roleDropdownOpen ? '▲' : '▼'}</Text>
                            </TouchableOpacity>

                            {roleDropdownOpen && (
                                <View style={styles.dropdownList}>
                                    {roles.map((role) => (
                                        <TouchableOpacity
                                            key={role.value}
                                            style={[
                                                styles.dropdownItem,
                                                selectedRole === role.value && styles.dropdownItemActive
                                            ]}
                                            onPress={() => {
                                                setSelectedRole(role.value);
                                                setRoleDropdownOpen(false);
                                            }}
                                        >
                                            <Text style={styles.dropdownItemText}>{role.label}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
                        </View>
                    </View>

                    {/* Zone Selection (RSO Only) - Medium Z-Index to float above button */}
                    {selectedRole === 'rso' && (
                        <View style={[styles.inputGroup, { zIndex: 2000, position: 'relative' }]}>
                            <Text style={styles.label}>{t('zone')}</Text>
                            <View>
                                <TouchableOpacity
                                    style={styles.dropdownHeader}
                                    onPress={() => {
                                        setZoneDropdownOpen(!zoneDropdownOpen);
                                        setRoleDropdownOpen(false);
                                    }}
                                >
                                    <Text style={styles.dropdownHeaderText}>
                                        {ZONES.find(z => z.id === selectedZone)?.name || selectedZone}
                                    </Text>
                                    <Text style={styles.dropdownArrow}>{zoneDropdownOpen ? '▲' : '▼'}</Text>
                                </TouchableOpacity>

                                {zoneDropdownOpen && (
                                    <View style={styles.dropdownList}>
                                        {ZONES.map((zone) => (
                                            <TouchableOpacity
                                                key={zone.id}
                                                style={[
                                                    styles.dropdownItem,
                                                    selectedZone === zone.id && styles.dropdownItemActive
                                                ]}
                                                onPress={() => {
                                                    setSelectedZone(zone.id);
                                                    setZoneDropdownOpen(false);
                                                }}
                                            >
                                                <Text style={styles.dropdownItemText}>{zone.name}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                )}
                            </View>
                        </View>
                    )}

                    <TouchableOpacity
                        style={[styles.button, loading && styles.buttonDisabled]}
                        onPress={handleSignup}
                        disabled={loading}
                    >
                        <Text style={styles.buttonText}>
                            {loading ? t('loading') : t('sign_up')}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={onBackToLogin} style={styles.linkButton}>
                        <Text style={styles.linkText}>
                            Already have an account? <Text style={styles.linkHighlight}>{t('login')}</Text>
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Demo Credentials */}
                <View style={styles.infoBox}>
                    <Text style={styles.infoText}>
                        Demo Credentials:{'\n'}
                        Admin: admin / admin123{'\n'}
                        RSO (Z1): rugved / rugved{'\n'}
                        RSO (Z4): deep / deep{'\n'}
                        RSO (Z8): atharva / atharva{'\n'}
                        Compliance: officer / officer{'\n'}
                        Citizen: arav / arav{'\n'}
                        Citizen: abbas / abbas
                    </Text>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.light,
    },
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'center',
        padding: 24,
    },
    header: {
        alignItems: 'center',
        marginBottom: 32,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: COLORS.dark,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: COLORS.gray,
    },
    form: {
        backgroundColor: COLORS.white,
        borderRadius: 20,
        padding: 24,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 4,
        borderWidth: 1,
        borderColor: COLORS.secondary,
    },
    inputGroup: {
        marginBottom: 20,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.dark,
        marginBottom: 8,
    },
    input: {
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 12,
        padding: 14,
        fontSize: 16,
        backgroundColor: '#f8fafc',
        color: COLORS.dark,
    },
    dropdownHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 14,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 12,
        backgroundColor: '#f8fafc',
    },
    dropdownHeaderText: {
        fontSize: 14,
        color: COLORS.dark,
        textTransform: 'capitalize',
    },
    dropdownArrow: {
        fontSize: 12,
        color: COLORS.gray,
    },
    dropdownList: {
        marginTop: 6,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 12,
        backgroundColor: COLORS.white,
        maxHeight: 200,
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        elevation: 10, // Increased elevation
        zIndex: 5000, // Explicit zIndex
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    dropdownItem: {
        padding: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
    },
    dropdownItemActive: {
        backgroundColor: '#eff6ff',
    },
    dropdownItemText: {
        fontSize: 14,
        color: COLORS.gray,
        textTransform: 'capitalize',
    },
    button: {
        backgroundColor: COLORS.primary,
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        marginTop: 12,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    buttonDisabled: {
        opacity: 0.7,
    },
    buttonText: {
        color: COLORS.white,
        fontSize: 16,
        fontWeight: 'bold',
    },
    linkButton: {
        marginTop: 20,
        alignItems: 'center',
    },
    linkText: {
        color: COLORS.gray,
        fontSize: 14,
    },
    linkHighlight: {
        color: COLORS.primary,
        fontWeight: 'bold',
    },
    infoBox: {
        marginTop: 24,
        padding: 16,
        backgroundColor: '#f1f5f9',
        borderRadius: 12,
        borderLeftWidth: 4,
        borderLeftColor: COLORS.gray,
    },
    infoText: {
        fontSize: 12,
        color: COLORS.dark,
        lineHeight: 20,
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    },
});
