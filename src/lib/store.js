// Lokaler Datenlayer für Jivak TV.
// Bewusste Entscheidung: keine externe Datenbank / kein Provider.
// Alle Inhalte werden im Browser (localStorage) gespeichert.
// Hochgeladene Videos liegen im Blob-Speicher (IndexedDB), Referenzen als idb://<id>.

import { isIdbUrl, idbIdFromUrl, idbDelete } from './blobstore.js'
import { logError } from './errorLog.js'
import { cloudEnabled, signOutCloud, isCloudSession } from './supabase.js'
import {
  cloudFetchAll, cloudPushArticle, cloudDeleteArticle,
  cloudPushCategory, cloudDeleteCategory,
  cloudPushAuthor, cloudDeleteAuthor,
  cloudPushMedia, cloudDeleteMedia,
  cloudPushSettings
} from './cloud-api.js'

const KEYS = {
  articles: 'jivak.articles',
  categories: 'jivak.categories',
  authors: 'jivak.authors',
  media: 'jivak.media',
  stats: 'jivak.stats',
  auth: 'jivak.auth',
  session: 'jivak.session',
  settings: 'jivak.settings'
}

// ---------- Store-Subscription (Re-Render nach Cloud-Sync) ----------
const listeners = new Set()
let storeVersion = 0
export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export function getStoreVersion() {
  return storeVersion
}
function emitChange() {
  storeVersion += 1
  // Referenz-Cache invalidieren: Getter liefern danach frische Objekte.
  try { readCache.clear() } catch { /* ignore */ }
  listeners.forEach((fn) => { try { fn() } catch {} })
}

// ---------- Cloud-Sync (Supabase) ----------
// Öffentliche Inhalte liegen in der Cloud; localStorage dient als schneller Cache.
const CLOUD_SYNCED_KEY = 'jivak.cloudSynced'
let syncing = null
let cloudReady = false
export function isCloudReady() {
  return cloudReady
}

function pushAllLocal() {
  const jobs = [
    ...getCategories().map((c) => cloudPushCategory(c)),
    ...getAuthors().map((a) => cloudPushAuthor(a)),
    ...getArticles().map((a) => cloudPushArticle(a)),
    ...getMediaItems().map((m) => cloudPushMedia(m)),
    cloudPushSettings(getSettings())
  ]
  return Promise.allSettled(jobs)
}

export function syncFromCloud() {
  if (!cloudEnabled) {
    cloudReady = true
    return Promise.resolve()
  }
  if (syncing) return syncing
  syncing = (async () => {
    try {
      const remote = await cloudFetchAll()
      if (!remote) return
      if (remote.articles.length > 0) {
        write(KEYS.articles, remote.articles)
        if (remote.categories.length > 0) write(KEYS.categories, remote.categories)
        if (remote.authors.length > 0) write(KEYS.authors, remote.authors)
        if (remote.media.length > 0) write(KEYS.media, remote.media)
        const site = remote.settings.find((row) => row.key === 'site')
        if (site && site.value) write(KEYS.settings, site.value)
        try { localStorage.setItem(CLOUD_SYNCED_KEY, '1') } catch { /* Speicher voll */ }
        emitChange()
        migrateCategories()
      } else if (
        getArticles().length > 0 &&
        !localStorage.getItem(CLOUD_SYNCED_KEY) &&
        isCloudSession()
      ) {
        // Cloud ist leer -> lokale Startdaten einmalig hochladen (nur nach Login,
        // anonyme Besucher dürfen laut RLS nicht schreiben)
        await pushAllLocal()
        try { localStorage.setItem(CLOUD_SYNCED_KEY, '1') } catch { /* Speicher voll */ }
      }
    } catch (err) {
      console.warn('Cloud-Sync übersprungen:', err?.message || err)
    } finally {
      syncing = null
      cloudReady = true
      emitChange()
    }
  })()
  return syncing
}

export const DEFAULT_PASSWORD = 'admin'

// Referenz-Cache: Getter liefern DIESELBE Objekt-Referenz, solange sich der
// Store nicht ändert. Vorher erzeugte JSON.parse bei jedem Aufruf neue Objekte,
// wodurch useEffect-Dependencies (z. B. article in useArticleL10n) bei jedem
// Render wechselten und eine Endlos-Render-Schleife entstand.
const readCache = new Map()
function read(key, fallback) {
  if (readCache.has(key)) return readCache.get(key)
  let value = fallback
  try {
    const raw = localStorage.getItem(key)
    if (raw) value = JSON.parse(raw)
  } catch {
    value = fallback
  }
  readCache.set(key, value)
  return value
}

function write(key, value) {
  readCache.set(key, value)
  // Browser-Speicher kann auf Geräten voll/blockiert sein (QuotaExceededError,
  // SecurityError im Privacy-Modus). Ein Fehler hier darf niemals einen
  // useEffect/Render crashen – sonst erscheint die globale ErrorBoundary.
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    logError('storage', err, key)
  }
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f\u064b-\u065f\u0670]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function safeDate(ts) {
  const d = new Date(ts == null ? Date.now() : ts)
  return Number.isNaN(d.getTime()) ? new Date() : d
}

