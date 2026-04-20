import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import es from './locales/es.json'
import en from './locales/en.json'
import fr from './locales/fr.json'
import de from './locales/de.json'
import it from './locales/it.json'

const saved = typeof localStorage !== 'undefined'
  ? (localStorage.getItem('hs-lang') ?? 'es')
  : 'es'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: es },
      en: { translation: en },
      fr: { translation: fr },
      de: { translation: de },
      it: { translation: it },
    },
    lng: saved,
    fallbackLng: 'es',
    interpolation: { escapeValue: false },
  })

export default i18n
