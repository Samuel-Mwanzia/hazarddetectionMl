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

// Route proxy — calls Google Routes API (new), keeps API key off the device
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

    // Routes API (New) — POST request with JSON body
    const body = JSON.stringify({
        origin: {
            location: { latLng: { latitude: parseFloat(olat), longitude: parseFloat(olng) } }
        },
        destination: {
            location: { latLng: { latitude: parseFloat(dlat), longitude: parseFloat(dlng) } }
        },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
        computeAlternativeRoutes: false,
        polylineEncoding: 'ENCODED_POLYLINE'
    });

    const options = {
        hostname: 'routes.googleapis.com',
        path: '/directions/v2:computeRoutes',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            // Only request the fields we need — reduces response size
            'X-Goog-FieldMask': 'routes.legs.steps.polyline,routes.polyline,routes.legs.steps.startLocation,routes.legs.steps.endLocation'
        }
    };

    const googleReq = https.request(options, (googleRes) => {
        let data = '';

        googleRes.on('data', chunk => { data += chunk; });

        googleRes.on('end', () => {
            try {
                const routesResponse = JSON.parse(data);

                if (!routesResponse.routes || routesResponse.routes.length === 0) {
                    return res.status(404).json({ status: 'ZERO_RESULTS', message: 'No route found' });
                }

                // Convert Routes API response to Directions API format
                // so the Android app needs zero changes
                const route = routesResponse.routes[0];

                const steps = (route.legs || []).flatMap(leg =>
                    (leg.steps || []).map(step => ({
                        polyline: { points: step.polyline.encodedPolyline }
                    }))
                );

                res.json({
                    status: 'OK',
                    routes: [{
                        legs: [{ steps }],
                        overview_polyline: { points: route.polyline.encodedPolyline }
                    }]
                });

            } catch (e) {
                console.error('Failed to parse Routes API response:', e);
                res.status(502).json({
                    status: 'UPSTREAM_ERROR',
                    message: 'Invalid response from Google'
                });
            }
        });
    });

    googleReq.on('error', (e) => {
        console.error('Google Routes API request failed:', e.message);
        res.status(500).json({
            status: 'SERVER_ERROR',
            message: 'Failed to reach Google Routes API'
        });
    });

    googleReq.write(body);
    googleReq.end();
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