export function formatDate(ts) {
  return new Intl.DateTimeFormat('ar-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).format(safeDate(ts))
}

export function formatDateTime(ts) {
  return new Intl.DateTimeFormat('ar-u-nu-latn', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(safeDate(ts))
}

export function readingMinutes(body) {
  const words = String(body || '').trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 200))
}

async function sha256(text) {
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ---------- Seed-Daten (Demo-Inhalte, im Admin löschbar) ----------

// 18 Hauptkategorien: feste IDs, damit Übersetzungen und Startseite stabil bleiben.
// name = arabischer Fallback-Name, slug = öffentliche URL unter /kategorien/<slug>.
const MAIN_CATEGORIES = [
  { id: 'cat-news', name: 'أخبار عامة', slug: 'nachrichten' },
  { id: 'cat-region', name: 'المنطقة', slug: 'region' },
  { id: 'cat-kurdistan', name: 'كردستان', slug: 'kurdistan' },
  { id: 'cat-irak', name: 'العراق', slug: 'irak' },
  { id: 'cat-welt', name: 'العالم', slug: 'welt' },
  { id: 'cat-religion', name: 'الدين', slug: 'religion' },
  { id: 'cat-kultur', name: 'الثقافة', slug: 'kultur' },
  { id: 'cat-geschichte', name: 'التاريخ', slug: 'geschichte' },
  { id: 'cat-diaspora', name: 'الشتات', slug: 'diaspora' },
  { id: 'cat-politik', name: 'السياسة', slug: 'politik' },
  { id: 'cat-wirtschaft', name: 'الاقتصاد', slug: 'wirtschaft' },
  { id: 'cat-sport', name: 'الرياضة', slug: 'sport' },
  { id: 'cat-bildung', name: 'التعليم', slug: 'bildung' },
  { id: 'cat-gesundheit', name: 'الصحة', slug: 'gesundheit' },
  { id: 'cat-interviews', name: 'مقابلات', slug: 'interviews' },
  { id: 'cat-videos', name: 'فيديو', slug: 'videos' },
  { id: 'cat-foto', name: 'ريبورتاجات مصورة', slug: 'fotoreportagen' },
  { id: 'cat-livetv', name: 'تلفزيون مباشر', slug: 'live-tv' }
]

const SEED_CATEGORIES = MAIN_CATEGORIES.map(({ id, name, slug }) => ({ id, name, slug }))

// Alte Kategorie-IDs -> neue Hauptkategorien (Migration bestehender Daten)
const OLD_CATEGORY_MAP = {
  'cat-news': 'cat-news',
  'cat-gemeinschaft': 'cat-diaspora'
}

// Demo-Artikel aus alten Cloud-Daten auf passende Hauptkategorien umlegen
// (entspricht der Zuordnung der Seed-Daten; greift nach jedem Cloud-Sync).
const ARTICLE_CATEGORY_MAP = {
  'demo-1': 'cat-region',
  'demo-video-kurdi': 'cat-videos',
  'demo-6': 'cat-foto'
}
const daysAgo = (n) => Date.now() - n * 24 * 60 * 60 * 1000

const DEFAULT_AUTHOR = 'Redaktion Jivak TV'

const SEED_ARTICLES = [
  {
    id: 'demo-5',
    title: 'تقرير مصوّر: حدث إخباري عام',
    slug: 'تقرير-مصوّر-احتفال-المجتمع-المحلي',
    categoryId: 'cat-kultur',
    authorId: 'author-redaktion',
    mediaType: 'video',
    mediaUrl: 'https://www.youtube.com/watch?v=MMD8IPl6Htw',
    status: 'published',
    createdAt: daysAgo(4),
    updatedAt: daysAgo(4),
    intro: 'مشاهد حيّة من احتفال المجتمع المحلي: موسيقى ورقص ولقاءات – فيلم عن التلاحم أُنتج بالتعاون مع الجمعيات الثقافية المحلية.',
    image: 'https://ylxvowivyyulmrdrtppj.supabase.co/storage/v1/object/public/jivak-tv/covers/yt-MMD8IPl6Htw.jpg', imageCredit: 'Video-Cover: YouTube',
    image: null,
    body: `في هذا التقرير المصوّر نرافق احتفالاً من احتفالات المجتمع المحلي، من أولى نغمات الطبل حتى الختام الجماعي في المساء.

## ماذا تشاهدون

- مشاهد من الموسيقى والرقص التقليدي
- حوارات مع المنظّمين والمنظّمات
- أصوات من المجتمع حول التراث والمستقبل

> الصور المتحركة تروي قصصاً لا تستطيع الكلمات وحدها حملها.

## التضمين

لتشغيل الفيديو في هذه الصفحة، أضف رابطاً في لوحة الإدارة ضمن «التنسيق: فيديو» (تضمين يوتيوب أو ملف MP4 مباشر).`
  },
  {
    id: 'demo-video-kurdi',
    title: 'ڤیدیۆیا کورت: تاقیکرنا بەلاڤکرنا گشتی',
    slug: 'vidyoya-kurt-wesana-gisti-t-ceribandin',
    categoryId: 'cat-videos',
    authorId: 'author-redaktion',
    mediaType: 'video',
    mediaUrl: 'https://www.youtube.com/watch?v=l3mSNTcfvqI',
    status: 'published',
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
    intro: 'ئەڤ ڤیدیۆیا کورت ب وەسفەکا کوردی هاتیە بەلاڤکرن – تاقیکردنەکا دا پشتراست ببین کو بەلاڤکرنا ڤیدیۆیێن گشتی کار دکەت.',
    image: 'https://ylxvowivyyulmrdrtppj.supabase.co/storage/v1/object/public/jivak-tv/covers/yt-l3mSNTcfvqI.jpg', imageCredit: 'Video-Cover: YouTube',
    image: null,
    body: 'ئەڤ ڤیدیۆیا کورت هاتیە زێدەکرن بۆ تاقیکرنا بەلاڤکرنا گشتی.\n\n## پوختە\n\n- ڤیدیۆیا کورت (MP4)\n- وەسف ب کوردی\n- بەلاڤکرنا گشتی\n\n> ڤیدیۆ ل سەر پەیجێ گشتی د ناڤ پلەیەرێ ناڤخۆیی دا کار دکەت.'
  },  {
    id: 'demo-6',
    title: 'ألبوم صور: الحياة اليومية والثقافة في أرشيف إيزيدي ميديا',
    slug: 'ألبوم-صور-الحياة-اليومية-والثقافة',
    categoryId: 'cat-foto',
    authorId: 'author-redaktion',
    mediaType: 'photo',
    mediaUrl: '',
    status: 'published',
    createdAt: daysAgo(9),
    updatedAt: daysAgo(9),
    intro: 'مختارات من صور مؤثّرة توثّق حياة المجتمع اليومية – مجمّعة في ألبوم مصوّر مع نصوص قصيرة.',
    image: '/placeholder-article.jpg', imageCredit: 'Foto: Platzhalter', gallery: ['/placeholder-article.jpg', '/placeholder-article.jpg', '/placeholder-article.jpg', '/placeholder-article.jpg', '/placeholder-article.jpg', '/placeholder-article.jpg'],
    image: null,
    body: `الصور تحفظ ما يمرّ سريعاً: الوجوه، الأعياد، ولحظات الحياة اليومية. يجمع هذا الألبوم صوراً قدّمها أعضاء من المجتمع.

## فصول الألبوم

- وجوه من المجتمع
- الأعياد والمناسبات
- العمل والحِرف
- النظرة إلى المستقبل

> كل صورة وثيقة، وبداية لحكاية.

هل تودّ المساهمة بصورك؟ تواصل معنا عبر الجمعيات الثقافية المحلية أو أضف مشاركات مصوّرة جديدة من لوحة الإدارة.`
  },
  {
    id: 'demo-1',
    title: 'ذكرى شنكال: إحياء الذكرى والتلاحم',
    slug: 'ذكرى-شنكال-إحياء-الذكرى-والتلاحم',
    categoryId: 'cat-region',
    authorId: 'author-redaktion',
    status: 'published',
    createdAt: daysAgo(6),
    updatedAt: daysAgo(6),
    intro: 'يستذكر المجتمع المحلي في أنحاء العالم ذكرى أحداث شنكال. في المقدمة: الذكرى، التضامن، والوعد بإبقاء الذاكرة حيّة.',
    image: '/placeholder-article.jpg', imageCredit: 'Foto: Platzhalter',
    image: null,
    body: `في ذكرى أحداث شنكال، يجتمع المحليون في مدن أوروبية كثيرة لإحياء الذكرى معاً. الشموع، دقائق الصمت، والقراءات تزيّن الفعاليات، وكذلك الأحاديث حول ما كان وما يجب أن يأتي.

## يوم للذكرى

الثالث من آب/أغسطس هو يوم حزن للمجتمع المحلي، ولكنه أيضاً يوم تأكّد من الذات. في المراسم تُكرَّم الضحايا، وتُوجَّه رسائل تضامن إلى عائلاتهم.

- فعاليات ذكرى مشتركة في أكثر من عشرين مدينة
- دقيقة صمت في منتصف النهار في جميع المراكز المجتمعية
- حلقات نقاش مع ناجين ومختصين

> الذاكرة ليست عبئاً، بل تكليف: من أجل مستقبل أطفالنا.

## تلاحم يتجاوز الحدود

تستغلّ منظمات إيزيدية كثيرة هذه الذكرى لتسليط الضوء على الأوضاع المستمرة في المنطقة وعرض مشاريع الدعم. وفي ألمانيا وفرنسا وهولندا أيضاً تتزايد الرغبة في تحمّل المسؤولية معاً.

فعاليات هذا العام تحمل الشعار: «نتذكّر معاً – نعمل معاً». من يرغب بالمشاركة يجد مراكز تواصل في المجتمع أو لدى الجمعيات الثقافية المحلية.`
  },
  {
    id: 'demo-2',
    title: 'الحفاظ على الثقافة المحلية: اللغة والموسيقى والأعياد',
    slug: 'الحفاظ-على-الثقافة-المحلية-اللغة-والموسيقى',
    categoryId: 'cat-kultur',
    authorId: 'author-redaktion',
    status: 'published',
    createdAt: daysAgo(12),
    updatedAt: daysAgo(12),
    intro: 'الكرمانجية والموسيقى والأعياد التقليدية هي جوهر الهوية المحلية. كيف تحافظ الجاليات في الشتات على إرثها الثقافي؟ نظرة شاملة.',
    image: '/placeholder-article.jpg', imageCredit: 'Foto: Platzhalter',
    image: null,
    body: `الثقافة المحلية تنبض بالرواية الشفهية والموسيقى والأعياد. من يتحدّث لغتها يمرّر جزءاً من الهوية؛ كل حكاية وكل أغنية لبنة في الذاكرة الثقافية.

## اللغة مفتاح

الكرمانجية ليست لغة يومية فقط، بل حاملة للأدعية والروايات والحِكم. لذلك تنشأ في الشتات دورات لغة وعروض للأطفال تفتح باب الأمّ اللغوية بلعب ومرح.

## الموسيقى والأعياد

في الأعراس ورأس السنة والأعياد الدينية تتردّد الأغاني التقليدية بمرافقة الطبل والناي. موسيقيون شباب يدمجون هذه الأصوات بترتيبات حديثة، فيصلون بذلك إلى من نشأ بعيداً عن الوطن.

> من يعرف أغانيه لا يخسر تاريخه.

العمل الثقافي عمل جماعي: يحدث في قاعات الجمعيات وفي الأعياد العائلية، وبشكل متزايد في صيغ رقمية. وهنا تحديداً يأتي دور إيزيدي ميديا – منصة تُظهر هذه الأصوات.`
  },
  {
    id: 'demo-3',
    title: 'مبادرة تعليمية جديدة للشباب المحلي',
    slug: 'مبادرة-تعليمية-جديدة-للشباب-المحلي',
    categoryId: 'cat-bildung',
    status: 'published',
    createdAt: daysAgo(20),
    updatedAt: daysAgo(20),
    authorId: 'author-redaktion',
    author: DEFAULT_AUTHOR,
    views: 720,
    recommended: true,
    intro: 'دروس تقوية وإرشاد وتوجيه مهني: برنامج جديد يريد مرافقة الشباب المحلي في مسارهم التعليمي وفتح آفاق أمامهم.',
    image: '/placeholder-article.jpg', imageCredit: 'Foto: Platzhalter',
    image: null,
    body: `مبادرة تعليمية جديدة تريد دعم الشباب المحلي بشكل ملموس – من المدرسة إلى التدريب المهني حتى الجامعة. مرشدون ومرشدات متطوعون يرافقون المشاركين على مدى عدة أشهر.

## ماذا يقدّم البرنامج

- مرافقة تعليمية أسبوعية في مجموعات صغيرة
- إرشاد من طلاب ومختصين
- ورش حول التقديم والتوجيه المهني
- استشارات منح ومرافقة في التقديم

## لماذا التعليم يصنع المستقبل

التعليم أقوى رافعة للمشاركة. من يحقّق نتائج جيدة ويطوّر آفاقه الخاصة يساهم بنشاط في صياغة مستقبل المجتمع. تنطلق المبادرة أولاً في ثلاث مدن، ومن المقرر توسيعها عند نجاحها.

يمكن للعائلات المهتمة التسجيل عبر الجمعيات الثقافية المحلية. المشاركة مجانية.`
  },
  {
    id: 'demo-4',
    title: 'من الداخل: ريبورتاج من المجتمع',
    slug: 'ريبورتاج-من-المجتمع',
    categoryId: 'cat-diaspora',
    status: 'draft',
    createdAt: daysAgo(2),
    updatedAt: daysAgo(1),
    authorId: 'author-redaktion',
    author: DEFAULT_AUTHOR,
    views: 0,
    recommended: false,
    intro: 'ريبورتاج عن الحياة اليومية في المجتمع المحلي – كيف يجتمع الناس ويساعدون ويكونون حاضرين لبعضهم. ما زال قيد الإعداد.',
    image: null,
    body: `هذا الريبورتاج قيد الإعداد حالياً. يرافق العائلات والجمعيات والأفراد الذين يحملون الحياة المجتمعية.

## فصول مخططة

- يوم في المركز المجتمعي
- حوارات مع المتطوعين
- النظرة إلى المستقبل

تتبّع انطباعات أخرى قريباً.`
  }
]


// ---------- Artikel ----------

export function getArticles() {
  return read(KEYS.articles, [])
}

export function getPublishedArticles() {
  return getArticles()
    .filter((a) => a.status === 'published')
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function getArticlesByCategory(categoryId, limit = 6) {
  return getPublishedArticles()
    .filter((a) => a.categoryId === categoryId)
    .slice(0, limit)
}

export function getMediaByType(type) {
  return getPublishedArticles().filter((a) => (a.mediaType || 'article') === type)
}
export function getPopularArticles(limit = 4) {
  return [...getPublishedArticles()]
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, limit)
}

export function getMostViewedVideos(limit = 3) {
  return [...getMediaByType('video')]
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, limit)
}

