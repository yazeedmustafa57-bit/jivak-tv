// RSS-Feed deaktiviert: /rss.xml wird nicht mehr ausgeliefert (Sicherheit).
export default function handler(_req, res) {
  res.status(404).json({ error: 'Not found' })
}
