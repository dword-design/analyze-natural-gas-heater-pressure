<script setup lang="ts">
interface PhotoItem {
  fileName: string
  relativePath: string
  url: string
  modifiedAt: string
  modifiedAtMs: number
}

interface PhotosResponse {
  totalDays: number
  total: number
  items: PhotoItem[]
}

interface PhotoCluster {
  startMs: number
  endMs: number
  photos: PhotoItem[]
}

interface DaySection {
  dayLabel: string
  dayKey: string
  clusters: PhotoCluster[]
}

interface PhotoClusterRow {
  kind: 'photo-cluster'
  key: string
  sortMs: number
  cluster: PhotoCluster
  annotations: FotoEntity[]
}

interface StandaloneAnnotationRow {
  kind: 'standalone-annotation'
  key: string
  sortMs: number
  annotation: FotoEntity
}

type TimelineRow = PhotoClusterRow | StandaloneAnnotationRow

interface DaySectionWithMeta {
  dayLabel: string
  dayKey: string
  rows: TimelineRow[]
}

interface FotoEntity {
  id: string
  content: string
  created_time: string
}

interface AnnotationsResponse {
  unmatchedPhotoAnnotations: FotoEntity[]
  photoMatchedAnnotations: { relativePath: string; entity: FotoEntity }[]
  standaloneTimelineAnnotations: FotoEntity[]
}

const { data: photosData, pending, error } = await useFetch<PhotosResponse>('/api/photos')

