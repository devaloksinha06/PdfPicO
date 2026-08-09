import VersionCheck from 'react-native-version-check';
import { Alert, Linking } from 'react-native';

// ⚠️ SET TO true TO TEST THE UPDATE DIALOG
// Set back to false before releasing to production!
const TEST_MODE = false;

export const checkAppVersion = async () => {
    try {
        if (TEST_MODE) {
            // --- TEST MODE: Always show the update dialog ---
            const currentVersion = VersionCheck.getCurrentVersion();
            console.log('🧪 [TEST MODE] Current app version:', currentVersion);
            console.log('🧪 [TEST MODE] Forcing update dialog to appear...');

            Alert.alert(
                'Update Available',
                `A new version of the app is available on the Play Store. Please update for the best experience.\n\n(Current: v${currentVersion}  →  Latest: v99.0.0)\n\n⚠️ This is a TEST alert. Set TEST_MODE = false before release.`,
                [
                    {
                        text: 'Update Now',
                        onPress: () => {
                            Alert.alert(
                                'Test Success ✅',
                                'In production, this would open the Play Store page for your app.'
                            );
                        },
                    },
                    {
                        text: 'Later',
                        style: 'cancel',
                    },
                ],
                { cancelable: true }
            );
            return;
        }

        // --- PRODUCTION MODE: Real version check ---
        const res = await VersionCheck.needUpdate();
        if (res && res.isNeeded) {
            Alert.alert(
                'Update Available',
                'A new version of the app is available on the Play Store. Please update for the best experience.',
                [
                    {
                        text: 'Update Now',
                        onPress: async () => {
                            const url = await VersionCheck.getStoreUrl();
                            if (url) {
                                Linking.openURL(url);
                            } else {
                                Alert.alert('Error', 'Could not open the store URL.');
                            }
                        },
                    },
                    {
                        text: 'Later',
                        style: 'cancel',
                    },
                ],
                { cancelable: true }
            );
        }
    } catch (error) {
        console.warn('Error checking app version:', error);
    }
};
