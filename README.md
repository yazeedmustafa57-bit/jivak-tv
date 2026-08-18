# Jivak TV

Unabhängige Medien-Plattform der jivakschen Gemeinschaft: öffentliche Website mit
Artikeln, Kategorien und Reportagen sowie ein privater Admin-Bereich zum
selbstständigen und verantwortlichen Veröffentlichen und Verwalten von Inhalten.
Viersprachig: Arabisch, Kurdisch (Badînî/بادینی), Deutsch und Englisch.

## Funktionen

**Öffentliche Website**
- Startseite mit Hero, Leitartikel, neuesten Beiträgen, Medien-Sektion und Themen
- Artikelübersicht mit Kategorie-Filter
- Eigene Rubriken „Videos“ (`/#/videos`) und „Fotos“ (`/#/fotos`) mit Medien-Badges
- Artikel-Detailseiten mit Inhalts-Formatierung (Absätze, Zwischenüberschriften, Listen, Zitate)
- Video-Player (YouTube-Einbettung / MP4) und großes Foto-Format auf der Detailseite
- Kategorien-Seiten, responsives Layout (Desktop / Tablet / Mobile)
- Eigenes Logo (Jivak-TV-Emblem) in Header, Footer, Admin-Sidebar und Login

**Admin-Bereich (dunkles Theme, unter `/admin`)**
- Passwortgeschützte Anmeldung
- Dashboard mit Statistiken und zuletzt bearbeiteten Artikeln
- Artikel-CRUD: anlegen, bearbeiten, veröffentlichen/als Entwurf zurückziehen, löschen
- Beitragsformat: Beitrag (Text), Video (mit Link für Einbettung) oder Foto/Fotostrecke
- Titelbild-Upload (Base64, max. 1,5 MB) mit automatischem Farbcover-Fallback
- Kategorien-Verwaltung (anlegen, umbenennen, löschen)
- Einstellungen: Passwort ändern, JSON-Export, Zurücksetzen auf Demo-Inhalte

## Erste Schritte

```bash
npm install
npm run dev
```

- Website: http://localhost:5173
- Admin: http://localhost:5173/#/admin
- Standard-Passwort (Erstanmeldung): `admin` — danach unter **Einstellungen** ändern.

## Cloud (Supabase) – öffentliche Inhalte

- Seit der öffentlichen Version sind Inhalte **cloud-synchron** (Supabase):
  Der Admin meldet sich unter `/#/admin` mit E-Mail + Passwort an („Konto erstellen“),
  alle Beiträge/Medien werden zusätzlich in die Cloud geschrieben; Besucher laden
  sie von dort. `localStorage` dient nur noch als schneller Offline-Cache.
- **Env-Variablen** (Vercel): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  `VITE_SUPABASE_BUCKET` (siehe `.env.example`). Ohne sie läuft die App im
  rein lokalen Modus (alle Funktionen, aber Inhalte nur im eigenen Browser).
- **Schema:** Tabellen `articles`, `categories`, `authors`, `media_items`,
  `settings` + öffentlicher Storage-Bucket `jivak-tv` (RLS: Lesen für alle,
  Schreiben nur für angemeldete Redakteure).
- **Dateien:** Videos/Fotos werden bei aktivem Cloud-Speicher direkt in den
  Supabase-Storage hochgeladen (öffentliche URLs, kein Größenlimit); ohne Cloud
  als IndexedDB-Blobs bzw. data-URLs.
- **Live-Update:** Nach dem ersten Cloud-Abruf aktualisieren sich die Seiten
  automatisch (Store-Subscription), sodass neue Beiträge ohne manuelles Neuladen
  sichtbar werden. Lokale Startdaten werden nur nach einer Anmeldung einmalig
  in die Cloud hochgeladen (anonyme Besucher erhalten keine Schreibrechte).

## Automatische Übersetzung (serverseitig)

- **Ablauf:** Der Browser ruft nur den eigenen Endpunkt `/api/translate` auf
  (Vercel Serverless). Übersetzt wird **serverseitig** – keine Google-/MyMemory-
  Endpunkte im Browser. Der Server liefert ausschließlich fertige Texte.
- **Priorität:** 1. manuelle Übersetzung (DB) → 2. gespeicherte automatische
  Übersetzung (DB, bei unverändertem Quelltext) → 3. neue automatische Übersetzung
  → 4. Originalsprache (Fallback).
- **Speicherung:** Tabelle `article_translations` (`article_id`, `lang`, `title`,
  `intro`, `body`, `kind` = `manual`/`auto`, `source_hash`). Automatische
  Übersetzungen werden einmal erzeugt und danach aus dem Cache ausgeliefert;
  ändert sich der Quelltext (`source_hash`), wird automatisch neu übersetzt.