function formatDate(dateIso: string) {
  return new Date(dateIso).toLocaleString('de-DE', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatTime(dateIso: string) {
  return new Date(dateIso).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatDay(dateIso: string) {
  return new Date(dateIso).toLocaleDateString('de-DE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: '2-digit'
  })
}

function dayKey(dateIso: string) {
  const d = new Date(dateIso)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function clusterKey(day: string, cluster: PhotoCluster): string {
  return `${day}-${cluster.startMs}-${cluster.endMs}`
}

const { data: annotationsData } = await useFetch<AnnotationsResponse>('/api/annotations')
const collapsedDays = ref<Set<string>>(new Set())
const unmatchedCollapsed = ref(true)
const selectedPhoto = ref<PhotoItem | null>(null)

const matchedByPath = computed(() => {
  const map = new Map<string, FotoEntity[]>()
  for (const m of annotationsData.value?.photoMatchedAnnotations ?? []) {
    const list = map.get(m.relativePath) ?? []
    list.push(m.entity)
    map.set(m.relativePath, list)
  }
  return map
})

function fotoNote(content: string): string {
  const idx = content.indexOf('foto:')
  return idx >= 0 ? content.slice(idx + 5).trim() : content
}

function isCollapsed(dayKey: string): boolean {
  return collapsedDays.value.has(dayKey)
}

function toggleDay(dayKey: string): void {
  const next = new Set(collapsedDays.value)
  if (next.has(dayKey)) {
    next.delete(dayKey)
  } else {
    next.add(dayKey)
  }
  collapsedDays.value = next
}

function toggleUnmatched(): void {
  unmatchedCollapsed.value = !unmatchedCollapsed.value
}

function openPhotoModal(photo: PhotoItem): void {
  selectedPhoto.value = photo
}

function closePhotoModal(): void {
  selectedPhoto.value = null
}

function onGlobalKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && selectedPhoto.value) {
    closePhotoModal()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
})

const groupedDays = computed<DaySection[]>(() => {
  const photos = photosData.value?.items ?? []
  const grouped = new Map<string, PhotoItem[]>()

  for (const photo of photos) {
    const key = dayKey(photo.modifiedAt)
    const list = grouped.get(key) ?? []
    list.push(photo)
    grouped.set(key, list)
  }

  const sections: DaySection[] = []

  for (const [key, dayPhotos] of Array.from(grouped.entries()).sort((a, b) => b[0].localeCompare(a[0]))) {
    const sortedPhotos = [...dayPhotos].sort((a, b) => b.modifiedAtMs - a.modifiedAtMs)
    const clusters: PhotoCluster[] = []
    let currentCluster: PhotoCluster | null = null
    let lastPhotoMs: number | null = null

    for (const photo of sortedPhotos) {
      if (!currentCluster) {
        currentCluster = {
          startMs: photo.modifiedAtMs,
          endMs: photo.modifiedAtMs,
          photos: [photo]
        }
        clusters.push(currentCluster)
        lastPhotoMs = photo.modifiedAtMs
        continue
      }

      const gap = lastPhotoMs === null ? Infinity : lastPhotoMs - photo.modifiedAtMs
      if (gap <= 5 * 60 * 1000) {
        currentCluster.photos.push(photo)
        currentCluster.endMs = photo.modifiedAtMs
        lastPhotoMs = photo.modifiedAtMs
      } else {
        currentCluster = {
          startMs: photo.modifiedAtMs,
          endMs: photo.modifiedAtMs,
          photos: [photo]
        }
        clusters.push(currentCluster)
        lastPhotoMs = photo.modifiedAtMs
      }
    }

    for (const cluster of clusters) {
      cluster.photos.sort((a, b) => a.modifiedAtMs - b.modifiedAtMs)
      cluster.startMs = cluster.photos[0]?.modifiedAtMs ?? cluster.startMs
      cluster.endMs = cluster.photos[cluster.photos.length - 1]?.modifiedAtMs ?? cluster.endMs
    }

    clusters.sort((a, b) => a.startMs - b.startMs)

    sections.push({
      dayKey: key,
      dayLabel: sortedPhotos[0] ? formatDay(sortedPhotos[0].modifiedAt) : key,
      clusters
    })
  }

  return sections
})

const groupedDaysWithAnnotations = computed<DaySectionWithMeta[]>(() => {
  const matched = matchedByPath.value
  const standalone = annotationsData.value?.standaloneTimelineAnnotations ?? []

  type MutableDaySection = {
    dayLabel: string
    dayKey: string
    rows: TimelineRow[]
  }

  const dayMap = new Map<string, MutableDaySection>()

  for (const day of groupedDays.value) {
    const rows: TimelineRow[] = day.clusters.map((cluster: PhotoCluster) => {
      const entityMap = new Map<string, FotoEntity>()

      for (const photo of cluster.photos) {
        for (const entity of matched.get(photo.relativePath) ?? []) {
          entityMap.set(entity.id, entity)
        }
      }

      return {
        kind: 'photo-cluster',
        key: clusterKey(day.dayKey, cluster),
        sortMs: cluster.startMs,
        cluster,
        annotations: Array.from(entityMap.values())
      }
    })

    dayMap.set(day.dayKey, {
      dayLabel: day.dayLabel,
      dayKey: day.dayKey,
      rows
    })
  }

  for (const annotation of standalone) {
    const key = dayKey(annotation.created_time)
    const annotationMs = new Date(annotation.created_time).getTime()
    const day = dayMap.get(key)

    const row: StandaloneAnnotationRow = {
      kind: 'standalone-annotation',
      key: `${key}-standalone-${annotation.id}`,
      sortMs: annotationMs,
      annotation
    }

    if (!day) {
      dayMap.set(key, {
        dayLabel: formatDay(annotation.created_time),
        dayKey: key,
        rows: [row]
      })
      continue
    }

    day.rows.push(row)
  }

  return Array.from(dayMap.values())
    .map((day) => ({
      ...day,
      rows: day.rows.sort((a, b) => b.sortMs - a.sortMs)
    }))
    .sort((a, b) => b.dayKey.localeCompare(a.dayKey))
})
</script>

<template>
  <main class="page">
    <header class="hero">
      <p class="eyebrow">iPhone JPG Timeline</p>
      <h1>Newest Photos First</h1>
      <p v-if="photosData" class="meta">{{ photosData.total }} JPG files found</p>
    </header>

    <section v-if="annotationsData?.unmatchedPhotoAnnotations.length" class="unmatched">
      <button class="unmatched-toggle" type="button" @click="toggleUnmatched">
        <div class="day-toggle-left">
          <span class="day-chevron" aria-hidden="true">{{ unmatchedCollapsed ? '▸' : '▾' }}</span>
          <h2 class="unmatched-title">⚠ Unmatched annotations (no photo within 30 min)</h2>
        </div>
      </button>
      <ul v-show="!unmatchedCollapsed" class="unmatched-list">
        <li v-for="entity in annotationsData.unmatchedPhotoAnnotations" :key="entity.id" class="unmatched-item">
          <span class="unmatched-note">{{ fotoNote(entity.content) }}</span>
          <span class="unmatched-date">{{ formatDate(entity.created_time) }}</span>
        </li>
      </ul>
    </section>

    <p v-if="pending" class="status">Loading photos...</p>
    <p v-else-if="error" class="status error">Failed to load photos. {{ error.message }}</p>

    <section v-else-if="photosData" class="timeline" aria-label="Photo timeline">
      <section v-for="day in groupedDaysWithAnnotations" :key="day.dayKey" class="day-section">
        <button class="day-toggle" type="button" @click="toggleDay(day.dayKey)">
          <div class="day-toggle-left">
            <span class="day-chevron" aria-hidden="true">{{ isCollapsed(day.dayKey) ? '▸' : '▾' }}</span>
            <h2 class="day-title">{{ day.dayLabel }}</h2>
          </div>
        </button>

        <template v-for="row in day.rows" :key="row.key">
          <article v-if="row.kind === 'photo-cluster'" v-show="!isCollapsed(day.dayKey)" class="cluster">
            <div class="cluster-time">
              <p class="cluster-range">{{ formatTime(new Date(row.cluster.startMs).toISOString()) }}</p>
            </div>

            <div class="cluster-content">
              <ul v-if="row.annotations.length" class="cluster-annotation-list">
                <li v-for="entity in row.annotations" :key="entity.id" class="cluster-annotation">
                  {{ fotoNote(entity.content) }}
                  <span class="cluster-annotation-date">({{ formatDate(entity.created_time) }})</span>
                </li>
              </ul>

              <div class="cluster-grid">
                <div v-for="photo in row.cluster.photos" :key="photo.relativePath" class="cluster-item">
                  <div class="card">
                    <img
                      :src="photo.url"
                      :alt="photo.fileName"
                      loading="lazy"
                      class="card-image"
                      @click="openPhotoModal(photo)"
                    />
                  </div>
                </div>
              </div>
            </div>
          </article>

          <article v-else v-show="!isCollapsed(day.dayKey)" class="annotation-row">
            <p class="cluster-range">{{ formatTime(new Date(row.sortMs).toISOString()) }}</p>
            <p class="standalone-annotation">
              {{ fotoNote(row.annotation.content) }}
              <span class="cluster-annotation-date">({{ formatDate(row.annotation.created_time) }})</span>
            </p>
          </article>
        </template>
      </section>
    </section>

    <div v-if="selectedPhoto" class="modal" @click.self="closePhotoModal">
      <button class="modal-close" type="button" aria-label="Close image" @click="closePhotoModal">×</button>
      <img :src="selectedPhoto.url" :alt="selectedPhoto.fileName" class="modal-image" />
    </div>
  </main>
</template>
