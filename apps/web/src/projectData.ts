export type Locale = "ru" | "en";
export type UserRole = "admin" | "manager" | "worker" | "tenant";

export const brand = {
  ru: {
    name: "склад контур",
    subtitle: "операционная платформа складской недвижимости"
  },
  en: {
    name: "warehouse contour",
    subtitle: "warehouse real-estate operations platform"
  }
};

export const copy = {
  ru: {
    localeLabel: "Язык",
    loading: "Загрузка системы...",
    auth: {
      title: "CRM, заявки и объектный контроль в едином контуре.",
      description:
        "Рабочая система для управляющей компании складской недвижимости: объектный борт, договорный рейл и сервисная очередь без лишнего промо-шума.",
      staffTab: "Сотрудник",
      tenantTab: "Арендатор",
      staffTitle: "Вход для администратора, менеджера и рабочего",
      tenantTitle: "Введите телефон, закреплённый за договором. Код придёт в подключённый канал.",
      tenantFirstTimeTitle: "Первый вход арендатора",
      tenantFirstTimeText: "Сначала привяжите Telegram или VK: откройте бота, отправьте номер телефона из договора, затем вернитесь сюда и запросите код.",
      channelUnavailable: "не подключён",
      email: "Email",
      password: "Пароль",
      phone: "Телефон",
      otp: "Код",
      requestOtp: "Запросить код",
      verifyOtp: "Подтвердить вход",
      mfaCode: "Код 2FA",
      verifyMfa: "Подтвердить 2FA",
      forgotPassword: "Забыли пароль?",
      resetTitle: "Восстановление пароля",
      resetHint: "Введите рабочий email. Код придёт в привязанный Telegram или VK.",
      resetCode: "Код восстановления",
      newPassword: "Новый пароль",
      requestReset: "Получить код",
      confirmReset: "Сменить пароль",
      backToLogin: "Вернуться ко входу",
      signIn: "Войти",
      accessNoteTitle: "Доступ",
      accessNoteHint: "Используйте учетные данные, выданные администратором платформы."
    },
    topbar: {
      logout: "Выйти",
      refresh: "Обновить"
    },
    nav: {
      overview: "Обзор",
      portfolio: "Площади",
      leases: "Договоры",
      service: "Заявки",
      chat: "Чат",
      admin: "Управление"
    },
    sectionHeads: {
      overview: "Сводка по объектам, договорам и сервисной нагрузке",
      portfolio: "Реестр площадей и параметры фонда",
      leases: "Сроки, стадии и точки пролонгации",
      service: "Очередь заявок, статусы и коммуникация",
      chat: "Диалог с управляющей командой по связанным заявкам",
      admin: "Операции по справочникам и договорам"
    },
    scopeByRole: {
      admin: "Полный доступ ко всему портфелю и справочникам.",
      manager: "Операционный контроль портфеля, договоров и заявок.",
      worker: "Доступ только к своему объекту и связанным заявкам.",
      tenant: "Доступ только к своим помещениям, договорам и обращениям."
    },
    metrics: {
      occupancy: "Заполняемость",
      activeLeases: "Активные договоры",
      openTickets: "Открытые заявки",
      expiring: "Истекают в 45 дней"
    },
    sections: {
      twin: "Объектная схема",
      watchlist: "Договорной рейл",
      serviceFeed: "Фокус по заявкам",
      ticketDetail: "Карточка заявки",
      ticketCreate: "Новая заявка",
      propertyForm: "Новый объект",
      tenantForm: "Новый арендатор",
      unitForm: "Новое помещение",
      leaseForm: "Новый договор"
    },
    fields: {
      name: "Название",
      address: "Адрес",
      totalArea: "Общая площадь",
      rentableArea: "Арендуемая площадь",
      warehouseClass: "Класс склада",
      description: "Описание",
      contactName: "Контактное лицо",
      inn: "ИНН",
      email: "Email",
      phone: "Телефон",
      riskLevel: "Риск",
      property: "Объект",
      number: "Номер",
      floor: "Этаж",
      area: "Площадь",
      type: "Тип",
      status: "Статус",
      temperatureRegime: "Температурный режим",
      ceilingHeight: "Высота потолка",
      hasRamp: "Рампа",
      hasGate: "Ворота",
      tenant: "Арендатор",
      unit: "Помещение",
      contractNumber: "Номер договора",
      stage: "Стадия",
      startDate: "Начало",
      endDate: "Окончание",
      ratePerSqm: "Ставка за м²",
      deposit: "Депозит",
      indexationPct: "Индексация, %",
      category: "Категория",
      priority: "Приоритет",
      title: "Тема",
      content: "Комментарий",
      legend: "Легенда",
      document: "Документ"
    },
    actions: {
      save: "Сохранить",
      create: "Создать",
      delete: "Удалить",
      addComment: "Добавить комментарий",
      confirmDelete: "Удалить запись?"
    },
    hints: {
      twin: "Схема собирает помещения по этажам и подсвечивает вакантность, эксплуатационные проблемы и риск по сроку договора.",
      noData: "Нет данных",
      availableUnits: "Для нового договора доступны только помещения без активного контракта.",
      readOnly: "Эта роль работает в read-only режиме по справочникам.",
      commentEmpty: "Комментариев пока нет.",
      ticketEmpty: "Заявок в выбранном фильтре нет.",
      adminEmpty: "Этот раздел доступен только администратору и менеджеру."
    },
    messages: {
      saved: "Изменения сохранены",
      deleted: "Запись удалена",
      otpSent: "Код отправлен в подключённый канал",
      ticketCreated: "Заявка создана",
      commentAdded: "Комментарий добавлен",
      statusUpdated: "Статус обновлён"
    },
    roles: {
      admin: "Администратор",
      manager: "Менеджер",
      worker: "Рабочий",
      tenant: "Арендатор"
    },
    unitStatuses: {
      vacant: "Вакантно",
      occupied: "Занято",
      maintenance: "На ремонте"
    },
    unitTypes: {
      warm: "Тёплый",
      cold: "Холодный",
      freezer: "Морозильный",
      open: "Открытая площадка",
      office: "Офис"
    },
    leaseStages: {
      draft: "Черновик",
      formed: "Сформирован",
      sent: "Отправлен",
      signed: "Подписан",
      active: "Активен",
      prolongation: "Пролонгация",
      terminated: "Завершён"
    },
    riskLevels: {
      low: "Низкий",
      medium: "Средний",
      high: "Высокий"
    },
    ticketCategories: {
      gates_ramps: "Ворота, рампы и доки",
      electrical: "Электрика",
      plumbing: "Вода и сантехника",
      heating: "Отопление и температура",
      security: "Охрана, камеры и доступ",
      territory: "Территория, дороги и освещение",
      loading_equipment: "Погрузочное оборудование",
      ventilation: "Вентиляция и климат",
      maintenance: "Эксплуатация",
      billing: "Биллинг",
      access: "Доступ",
      damage: "Повреждение",
      cleaning: "Уборка",
      other: "Прочее"
    },
    ticketPriorities: {
      low: "Низкий",
      medium: "Средний",
      high: "Высокий",
      urgent: "Критичный"
    },
    ticketStatuses: {
      accepted: "Принята",
      completed: "Выполнена",
      rejected: "Отменена",
      new: "Новая",
      in_progress: "В работе",
      waiting_tenant: "Ожидает арендатора",
      resolved: "Решена",
      closed: "Закрыта"
    },
    warehouseClasses: ["A+", "A", "B+", "B", "C", "D"]
  },
  en: {
    localeLabel: "Language",
    loading: "Loading system...",
    auth: {
      title: "CRM, Service Desk, and property control in one operating surface.",
      description:
        "An operating system for warehouse real-estate teams: property board, lease rail, and service queue without landing-page filler.",
      staffTab: "Staff",
      tenantTab: "Tenant",
      staffTitle: "Sign in for admin, manager, and worker",
      tenantTitle: "Enter the phone linked to the lease. The code will arrive through the connected channel.",
      tenantFirstTimeTitle: "First tenant sign-in",
      tenantFirstTimeText: "Bind Telegram or VK first: open the bot, send the phone number from the lease, then return here and request the code.",
      channelUnavailable: "not connected",
      email: "Email",
      password: "Password",
      phone: "Phone",
      otp: "Code",
      requestOtp: "Request code",
      verifyOtp: "Verify sign in",
      mfaCode: "2FA code",
      verifyMfa: "Verify 2FA",
      forgotPassword: "Forgot password?",
      resetTitle: "Password recovery",
      resetHint: "Enter your work email. The code will arrive in the linked Telegram or VK.",
      resetCode: "Recovery code",
      newPassword: "New password",
      requestReset: "Get code",
      confirmReset: "Change password",
      backToLogin: "Back to sign in",
      signIn: "Sign in",
      accessNoteTitle: "Workspace access",
      accessNoteHint: "Use the credentials issued by the platform administrator."
    },
    topbar: {
      logout: "Log out",
      refresh: "Refresh"
    },
    nav: {
      overview: "Overview",
      portfolio: "Portfolio",
      leases: "Leases",
      service: "Service Desk",
      chat: "Chat",
      admin: "Admin"
    },
    sectionHeads: {
      overview: "Portfolio, lease, and service overview",
      portfolio: "Unit registry and building condition",
      leases: "Terms, stages, and renewal points",
      service: "Ticket queue, status flow, and collaboration",
      chat: "Conversation with the operations team by linked tickets",
      admin: "Master data and lease operations"
    },
    scopeByRole: {
      admin: "Full access to the portfolio and master data.",
      manager: "Operational control over portfolio, leases, and tickets.",
      worker: "Access only to the assigned property and related tickets.",
      tenant: "Access only to own units, leases, and tickets."
    },
    metrics: {
      occupancy: "Occupancy",
      activeLeases: "Active leases",
      openTickets: "Open tickets",
      expiring: "Expiring in 45 days"
    },
    sections: {
      twin: "Property board",
      watchlist: "Lease rail",
      serviceFeed: "Incident focus",
      ticketDetail: "Ticket detail",
      ticketCreate: "New ticket",
      propertyForm: "New property",
      tenantForm: "New tenant",
      unitForm: "New unit",
      leaseForm: "New lease"
    },
    fields: {
      name: "Name",
      address: "Address",
      totalArea: "Total area",
      rentableArea: "Rentable area",
      warehouseClass: "Warehouse class",
      description: "Description",
      contactName: "Contact person",
      inn: "Tax ID",
      email: "Email",
      phone: "Phone",
      riskLevel: "Risk",
      property: "Property",
      number: "Number",
      floor: "Floor",
      area: "Area",
      type: "Type",
      status: "Status",
      temperatureRegime: "Temperature regime",
      ceilingHeight: "Ceiling height",
      hasRamp: "Ramp",
      hasGate: "Gate",
      tenant: "Tenant",
      unit: "Unit",
      contractNumber: "Contract number",
      stage: "Stage",
      startDate: "Start",
      endDate: "End",
      ratePerSqm: "Rate per sqm",
      deposit: "Deposit",
      indexationPct: "Indexation, %",
      category: "Category",
      priority: "Priority",
      title: "Title",
      content: "Comment",
      legend: "Legend",
      document: "Document"
    },
    actions: {
      save: "Save",
      create: "Create",
      delete: "Delete",
      addComment: "Add comment",
      confirmDelete: "Delete this record?"
    },
    hints: {
      twin: "The board arranges units by floor and highlights vacancy, maintenance issues, and lease timing risk.",
      noData: "No data",
      availableUnits: "Only units without an active contract are available for a new lease.",
      readOnly: "This role is read-only for master data.",
      commentEmpty: "No comments yet.",
      ticketEmpty: "No tickets match the current filter.",
      adminEmpty: "This section is available only to admin and manager."
    },
    messages: {
      saved: "Changes saved",
      deleted: "Record deleted",
      otpSent: "Code sent",
      ticketCreated: "Ticket created",
      commentAdded: "Comment added",
      statusUpdated: "Status updated"
    },
    roles: {
      admin: "Admin",
      manager: "Manager",
      worker: "Worker",
      tenant: "Tenant"
    },
    unitStatuses: {
      vacant: "Vacant",
      occupied: "Occupied",
      maintenance: "Maintenance"
    },
    unitTypes: {
      warm: "Warm",
      cold: "Cold",
      freezer: "Freezer",
      open: "Open area",
      office: "Office"
    },
    leaseStages: {
      draft: "Draft",
      formed: "Formed",
      sent: "Sent",
      signed: "Signed",
      active: "Active",
      prolongation: "Prolongation",
      terminated: "Terminated"
    },
    riskLevels: {
      low: "Low",
      medium: "Medium",
      high: "High"
    },
    ticketCategories: {
      gates_ramps: "Gates / ramps / docks",
      electrical: "Electrical",
      plumbing: "Plumbing / water",
      heating: "Heating / temperature",
      security: "Security / CCTV / access",
      territory: "Territory / roads / lighting",
      loading_equipment: "Loading equipment",
      ventilation: "Ventilation / HVAC",
      maintenance: "Maintenance",
      billing: "Billing",
      access: "Access",
      damage: "Damage",
      cleaning: "Cleaning",
      other: "Other"
    },
    ticketPriorities: {
      low: "Low",
      medium: "Medium",
      high: "High",
      urgent: "Urgent"
    },
    ticketStatuses: {
      new: "New",
      accepted: "Accepted",
      in_progress: "In progress",
      completed: "Completed",
      waiting_tenant: "Waiting for tenant",
      resolved: "Resolved",
      closed: "Closed",
      rejected: "Rejected"
    },
    warehouseClasses: ["A+", "A", "B+", "B", "C", "D"]
  }
} as const;

export const unitTypeOptions = ["warm", "cold", "freezer", "open", "office"] as const;
export const unitStatusOptions = ["vacant", "occupied", "maintenance"] as const;
export const leaseStageOptions = [
  "draft",
  "formed",
  "sent",
  "signed",
  "active",
  "prolongation",
  "terminated"
] as const;
export const riskLevelOptions = ["low", "medium", "high"] as const;
export const ticketCategoryOptions = [
  "gates_ramps",
  "electrical",
  "plumbing",
  "heating",
  "security",
  "territory",
  "loading_equipment",
  "ventilation",
  "maintenance",
  "billing",
  "access",
  "damage",
  "cleaning",
  "other"
] as const;
export const ticketPriorityOptions = ["low", "medium", "high", "urgent"] as const;
export const ticketStatusOptions = ["new", "accepted", "in_progress", "completed", "closed", "rejected", "waiting_tenant", "resolved"] as const;