- **Performance:** Die sichtbaren Artikel einer Seite werden in **einer** Batch-Anfrage
  (`POST /api/translate` mit `articles: […]`) übersetzt statt vieler paralleler
  Requests; Wiederbesuche kommen komplett aus dem localStorage-Cache. Ein
  ErrorBoundary verhindert eingefrorene Seiten bei Render-Fehlern.
- **Provider-Kette:** `OPENAI_API_KEY` → `OPENROUTER_API_KEY` (+ `TRANSLATION_MODEL`)
  → eingebauter MyMemory-Fallback (kostenlos, ohne Key). Aktuell läuft der
  MyMemory-Fallback; mit einem AI-Key verbessert sich die Qualität automatisch.
- **Kurdisch/Badînî:** wird **nie maschinell** übersetzt. Der Server liefert für
  `ku` nur manuelle Übersetzungen; ansonsten bleibt der Originaltext erhalten.
- **Sprache:** Browser-Sprache wird automatisch erkannt (`navigator.language`),
  gespeichert (`localStorage`) und in der URL geführt (`?lang=de`). Sprachwechsel
  aktualisiert die ganze Seite sofort.
- **SEO:** Jede Sprache hat eine eigene URL (`?lang=…`), eigenen Canonical,
  hreflang-Alternates (ar/ku/en/de + x-default) und eigene JSON-LD-Struktur
  (`inLanguage`). Sitemap enthält alle Sprachvarianten inkl. hreflang-Links.
- **Admin:** Artikelliste zeigt den Übersetzungsstatus je Sprache (manuell /
  automatisch / fehlt); im Artikel-Editor können automatische Übersetzungen
  bearbeitet und als manuell gespeichert werden. Kurdisch bietet im Editor keine
  Automatik-Schaltfläche.
- **Env (Vercel, nur Server):** `SUPABASE_SERVICE_ROLE_KEY` (schreibt Auto-
  Übersetzungen, wird nie in den Browser ausgeliefert). Optional
  `OPENAI_API_KEY` / `OPENROUTER_API_KEY` / `TRANSLATION_MODEL`.

## Bewusste Entscheidungen

- **Hybrider Datenlayer:** `localStorage` als Cache + Supabase als Quelle für
  öffentliche Inhalte. Export als JSON ist weiterhin eingebaut.
- **Auth:** Lokales SHA-256-Passwort als Fallback; mit Cloud aktiviert erfolgt die
  Anmeldung über Supabase Auth (E-Mail + Passwort, Rollen via RLS).
- **Demo-Inhalte:** Beim ersten Start sind sechs Beispielbeiträge (inkl. Video- und
  Foto-Format) und vier Kategorien vorhanden, damit das Layout sichtbar ist. Alles ist im Admin löschbar bzw. über
  „Demo-Inhalte wiederherstellen“ zurücksetzbar.
- **Titelbilder:** Ohne hochgeladenes Bild erzeugt die Plattform automatisch ein
  farbiges Cover passend zur Kategorie – keine generischen Stock-Fotos.
- **Konzept:** Das visuelle Konzept folgt dem vom Nutzer bereitgestellten Referenzbild
  und ist in `design-system.md` als Design-Spezifikation dokumentiert (Image-Gen war
  in der Erstellungssession nicht verfügbar).

## Technik

- React 18 + Vite, React Router (Hash-Routing für statisches Hosting)
- Lokale Fonts via `@fontsource` (Fraunces + Inter, kein CDN)
- Datenlayer: `src/lib/store.js` (localStorage-Cache) + `src/lib/cloud-api.js`/`src/lib/supabase.js` (Supabase), Sicherer Text-Renderer:
  `src/lib/markdown-lite.jsx` (kein `dangerouslySetInnerHTML`)
- Design-Tokens & Konventionen: `design-system.md`

## Newsletter

- Anmeldung im Footer speichert die E-Mail in der Supabase-Tabelle `newsletter` (RLS: Insert öffentlich, SELECT/DELETE nur für angemeldete Nutzer).
- Sofern `RESEND_API_KEY` + `NEWSLETTER_FROM` gesetzt sind, sendet `api/newsletter.js` eine Willkommens-E-Mail mit signiertem Abmelde-Link (`api/newsletter-unsubscribe.js`, HMAC mit `NEWSLETTER_SECRET`).
- Admin-Bereich → **Newsletter**: Abonnenten-Liste, Suche, Löschen, CSV-Export (`api/newsletter-admin.js`, geschützt durch Supabase-Session-Token).
- Ohne Resend-Konfiguration werden Anmeldungen weiterhin gespeichert, aber es wird keine E-Mail versendet (Status wird im Admin angezeigt).
- Hinweis: Ohne verifizierte Domain in Resend liefert der Sandbox-Absender `onboarding@resend.dev` nur an die Inhaber-E-Mail. Für den Versand an alle Abonnenten muss `jivaktv.net` in Resend verifiziert werden, danach `NEWSLETTER_FROM` auf `Jivak TV <newsletter@jivaktv.net>` umstellen.