/** Meistgelesene Artikel: echte Seitenaufrufe aus den Besucher-Statistiken.
 *  Fallback auf die views-Zähler der Artikel, falls noch keine Statistik vorliegt. */
export function getMostReadArticles(limit = 5) {
  const stats = getStats()
  const byArticle = stats.byArticle || {}
  const ids = Object.keys(byArticle)
  if (ids.length > 0) {
    return ids
      .map((id) => getArticleById(id))
      .filter((a) => a && a.status === 'published')
      .sort((a, b) => (byArticle[b.id] || 0) - (byArticle[a.id] || 0))
      .slice(0, limit)
  }
  return [...getPublishedArticles()]
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, limit)
}

export function getRecommendedArticles(limit = 3) {
  const rec = getPublishedArticles().filter((a) => a.recommended)
  const pool = rec.length > 0 ? rec : getPublishedArticles()
  return [...pool].slice(0, limit)
}

export function getArticleById(id) {
  return getArticles().find((a) => a.id === id) || null
}

export function getArticleBySlug(slug) {
  return getPublishedArticles().find((a) => a.slug === slug) || null
}
export function recordView(id) {
  const articles = getArticles()
  const idx = articles.findIndex((a) => a.id === id)
  if (idx === -1) return
  articles[idx] = { ...articles[idx], views: (articles[idx].views || 0) + 1 }
  write(KEYS.articles, articles)
  const stats = getStats()
  stats.byArticle[id] = (stats.byArticle[id] || 0) + 1
  write(KEYS.stats, stats)
}

