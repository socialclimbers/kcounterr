const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Use /tmp for DB on platforms with ephemeral disk, or local dir
const dbPath = process.env.DB_PATH || path.join(__dirname, 'calories.db');
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE,
    description TEXT NOT NULL,
    calories INTEGER NOT NULL,
    date TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_entries_user_date ON entries(username, date);
`);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Get entries for a user on a specific date
app.get('/api/entries', (req, res) => {
  const { username, date } = req.query;
  if (!username || !date) return res.status(400).json({ error: 'username and date required' });

  const entries = db.prepare(
    'SELECT * FROM entries WHERE username = ? AND date = ? ORDER BY created_at ASC'
  ).all(username, date);

  const total = db.prepare(
    'SELECT COALESCE(SUM(calories), 0) as total FROM entries WHERE username = ? AND date = ?'
  ).get(username, date);

  res.json({ entries, total: total.total });
});

// Get weekly summary for a user
app.get('/api/summary', (req, res) => {
  const { username, days } = req.query;
  if (!username) return res.status(400).json({ error: 'username required' });

  const numDays = parseInt(days) || 7;
  const summary = db.prepare(`
    SELECT date, SUM(calories) as total, COUNT(*) as entry_count
    FROM entries
    WHERE username = ? AND date >= date('now', ?)
    GROUP BY date ORDER BY date DESC
  `).all(username, `-${numDays} days`);

  res.json({ summary });
});

// Add an entry
app.post('/api/entries', (req, res) => {
  const { username, description, calories, date } = req.body;
  if (!username || !description || calories == null || !date) {
    return res.status(400).json({ error: 'All fields required' });
  }

  const cal = parseInt(calories);
  if (isNaN(cal) || cal === 0) return res.status(400).json({ error: 'Invalid calorie value' });

  const result = db.prepare(
    'INSERT INTO entries (username, description, calories, date) VALUES (?, ?, ?, ?)'
  ).run(username.trim(), description.trim(), cal, date);

  const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(result.lastInsertRowid);
  res.json(entry);
});

// Delete an entry
app.delete('/api/entries/:id', (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: 'username required' });

  const result = db.prepare(
    'DELETE FROM entries WHERE id = ? AND username = ?'
  ).run(req.params.id, username);

  if (result.changes === 0) return res.status(404).json({ error: 'Entry not found' });
  res.json({ success: true });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Calorie Counter running on port ${PORT}`);
});
