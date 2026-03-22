const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

// ===== DATABASE CONNECTION =====
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
});

db.connect(err => {
    if (err) {
        console.error('❌ MySQL connection error:', err.message);
        process.exit(1);
    }
    console.log('✅ Connected to Railway MySQL');
});

// ===== ROUTES =====

// Get all obstacles
app.get('/getCoordinates', (req, res) => {

    const sql = 'SELECT * FROM obstacles';

    db.query(sql, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: err.message });
        }

        res.json(results);
    });
});

// Add obstacle
app.post('/addObstacle', (req, res) => {

    const { type, latitude, longitude } = req.body;

    if (!type || !latitude || !longitude) {
        return res.status(400).json({ error: 'Missing fields' });
    }

    const sql = `
        INSERT INTO obstacles (type, latitude, longitude)
        VALUES (?, ?, ?)
    `;

    db.query(sql, [type, latitude, longitude], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: err.message });
        }

        res.json({
            message: '✅ Obstacle added',
            id: result.insertId
        });
    });
});

// Health check (important for Render)
app.get('/', (req, res) => {
    res.send('API is running 🚀');
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});