export async function saveArticle(data) {
  const articles = getArticles()
  const now = Date.now()
  const idx = data.id ? articles.findIndex((a) => a.id === data.id) : -1
  if (idx !== -1) {
    const updated = { ...articles[idx], ...data, updatedAt: now }
    // Cloud zuerst schreiben – bei Fehler wird nichts lokal gespeichert und der
    // Aufrufer bekommt die echte Fehlermeldung (kein stiller Verlust).
    if (cloudEnabled) await cloudPushArticle(updated)
    articles[idx] = updated
    write(KEYS.articles, articles)
    return updated
  }
  const created = {
    ...data,
    mediaType: data.mediaType || 'article',
    mediaUrl: data.mediaUrl || '',
    author: data.author || '',
    authorId: data.authorId || '',
    gallery: Array.isArray(data.gallery) ? data.gallery : [],
    recommended: Boolean(data.recommended),
    views: Number(data.views) || 0,
    id: data.id || uid(),
    slug: uniqueSlug(data.title),
    createdAt: now,
    updatedAt: now
  }
  if (cloudEnabled) await cloudPushArticle(created)
  articles.unshift(created)
  write(KEYS.articles, articles)
  return created
}

function uniqueSlug(title) {
  const base = slugify(title) || 'beitrag'
  const existing = getArticles().map((a) => a.slug)
  let slug = base
  let n = 2
  while (existing.includes(slug)) {
    slug = `${base}-${n}`
    n += 1
  }
  return slug
}

