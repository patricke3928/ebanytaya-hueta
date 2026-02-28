import type { Task } from "@/types/domain";

export type Lang = "ru" | "en";

type Dictionary = {
  dashboardTitle: string;
  projectLabel: string;
  noProjectSelected: string;
  projects: string;
  myTasks: string;
  notifications: string;
  noAssignedTasks: string;
  noRecentEvents: string;
  kanbanBoard: string;
  noBoardSelected: string;
  noTasks: string;
  quickActions: string;
  createProject: string;
  createTaskCurrentProject: string;
  projectName: string;
  taskTitle: string;
  addProject: string;
  addTask: string;
  moveTo: string;
  startupFailed: string;
  boardLoadFailed: string;
  taskSynced: string;
  projectCreated: string;
  createProjectFailed: string;
  taskCreated: string;
  createTaskFailed: string;
  moveFailed: string;
  user: string;
  language: string;
  loginTitle: string;
  loginSubtitle: string;
  username: string;
  password: string;
  signIn: string;
  signOut: string;
  loginFailed: string;
  updateTask: string;
  assignee: string;
  unassigned: string;
  save: string;
  openProjectPage: string;
  allAssignees: string;
  filterByAssignee: string;
  filterByStatus: string;
  allStatuses: string;
  projectBoardTitle: string;
  openCore: string;
  loading: string;
  loadingBoard: string;
  loadingWorkspace: string;
  saving: string;
  roleLeadHint: string;
  roleDevHint: string;
  rolePoHint: string;
  projectRequiredHint: string;
  loginRequired: string;
  boardFailed: string;
  noProjectsHint: string;
  noPermissionMoveDev: string;
  noPermissionMovePo: string;
  noPermissionEdit: string;
  backToDashboard: string;
  statusLabels: Record<Task["status"], string>;
  priorityLabels: Record<Task["priority"], string>;
};

