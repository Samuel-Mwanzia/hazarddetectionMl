const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json());

// ===== DATABASE CONNECTION =====
const db = mysql.createConnection(process.env.DATABASE_URL);
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

// Route proxy — forwards to Google Directions, keeps API key off the device
// Android calls: GET /route?olat=...&olng=...&dlat=...&dlng=...
app.get('/route', (req, res) => {
    const { olat, olng, dlat, dlng } = req.query;

    if (!olat || !olng || !dlat || !dlng) {
        return res.status(400).json({
            status: 'INVALID_REQUEST',
            message: 'Missing required params: olat, olng, dlat, dlng'
        });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
        console.error('GOOGLE_MAPS_API_KEY is not set');
        return res.status(500).json({
            status: 'SERVER_ERROR',
            message: 'Routing service is not configured'
        });
    }

    const googleUrl = `https://maps.googleapis.com/maps/api/directions/json`
        + `?origin=${olat},${olng}`
        + `&destination=${dlat},${dlng}`
        + `&mode=driving`
        + `&alternatives=false`
        + `&key=${apiKey}`;

    https.get(googleUrl, (googleRes) => {
        let data = '';

        googleRes.on('data', chunk => { data += chunk; });

        googleRes.on('end', () => {
            try {
                const parsed = JSON.parse(data);
                // Forward Google's response as-is — Android already knows how to parse it
                res.json(parsed);
            } catch (e) {
                console.error('Failed to parse Google response:', e);
                res.status(502).json({
                    status: 'UPSTREAM_ERROR',
                    message: 'Invalid response from Google'
                });
            }
        });

    }).on('error', (e) => {
        console.error('Google Directions request failed:', e.message);
        res.status(500).json({
            status: 'SERVER_ERROR',
            message: 'Failed to reach Google Directions API'
        });
    });
});

// Health check
app.get('/', (req, res) => {
    res.send('API is running 🚀');
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
