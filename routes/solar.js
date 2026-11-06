const express = require('express');
const router = express.Router();
const axios = require('axios');

/**
 * GET /api/solar?lat=23.81&lon=86.44
 * Fetches monthly solar yields + optimal tilt & azimuth from PVGIS (free, no API key)
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

    // --- Step 1: Get optimal tilt via PVGIS optimal inclination ---
    const optRes = await axios.get(
      'https://re.jrc.ec.europa.eu/api/v5_2/MRcalc',
      {
        params: {
          lat: latN,
          lon: lonN,
          horirrad: 1,
          optrad: 1,
          outputformat: 'json',
          browser: 0,
        },
        timeout: 15000,
      }
    );

    const optData = optRes.data;
    // Extract optimal tilt (angle giving max annual irradiation)
    const optimalTilt = optData?.inputs?.plane_inclination?.value ?? Math.round(Math.abs(latN));
    const optimalAzimuth = latN >= 0 ? 180 : 0; // South for northern hemisphere

    // --- Step 2: Get monthly yields at optimal tilt ---
    const pvRes = await axios.get(
      'https://re.jrc.ec.europa.eu/api/v5_2/PVcalc',
      {
        params: {
          lat: latN,
          lon: lonN,
          peakpower: 1,         // 1 kWp system → gives kWh/kWp per month
          loss: 14,             // 14% system losses (standard)
          angle: optimalTilt,
          aspect: optimalAzimuth - 180, // PVGIS uses -180..180 (0=south)
          outputformat: 'json',
          browser: 0,
          mountingplace: 'free', // free-standing, not building-integrated
          pvtechchoice: 'crystSi',
        },
        timeout: 15000,
      }
    );

    const pvData = pvRes.data;
    const monthly = pvData?.outputs?.monthly?.fixed ?? [];

    // monthly[i].E_m = monthly electricity per kWp (kWh/kWp)
    const monthlyYields = monthly.map((m) => parseFloat(m.E_m) || 0);
    const annualYield = monthlyYields.reduce((a, b) => a + b, 0);

    res.json({
      lat: latN,
      lon: lonN,
      optimalTiltDeg: optimalTilt,
      optimalAzimuthDeg: optimalAzimuth,
      monthlyYields,          // Array of 12 numbers [kWh/kWp]
      annualYieldKwhPerKwp: parseFloat(annualYield.toFixed(1)),
    });
  } catch (err) {
    console.error('PVGIS error:', err?.response?.data || err.message);
    // If PVGIS is unreachable, return sensible defaults for Dhanbad, India
    if (err.code === 'ECONNABORTED' || err.code === 'ECONNREFUSED' || err.response?.status >= 500) {
      return res.json({
        lat: parseFloat(req.query.lat),
        lon: parseFloat(req.query.lon),
        optimalTiltDeg: Math.round(Math.abs(parseFloat(req.query.lat))),
        optimalAzimuthDeg: 180,
        monthlyYields: [149.9, 142.7, 162.6, 146.3, 128.8, 104.0, 87.0, 91.0, 98.5, 123.7, 140.5, 141.9],
        annualYieldKwhPerKwp: 1517.9,
        fallback: true,
      });
    }
    res.status(500).json({ error: 'Failed to fetch solar data: ' + err.message });
  }
});

module.exports = router;
