const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const PDFGenerator = require('./pdf-generator');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-in-production';

// Middleware
app.use(cors());
app.use(express.json());

// Serve built client if it exists
const publicExists = fs.existsSync('client/dist');
const staticPath = publicExists ? 'client/dist' : 'public';
console.log(`Serving static files from: ${staticPath}`);
app.use(express.static(staticPath));

// Multer configuration for file uploads
const upload = multer({ dest: 'uploads/' });

// SQLite database connection
const db = new sqlite3.Database('./database.db');

// Initialise database schema
initializeDatabase();

function initializeDatabase() {
  db.serialize(() => {
    // Users table (administrators)
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Form templates table
    db.run(`CREATE TABLE IF NOT EXISTS form_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Submitted forms table
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

    db.run(`CREATE TABLE IF NOT EXISTS field_suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_field_key TEXT NOT NULL,
      value TEXT NOT NULL,
      usage_count INTEGER DEFAULT 1,
      UNIQUE(template_field_key, value)
    )`);

    // Seed default administrator credentials
    const hashedPassword = bcrypt.hashSync('admin', 10);
    db.run(`INSERT OR IGNORE INTO users (username, email, password) VALUES (?, ?, ?)`,
      ['admin', 'admin@example.com', hashedPassword]);
  });
}

// Middleware to verify JWT tokens
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ ok: false, error: 'Authentication required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ ok: false, error: 'Invalid token' });
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

// Authentication
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) {
      return res.status(500).json({ ok: false, error: 'Server error' });
    }

    if (!user) {
      return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    }

    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
    res.json({ ok: true, token, user: { id: user.id, username: user.username, email: user.email } });
  });
});

// Change password
app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
  const { email, newPassword } = req.body;
  const userId = req.user.id;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ ok: false, error: 'Password must be at least 6 characters long' });
  }

  const hashedPassword = bcrypt.hashSync(newPassword, 10);

  db.run('UPDATE users SET email = ?, password = ? WHERE id = ?', 
    [email, hashedPassword, userId], 
    function(err) {
      if (err) {
        return res.status(500).json({ ok: false, error: 'Failed to update password' });
      }
      res.json({ ok: true, message: 'Password updated' });
    }
  );
});

// Fetch all form templates
app.get('/api/forms', (req, res) => {
  db.all('SELECT * FROM form_templates ORDER BY created_at DESC', (err, forms) => {
    if (err) {
      return res.status(500).json({ ok: false, error: 'Failed to fetch forms' });
    }
    res.json({ ok: true, forms });
  });
});

// Fetch single form template
app.get('/api/forms/:id', (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM form_templates WHERE id = ?', [id], (err, form) => {
    if (err) {
      return res.status(500).json({ ok: false, error: 'Failed to fetch form' });
    }
    if (!form) {
      return res.status(404).json({ ok: false, error: 'Form not found' });
    }
    res.json({ ok: true, form });
  });
});

app.get('/api/forms/:id/suggestions', (req, res) => {
  const { id } = req.params;
  const { field, q = '' } = req.query;

  if (!field) {
    return res.status(400).json({ ok: false, error: 'Field parameter is required' });
  }

  const search = `${String(q || '').trim()}%`;
  const key = `${id}:${field}`;

  db.all(
    `SELECT value FROM field_suggestions
     WHERE template_field_key = ?
       AND value LIKE ? COLLATE NOCASE
     ORDER BY usage_count DESC, value ASC
     LIMIT 10`,
    [key, search === '%' ? '%' : search],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ ok: false, error: 'Failed to load suggestions' });
      }

      res.json({
        ok: true,
        suggestions: rows.map((row) => row.value)
      });
    }
  );
});

// Create new form template (admin only)
app.post('/api/forms', authenticateToken, (req, res) => {
  const { name, description, content } = req.body;

  if (!name || !content) {
    return res.status(400).json({ ok: false, error: 'Name and content are required' });
  }

  db.run('INSERT INTO form_templates (name, description, content) VALUES (?, ?, ?)',
    [name, description, JSON.stringify(content)],
    function(err) {
      if (err) {
        return res.status(500).json({ ok: false, error: 'Failed to create form' });
      }
      res.json({ ok: true, id: this.lastID });
    }
  );
});

// Update form template (admin only)
app.put('/api/forms/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { name, description, content } = req.body;

  db.run('UPDATE form_templates SET name = ?, description = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [name, description, JSON.stringify(content), id],
    function(err) {
      if (err) {
        return res.status(500).json({ ok: false, error: 'Failed to update form' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ ok: false, error: 'Form not found' });
      }
      res.json({ ok: true });
    }
  );
});

// Delete form template (admin only)
app.delete('/api/forms/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM form_templates WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ ok: false, error: 'Failed to delete form' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ ok: false, error: 'Form not found' });
    }
    res.json({ ok: true });
  });
});

// Store submitted form data
app.post('/api/forms/:id/fill', upload.any(), (req, res) => {
  const { id } = req.params;
  const data = JSON.parse(req.body.data || '{}');
  const uploadedFiles = req.files || [];

  // Process uploaded files
  const filePaths = uploadedFiles.map(file => ({
    field: file.fieldname,
    path: `/uploads/${file.filename}`,
    originalname: file.originalname
  }));

  db.run('INSERT INTO filled_forms (template_id, data) VALUES (?, ?)',
    [id, JSON.stringify({ ...data, files: filePaths })],
    function(err) {
      if (err) {
        return res.status(500).json({ ok: false, error: 'Failed to store form submission' });
      }
      res.json({ ok: true, id: this.lastID });
    }
  );
});

// Sign submitted form
app.post('/api/forms/:id/sign', (req, res) => {
  const { id } = req.params;
  const { signatures } = req.body;

  db.run(
    'UPDATE filled_forms SET signatures = ?, signed_at = CURRENT_TIMESTAMP WHERE id = ?',
    [JSON.stringify(signatures || {}), id],
    function (err) {
      if (err) {
        return res.status(500).json({ ok: false, error: 'Failed to sign form' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ ok: false, error: 'Submission not found' });
      }

      db.get(
        `SELECT ff.*, ft.name AS template_name, ft.description AS template_description, ft.content AS template_content
         FROM filled_forms ff
         JOIN form_templates ft ON ft.id = ff.template_id
         WHERE ff.id = ?`,
        [id],
        async (selectErr, row) => {
          if (selectErr || !row) {
            console.error('Failed to load submission for PDF generation', selectErr);
            return res.status(500).json({ ok: false, error: 'Failed to generate PDF' });
          }

          try {
            const submissionData = JSON.parse(row.data || '{}');
            const signaturePayload =
              signatures || JSON.parse(row.signatures || '{}') || {};
            const templateFields = JSON.parse(row.template_content || '[]');

            const safeTemplate =
              (row.template_name || 'form')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '') || 'form';

            const outputPath = path.join(
              __dirname,
              'generated',
              `${safeTemplate}_${row.id}_${Date.now()}.pdf`
            );

            const suggestionStmt = db.prepare(
              `INSERT INTO field_suggestions (template_field_key, value, usage_count)
               VALUES (?, ?, 1)
               ON CONFLICT(template_field_key, value)
               DO UPDATE SET usage_count = usage_count + 1`
            );

            templateFields
              .filter((field) => field.type === 'text')
              .forEach((field) => {
                const key = String(field.id);
                const rawValue = submissionData[key];
                if (typeof rawValue === 'string') {
                  const trimmed = rawValue.trim();
                  if (trimmed) {
                    suggestionStmt.run([
                      `${row.template_id}:${field.id}`,
                      trimmed
                    ]);
                  }
                }
              });

            suggestionStmt.finalize();

            await PDFGenerator.generate(submissionData, signaturePayload, {
              outputPath,
              template: templateFields,
              meta: {
                templateName: row.template_name,
                templateDescription: row.template_description
              }
            });

            db.run(
              'UPDATE filled_forms SET pdf_path = ? WHERE id = ?',
              [outputPath, id],
              (updateErr) => {
                if (updateErr) {
                  console.error('Failed to update PDF path in database', updateErr);
                }
                res.json({ ok: true, pdfPath: outputPath });
              }
            );
          } catch (pdfErr) {
            console.error('PDF generation failed', pdfErr);
            res.status(500).json({ ok: false, error: 'Failed to generate PDF' });
          }
        }
      );
    }
  );
});

// React Router fallback (must stay after API routes)
if (publicExists) {
  app.get('*', (req, res) => {
    try {
      res.sendFile(path.join(__dirname, 'client/dist/index.html'));
    } catch (err) {
      res.status(500).send('Error loading client');
    }
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`PDF Generator server running at http://localhost:${PORT}`);
  console.log(`Serving static files from: ${staticPath}`);
  console.log(`Open your browser and navigate to http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  db.close();
  process.exit(0);
});

