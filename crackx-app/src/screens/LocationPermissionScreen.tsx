import React, { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../constants';
import locationService from '../services/location';

interface LocationPermissionScreenProps {
    onPermissionGranted: () => void;
}

export default function LocationPermissionScreen({
    onPermissionGranted,
}: LocationPermissionScreenProps) {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);

    const handleRequestPermission = async () => {
        setLoading(true);
        try {
            const granted = await locationService.requestPermission();

            if (granted) {
                onPermissionGranted();
            } else {
                Alert.alert(
                    t('permission_denied'),
                    t('enable_location'),
                    [{ text: 'OK' }]
                );
            }
        } catch (error) {
            Alert.alert(t('error'), 'Failed to request location permission');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.content}>
                {/* Icon */}
                <View style={styles.iconContainer}>
                    <Text style={styles.icon}>📍</Text>
                </View>

                {/* Title */}
                <Text style={styles.title}>{t('location_permission_title')}</Text>

                {/* Description */}
                <Text style={styles.description}>
                    {t('location_permission_message')}
                </Text>

                {/* Features List */}
                <View style={styles.featuresList}>
                    <View style={styles.featureItem}>
                        <Text style={styles.featureIcon}>✓</Text>
                        <Text style={styles.featureText}>
                            Accurate damage location tracking
                        </Text>
                    </View>
                    <View style={styles.featureItem}>
                        <Text style={styles.featureIcon}>✓</Text>
                        <Text style={styles.featureText}>
                            Automatic zone detection
                        </Text>
                    </View>
                    <View style={styles.featureItem}>
                        <Text style={styles.featureIcon}>✓</Text>
                        <Text style={styles.featureText}>
                            Faster complaint routing
                        </Text>
                    </View>
                    <View style={styles.featureItem}>
                        <Text style={styles.featureIcon}>✓</Text>
                        <Text style={styles.featureText}>
                            Works offline after initial setup
                        </Text>
                    </View>
                </View>

                {/* Grant Permission Button */}
                <TouchableOpacity
                    style={[styles.button, loading && styles.buttonDisabled]}
                    onPress={handleRequestPermission}
                    disabled={loading}
                >
                    <Text style={styles.buttonText}>
                        {loading ? t('loading') : t('grant_permission')}
                    </Text>
                </TouchableOpacity>

                {/* Info Text */}
                <Text style={styles.infoText}>
                    This permission is required to use CrackX effectively
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.light,
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        padding: 24,
    },
    iconContainer: {
        alignItems: 'center',
        marginBottom: 24,
    },
    icon: {
        fontSize: 80,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: COLORS.dark,
        textAlign: 'center',
        marginBottom: 16,
    },
    description: {
        fontSize: 16,
        color: COLORS.gray,
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: 32,
    },
    featuresList: {
        backgroundColor: COLORS.white,
        borderRadius: 12,
        padding: 20,
        marginBottom: 32,
    },
    featureItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    featureIcon: {
        fontSize: 20,
        color: COLORS.success,
        marginRight: 12,
    },
    featureText: {
        fontSize: 14,
        color: COLORS.dark,
        flex: 1,
    },
    button: {
        backgroundColor: COLORS.primary,
        borderRadius: 8,
        padding: 16,
        alignItems: 'center',
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    buttonText: {
        color: COLORS.white,
        fontSize: 16,
        fontWeight: 'bold',
    },
    infoText: {
        fontSize: 12,
        color: COLORS.gray,
        textAlign: 'center',
        marginTop: 16,
    },
});
