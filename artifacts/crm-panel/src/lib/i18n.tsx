import { createContext, useContext, useState, ReactNode } from "react";

type Lang = "en" | "ru";

const translations = {
  en: {
    nav: {
      overview: "Overview",
      dashboard: "Dashboard",
      analytics: "Analytics",
      distribution_group: "Distribution",
      distribution: "Distribution",
      catalog: "Catalog",
      releases: "Releases",
      artists: "Artists",
      labels: "Labels",
      videos: "Videos",
      users_group: "Users",
      users: "Users",
      operations: "Operations",
      publishing: "Publishing",
      rights: "Rights Management",
      crm: "CRM",
      communications: "Communications",
      marketing: "Marketing",
      financials: "Financials",
      royalties: "Royalties",
      finance: "Finance",
      splits: "Splits",
      payouts: "Payouts",
      account_group: "Account",
      profile: "Profile",
      support: "Support",
      system: "System",
      automation: "Automation",
      integrations: "API Integrations",
      settings: "Settings",
    },
    header: {
      search: "Search catalog, artists, or ISRC...",
    },
    dashboard: {
      title: "Dashboard",
      subtitle: "Real-time overview of your music catalog and operations.",
      total_revenue: "Total Revenue",
      total_artists: "Total Artists",
      total_releases: "Total Releases",
      active_deliveries: "Active Deliveries",
      revenue_overview: "Revenue Overview",
      revenue_subtitle: "DSP vs Publishing revenue by month",
      top_artists: "Top Artists",
      top_artists_subtitle: "By streams this month",
      recent_releases: "Recent Releases",
      recent_releases_subtitle: "Latest submissions and deliveries",
    },
    analytics: {
      title: "Analytics",
      subtitle: "Streams, revenue, UGC and audience data across all platforms.",
      total_streams: "Total Streams",
      total_revenue: "Total Revenue",
      active_tracks: "Active Tracks",
      ugc_claims: "UGC Claims",
      tabs: {
        streams: "Streams",
        revenue: "Revenue",
        geo: "Geography",
        ugc: "YouTube UGC",
        tiktok: "TikTok",
        playlist: "Playlists",
      },
    },
    distribution: {
      title: "Distribution",
      subtitle: "Release moderation, DDEX delivery, DSP status and takedowns.",
    },
    rights: {
      title: "Rights Management",
      subtitle: "DSP deals, Content ID, disputes and territorial rights.",
    },
    crm: {
      title: "CRM",
      subtitle: "Contacts, tasks, notes, and communication history.",
    },
    communications: {
      title: "Communications",
      subtitle: "Email campaigns, push notifications, and messaging channels.",
    },
    marketing: {
      title: "Marketing",
      subtitle: "Pre-save campaigns, smart links, editorial pitches and promo assets.",
    },
    automation: {
      title: "Automation",
      subtitle: "Workflow rules, fraud detection, and content moderation automation.",
    },
    videos: {
      title: "Video Distribution",
      subtitle: "YouTube, VEVO, art tracks, and Content ID video management.",
    },
    common: {
      export: "Export",
      new: "New",
      search: "Search",
      filter: "Filter",
      approve: "Approve",
      reject: "Reject",
      save: "Save",
      cancel: "Cancel",
      edit: "Edit",
      delete: "Delete",
      active: "Active",
      pending: "Pending",
      draft: "Draft",
      status: "Status",
      actions: "Actions",
      period: {
        "1m": "Last month",
        "3m": "Last 3 months",
        "6m": "Last 6 months",
        "1y": "Last year",
      },
    },
  },
  ru: {
    nav: {
      overview: "Обзор",
      dashboard: "Дашборд",
      analytics: "Аналитика",
      distribution_group: "Дистрибуция",
      distribution: "Дистрибуция",
      catalog: "Каталог",
      releases: "Релизы",
      artists: "Исполнители",
      labels: "Лейблы",
      videos: "Видео",
      users_group: "Пользователи",
      users: "Пользователи",
      operations: "Операции",
      publishing: "Паблишинг",
      rights: "Управление правами",
      crm: "CRM",
      communications: "Коммуникации",
      marketing: "Маркетинг",
      financials: "Финансы",
      royalties: "Роялти",
      finance: "Финансы",
      splits: "Сплиты",
      payouts: "Выплаты",
      account_group: "Аккаунт",
      profile: "Профиль",
      support: "Поддержка",
      system: "Система",
      automation: "Автоматизация",
      integrations: "Интеграции API",
      settings: "Настройки",
    },
    header: {
      search: "Поиск каталога, исполнителей, ISRC...",
    },
    dashboard: {
      title: "Дашборд",
      subtitle: "Оперативный обзор вашего каталога и операций.",
      total_revenue: "Выручка",
      total_artists: "Исполнители",
      total_releases: "Релизы",
      active_deliveries: "Активные доставки",
      revenue_overview: "Обзор выручки",
      revenue_subtitle: "Доходы DSP vs Паблишинг по месяцам",
      top_artists: "Топ исполнители",
      top_artists_subtitle: "По стримам за этот месяц",
      recent_releases: "Последние релизы",
      recent_releases_subtitle: "Последние заявки и доставки",
    },
    analytics: {
      title: "Аналитика",
      subtitle: "Стримы, выручка, UGC и данные аудитории по всем платформам.",
      total_streams: "Всего стримов",
      total_revenue: "Выручка",
      active_tracks: "Активных треков",
      ugc_claims: "UGC клеймы",
      tabs: {
        streams: "Стримы",
        revenue: "Выручка",
        geo: "География",
        ugc: "YouTube UGC",
        tiktok: "TikTok",
        playlist: "Плейлисты",
      },
    },
    distribution: {
      title: "Дистрибуция",
      subtitle: "Модерация релизов, доставка DDEX, статус DSP и отзывы.",
    },
    rights: {
      title: "Управление правами",
      subtitle: "Договоры с DSP, Content ID, споры и территориальные права.",
    },
    crm: {
      title: "CRM",
      subtitle: "Контакты, задачи, заметки и история коммуникаций.",
    },
    communications: {
      title: "Коммуникации",
      subtitle: "Email-кампании, пуш-уведомления и каналы связи.",
    },
    marketing: {
      title: "Маркетинг",
      subtitle: "Пресейвы, умные ссылки, редакционные питчи и промо-материалы.",
    },
    automation: {
      title: "Автоматизация",
      subtitle: "Рабочие процессы, обнаружение фрода и модерация контента.",
    },
    videos: {
      title: "Видеодистрибуция",
      subtitle: "YouTube, VEVO, арт-треки и управление Content ID.",
    },
    common: {
      export: "Экспорт",
      new: "Новый",
      search: "Поиск",
      filter: "Фильтр",
      approve: "Одобрить",
      reject: "Отклонить",
      save: "Сохранить",
      cancel: "Отмена",
      edit: "Редактировать",
      delete: "Удалить",
      active: "Активный",
      pending: "В ожидании",
      draft: "Черновик",
      status: "Статус",
      actions: "Действия",
      period: {
        "1m": "Последний месяц",
        "3m": "Последние 3 месяца",
        "6m": "Последние 6 месяцев",
        "1y": "Последний год",
      },
    },
  },
};

type Translations = typeof translations.en;

interface LangContextType {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Translations;
}

const LangContext = createContext<LangContextType>({
  lang: "en",
  setLang: () => {},
  t: translations.en,
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");
  return (
    <LangContext.Provider value={{ lang, setLang, t: translations[lang] }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
