import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, StyleSheet, Platform, Text, TouchableOpacity, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initI18n } from './src/i18n';
import { COLORS } from './src/constants';
import authService from './src/services/supabaseAuth';
import locationService from './src/services/location';
import { BASE_URL } from './src/config/api';

// Screens
// Screens
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
import LocationPermissionScreen from './src/screens/LocationPermissionScreen';
import CitizenHomeScreen from './src/screens/CitizenHomeScreen';
import RSOHomeScreen from './src/screens/RSOHomeScreen';
import RSOReviewScreen from './src/screens/RSOReviewScreen';
import RSOReviewListScreen from './src/screens/RSOReviewListScreen';
import RSOHeatmapScreen from './src/screens/RSOHeatmapScreen';
import AdminHomeScreen from './src/screens/AdminHomeScreen';
import ReportDamageScreen from './src/screens/ReportDamageScreen';
import MyReportsScreen from './src/screens/MyReportsScreen';
import AdminUserManagementScreen from './src/screens/AdminUserManagementScreen';
import AdminHeatmapScreen from './src/screens/AdminHeatmapScreen';
import AdminPointsManagementScreen from './src/screens/AdminPointsManagementScreen';
import AdminFeedbackScreen from './src/screens/AdminFeedbackScreen';
import NotificationScreen from './src/screens/NotificationScreen';

import ComplianceDashboardScreen from './src/screens/ComplianceDashboardScreen';
import ContractorHomeScreen from './src/screens/ContractorHomeScreen';
import LiveDetectionScreen from './src/screens/LiveDetectionScreen';
import { AIDetectionResult, Report } from './src/types';

type AppState =
  | 'loading'
  | 'login'
  | 'signup'
  | 'location-permission'
  | 'citizen-home'
  | 'rso-home'
  | 'rso-review-list'
  | 'rso-review'
  | 'rso-heatmap'
  | 'admin-home'
  | 'report-damage'
  | 'my-reports'
  | 'user-management'
  | 'admin-heatmap'
  | 'admin-feedback'
  | 'points-management'
  | 'notifications'

  | 'compliance-dashboard'
  | 'contractor-home'
  | 'live-detection';