export async function deleteArticle(id) {
  if (cloudEnabled) await cloudDeleteArticle(id)
  const articles = getArticles()
  const article = articles.find((a) => a.id === id)
  if (article) {
    const urls = [article.mediaUrl, article.image, ...(Array.isArray(article.gallery) ? article.gallery : [])]
    urls.filter(isIdbUrl).forEach((u) => idbDelete(idbIdFromUrl(u)).catch(() => {}))
  }
  write(KEYS.articles, articles.filter((a) => a.id !== id))
}

export async function setArticleStatus(id, status) {
  const articles = getArticles()
  const idx = articles.findIndex((a) => a.id === id)
  if (idx === -1) return
  const updated = { ...articles[idx], status, updatedAt: Date.now() }
  if (cloudEnabled) await cloudPushArticle(updated)
  articles[idx] = updated
  write(KEYS.articles, articles)
}

// ---------- Kategorien ----------

export function getCategories() {
  const cats = read(KEYS.categories, [])
  const rank = new Map(MAIN_CATEGORIES.map((c, i) => [c.id, i]))
  return [...cats].sort((a, b) => {
    const ra = rank.has(a.id) ? rank.get(a.id) : 999
    const rb = rank.has(b.id) ? rank.get(b.id) : 999
    if (ra !== rb) return ra - rb
    return String(a.name || '').localeCompare(String(b.name || ''))
  })
}

/** Fehlende Hauptkategorien ergänzen und alte Kategorie-IDs in Artikeln umbiegen. */
function migrateCategories() {
  const categories = read(KEYS.categories, [])
  const articles = read(KEYS.articles, [])
  if (categories.length === 0 && articles.length === 0) return
  let changed = false

  const existingIds = new Set(categories.map((c) => c.id))
  const missing = MAIN_CATEGORIES.filter((c) => !existingIds.has(c.id))
  if (missing.length > 0) {
    categories.push(...missing.map(({ id, name, slug }) => ({ id, name, slug })))
    changed = true
  }

  const removeIds = new Set(Object.keys(OLD_CATEGORY_MAP))
  const nextCategories = categories.filter((c) => !removeIds.has(c.id))
  if (nextCategories.length !== categories.length) changed = true

  const nextArticles = articles.map((a) => {
    const mapped = ARTICLE_CATEGORY_MAP[a.id] || OLD_CATEGORY_MAP[a.categoryId] || a.categoryId
    if (mapped === a.categoryId) return a
    changed = true
    return { ...a, categoryId: mapped }
  })

  if (changed) {
    write(KEYS.categories, nextCategories)
    write(KEYS.articles, nextArticles)
  }
}

