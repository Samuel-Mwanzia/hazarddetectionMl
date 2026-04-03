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

// Route proxy — calls OSRM (free, no API key) and returns response to Android app.
// The app calls this instead of OSRM directly, avoiding SSL issues on older Android devices.
// Android calls: GET /route?olat=...&olng=...&dlat=...&dlng=...
app.get('/route', (req, res) => {
    const { olat, olng, dlat, dlng } = req.query;

    if (!olat || !olng || !dlat || !dlng) {
        return res.status(400).json({
            code: 'InvalidInput',
            message: 'Missing required params: olat, olng, dlat, dlng'
        });
    }

    // OSRM expects lng,lat order
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/`
        + `${olng},${olat};${dlng},${dlat}`
        + `?overview=full&geometries=polyline&steps=true`;

    console.log('Calling OSRM:', osrmUrl);

    https.get(osrmUrl, (osrmRes) => {
        let data = '';

        osrmRes.on('data', chunk => { data += chunk; });

        osrmRes.on('end', () => {
            try {
                const parsed = JSON.parse(data);
                console.log('OSRM response code:', parsed.code);
                // Forward OSRM response as-is — Android app already parses this format
                res.json(parsed);
            } catch (e) {
                console.error('Failed to parse OSRM response:', e.message);
                console.error('Raw response:', data.substring(0, 300));
                res.status(502).json({
                    code: 'ParseError',
                    message: 'Invalid response from OSRM'
                });
            }
        });

    }).on('error', (e) => {
        console.error('OSRM request failed:', e.message);
        res.status(500).json({
            code: 'ServerError',
            message: 'Failed to reach routing server'
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
