import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from './en';
import mr from './mr';
import hi from './hi';
import kn from './kn';
import { STORAGE_KEYS } from '../constants';

const resources = {
    en: { translation: en },
    mr: { translation: mr },
    hi: { translation: hi },
    kn: { translation: kn },
};

const initI18n = async () => {
    const savedLanguage = await AsyncStorage.getItem(STORAGE_KEYS.LANGUAGE);

    i18n
        .use(initReactI18next)
        .init({
            resources,
            lng: savedLanguage || 'en',
            fallbackLng: 'en',
            compatibilityJSON: 'v4',
            interpolation: {
                escapeValue: false,
            },
        });
};

export const changeLanguage = async (language: string) => {
    await AsyncStorage.setItem(STORAGE_KEYS.LANGUAGE, language);
    i18n.changeLanguage(language);
};

export { initI18n };
export default i18n;