/** Stellt die 18 Hauptkategorien im Admin wieder her (fügt nur Fehlende hinzu). */
export function restoreMainCategories() {
  const categories = getCategories()
  const existingIds = new Set(categories.map((c) => c.id))
  const missing = MAIN_CATEGORIES.filter((c) => !existingIds.has(c.id))
  if (missing.length === 0) return { ok: true, added: 0 }
  write(KEYS.categories, [
    ...categories,
    ...missing.map(({ id, name, slug }) => ({ id, name, slug }))
  ])
  return { ok: true, added: missing.length }
}

export function getCategoryById(id) {
  return getCategories().find((c) => c.id === id) || null
}

export function getCategoryBySlug(slug) {
  return getCategories().find((c) => c.slug === slug) || null
}

export function addCategory(name) {
  const categories = getCategories()
  const base = slugify(name) || 'kategorie'
  let slug = base
  let n = 2
  while (categories.some((c) => c.slug === slug)) {
    slug = `${base}-${n}`
    n += 1
  }
  const created = { id: uid(), name: name.trim(), slug }
  write(KEYS.categories, [...categories, created])
  cloudPushCategory(created).catch(() => {})
  return created
}

export function renameCategory(id, name) {
  const categories = getCategories()
  const idx = categories.findIndex((c) => c.id === id)
  if (idx === -1) return
  categories[idx] = { ...categories[idx], name: name.trim() }
  write(KEYS.categories, categories)
  cloudPushCategory(categories[idx]).catch(() => {})
}

export function deleteCategory(id) {
  const used = getArticles().some((a) => a.categoryId === id)
  if (used) return { ok: false, errorKey: 'catadmin.inUse' }
  write(KEYS.categories, getCategories().filter((c) => c.id !== id))
  cloudDeleteCategory(id).catch(() => {})
  return { ok: true }
}

export function countArticlesByCategory(categoryId) {
  return getArticles().filter((a) => a.categoryId === categoryId).length
}

// ---------- Auth (lokal, bewusst ohne Backend) ----------

export function isAuthed() {
  const session = read(KEYS.session, null)
  return Boolean(session && session.authed)
}

/** Aktuell angemeldeter Benutzer (Cloud: Supabase-Profil, lokal: Admin). */
export function getSessionUser() {
  const session = read(KEYS.session, null)
  return (session && session.user) || null
}

/** Benutzer in der Session aktualisieren (z. B. nach Profil-Refresh). */
export function setSessionUser(user) {
  const session = read(KEYS.session, null) || { authed: false }
  write(KEYS.session, { ...session, user: user || null })
  emitChange()
}

export function isDefaultPassword() {
  return !localStorage.getItem(KEYS.auth)
}

export async function login(password) {
  const stored = read(KEYS.auth, null)
  const expected = stored ? stored.hash : await sha256(DEFAULT_PASSWORD)
  const hash = await sha256(password)
  if (hash !== expected) return false
  if (!stored) {
    write(KEYS.auth, { hash })
  }
  write(KEYS.session, { authed: true, at: Date.now(), user: { id: 'local', email: '', name: 'Admin', role: 'admin', authorId: '', active: true } })
  return true
}

export function markAuthed(user) {
  write(KEYS.session, { authed: true, at: Date.now(), user: user || null })
  emitChange()
}

export function logout() {
  localStorage.removeItem(KEYS.session)
  emitChange()
  signOutCloud()
}
// ---------- Einstellungen (u. a. Eilmeldung) ----------

const DEFAULT_SETTINGS = {
  liveTv: { enabled: false, streamUrl: '', poster: '', title: '', programs: [] },
  ticker: { items: [], autoArticles: true, excludeArticleIds: [] }
}

export function getSettings() {
  const stored = read(KEYS.settings, {})
  const base = {
    ...DEFAULT_SETTINGS,
    ...stored,
    liveTv: { ...DEFAULT_SETTINGS.liveTv, ...(stored.liveTv || {}) }
  }
  // Entfernte Features nicht weiter übernehmen (Eilmeldung, Medien-Löschung)
  delete base.breaking
  delete base.mediaCleanup
  return {
    ...base,
    ticker: {
      items: Array.isArray(stored.ticker && stored.ticker.items) ? stored.ticker.items : [],
      autoArticles: stored.ticker ? stored.ticker.autoArticles !== false : true,
      excludeArticleIds: Array.isArray(stored.ticker && stored.ticker.excludeArticleIds)
        ? stored.ticker.excludeArticleIds
        : []
    }
  }
}