export default function App() {
  const [appState, setAppState] = useState<AppState>('loading');
  const [userRole, setUserRole] = useState<string>('');
  const [liveDetectionData, setLiveDetectionData] = useState<{ photoUri: string; detection: AIDetectionResult } | null>(null);
  const [selectedReviewReport, setSelectedReviewReport] = useState<Report | null>(null);

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    initialize();

    if (Platform.OS === 'web') {
      const handleBeforeInstallPrompt = (e: any) => {
        // Prevent Chrome 67 and earlier from automatically showing the prompt
        e.preventDefault();
        // Stash the event so it can be triggered later.
        setDeferredPrompt(e);
      };

      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      };
    }
  }, []);

  useEffect(() => {
    // Listener for when user taps a notification
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const { data } = response.notification.request.content;
      console.log('Notification tapped:', data);

      // If we are logged in, navigate
      if (userRole) {
        if (data && data.type === 'submission') {
          // Usually navigate to MyReports or specific report
          setAppState('my-reports');
        } else if (data && data.type === 'assignment') {
          // For RSO
          setAppState('rso-home');
        } else {
          // Default to notification center
          setAppState('notifications');
        }
      }
    });

    return () => subscription.remove();
  }, [userRole]);

  const initialize = async () => {
    try {
      // Initialize i18n
      await initI18n();

      // Check if user is logged in (keeps latest login)
      const user = await authService.getCurrentUser();

      if (user) {
        setUserRole(user.role);

        // Check location permission
        const hasPermission = await locationService.checkPermission();

        if (hasPermission) {
          // Starts from the main dashboard immediately after login
          navigateToHome(user.role);
        } else {
          setAppState('location-permission');
        }
      } else {
        setAppState('login');
      }
    } catch (error) {
      console.error('Initialization error:', error);
      setAppState('login');
    }
  };

  const handleLoginSuccess = async () => {
    const user = await authService.getCurrentUser();
    if (user) {
      setUserRole(user.role);
      const hasPermission = await locationService.checkPermission();
      if (hasPermission) {
        navigateToHome(user.role);
      } else {
        setAppState('location-permission');
      }
    }
  };

  const handlePermissionGranted = () => {
    navigateToHome(userRole as any);
  };

  const handleLogout = () => {
    setAppState('login');
  };

  const navigateToHome = (role: string) => {
    switch (role) {
      case 'citizen':
        setAppState('citizen-home');
        break;
      case 'rso':
        setAppState('rso-home');
        break;
      case 'admin':
        setAppState('admin-home');
        break;
      case 'compliance_officer':
        setAppState('compliance-dashboard');
        break;
      case 'contractor':
        setAppState('contractor-home');
        break;
      default:
        setAppState('citizen-home');
    }
  };

  const handleNavigate = (screen: string) => {
    switch (screen) {
      case 'ReportDamage':
        setAppState('report-damage');
        break;
      case 'MyReports':
        setAppState('my-reports');
        break;
      case 'Dashboard':
        navigateToHome(userRole);
        break;
      case 'Assigned': // RSO Sidebar Item
        navigateToHome(userRole);
        break;
      case 'UploadProof': // RSO Sidebar Item
        navigateToHome(userRole);
        break;
      case 'rso-review-list':
        setAppState('rso-review-list'); // Actually switch to the new AppState
        break;
      case 'RoadHealth': // Admin Sidebar Item
        navigateToHome(userRole);
        break;
      case 'UserManagement':
        setAppState('user-management');
        break;
      case 'Heatmap':
        // Check user role to determine which heatmap screen to show
        if (userRole === 'rso') {
          setAppState('rso-heatmap');
        } else {
          setAppState('admin-heatmap');
        }
        break;
      case 'Feedback':
        setAppState('admin-feedback');
        break;
      case 'Points':
        setAppState('points-management');
        break;
      case 'Notifications':
        setAppState('notifications');
        break;

      case 'LiveDetection':
        setLiveDetectionData(null);
        setAppState('live-detection');
        break;
      default:
        navigateToHome(userRole);
    }
  };

  const handleLiveCapture = (photoUri: string, detection: AIDetectionResult) => {
    setLiveDetectionData({ photoUri, detection });
    setAppState('report-damage');
  };

  const handleBack = () => {
    setLiveDetectionData(null);
    navigateToHome(userRole);
  };

  const renderScreen = () => {
    switch (appState) {
      case 'loading':
        return (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        );

      case 'login':
        return (
          <LoginScreen
            onLoginSuccess={handleLoginSuccess}
            onSignupClick={() => setAppState('signup')}
          />
        );

      case 'signup':
        return <SignupScreen onBackToLogin={() => setAppState('login')} />;



      case 'location-permission':
        return <LocationPermissionScreen onPermissionGranted={handlePermissionGranted} />;

      case 'citizen-home':
        return (
          <CitizenHomeScreen
            onNavigate={handleNavigate}
            onLogout={handleLogout}
          />
        );

      case 'rso-home':
        return (
          <RSOHomeScreen
            onNavigate={handleNavigate}
            onLogout={handleLogout}
            onReviewReport={(report) => {
              setSelectedReviewReport(report);
              setAppState('rso-review');
            }}
          />
        );

      case 'rso-review-list':
        return (
          <RSOReviewListScreen
            onNavigate={handleNavigate}
            onLogout={handleLogout}
            onReviewReport={(report) => {
              setSelectedReviewReport(report);
              setAppState('rso-review');
            }}
          />
        );

      case 'rso-review':
        if (!selectedReviewReport) {
          setAppState('rso-home');
          return null;
        }
        return (
          <RSOReviewScreen
            report={selectedReviewReport}
            onBack={() => setAppState('rso-review-list')}
            onComplete={() => setAppState('rso-review-list')}
            onNavigate={handleNavigate}
            onLogout={handleLogout}
          />
        );

      case 'rso-heatmap':
        return (
          <RSOHeatmapScreen
            onNavigate={handleNavigate}
            onLogout={handleLogout}
          />
        );

      case 'admin-home':
        return (
          <AdminHomeScreen
            onNavigate={handleNavigate}
            onLogout={handleLogout}
          />
        );

      case 'user-management':
        return (
          <AdminUserManagementScreen
            onNavigate={handleNavigate}
            onLogout={handleLogout}
          />
        );
      case 'admin-heatmap':
        return (
          <AdminHeatmapScreen
            onNavigate={handleNavigate}
            onLogout={handleLogout}
          />
        );
      case 'points-management':
        return (
          <AdminPointsManagementScreen
            onNavigate={handleNavigate}
            onLogout={handleLogout}
          />
        );
      case 'admin-feedback':
        return (
          <AdminFeedbackScreen
            onNavigate={handleNavigate}
            onLogout={handleLogout}
          />
        );
      case 'notifications':
        return (
          <NotificationScreen
            onNavigate={handleNavigate}
            onLogout={handleLogout}
          />
        );


      case 'compliance-dashboard':
        return (
          <ComplianceDashboardScreen
            onNavigate={handleNavigate}
            onLogout={handleLogout}
          />
        );

      case 'contractor-home':
        return (
          <ContractorHomeScreen
            onNavigate={handleNavigate}
            onLogout={handleLogout}
          />
        );

      case 'live-detection':
        return (
          <LiveDetectionScreen
            onCapture={handleLiveCapture}
            onClose={() => navigateToHome(userRole)}
          />
        );

      case 'report-damage':
        return (
          <ReportDamageScreen
            initialData={liveDetectionData}
            onNavigate={handleNavigate}
            onBack={handleBack}
            onSuccess={handleBack}
            onLogout={handleLogout}
          />
        );

      case 'my-reports':
        return (
          <MyReportsScreen
            onNavigate={handleNavigate}
            onBack={handleBack}
            onLogout={handleLogout}
          />
        );

      default:
        return (
          <LoginScreen
            onLoginSuccess={handleLoginSuccess}
            onSignupClick={() => setAppState('signup')}
          />
        );
    }
  };

  const handleInstallApp = async () => {
    if (!deferredPrompt) {
      alert('Installation is only available in supported browsers (like Chrome or Edge) when the app is served over HTTPS or localhost.');
      return;
    }
    // Show the prompt
    deferredPrompt.prompt();
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    // We've used the prompt, and can't use it again, throw it away
    setDeferredPrompt(null);
  };

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      {Platform.OS === 'web' && (
        <View style={styles.webBanner}>
          <Text style={styles.webBannerText}>
            📲 Get the CrackX App for the best experience!
          </Text>
          <View style={styles.bannerButtons}>
            {deferredPrompt && (
              <TouchableOpacity 
                style={styles.installButton}
                onPress={handleInstallApp}
              >
                <Text style={styles.installButtonText}>Install Directly</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity 
              style={styles.downloadButton}
              onPress={() => {
                const downloadUrl = `${BASE_URL}/download-apk`;
                Linking.openURL(downloadUrl).catch(() => {
                  alert('Failed to open APK download link.');
                });
              }}
            >
              <Text style={styles.downloadButtonText}>Download APK</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {renderScreen()}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.light,
  },
  webBanner: {
    backgroundColor: COLORS.primary,
    padding: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 15,
  },
  webBannerText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  bannerButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  installButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  installButtonText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: 'bold',
  },
  downloadButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#fff',
  },
  downloadButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