export const dictionaries: Record<Lang, Dictionary> = {
  ru: {
    dashboardTitle: "Панель Nexus OS",
    projectLabel: "Проект",
    noProjectSelected: "Проект не выбран",
    projects: "Проекты",
    myTasks: "Мои задачи",
    notifications: "Уведомления",
    noAssignedTasks: "Нет назначенных задач.",
    noRecentEvents: "Нет новых событий.",
    kanbanBoard: "Канбан-доска",
    noBoardSelected: "Доска не выбрана.",
    noTasks: "Задач нет.",
    quickActions: "Быстрые действия",
    createProject: "Создать проект",
    createTaskCurrentProject: "Создать задачу в текущем проекте",
    projectName: "Название проекта",
    taskTitle: "Название задачи",
    addProject: "Добавить проект",
    addTask: "Добавить задачу",
    moveTo: "Перевести в",
    startupFailed: "Ошибка запуска",
    boardLoadFailed: "Ошибка загрузки доски",
    taskSynced: "Задача синхронизирована",
    projectCreated: "Проект создан",
    createProjectFailed: "Ошибка создания проекта",
    taskCreated: "Задача создана",
    createTaskFailed: "Ошибка создания задачи",
    moveFailed: "Ошибка смены статуса",
    user: "Пользователь",
    language: "Язык",
    loginTitle: "Вход в Nexus OS",
    loginSubtitle: "Войдите, чтобы управлять проектами и задачами.",
    username: "Логин",
    password: "Пароль",
    signIn: "Войти",
    signOut: "Выйти",
    loginFailed: "Ошибка входа",
    updateTask: "Обновить задачу",
    assignee: "Исполнитель",
    unassigned: "Не назначен",
    save: "Сохранить",
    openProjectPage: "Открыть страницу проекта",
    allAssignees: "Все исполнители",
    filterByAssignee: "Фильтр по исполнителю",
    filterByStatus: "Фильтр по статусу",
    allStatuses: "Все статусы",
    projectBoardTitle: "Доска проекта",
    openCore: "Открыть The Core",
    loading: "Загрузка...",
    loadingBoard: "Загружаем доску проекта...",
    loadingWorkspace: "Загружаем рабочее пространство...",
    saving: "Сохранение...",
    roleLeadHint: "Роль LEAD: полное управление проектами и задачами.",
    roleDevHint: "Роль DEV: можно двигать только свои задачи по статусам.",
    rolePoHint: "Роль PO: режим просмотра без изменений задач.",
    projectRequiredHint: "Сначала выбери проект.",
    loginRequired: "Нужно войти в систему через Dashboard.",
    boardFailed: "Не удалось загрузить доску проекта.",
    noProjectsHint: "Создай первый проект, чтобы начать работу.",
    noPermissionMoveDev: "DEV может менять статус только своих задач.",
    noPermissionMovePo: "PO не может менять статусы задач.",
    noPermissionEdit: "Редактирование доступно только роли LEAD.",
    backToDashboard: "Назад в Dashboard",
    statusLabels: {
      BACKLOG: "Бэклог",
      TODO: "К выполнению",
      DOING: "В работе",
      DONE: "Готово",
    },
    priorityLabels: {
      LOW: "Низкий",
      MEDIUM: "Средний",
      HIGH: "Высокий",
      CRITICAL: "Критический",
    },
  },
  en: {
    dashboardTitle: "Nexus OS Dashboard",
    projectLabel: "Project",
    noProjectSelected: "No project selected",
    projects: "Projects",
    myTasks: "My Tasks",
    notifications: "Notifications",
    noAssignedTasks: "No assigned tasks.",
    noRecentEvents: "No recent events.",
    kanbanBoard: "Kanban Board",
    noBoardSelected: "No board selected.",
    noTasks: "No tasks.",
    quickActions: "Quick Actions",
    createProject: "Create project",
    createTaskCurrentProject: "Create task in current project",
    projectName: "Project name",
    taskTitle: "Task title",
    addProject: "Add Project",
    addTask: "Add Task",
    moveTo: "Move to",
    startupFailed: "Startup failed",
    boardLoadFailed: "Board load failed",
    taskSynced: "Task synced",
    projectCreated: "Project created",
    createProjectFailed: "Create project failed",
    taskCreated: "Task created",
    createTaskFailed: "Create task failed",
    moveFailed: "Move failed",
    user: "User",
    language: "Language",
    loginTitle: "Sign in to Nexus OS",
    loginSubtitle: "Use your account to manage projects and tasks.",
    username: "Username",
    password: "Password",
    signIn: "Sign in",
    signOut: "Sign out",
    loginFailed: "Login failed",
    updateTask: "Update task",
    assignee: "Assignee",
    unassigned: "Unassigned",
    save: "Save",
    openProjectPage: "Open project page",
    allAssignees: "All assignees",
    filterByAssignee: "Filter by assignee",
    filterByStatus: "Filter by status",
    allStatuses: "All statuses",
    projectBoardTitle: "Project board",
    openCore: "Open The Core",
    loading: "Loading...",
    loadingBoard: "Loading project board...",
    loadingWorkspace: "Loading workspace...",
    saving: "Saving...",
    roleLeadHint: "LEAD role: full control over projects and tasks.",
    roleDevHint: "DEV role: can move only own tasks by status.",
    rolePoHint: "PO role: read-only mode for tasks.",
    projectRequiredHint: "Select a project first.",
    loginRequired: "Please sign in via Dashboard first.",
    boardFailed: "Failed to load project board.",
    noProjectsHint: "Create your first project to start working.",
    noPermissionMoveDev: "DEV can move only tasks assigned to them.",
    noPermissionMovePo: "PO cannot change task statuses.",
    noPermissionEdit: "Editing is available only for LEAD role.",
    backToDashboard: "Back to Dashboard",
    statusLabels: {
      BACKLOG: "Backlog",
      TODO: "To Do",
      DOING: "Doing",
      DONE: "Done",
    },
    priorityLabels: {
      LOW: "Low",
      MEDIUM: "Medium",
      HIGH: "High",
      CRITICAL: "Critical",
    },
  },
};
