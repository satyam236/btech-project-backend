const mongoose = require('mongoose');

const equipmentSchema = new mongoose.Schema({
  area: String,
  rooms: Number,
  equipment: String,
  qtyPerRoom: Number,
  ratedW: Number,
  hoursPerDay: Number,
  loadFactor: Number,
});

const projectSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  location: {
    lat: { type: Number, required: true },
    lon: { type: Number, required: true },
    address: { type: String, default: '' },
  },
  inputMode: {
    type: String,
    enum: ['preset', 'manual'],
    default: 'manual',
  },
  presetType: { type: String, default: '' },
  equipment: [equipmentSchema],
  operationSettings: {
    workingDaysPerMonth: { type: Number, default: 25 },
    operatingMonthsPerYear: { type: Number, default: 12 },
  },
  moduleSettings: {
    panelWp: { type: Number, default: 550 },
    panelLengthM: { type: Number, default: 2.278 },
    panelWidthM: { type: Number, default: 1.134 },
    dcAcRatio: { type: Number, default: 1.2 },
    roofAreaM2: { type: Number, default: 0 },
    coveragePct: { type: Number, default: 100 },
  },
  costSettings: {
    tariffPerKwh: { type: Number, default: 0 },
    installedCostPerKwp: { type: Number, default: 0 },
  },
  // Computed results (cached)
  results: {
    connectedLoadKw: Number,
    dailyEnergyKwh: Number,
    monthlyEnergyKwh: Number,
    annualEnergyKwh: Number,
    requiredCapacityKwp: Number,
    panelCount: Number,
    installedCapacityKwp: Number,
    moduleAreaM2: Number,
    inverterSizeKw: Number,
    annualGenerationKwh: Number,
    optimalTiltDeg: Number,
    optimalAzimuthDeg: Number,
    monthlyGeneration: [Number],
    monthlyYields: [Number],
    simplePaybackYears: Number,
    annualSavings: Number,
    co2OffsetTonnes: Number,
  },
}, { timestamps: true });

module.exports = mongoose.model('Project', projectSchema);