export function saveSettings(patch) {
  const current = getSettings()
  const next = {
    ...current,
    ...patch,
    liveTv: { ...current.liveTv, ...(patch.liveTv || {}) },
    ticker: patch.ticker
      ? {
          items: Array.isArray(patch.ticker.items) ? patch.ticker.items : [],
          autoArticles: patch.ticker.autoArticles !== false,
          excludeArticleIds: Array.isArray(patch.ticker.excludeArticleIds) ? patch.ticker.excludeArticleIds : []
        }
      : current.ticker
  }
  write(KEYS.settings, next)
  cloudPushSettings(next).catch(() => {})
  return next
}

// Manuelle Newsticker-Einträge aus den Einstellungen (Redaktions-Laufband).
// Nur aktivierte Einträge mit mindestens einer Sprache werden geliefert.
export function getTickerItems() {
  const { ticker } = getSettings()
  if (!ticker || !Array.isArray(ticker.items)) return []
  return ticker.items.filter(
    (i) => i && i.enabled !== false && (i.titleAr || i.titleKu || i.titleEn || i.titleDe)
  )
}

// Steuerung der automatischen Artikel-Schlagzeilen im Laufband:
// - autoArticles: ob die neuesten Artikel automatisch erscheinen
// - excludeArticleIds: Artikel, die aus dem Laufband ausgeblendet werden
export function getTickerAuto() {
  const { ticker } = getSettings()
  return {
    autoArticles: ticker ? ticker.autoArticles !== false : true,
    excludeArticleIds: Array.isArray(ticker && ticker.excludeArticleIds) ? ticker.excludeArticleIds : []
  }
}

export function getLiveTv() {
  return getSettings().liveTv || DEFAULT_SETTINGS.liveTv
}

export async function changePassword(current, next) {
  if (next.length < 6) {
    return { ok: false, errorKey: 'set.errorShort' }
  }
  const stored = read(KEYS.auth, null)
  const expected = stored ? stored.hash : await sha256(DEFAULT_PASSWORD)
  if ((await sha256(current)) !== expected) {
    return { ok: false, errorKey: 'set.errorWrongCurrent' }
  }
  write(KEYS.auth, { hash: await sha256(next) })
  return { ok: true }
}

// ---------- Autoren ----------

const DEFAULT_AUTHOR_ID = 'author-redaktion'

const SEED_AUTHORS = [
  {
    id: DEFAULT_AUTHOR_ID,
    slug: 'redaktion',
    name: 'Redaktion Jivak TV',
    role: '',
    bio: '',
    image: null,
    createdAt: daysAgo(30)
  }
]

export const EXAMPLE_MEDIA_URL = '/videos/jivak-beispiel.mp4'

function exampleMediaItem() {
  return {
    id: 'media-beispiel-video',
    type: 'video',
    name: 'Jivak TV Beispiel-Video (MP4)',
    url: EXAMPLE_MEDIA_URL,
    tag: 'Beispiel, MP4',
    createdAt: Date.now()
  }
}

function ensureSeed() {
  if (!localStorage.getItem(KEYS.categories)) {
    write(KEYS.categories, SEED_CATEGORIES)
  }
  if (!localStorage.getItem(KEYS.articles)) {
    write(KEYS.articles, SEED_ARTICLES)
  }
  if (!localStorage.getItem(KEYS.authors)) {
    write(KEYS.authors, SEED_AUTHORS)
  }
  if (!localStorage.getItem(KEYS.media)) {
    write(KEYS.media, [exampleMediaItem()])
  }
  if (!localStorage.getItem(KEYS.stats)) {
    write(KEYS.stats, { pageViews: [], visits: [], byArticle: {} })
  }
  // Alte Kategorien migrieren, fehlende Hauptkategorien ergänzen
  migrateCategories()
  // Cloud-Inhalte nachladen (localStorage bleibt schneller Cache)
  syncFromCloud()
}

ensureSeed()

export function getAuthors() {
  return read(KEYS.authors, [])
}

export function getAuthorById(id) {
  return getAuthors().find((a) => a.id === id) || null
}

export function getAuthorBySlug(slug) {
  return getAuthors().find((a) => a.slug === slug) || null
}

export function getArticlesByAuthorId(authorId) {
  if (!authorId) return []
  return getPublishedArticles().filter((a) => a.authorId === authorId)
}

export function getArticlesByAuthorName(name) {
  if (!name) return []
  return getPublishedArticles().filter((a) => String(a.author || '').toLowerCase() === String(name || '').toLowerCase())
}

export function saveAuthor(data) {
  const authors = getAuthors()
  const now = Date.now()
  if (data.id) {
    const idx = authors.findIndex((a) => a.id === data.id)
    if (idx === -1) return null
    const updated = { ...authors[idx], ...data, updatedAt: now }
    authors[idx] = updated
    write(KEYS.authors, authors)
    cloudPushAuthor(updated).catch(() => {})
    return updated
  }
  const base = slugify(data.name) || 'autor'
  let slug = base
  let n = 2
  while (authors.some((a) => a.slug === slug)) {
    slug = `${base}-${n}`
    n += 1
  }
  const created = {
    ...data,
    name: String(data.name || '').trim(),
    role: data.role || '',
    bio: data.bio || '',
    image: data.image || null,
    id: uid(),
    slug,
    createdAt: now,
    updatedAt: now
  }
  authors.push(created)
  write(KEYS.authors, authors)
  cloudPushAuthor(created).catch(() => {})
  return created
}

