const express = require('express');
const router = express.Router();

/**
 * POST /api/calculate
 * Body: { equipment[], operationSettings, moduleSettings, costSettings, monthlyYields[], optimalTiltDeg, optimalAzimuthDeg }
 * Returns all computed solar sizing metrics
 */
router.post('/', (req, res) => {
  try {
    const {
      equipment = [],
      operationSettings = {},
      moduleSettings = {},
      costSettings = {},
      monthlyYields = [],
      optimalTiltDeg = 25,
      optimalAzimuthDeg = 180,
    } = req.body;

    const {
      workingDaysPerMonth = 25,
      operatingMonthsPerYear = 12,
    } = operationSettings;

    const {
      panelWp = 550,
      panelLengthM = 2.278,
      panelWidthM = 1.134,
      dcAcRatio = 1.2,
      coveragePct = 100,
    } = moduleSettings;

    const { tariffPerKwh = 0, installedCostPerKwp = 0 } = costSettings;

    // --- 1. Load & energy calculations ---
    let connectedLoadKw = 0;
    let dailyEnergyKwh = 0;

    equipment.forEach((row) => {
      const rooms = row.rooms || 1;
      const qtyPerRoom = row.qtyPerRoom || 1;
      const ratedW = row.ratedW || 0;
      const hours = row.hoursPerDay || 0;
      const lf = row.loadFactor || 1;

      const rowLoadKw = (rooms * qtyPerRoom * ratedW) / 1000;
      const rowDailyKwh = rowLoadKw * hours * lf;

      connectedLoadKw += rowLoadKw;
      dailyEnergyKwh += rowDailyKwh;
    });

    const monthlyEnergyKwh = dailyEnergyKwh * workingDaysPerMonth;
    const annualEnergyKwh = monthlyEnergyKwh * operatingMonthsPerYear;

    // --- 2. Solar sizing ---
    const annualYield = monthlyYields.reduce((a, b) => a + b, 0);
    const coverageFraction = coveragePct / 100;

    const requiredCapacityKwp = annualYield > 0
      ? (annualEnergyKwh * coverageFraction) / annualYield
      : 0;

    const panelCount = panelWp > 0
      ? Math.ceil((requiredCapacityKwp * 1000) / panelWp)
      : 0;

    const installedCapacityKwp = (panelCount * panelWp) / 1000;
    const moduleAreaM2 = panelCount * panelLengthM * panelWidthM;
    const inverterSizeKw = dcAcRatio > 0 ? installedCapacityKwp / dcAcRatio : 0;

    // --- 3. Monthly generation (kWh/month) ---
    const monthlyGeneration = monthlyYields.map(
      (yield_kwhperkwp) => yield_kwhperkwp * installedCapacityKwp
    );
    const annualGenerationKwh = monthlyGeneration.reduce((a, b) => a + b, 0);

    // --- 4. Financial & carbon ---
    let simplePaybackYears = null;
    let annualSavings = 0;

    if (tariffPerKwh > 0 && installedCostPerKwp > 0 && annualGenerationKwh > 0) {
      annualSavings = annualGenerationKwh * tariffPerKwh;
      const totalCost = installedCapacityKwp * installedCostPerKwp;
      simplePaybackYears = parseFloat((totalCost / annualSavings).toFixed(1));
    }

    // CO2: India grid emission factor ≈ 0.82 kg CO2/kWh (CEA 2023)
    const co2OffsetTonnes = parseFloat(((annualGenerationKwh * 0.82) / 1000).toFixed(2));

    // --- 5. Equipment breakdown for pie chart ---
    const equipmentBreakdown = {};
    equipment.forEach((row) => {
      const key = row.equipment || 'Other';
      const rooms = row.rooms || 1;
      const daily = ((rooms * (row.qtyPerRoom || 1) * (row.ratedW || 0)) / 1000)
        * (row.hoursPerDay || 0)
        * (row.loadFactor || 1);
      equipmentBreakdown[key] = (equipmentBreakdown[key] || 0) + daily;
    });

    res.json({
      connectedLoadKw: parseFloat(connectedLoadKw.toFixed(2)),
      dailyEnergyKwh: parseFloat(dailyEnergyKwh.toFixed(1)),
      monthlyEnergyKwh: parseFloat(monthlyEnergyKwh.toFixed(0)),
      annualEnergyKwh: parseFloat(annualEnergyKwh.toFixed(0)),
      annualYieldKwhPerKwp: parseFloat(annualYield.toFixed(1)),
      requiredCapacityKwp: parseFloat(requiredCapacityKwp.toFixed(1)),
      panelCount,
      installedCapacityKwp: parseFloat(installedCapacityKwp.toFixed(2)),
      moduleAreaM2: parseFloat(moduleAreaM2.toFixed(0)),
      inverterSizeKw: parseFloat(inverterSizeKw.toFixed(0)),
      monthlyGeneration: monthlyGeneration.map((v) => parseFloat(v.toFixed(0))),
      monthlyEnergyPerMonth: parseFloat(monthlyEnergyKwh.toFixed(0)),
      annualGenerationKwh: parseFloat(annualGenerationKwh.toFixed(0)),
      optimalTiltDeg,
      optimalAzimuthDeg,
      simplePaybackYears,
      annualSavings: parseFloat(annualSavings.toFixed(0)),
      co2OffsetTonnes,
      equipmentBreakdown,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
