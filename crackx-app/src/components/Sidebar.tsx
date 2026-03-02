import React, { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Image,
    Platform
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, SUPPORTED_LANGUAGES } from '../constants';
import { UserRole } from '../types';
import { changeLanguage } from '../i18n';

interface SidebarProps {
    role: UserRole;
    activeRoute: string;
    onNavigate: (route: string) => void;
    onLogout: () => void;
    onClose?: () => void; // For mobile drawer close
}

export default function Sidebar({ role, activeRoute, onNavigate, onLogout, onClose }: SidebarProps) {
    const { t, i18n } = useTranslation();
    const [langDropdownOpen, setLangDropdownOpen] = useState(false);

    // Menu Definitions
    const getMenuItems = () => {
        switch (role) {
            case 'citizen':
                return [
                    { id: 'Dashboard', label: t('dashboard'), icon: '🏠' },
                    { id: 'ReportDamage', label: t('report_damage'), icon: '📸' },
                    { id: 'MyReports', label: t('my_reports'), icon: '📄' },
                    { id: 'Notifications', label: t('notifications'), icon: '🔔' },
                ];
            case 'rso':
                return [
                    { id: 'Assigned', label: t('assigned_zone_feed'), icon: '📍' },
                    { id: 'rso-review-list', label: 'Review Reports', icon: '📝' },
                    { id: 'Heatmap', label: 'Zone Heatmap', icon: '🔥' },
                    { id: 'Notifications', label: t('notifications'), icon: '🔔' },
                ];
            case 'admin':
                return [
                    { id: 'Dashboard', label: t('admin_dashboard'), icon: '🏠' },
                    { id: 'Heatmap', label: t('disaster_heatmap'), icon: '🔥' },
                    { id: 'Feedback', label: t('citizen_feedback'), icon: '⭐' },
                    { id: 'Points', label: t('points_management'), icon: '💎' },
                    { id: 'UserManagement', label: t('user_management'), icon: '👥' },
                    { id: 'Notifications', label: t('notifications'), icon: '🔔' },
                ];
            case 'compliance_officer':
                return [
                    { id: 'Dashboard', label: 'Monitor RSOs', icon: '👮' },
                    { id: 'Notifications', label: t('notifications'), icon: '🔔' },
                ];
            case 'contractor':
                return [
                    { id: 'Dashboard', label: 'My Work Orders', icon: '🛠️' },
                    { id: 'Notifications', label: t('notifications'), icon: '🔔' },
                ];
            default:
                return [];
        }
    };

    const menuItems = getMenuItems();
    const currentLangLabel = SUPPORTED_LANGUAGES.find(l => l.code === i18n.language)?.label || 'English';

    return (
        <View style={styles.container}>
            {/* Header / Logo */}
            <View style={styles.header}>
                <View style={styles.logoBadge}>
                    <Text style={styles.logoText}>CX</Text>
                </View>
                <View>
                    <Text style={styles.appName}>CrackX</Text>
                    <View style={styles.roleBadge}>
                        <Text style={styles.roleText}>{t(role).toUpperCase()}</Text>
                    </View>
                </View>
            </View>

            {/* Menu */}
            <ScrollView style={styles.menuContainer}>
                {menuItems.map(item => {
                    const isActive = activeRoute === item.id;
                    return (
                        <TouchableOpacity
                            key={item.id}
                            style={[styles.menuItem, isActive && styles.menuItemActive]}
                            onPress={() => {
                                onNavigate(item.id);
                                if (onClose) onClose();
                            }}
                        >
                            <Text style={styles.menuIcon}>{item.icon}</Text>
                            <Text style={[styles.menuLabel, isActive && styles.menuLabelActive]}>
                                {item.label}
                            </Text>
                            {isActive && <View style={styles.activeIndicator} />}
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>

            {/* Footer: Language & Logout */}
            <View style={styles.footer}>

                {/* Language Switcher */}
                <View style={styles.langContainer}>
                    <TouchableOpacity
                        style={styles.langButton}
                        onPress={() => setLangDropdownOpen(!langDropdownOpen)}
                    >
                        <Text style={styles.langButtonText}>🌐 {currentLangLabel}</Text>
                        <Text style={styles.dropdownArrow}>{langDropdownOpen ? '▲' : '▼'}</Text>
                    </TouchableOpacity>

                    {langDropdownOpen && (
                        <View style={styles.langDropdown}>
                            {SUPPORTED_LANGUAGES.map(lang => (
                                <TouchableOpacity
                                    key={lang.code}
                                    style={styles.langOption}
                                    onPress={() => {
                                        changeLanguage(lang.code);
                                        setLangDropdownOpen(false);
                                    }}
                                >
                                    <Text style={styles.langOptionText}>{lang.label}</Text>
                                    {i18n.language === lang.code && <Text style={styles.checkIcon}>✓</Text>}
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </View>

                {/* Logout */}
                <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
                    <Text style={styles.logoutIcon}>🚪</Text>
                    <Text style={styles.logoutText}>{t('logout')}</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.white,
        borderRightWidth: 1,
        borderRightColor: COLORS.border,
        paddingVertical: 24,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        marginBottom: 32,
    },
    logoBadge: {
        width: 48,
        height: 48,
        backgroundColor: COLORS.primary,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    logoText: {
        fontSize: 20,
        fontWeight: '900',
        color: COLORS.white,
    },
    appName: {
        fontSize: 20,
        fontWeight: 'bold',
        color: COLORS.dark,
    },
    roleBadge: {
        backgroundColor: COLORS.secondary,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        alignSelf: 'flex-start',
        marginTop: 4,
        borderWidth: 1,
        borderColor: '#fed7aa', // orange-200
    },
    roleText: {
        fontSize: 10,
        fontWeight: 'bold',
        color: COLORS.primary,
    },
    menuContainer: {
        flex: 1,
        paddingHorizontal: 12,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 12,
        marginBottom: 8,
    },
    menuItemActive: {
        backgroundColor: COLORS.secondary,
    },
    menuIcon: {
        fontSize: 20,
        marginRight: 12,
    },
    menuLabel: {
        fontSize: 16,
        color: COLORS.gray,
        fontWeight: '500',
        flex: 1,
    },
    menuLabelActive: {
        color: COLORS.primary,
        fontWeight: 'bold',
    },
    activeIndicator: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: COLORS.primary,
    },
    footer: {
        paddingHorizontal: 20,
        borderTopWidth: 1,
        borderTopColor: COLORS.light,
        paddingTop: 20,
    },
    langContainer: {
        marginBottom: 16,
        zIndex: 10,
    },
    langButton: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 8,
        backgroundColor: COLORS.light,
    },
    langButtonText: {
        fontSize: 14,
        color: COLORS.dark,
    },
    dropdownArrow: {
        color: COLORS.gray,
        fontSize: 12,
    },
    langDropdown: {
        position: 'absolute',
        bottom: '100%',
        left: 0,
        right: 0,
        backgroundColor: COLORS.white,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 8,
        marginBottom: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 8,
    },
    langOption: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.light,
    },
    langOptionText: {
        fontSize: 14,
        color: COLORS.dark,
    },
    checkIcon: {
        color: COLORS.primary,
        fontWeight: 'bold',
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 8,
        backgroundColor: '#fee2e2', // Red light
    },
    logoutIcon: {
        fontSize: 18,
        marginRight: 8,
    },
    logoutText: {
        color: COLORS.danger,
        fontWeight: 'bold',
        fontSize: 14,
    },
});
