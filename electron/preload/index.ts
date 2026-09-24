import { contextBridge, ipcRenderer } from 'electron';

// Everything the React UI is allowed to do lives on window.api. Add new
// methods here + a matching ipcMain.handle in electron/main/index.ts
// whenever the UI needs a new backend operation — the shape here must
// match src/vite-env.d.ts's LabProApi interface exactly.
contextBridge.exposeInMainWorld('api', {
  events: {
    // Fires after any backend call that changed stored data (see
    // MUTATING_CHANNEL in electron/main/index.ts). Returns an unsubscribe.
    onDataChanged: (callback: (channel: string) => void) => {
      const listener = (_e: unknown, channel: string) => callback(channel);
      ipcRenderer.on('data:changed', listener);
      return () => {
        ipcRenderer.removeListener('data:changed', listener);
      };
    },
  },
  auth: {
    needsSetup: () => ipcRenderer.invoke('auth:needsSetup'),
    login: (username: string, password: string) => ipcRenderer.invoke('auth:login', username, password),
    logout: (reason?: string) => ipcRenderer.invoke('auth:logout', reason),
    currentUser: () => ipcRenderer.invoke('auth:currentUser'),
    changePassword: (oldPassword: string, newPassword: string) =>
      ipcRenderer.invoke('auth:changePassword', oldPassword, newPassword),
  },
  dev: {
    info: () => ipcRenderer.invoke('dev:info'),
    lockoutStatus: () => ipcRenderer.invoke('dev:lockoutStatus'),
    login: (username: string, password: string) => ipcRenderer.invoke('dev:login', username, password),
    logout: () => ipcRenderer.invoke('dev:logout'),
    pickReportFolder: () => ipcRenderer.invoke('dev:pickReportFolder'),
    completeLabSetup: (payload: unknown) => ipcRenderer.invoke('dev:completeLabSetup', payload),
    systemInfo: () => ipcRenderer.invoke('dev:systemInfo'),
    listAdmins: () => ipcRenderer.invoke('dev:listAdmins'),
    resetLabAdminPassword: (userId: number, newPassword: string) =>
      ipcRenderer.invoke('dev:resetLabAdminPassword', userId, newPassword),
    auditLog: (filters?: unknown) => ipcRenderer.invoke('dev:auditLog', filters),
    openLogsFolder: () => ipcRenderer.invoke('dev:openLogsFolder'),
    dbIntegrityCheck: () => ipcRenderer.invoke('dev:dbIntegrityCheck'),
    resetSetup: () => ipcRenderer.invoke('dev:resetSetup'),
  },
  users: {
    list: () => ipcRenderer.invoke('users:list'),
    create: (payload: unknown) => ipcRenderer.invoke('users:create', payload),
    update: (id: number, payload: unknown) => ipcRenderer.invoke('users:update', id, payload),
    resetPassword: (id: number, newPassword: string) => ipcRenderer.invoke('users:resetPassword', id, newPassword),
  },
  doctors: {
    list: () => ipcRenderer.invoke('doctors:list'),
    create: (payload: unknown) => ipcRenderer.invoke('doctors:create', payload),
    update: (id: number, payload: unknown) => ipcRenderer.invoke('doctors:update', id, payload),
    delete: (id: number) => ipcRenderer.invoke('doctors:delete', id),
  },
  technicians: {
    list: () => ipcRenderer.invoke('technicians:list'),
    create: (payload: unknown) => ipcRenderer.invoke('technicians:create', payload),
    delete: (id: number) => ipcRenderer.invoke('technicians:delete', id),
  },
  patients: {
    search: (query: string) => ipcRenderer.invoke('patients:search', query),
    list: (search?: string) => ipcRenderer.invoke('patients:list', search),
    get: (id: number) => ipcRenderer.invoke('patients:get', id),
    create: (payload: unknown) => ipcRenderer.invoke('patients:create', payload),
    findDuplicate: (fullName: string, phone: string) => ipcRenderer.invoke('patients:findDuplicate', fullName, phone),
    trendableParameters: (patientId: number) => ipcRenderer.invoke('patients:trendableParameters', patientId),
    parameterHistory: (patientId: number, parameterName: string) =>
      ipcRenderer.invoke('patients:parameterHistory', patientId, parameterName),
  },
  categories: {
    list: () => ipcRenderer.invoke('categories:list'),
    create: (payload: unknown) => ipcRenderer.invoke('categories:create', payload),
    update: (id: number, payload: unknown) => ipcRenderer.invoke('categories:update', id, payload),
    delete: (id: number) => ipcRenderer.invoke('categories:delete', id),
    reorder: (orderedIds: number[]) => ipcRenderer.invoke('categories:reorder', orderedIds),
  },
  tests: {
    list: (includeInactive?: boolean) => ipcRenderer.invoke('tests:list', includeInactive),
    get: (id: number) => ipcRenderer.invoke('tests:get', id),
    create: (payload: unknown) => ipcRenderer.invoke('tests:create', payload),
    update: (id: number, payload: unknown) => ipcRenderer.invoke('tests:update', id, payload),
    deactivate: (id: number) => ipcRenderer.invoke('tests:deactivate', id),
    activate: (id: number) => ipcRenderer.invoke('tests:activate', id),
    delete: (id: number) => ipcRenderer.invoke('tests:delete', id),
    exportExcel: () => ipcRenderer.invoke('tests:exportExcel'),
    importExcel: () => ipcRenderer.invoke('tests:importExcel'),
    exportJson: () => ipcRenderer.invoke('tests:exportJson'),
    importJson: () => ipcRenderer.invoke('tests:importJson'),
  },
  reports: {
    create: (payload: unknown) => ipcRenderer.invoke('reports:create', payload),
    updateDraft: (reportId: number, payload: unknown) => ipcRenderer.invoke('reports:updateDraft', reportId, payload),
    finalize: (reportId: number) => ipcRenderer.invoke('reports:finalize', reportId),
    retryArchive: (reportId: number) => ipcRenderer.invoke('reports:retryArchive', reportId),
    findMissingPdfs: () => ipcRenderer.invoke('reports:findMissingPdfs'),
    regenerateMissingPdfs: () => ipcRenderer.invoke('reports:regenerateMissingPdfs'),
    verifyPdf: () => ipcRenderer.invoke('reports:verifyPdf'),
    getById: (reportId: number) => ipcRenderer.invoke('reports:getById', reportId),
    list: (filters?: unknown) => ipcRenderer.invoke('reports:list', filters),
    listPage: (filters?: unknown) => ipcRenderer.invoke('reports:listPage', filters),
    search: (query: string) => ipcRenderer.invoke('reports:search', query),
    exportExcel: (filters?: unknown) => ipcRenderer.invoke('reports:exportExcel', filters),
  },
  dashboard: {
    stats: () => ipcRenderer.invoke('dashboard:stats'),
  },
  revenue: {
    period: (filters: unknown) => ipcRenderer.invoke('revenue:period', filters),
    outstandingBalances: () => ipcRenderer.invoke('revenue:outstandingBalances'),
    print: (filters: unknown) => ipcRenderer.invoke('revenue:print', filters),
    exportExcel: (filters: unknown) => ipcRenderer.invoke('revenue:exportExcel', filters),
    exportPdf: (filters: unknown) => ipcRenderer.invoke('revenue:exportPdf', filters),
  },
  testReport: {
    period: (filters: unknown) => ipcRenderer.invoke('testreport:period', filters),
    print: (filters: unknown) => ipcRenderer.invoke('testreport:print', filters),
    exportPdf: (filters: unknown) => ipcRenderer.invoke('testreport:exportPdf', filters),
  },
  payments: {
    record: (reportId: number, payload: unknown) => ipcRenderer.invoke('payments:record', reportId, payload),
  },
  audit: {
    list: (filters?: unknown) => ipcRenderer.invoke('audit:list', filters),
    actions: () => ipcRenderer.invoke('audit:actions'),
    entities: () => ipcRenderer.invoke('audit:entities'),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (fields: unknown) => ipcRenderer.invoke('settings:update', fields),
    pickImage: (kind: 'logo' | 'header' | 'footer' | 'signature') => ipcRenderer.invoke('settings:pickImage', kind),
    pickFolder: () => ipcRenderer.invoke('settings:pickFolder'),
    getPrintLayout: () => ipcRenderer.invoke('settings:getPrintLayout'),
    updatePrintLayout: (layout: unknown) => ipcRenderer.invoke('settings:updatePrintLayout', layout),
  },
  backup: {
    now: () => ipcRenderer.invoke('backup:now'),
    list: () => ipcRenderer.invoke('backup:list'),
    restore: (backupPath: string, adminPassword: string) => ipcRenderer.invoke('backup:restore', { backupPath, adminPassword }),
  },
  db: {
    healthCheck: () => ipcRenderer.invoke('db:healthCheck'),
  },
  appSettings: {
    get: (key: string) => ipcRenderer.invoke('appSettings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('appSettings:set', key, value),
  },
  print: {
    report: (reportId: number, mode: 'paper' | 'pdf') => ipcRenderer.invoke('print:report', reportId, mode),
    savePdf: (reportId: number) => ipcRenderer.invoke('print:savePdf', reportId),
    testPage: () => ipcRenderer.invoke('print:testPage'),
    listPrinters: () => ipcRenderer.invoke('print:listPrinters'),
    openPdf: (reportId: number) => ipcRenderer.invoke('print:openPdf', reportId),
    openFolder: (reportId: number) => ipcRenderer.invoke('print:openFolder', reportId),
  },
});
