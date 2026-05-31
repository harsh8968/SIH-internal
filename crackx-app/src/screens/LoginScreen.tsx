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
import { COLORS, SUPPORTED_LANGUAGES } from '../constants';
import authService from '../services/supabaseAuth';
import { changeLanguage } from '../i18n';

interface LoginScreenProps {
    onLoginSuccess: () => void;
    onSignupClick: () => void;
}

export default function LoginScreen({ onLoginSuccess, onSignupClick }: LoginScreenProps) {
    const { t } = useTranslation();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [selectedRole, setSelectedRole] = useState<UserRole>('citizen');
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const roles: { value: UserRole; label: string }[] = [
        { value: 'citizen', label: t('citizen') },
        { value: 'rso', label: t('rso') },
        { value: 'compliance_officer', label: 'Compliance Officer' },
    ];

    const changeAppLanguage = (langCode: string) => {
        changeLanguage(langCode);
    };

    const handleLogin = async () => {
        if (!username || !password) {
            Alert.alert(t('error'), 'Please enter username and password');
            return;
        }

        setLoading(true);
        try {
            const user = await authService.login(username, password);

            if (user) {
                onLoginSuccess();
            } else {
                Alert.alert(t('error'), t('login_error'));
            }
        } catch (error: any) {
            if (error.message && error.message.includes('approval')) {
                if (Platform.OS === 'web') {
                    alert(error.message);
                } else {
                    Alert.alert('Account Pending', error.message);
                }
            } else {
                Alert.alert(t('error'), 'An error occurred during login');
            }
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
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.logoContainer}>
                        <Text style={styles.logoText}>RCMS</Text>
                    </View>
                    <Text style={styles.title}>{t('app_name')}</Text>
                    <Text style={styles.subtitle}>Solapur Municipal Corporation</Text>

                    {/* Language Switcher */}
                    <View style={styles.languageRow}>
                        {SUPPORTED_LANGUAGES.map(lang => (
                            <TouchableOpacity
                                key={lang.code}
                                style={styles.langButton}
                                onPress={() => changeAppLanguage(lang.code)}
                            >
                                <Text style={styles.langButtonText}>{lang.label.split(' ')[0]}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>


                </View>

                {/* Login Form */}
                <View style={styles.form}>
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>{t('username')}</Text>
                        <TextInput
                            style={styles.input}
                            value={username}
                            onChangeText={setUsername}
                            placeholder="Enter username"
                            placeholderTextColor={COLORS.gray}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>{t('password')}</Text>
                        <TextInput
                            style={styles.input}
                            value={password}
                            onChangeText={setPassword}
                            placeholder="Enter password"
                            placeholderTextColor={COLORS.gray}
                            secureTextEntry
                            autoCapitalize="none"
                        />
                    </View>



                </View>

                <TouchableOpacity
                    style={[styles.loginButton, loading && styles.loginButtonDisabled]}
                    onPress={handleLogin}
                    disabled={loading}
                >
                    <Text style={styles.loginButtonText}>
                        {loading ? t('loading') : t('login')}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={onSignupClick} style={styles.linkButton}>
                    <Text style={styles.linkText}>
                        Don't have an account? <Text style={styles.linkHighlight}>Sign Up</Text>
                    </Text>
                </TouchableOpacity>

                {/* Demo Credentials Info */}
                <View style={styles.infoBox}>
                    <Text style={styles.infoText}>
                        Available Logins:{'\n'}
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
    logoContainer: {
        backgroundColor: COLORS.primary,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 12,
        marginBottom: 16,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    logoText: {
        fontSize: 32,
        fontWeight: '900',
        color: COLORS.white,
        letterSpacing: 2,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: COLORS.dark,
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 14,
        color: COLORS.gray,
        marginBottom: 20,
        fontWeight: '500',
    },
    languageRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 16,
    },
    langButton: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: COLORS.border, // Using border color
        backgroundColor: COLORS.white,
    },
    langButtonText: {
        fontSize: 12,
        fontWeight: '600',
        color: COLORS.gray,
    },
    demoBadge: {
        backgroundColor: COLORS.warning, // Changed to Amber
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 12,
    },
    demoText: {
        color: COLORS.white,
        fontWeight: '600',
        fontSize: 10,
    },
    form: {
        backgroundColor: COLORS.white,
        borderRadius: 20,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 8,
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
        borderRadius: 12, // More rounded
        padding: 14,
        fontSize: 16,
        backgroundColor: '#f8fafc', // Slight gray bg for inputs
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
        overflow: 'hidden',
        elevation: 4,
    },
    dropdownItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
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
    dropdownItemTextActive: {
        color: COLORS.primary,
        fontWeight: 'bold',
    },
    checkIcon: {
        color: COLORS.primary,
        fontWeight: 'bold',
    },
    loginButton: {
        backgroundColor: COLORS.primary,
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        marginTop: 12,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 4,
    },
    loginButtonDisabled: {
        opacity: 0.7,
    },
    loginButtonText: {
        color: COLORS.white,
        fontSize: 16,
        fontWeight: 'bold',
        letterSpacing: 0.5,
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
        color: COLORS.gray,
        lineHeight: 20,
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
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
});
