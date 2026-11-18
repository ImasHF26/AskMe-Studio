import { createI18n } from 'vue-i18n';

export type AppLocale = 'fr' | 'en' | 'ar';

const LOCALE_KEY = 'askme_locale';

export const localeOptions: Array<{ value: AppLocale; label: string; shortLabel: string; dir: 'ltr' | 'rtl' }> = [
  { value: 'fr', label: 'Francais', shortLabel: 'FR', dir: 'ltr' },
  { value: 'en', label: 'English', shortLabel: 'EN', dir: 'ltr' },
  { value: 'ar', label: 'العربية', shortLabel: 'AR', dir: 'rtl' }
];

const messages = {
  fr: {
    app: {
      tagline: 'Interrogez vos donnees en langage naturel',
      liveWorkspace: 'Workspace actif',
      newSource: 'Nouvelle source',
      language: 'Langue',
      notAuthenticated: 'Non authentifie'
    },
    pages: {
      workspace: 'Workspace',
      datasources: 'Workflow data source',
      datasets: 'Dataset explorer',
      semantic: 'Semantic layer',
      dashboards: 'Tableau de bord',
      playground: 'Query playground'
    },
    theme: {
      label: 'Theme',
      dark: 'Mode sombre',
      darkSubtitle: 'Command center cinematographique',
      light: 'Mode clair',
      lightSubtitle: 'Studio analytics lumineux'
    },
    sidebar: {
      copilotReady: 'Copilot pret',
      semanticOnline: 'Semantic analytics en ligne',
      workspace: 'Workspace',
      dataSources: 'Data Sources',
      datasetExplorer: 'Dataset Explorer',
      semanticLayer: 'Semantic Layer',
      dashboards: 'Tableau de bord',
      playground: 'Playground',
      logout: 'Deconnexion'
    },
    workspace: {
      showHistory: 'Afficher Query History',
      hideHistory: 'Masquer Query History',
      conversationMemory: 'Memoire conversationnelle',
      queryHistory: 'Query History',
      sourceContext: 'Contexte source',
      sourceTitle: 'Selectionner la source',
      dataSources: 'Data Sources',
      activeSource: 'Datasource active',
      providerTitle: 'Provider Text-to-SQL',
      availableSources: 'Datasources disponibles',
      refreshSources: 'Rafraichir les datasources',
      manageSources: 'Gerer les connexions',
      noSources: 'Aucune datasource disponible. Creez une connexion depuis le workflow Data Sources.'
    },
    chat: {
      copilot: 'AskMe Copilot',
      workspaceActive: 'Workspace actif',
      welcomeTitle: 'Analyse tes donnees en langage naturel',
      welcomeCopy:
        'Pose une question, verifie la requete generee, puis transforme le resultat en insight ou dashboard.',
      user: 'Vous',
      thinking: 'Analyse du contexte semantique...',
      selectDatasource: 'Selectionne une datasource',
      placeholder: 'Posez vos questions a vos donnees...',
      activePlaceholder: 'Analyse, compare, visualise...',
      attachFile: 'Attacher un fichier',
      openDatasource: 'Ouvrir le panneau datasource',
      clearQuestion: 'Effacer la question',
      sendQuestion: 'Envoyer la question',
      enter: 'Enter',
      send: 'envoyer',
      suggestionsLabel: 'Suggestions de prompts BI',
      suggestions: [
        'Montre les ventes mensuelles',
        'Compare 2023 et 2024',
        'Créer un tableau de bord',
        'Top clients par region'
      ]
    },
    history: {
      title: 'Query History',
      refresh: 'Rafraichir',
      sql: 'SQL',
      empty: 'Aucun historique pour le moment.'
    }
  },
  en: {
    app: {
      tagline: 'Ask your data in natural language',
      liveWorkspace: 'Live workspace',
      newSource: 'New source',
      language: 'Language',
      notAuthenticated: 'Not authenticated'
    },
    pages: {
      workspace: 'Workspace',
      datasources: 'Data source workflow',
      datasets: 'Dataset explorer',
      semantic: 'Semantic layer',
      dashboards: 'Dashboard builder',
      playground: 'Query playground'
    },
    theme: {
      label: 'Theme',
      dark: 'Dark mode',
      darkSubtitle: 'Cinematic command center',
      light: 'Light mode',
      lightSubtitle: 'Bright analytics studio'
    },
    sidebar: {
      copilotReady: 'Copilot ready',
      semanticOnline: 'Semantic analytics online',
      workspace: 'Workspace',
      dataSources: 'Data Sources',
      datasetExplorer: 'Dataset Explorer',
      semanticLayer: 'Semantic Layer',
      dashboards: 'Dashboards',
      playground: 'Playground',
      logout: 'Logout'
    },
    workspace: {
      showHistory: 'Show Query History',
      hideHistory: 'Hide Query History',
      conversationMemory: 'Conversation memory',
      queryHistory: 'Query History',
      sourceContext: 'Source context',
      sourceTitle: 'Select source',
      dataSources: 'Data Sources',
      activeSource: 'Active datasource',
      providerTitle: 'Text-to-SQL provider',
      availableSources: 'Available datasources',
      refreshSources: 'Refresh datasources',
      manageSources: 'Manage connections',
      noSources: 'No datasource available. Create a connection from the Data Sources workflow.'
    },
    chat: {
      copilot: 'AskMe Copilot',
      workspaceActive: 'Workspace active',
      welcomeTitle: 'Analyze your data in natural language',
      welcomeCopy:
        'Ask a question, review the generated query, then turn the result into an insight or dashboard.',
      user: 'You',
      thinking: 'Analyzing semantic context...',
      selectDatasource: 'Select a datasource',
      placeholder: 'Ask questions to your data...',
      activePlaceholder: 'Analyze, compare, visualize...',
      attachFile: 'Attach file',
      openDatasource: 'Open datasource panel',
      clearQuestion: 'Clear question',
      sendQuestion: 'Send question',
      enter: 'Enter',
      send: 'send',
      suggestionsLabel: 'Suggested BI prompts',
      suggestions: [
        'Show monthly sales',
        'Compare 2023 and 2024',
        'Create an HR dashboard',
        'Top customers by region'
      ]
    },
    history: {
      title: 'Query History',
      refresh: 'Refresh',
      sql: 'SQL',
      empty: 'No query history yet.'
    }
  },
  ar: {
    app: {
      tagline: 'اسأل بياناتك باللغة الطبيعية',
      liveWorkspace: 'مساحة العمل نشطة',
      newSource: 'مصدر جديد',
      language: 'اللغة',
      notAuthenticated: 'غير مسجل الدخول'
    },
    pages: {
      workspace: 'مساحة العمل',
      datasources: 'مسار مصادر البيانات',
      datasets: 'مستكشف البيانات',
      semantic: 'الطبقة الدلالية',
      dashboards: 'منشئ اللوحات',
      playground: 'ساحة الاستعلام'
    },
    theme: {
      label: 'المظهر',
      dark: 'الوضع الداكن',
      darkSubtitle: 'مركز تحكم سينمائي',
      light: 'الوضع الفاتح',
      lightSubtitle: 'استوديو تحليلات مضيء'
    },
    sidebar: {
      copilotReady: 'المساعد جاهز',
      semanticOnline: 'التحليلات الدلالية متصلة',
      workspace: 'مساحة العمل',
      dataSources: 'مصادر البيانات',
      datasetExplorer: 'مستكشف البيانات',
      semanticLayer: 'الطبقة الدلالية',
      dashboards: 'اللوحات',
      playground: 'التجارب',
      logout: 'تسجيل الخروج'
    },
    workspace: {
      showHistory: 'إظهار سجل الاستعلامات',
      hideHistory: 'إخفاء سجل الاستعلامات',
      conversationMemory: 'ذاكرة المحادثة',
      queryHistory: 'سجل الاستعلامات',
      sourceContext: 'سياق المصدر',
      sourceTitle: 'اختيار مصدر البيانات',
      dataSources: 'مصادر البيانات',
      activeSource: 'مصدر البيانات النشط',
      providerTitle: 'مزود Text-to-SQL',
      availableSources: 'مصادر البيانات المتاحة',
      refreshSources: 'تحديث مصادر البيانات',
      manageSources: 'إدارة الاتصالات',
      noSources: 'لا توجد مصادر بيانات متاحة. أنشئ اتصالا من مسار مصادر البيانات.'
    },
    chat: {
      copilot: 'AskMe Copilot',
      workspaceActive: 'مساحة العمل نشطة',
      welcomeTitle: 'حلل بياناتك باللغة الطبيعية',
      welcomeCopy: 'اطرح سؤالا، راجع الاستعلام الناتج، ثم حول النتيجة إلى رؤية أو لوحة تحكم.',
      user: 'أنت',
      thinking: 'تحليل السياق الدلالي...',
      selectDatasource: 'اختر مصدر بيانات',
      placeholder: 'اطرح أسئلتك على بياناتك...',
      activePlaceholder: 'حلل، قارن، اعرض...',
      attachFile: 'إرفاق ملف',
      openDatasource: 'فتح لوحة مصادر البيانات',
      clearQuestion: 'مسح السؤال',
      sendQuestion: 'إرسال السؤال',
      enter: 'Enter',
      send: 'إرسال',
      suggestionsLabel: 'اقتراحات أسئلة BI',
      suggestions: ['اعرض المبيعات الشهرية', 'قارن 2023 و 2024', 'أنشئ لوحة موارد بشرية', 'أفضل العملاء حسب المنطقة']
    },
    history: {
      title: 'سجل الاستعلامات',
      refresh: 'تحديث',
      sql: 'SQL',
      empty: 'لا يوجد سجل استعلامات بعد.'
    }
  }
};

const getInitialLocale = (): AppLocale => {
  const saved = localStorage.getItem(LOCALE_KEY);
  if (saved === 'fr' || saved === 'en' || saved === 'ar') return saved;
  return 'fr';
};

export const syncLocaleDocument = (locale: AppLocale) => {
  const option = localeOptions.find((item) => item.value === locale) || localeOptions[0];
  document.documentElement.lang = locale;
  document.documentElement.dir = option.dir;
  document.documentElement.dataset.askmeLocale = locale;
};

export const i18n = createI18n({
  legacy: false,
  locale: getInitialLocale(),
  fallbackLocale: 'fr',
  messages
});

export const setLocale = (locale: AppLocale) => {
  i18n.global.locale.value = locale;
  localStorage.setItem(LOCALE_KEY, locale);
  syncLocaleDocument(locale);
};

syncLocaleDocument(i18n.global.locale.value as AppLocale);
