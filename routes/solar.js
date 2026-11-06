const express = require('express');
const router = express.Router();
const axios = require('axios');

/**
 * GET /api/solar?lat=25.4377&lon=81.7342
 * Uses PVGIS PVcalc with optimalangles=1 to calculate:
 * - exact optimal tilt (slope)
 * - exact optimal azimuth (accounting for terrain, atmosphere, elevation)
 * - exact monthly yields per kWp
 */
router.get('/', async (req, res) => {
  try {
    const { lat, lon } = req.query;
    if (!lat || !lon)
      return res.status(400).json({ error: 'lat and lon are required' });

    const latN = parseFloat(lat);
    const lonN = parseFloat(lon);

    if (isNaN(latN) || isNaN(lonN))
      return res.status(400).json({ error: 'Invalid lat/lon values' });

    // Single fast PVGIS call with optimalangles=1
    const pvRes = await axios.get(
      'https://re.jrc.ec.europa.eu/api/v5_2/PVcalc',
      {
        params: {
          lat: latN,
          lon: lonN,
          peakpower: 1,         // 1 kWp system → gives kWh/kWp per month
          loss: 14,             // 14% system losses (standard)
          optimalangles: 1,     // Automatically computes optimal tilt AND optimal azimuth!
          outputformat: 'json',
          browser: 0,
          mountingplace: 'free',
          pvtechchoice: 'crystSi',
        },
        timeout: 15000,
      }
    );

    const pvData = pvRes.data;
    const fixedMount = pvData?.inputs?.mounting_system?.fixed || {};

    // 1. Optimal tilt angle (slope)
    const optimalTilt = fixedMount.slope?.value ?? Math.round(Math.abs(latN));

    // 2. Exact optimal azimuth from PVGIS:
    // PVGIS convention: 0 = South, 90 = West, -90 = East, 180/-180 = North
    const pvgisAzimuth = fixedMount.azimuth?.value ?? 0;

    // Convert to standard 360° compass bearing (North = 0°, East = 90°, South = 180°, West = 270°)
    let compassAzimuth = Math.round(180 + pvgisAzimuth);
    if (compassAzimuth >= 360) compassAzimuth -= 360;
    if (compassAzimuth < 0) compassAzimuth += 360;

    // 3. Monthly generation yields per 1 kWp
    const monthly = pvData?.outputs?.monthly?.fixed ?? [];
    const monthlyYields = monthly.map((m) => parseFloat(m.E_m) || 0);
    const annualYield = monthlyYields.reduce((a, b) => a + b, 0);

    res.json({
      lat: latN,
      lon: lonN,
      optimalTiltDeg: optimalTilt,
      optimalAzimuthDeg: compassAzimuth,      // e.g. 177° (standard compass bearing)
      pvgisAzimuthDeg: pvgisAzimuth,          // e.g. -3° (PVGIS offset from South)
      monthlyYields,                          // Array of 12 numbers [kWh/kWp]
      annualYieldKwhPerKwp: parseFloat(annualYield.toFixed(1)),
    });
  } catch (err) {
    console.error('PVGIS error:', err?.response?.data || err.message);
    // Sensible fallback if PVGIS is down
    const latN = parseFloat(req.query.lat) || 23.8;
    const lonN = parseFloat(req.query.lon) || 86.4;
    return res.json({
      lat: latN,
      lon: lonN,
      optimalTiltDeg: Math.round(Math.abs(latN)),
      optimalAzimuthDeg: latN >= 0 ? 180 : 0,
      pvgisAzimuthDeg: 0,
      monthlyYields: [149.9, 142.7, 162.6, 146.3, 128.8, 104.0, 87.0, 91.0, 98.5, 123.7, 140.5, 141.9],
      annualYieldKwhPerKwp: 1517.9,
      fallback: true,
    });
  }
});

module.exports = router;
