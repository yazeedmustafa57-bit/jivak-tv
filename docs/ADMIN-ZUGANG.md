# Admin-Zugang ROJ TV (dauerhaft)

> Diese Datei liegt nur im Projektordner – sie ist nicht öffentlich auf der Website.

## Login-Seite
https://jivak-tv.vercel.app/admin/login

## Zugangsdaten (Stand: 15.08.2026)
| Konto | E-Mail | Passwort |
|---|---|---|
| Hauptkonto | yazeedmustafa57@gmail.com | 333221frf@ |
| Backup-Konto | admin@jivaktv.net | Ez1di-Media-2026! |

## Wichtige Hinweise
- Die Konten liegen bei Supabase (Auth) und bleiben dauerhaft aktiv, solange die Website
  regelmäßig besucht wird (Besucher halten das kostenlose Supabase-Projekt aktiv).
- Passwort vergessen? Auf der Login-Seite auf „Passwort vergessen“ klicken – die
  Bestätigungs-E-Mail kommt an die hinterlegte E-Mail-Adresse.
- Änderungen am Passwort bitte ebenfalls hier eintragen, damit der Zugang dokumentiert bleibt.
- Website-Deployment: Vercel (https://jivak-tv.vercel.app) – läuft dauerhaft im
  kostenlosen Tier, solange das Konto aktiv bleibt.

---

## Stufe 1: Mitarbeiter & Rollen (Stand: 15.08.2026)

### Rollen
| Rolle | Rechte |
|---|---|
| **Admin** | Alles: Artikel, Kategorien, Autoren, Einstellungen, Mitarbeiter, Audit-Protokoll, Veröffentlichen, Löschen |
| **Editor (Redakteur)** | Artikel anlegen/bearbeiten, veröffentlichen, Übersetzungen bearbeiten, Medienbibliothek |
| **Autor** | Nur eigene Artikel anlegen/bearbeiten; darf NICHT veröffentlichen; kann „zur Freigabe“ schicken |
| **Media** | Nur Medienbibliothek (Fotos/Videos verwalten) |

### Mitarbeiter-Verwaltung
- Bereich: Admin → **Mitarbeiter** (`/admin/mitarbeiter`) – nur für Admins sichtbar.
- Dort können Konten angelegt, bearbeitet, deaktiviert, gelöscht und Passwörter zurückgesetzt werden.
- „Passwort vergessen“-E-Mail wird direkt von Supabase an den Mitarbeiter gesendet.
- Der letzte verbleibende Admin kann nicht gelöscht oder degradiert werden (Schutz).

### Prüf-Workflow
- Autor erstellt Artikel → Status **Entwurf (draft)**
- Autor schickt Artikel **zur Freigabe (review)**
- Redakteur/Admin sieht die Warteschlange im Dashboard („Zur Freigabe“) und veröffentlicht
- Bereits veröffentlichte Artikel ändert ein Autor nur noch im Status „review“ (kein direkter Publish)

### Audit-Protokoll
- Admin → **Audit** (`/admin/audit`): protokolliert Anlegen/Bearbeiten/Statuswechsel/Löschen
  von Artikeln sowie Mitarbeiter-Aktionen, mit Benutzer, Zeitpunkt und Ziel.
- Max. 400 Einträge werden gehalten (älteste werden automatisch verworfen).

### Technische Hinweise (für Entwicklung)
- Alle Schreibzugriffe laufen über `api/staff.js` (Service-Role + serverseitige Rollenprüfung),
  weil die bestehenden RLS-Policies nur die bisherigen Admin-Mails direkt schreiben lassen.
- Rollen liegen in den Supabase-Auth-Metadaten (`role`, `name`, `authorId`, `active`).
- Bootstrap: Die ersten Konten (`yazeedmustafa57@gmail.com`, `admin@jivaktv.net`) werden
  automatisch zu Admins; ohne bestehenden Admin wird das erste Konto Admin.
- Vercel-Hobby-Limit: max. 12 Serverless Functions – daher ist alles in `api/staff.js` gebündelt.

---

## Passwort-Reset (Stand: 15.08.2026)
- Supabase-Auth-Einstellungen korrigiert: Site URL war `http://localhost:3000` →
  jetzt `https://jivak-tv.vercel.app` (Redirect-Allowlist enthält die Live-Seite).
- Reset-Links aus „Mitarbeiter → Passwort-Reset-Mail“ führen direkt auf
  `https://jivak-tv.vercel.app/auth/reset`.
- Links, die auf der Startseite landen, werden automatisch zur Reset-Seite weitergeleitet.
- Der Reset-Link ist 1 Stunde gültig und kann nur einmal verwendet werden.
- Nach erfolgreicher Passwort-Änderung wird die Session beendet: Der Nutzer wird
  automatisch zur Anmeldung weitergeleitet und muss sich mit dem neuen Passwort
  erneut einloggen (kein automatisches Eingeloggt-Bleiben).
- Ein Reset-Link ist NUR EINMAL verwendbar (verifiziert):
  - Der Supabase-Verify-Token wird beim ersten Klick verbraucht (zweiter Klick → otp_expired).
  - Nach der Passwort-Änderung werden serverseitig ALLE Sessions des Nutzers widerrufen
    (signOut mit scope=global). Damit sind auch die Access-/Refresh-Tokens aus dem Link
    sofort ungültig – auch ein direkt gespeicherter Link kann nicht erneut verwendet werden.
  - Beim erneuten Öffnen eines verbrauchten Links erscheint die Meldung
    „Dieser Link wurde bereits verwendet oder ist abgelaufen.“ (ohne Formular).
  - ALT-LINKS (vor dem SignOut-Fix erzeugt): Auch eine bereits früher verwendete,
    nie widerrufene Recovery-Session wird beim Öffnen von /auth/reset jetzt erkannt
    und serverseitig widerrufen (scope: global) – sie kann keine weitere
    Passwort-Änderung auslösen. Die Reset-Seite akzeptiert nur noch frische
    Recovery-Tokens aus der URL (kein „irgendeine Session“-Fallback mehr).
  - Cache: index.html/SPA-Routen werden mit `Cache-Control: no-cache, must-revalidate`
    ausgeliefert (vercel.json), gehashte Assets mit `immutable` (1 Jahr).
