const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-in-production';

// Middleware
app.use(cors());
app.use(express.json());

// Проверяем наличие собранного клиента
const publicExists = fs.existsSync('client/dist');
const staticPath = publicExists ? 'client/dist' : 'public';
console.log(`📁 Статические файлы из: ${staticPath}`);
app.use(express.static(staticPath));

// Настройка multer для загрузки файлов
const upload = multer({ dest: 'uploads/' });

// Подключение к базе данных
const db = new sqlite3.Database('./database.db');

// Инициализация базы данных
initializeDatabase();

function initializeDatabase() {
  db.serialize(() => {
    // Таблица пользователей (администраторы)
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Таблица шаблонов форм
    db.run(`CREATE TABLE IF NOT EXISTS form_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Таблица заполненных форм
    db.run(`CREATE TABLE IF NOT EXISTS filled_forms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL,
      data TEXT NOT NULL,
      signatures TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      signed_at DATETIME,
      pdf_path TEXT,
      FOREIGN KEY (template_id) REFERENCES form_templates(id)
    )`);

    // Создаем администратора по умолчанию
    const hashedPassword = bcrypt.hashSync('admin', 10);
    db.run(`INSERT OR IGNORE INTO users (username, email, password) VALUES (?, ?, ?)`,
      ['admin', 'admin@example.com', hashedPassword]);
  });
}

// Middleware для проверки JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ ok: false, error: 'Требуется авторизация' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ ok: false, error: 'Недействительный токен' });
    }
    req.user = user;
    next();
  });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'pdfgenirator', 
    uptime: process.uptime(), 
    now: new Date().toISOString() 
  });
});

// Авторизация
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) {
      return res.status(500).json({ ok: false, error: 'Ошибка сервера' });
    }

    if (!user) {
      return res.status(401).json({ ok: false, error: 'Неверные учетные данные' });
    }

    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ ok: false, error: 'Неверные учетные данные' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
    res.json({ ok: true, token, user: { id: user.id, username: user.username, email: user.email } });
  });
});

// Смена пароля
app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
  const { email, newPassword } = req.body;
  const userId = req.user.id;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ ok: false, error: 'Пароль должен содержать минимум 6 символов' });
  }

  const hashedPassword = bcrypt.hashSync(newPassword, 10);

  db.run('UPDATE users SET email = ?, password = ? WHERE id = ?', 
    [email, hashedPassword, userId], 
    function(err) {
      if (err) {
        return res.status(500).json({ ok: false, error: 'Ошибка обновления пароля' });
      }
      res.json({ ok: true, message: 'Пароль успешно изменен' });
    }
  );
});

// Получить все шаблоны форм
app.get('/api/forms', (req, res) => {
  db.all('SELECT * FROM form_templates ORDER BY created_at DESC', (err, forms) => {
    if (err) {
      return res.status(500).json({ ok: false, error: 'Ошибка получения форм' });
    }
    res.json({ ok: true, forms });
  });
});

// Получить шаблон формы
app.get('/api/forms/:id', (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM form_templates WHERE id = ?', [id], (err, form) => {
    if (err) {
      return res.status(500).json({ ok: false, error: 'Ошибка получения формы' });
    }
    if (!form) {
      return res.status(404).json({ ok: false, error: 'Форма не найдена' });
    }
    res.json({ ok: true, form });
  });
});

// Создать новый шаблон формы (только админ)
app.post('/api/forms', authenticateToken, (req, res) => {
  const { name, description, content } = req.body;

  if (!name || !content) {
    return res.status(400).json({ ok: false, error: 'Название и содержимое обязательны' });
  }

  db.run('INSERT INTO form_templates (name, description, content) VALUES (?, ?, ?)',
    [name, description, JSON.stringify(content)],
    function(err) {
      if (err) {
        return res.status(500).json({ ok: false, error: 'Ошибка создания формы' });
      }
      res.json({ ok: true, id: this.lastID });
    }
  );
});

// Обновить шаблон формы (только админ)
app.put('/api/forms/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { name, description, content } = req.body;

  db.run('UPDATE form_templates SET name = ?, description = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [name, description, JSON.stringify(content), id],
    function(err) {
      if (err) {
        return res.status(500).json({ ok: false, error: 'Ошибка обновления формы' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ ok: false, error: 'Форма не найдена' });
      }
      res.json({ ok: true });
    }
  );
});

// Удалить шаблон формы (только админ)
app.delete('/api/forms/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM form_templates WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ ok: false, error: 'Ошибка удаления формы' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ ok: false, error: 'Форма не найдена' });
    }
    res.json({ ok: true });
  });
});

// Сохранить заполненную форму
app.post('/api/forms/:id/fill', upload.any(), (req, res) => {
  const { id } = req.params;
  const data = JSON.parse(req.body.data || '{}');
  const uploadedFiles = req.files || [];

  // Обработка загруженных файлов
  const filePaths = uploadedFiles.map(file => ({
    field: file.fieldname,
    path: `/uploads/${file.filename}`,
    originalname: file.originalname
  }));

  db.run('INSERT INTO filled_forms (template_id, data) VALUES (?, ?)',
    [id, JSON.stringify({ ...data, files: filePaths })],
    function(err) {
      if (err) {
        return res.status(500).json({ ok: false, error: 'Ошибка сохранения формы' });
      }
      res.json({ ok: true, id: this.lastID });
    }
  );
});

// Подписать форму
app.post('/api/forms/:id/sign', (req, res) => {
  const { id } = req.params;
  const { signatures } = req.body;

  db.run('UPDATE filled_forms SET signatures = ?, signed_at = CURRENT_TIMESTAMP WHERE id = ?',
    [JSON.stringify(signatures), id],
    function(err) {
      if (err) {
        return res.status(500).json({ ok: false, error: 'Ошибка подписания формы' });
      }

      // Здесь будет генерироваться PDF
      // TODO: вызвать функцию генерации PDF

      res.json({ ok: true });
    }
  );
});

// Fallback для React Router - ДОЛЖЕН быть после всех API роутов
if (publicExists) {
  app.get('*', (req, res) => {
    try {
      res.sendFile(path.join(__dirname, 'client/dist/index.html'));
    } catch (err) {
      res.status(500).send('Error loading client');
    }
  });
}

// Запуск сервера
app.listen(PORT, () => {
  console.log(`📋 PDF Generator сервер запущен на http://localhost:${PORT}`);
  console.log(`📁 Статические файлы из: ${staticPath}`);
  console.log(`💡 Откройте браузер и перейдите по адресу http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  db.close();
  process.exit(0);
});

