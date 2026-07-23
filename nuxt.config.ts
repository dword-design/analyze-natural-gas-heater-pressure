export default defineNuxtConfig({
  compatibilityDate: '2026-07-22',
  devtools: { enabled: true },
  runtimeConfig: {
    nuxtPhotosDir: '',
    manualTimelineEntityUuids: [],
    foo: [],
    dbHost: '',
    dbName: '',
    dbPassword: '',
    dbPort: '5432',
    dbUser: '',
    public: {
      pageSize: 40
    }
  },
  css: ['~/assets/main.css']
})