export function deleteAuthor(id) {
  const used = getArticles().some((a) => a.authorId === id)
  if (used) return { ok: false, errorKey: 'authors.inUse' }
  write(KEYS.authors, getAuthors().filter((a) => a.id !== id))
  cloudDeleteAuthor(id).catch(() => {})
  return { ok: true }
}

// ---------- Besucherstatistiken ----------

export function getStats() {
  const raw = read(KEYS.stats, null)
  return { pageViews: [], visits: [], byArticle: {}, ...(raw || {}) }
}

const dayKey = () => new Date().toISOString().slice(0, 10)

export function trackPageView(path) {
  const stats = getStats()
  const day = dayKey()
  let entry = stats.pageViews.find((p) => p.path === path)
  if (!entry) {
    entry = { path, day, count: 0 }
    stats.pageViews.push(entry)
  }
  entry.count += 1
  entry.day = day
  // Besucher pro Tag: eine Zählung pro Tag und Browser (Session)
  const sessionKey = 'jivak.visit-day'
  const lastVisitDay = (() => {
    try { return localStorage.getItem(sessionKey) || '' } catch { return '' }
  })()
  if (lastVisitDay !== day) {
    const dayEntry = stats.visits.find((v) => v.day === day)
    if (dayEntry) dayEntry.count += 1
    else stats.visits.push({ day, count: 1 })
    try { localStorage.setItem(sessionKey, day) } catch { /* Speicher voll */ }
  }
  write(KEYS.stats, stats)
  return stats
}

export function getTotalPageViews() {
  return getStats().pageViews.reduce((sum, p) => sum + (p.count || 0), 0)
}

export function getVisitorsPerDay(limit = 14) {
  return [...getStats().visits].sort((a, b) => (a.day < b.day ? -1 : 1)).slice(-limit)
}

export function getMostViewedArticles(limit = 5) {
  return [...getPublishedArticles()]
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, limit)
}

export function getTopPages(limit = 5) {
  return [...getStats().pageViews]
    .sort((a, b) => (b.count || 0) - (a.count || 0))
    .slice(0, limit)
}

// ---------- Medienbibliothek ----------

/** Fügt das Beispiel-Video hinzu, falls es noch nicht in der Bibliothek liegt. */
export function ensureExampleMedia() {
  const items = getMediaItems()
  const existing = items.find((m) => m.url === EXAMPLE_MEDIA_URL)
  if (existing) return { added: false, item: existing }
  const item = exampleMediaItem()
  items.unshift(item)
  write(KEYS.media, items)
  return { added: true, item }
}

export function getMediaItems() {
  return read(KEYS.media, [])
}

export function addMediaItem(data) {
  const items = getMediaItems()
  const created = {
    id: uid(),
    type: data.type === 'video' ? 'video' : 'image',
    name: String(data.name || '').trim(),
    url: String(data.url || '').trim(),
    tag: String(data.tag || '').trim(),
    createdAt: Date.now()
  }
  items.unshift(created)
  write(KEYS.media, items)
  cloudPushMedia(created).catch(() => {})
  return created
}

export function updateMediaItem(id, patch) {
  const items = getMediaItems()
  const idx = items.findIndex((m) => m.id === id)
  if (idx === -1) return null
  items[idx] = { ...items[idx], ...patch }
  write(KEYS.media, items)
  cloudPushMedia(items[idx]).catch(() => {})
  return items[idx]
}

export function deleteMediaItem(id) {
  const items = getMediaItems()
  const item = items.find((m) => m.id === id)
  if (item && isIdbUrl(item.url)) idbDelete(idbIdFromUrl(item.url)).catch(() => {})
  write(KEYS.media, items.filter((m) => m.id !== id))
  cloudDeleteMedia(id).catch(() => {})
}

// ---------- Artikel-Helfer (TOC, prev/next) ----------

export function getHeadings(body) {
  return String(body || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('## '))
    .map((line) => line.slice(3))
}

export function getPrevNextArticle(slug) {
  const published = getPublishedArticles()
  const idx = published.findIndex((a) => a.slug === slug)
  if (idx === -1) return { prev: null, next: null }
  return {
    prev: idx > 0 ? published[idx - 1] : null,
    next: idx < published.length - 1 ? published[idx + 1] : null
  }
}

// ---------- Export / Reset ----------

export function exportData() {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      app: 'Jivak TV',
      articles: getArticles(),
      categories: getCategories()
    },
    null,
    2
  )
}

export function resetData() {
  localStorage.removeItem(KEYS.articles)
  localStorage.removeItem(KEYS.categories)
  localStorage.removeItem(KEYS.authors)
  localStorage.removeItem(KEYS.media)
  localStorage.removeItem(KEYS.stats)
  localStorage.removeItem(KEYS.settings)
  ensureSeed()
}
