// lib/products.ts
// Heat pump and cylinder product database
// Sources: manufacturer datasheets, MCS product directory, technical brochures

export type HeatPump = {
    id: string
    brand: string
    range: string
    model: string
    outputKw: number           // Nominal rated output
    refrigerant: string
    // Performance at A7 (outdoor 7°C)
    copW35: number             // COP at A7/W35
    copW45: number             // COP at A7/W45
    copW55: number             // COP at A7/W55
    outputW35: number          // Heating capacity kW at A7/W35
    outputW45: number          // Heating capacity kW at A7/W45
    outputW55: number          // Heating capacity kW at A7/W55
    // Seasonal performance
    scopW35: number            // SCOP EN14825 at 35°C
    scopW55: number            // SCOP EN14825 at 55°C
    // Noise
    soundPowerDb: number       // Sound power level dB(A)
    soundPressureDb: number    // Sound pressure at 1m dB(A)
    // Physical
    widthMm: number
    heightMm: number
    depthMm: number
    weightKg: number
    // Operating range
    minOutdoorC: number        // Min outdoor operating temp
    maxFlowC: number           // Max flow temperature
    phases: number             // 1 or 3 phase
    // Commercial
    warrantyYears: number
    mcsListed: boolean
    productCode: string
    busEligible: boolean
    // Notes
    notes: string
    compatibleCylinders?: string[]  // cylinder brand restrictions
  }
  
  export type Cylinder = {
    id: string
    brand: string
    range: string
    model: string
    capacityL: number
    type: string               // indirect / preplumbed / thermal_store
    coilAreaM2: number         // Heat exchanger coil surface area
    // Performance
    reheatkwFromCold: number   // Reheat time from cold (minutes)
    reheatMinFrom70: number    // Reheat from 70% draw-off (minutes)
    standingLossKwhDay: number // Standing heat loss kWh/24h
    // Physical
    heightMm: number
    diameterMm: number
    weightEmptyKg: number
    // Spec
    maxPressureBar: number
    immersionKw: number
    erpBand: string
    // Commercial
    warrantyYears: number
    guaranteeYears: number     // Anti-corrosion guarantee
    productCode: string
    // Restrictions
    vaillantOnly: boolean
    notes: string
  }
  
  // ─── HEAT PUMPS ───────────────────────────────────────────────────────────────
  
  export const HEAT_PUMPS: HeatPump[] = [
  
    // ── Vaillant aroTHERM plus ──────────────────────────────────────────────────
    // Source: Vaillant technical datasheet, MCS product directory
    // SCOP values from MCS listing: @35°C – 4.36, @40°C – 4.13, @45°C – 3.91, @50°C – 3.65, @55°C – 3.39 (7kW)
    {
      id: 'vaillant-arotherm-3-5',
      brand: 'Vaillant', range: 'aroTHERM plus', model: 'VWF 35/4',
      outputKw: 3.5, refrigerant: 'R290',
      copW35: 5.2, copW45: 4.3, copW55: 3.1,
      outputW35: 3.5, outputW45: 3.2, outputW55: 3.0,
      scopW35: 4.36, scopW55: 3.39,
      soundPowerDb: 48, soundPressureDb: 35,
      widthMm: 900, heightMm: 625, depthMm: 383, weightKg: 70,
      minOutdoorC: -25, maxFlowC: 75, phases: 1,
      warrantyYears: 5, mcsListed: true, productCode: 'VWF 35/4',
      busEligible: true,
      notes: 'Quiet Mark accredited. Sound Safe System. R290 natural refrigerant GWP=3.',
      compatibleCylinders: ['vaillant'],
    },
    {
      id: 'vaillant-arotherm-5',
      brand: 'Vaillant', range: 'aroTHERM plus', model: 'VWF 57/4',
      outputKw: 5, refrigerant: 'R290',
      copW35: 5.2, copW45: 4.3, copW55: 3.1,
      outputW35: 5.0, outputW45: 4.5, outputW55: 4.2,
      scopW35: 4.36, scopW55: 3.39,
      soundPowerDb: 48, soundPressureDb: 35,
      widthMm: 900, heightMm: 625, depthMm: 383, weightKg: 72,
      minOutdoorC: -25, maxFlowC: 75, phases: 1,
      warrantyYears: 5, mcsListed: true, productCode: 'VWF 57/4',
      busEligible: true,
      notes: 'Quiet Mark accredited. A+++ rated. SCoP up to 5.03.',
      compatibleCylinders: ['vaillant'],
    },
    {
      id: 'vaillant-arotherm-7',
      brand: 'Vaillant', range: 'aroTHERM plus', model: 'VWF 87/4',
      outputKw: 7, refrigerant: 'R290',
      copW35: 5.1, copW45: 4.2, copW55: 3.2,
      outputW35: 7.0, outputW45: 6.4, outputW55: 5.8,
      scopW35: 4.36, scopW55: 3.39,
      soundPowerDb: 54, soundPressureDb: 40,
      widthMm: 1170, heightMm: 790, depthMm: 445, weightKg: 102,
      minOutdoorC: -25, maxFlowC: 75, phases: 1,
      warrantyYears: 5, mcsListed: true, productCode: 'VWF 87/4',
      busEligible: true,
      notes: 'Most popular UK size. Quiet Mark accredited. MCS SCOP @35°C: 4.36, @55°C: 3.39.',
      compatibleCylinders: ['vaillant'],
    },
    {
      id: 'vaillant-arotherm-10',
      brand: 'Vaillant', range: 'aroTHERM plus', model: 'VWF 108/4',
      outputKw: 10, refrigerant: 'R290',
      copW35: 5.0, copW45: 4.1, copW55: 3.1,
      outputW35: 10.0, outputW45: 9.2, outputW55: 8.3,
      scopW35: 4.13, scopW55: 3.39,
      soundPowerDb: 57, soundPressureDb: 43,
      widthMm: 1170, heightMm: 790, depthMm: 445, weightKg: 108,
      minOutdoorC: -25, maxFlowC: 75, phases: 1,
      warrantyYears: 5, mcsListed: true, productCode: 'VWF 108/4',
      busEligible: true,
      notes: '1-phase. R290. Suitable for larger properties.',
      compatibleCylinders: ['vaillant'],
    },
    {
      id: 'vaillant-arotherm-12',
      brand: 'Vaillant', range: 'aroTHERM plus', model: 'VWF 128/4',
      outputKw: 12, refrigerant: 'R290',
      copW35: 4.9, copW45: 4.0, copW55: 3.0,
      outputW35: 12.0, outputW45: 11.0, outputW55: 9.8,
      scopW35: 4.36, scopW55: 3.39,
      soundPowerDb: 54, soundPressureDb: 40,
      widthMm: 1170, heightMm: 790, depthMm: 445, weightKg: 113,
      minOutdoorC: -25, maxFlowC: 75, phases: 1,
      warrantyYears: 5, mcsListed: true, productCode: 'VWF 128/4',
      busEligible: true,
      notes: 'Quiet Mark accredited. Single phase. High output for larger properties.',
      compatibleCylinders: ['vaillant'],
    },
  
    // ── Samsung Gen7 EHS Mono R290 ──────────────────────────────────────────────
    // Source: Samsung EHS Mono R290 datasheet, Climate Solutions UK, AIZO
    // COP at A7/W35 for 5kW: 5.10 (from datasheet)
    {
      id: 'samsung-gen7-5',
      brand: 'Samsung', range: 'EHS Gen7 R290', model: 'AE050CXYDEK/EU',
      outputKw: 5, refrigerant: 'R290',
      copW35: 5.10, copW45: 4.3, copW55: 3.3,
      outputW35: 5.0, outputW45: 4.6, outputW55: 4.1,
      scopW35: 4.5, scopW55: 3.5,
      soundPowerDb: 55, soundPressureDb: 41,
      widthMm: 998, heightMm: 850, depthMm: 500, weightKg: 86,
      minOutdoorC: -25, maxFlowC: 75, phases: 1,
      warrantyYears: 5, mcsListed: true, productCode: 'AE050CXYDEK/EU',
      busEligible: true,
      notes: '4-step Quiet Mode down to 35 dB(A). R290. SmartThings compatible. Buffer tank required (30L min).',
    },
    {
      id: 'samsung-gen7-8',
      brand: 'Samsung', range: 'EHS Gen7 R290', model: 'AE080CXYDEK/EU',
      outputKw: 8, refrigerant: 'R290',
      copW35: 4.8, copW45: 4.0, copW55: 3.1,
      outputW35: 8.0, outputW45: 7.3, outputW55: 6.5,
      scopW35: 4.3, scopW55: 3.3,
      soundPowerDb: 57, soundPressureDb: 43,
      widthMm: 998, heightMm: 850, depthMm: 500, weightKg: 92,
      minOutdoorC: -25, maxFlowC: 75, phases: 1,
      warrantyYears: 5, mcsListed: true, productCode: 'AE080CXYDEK/EU',
      busEligible: true,
      notes: 'Popular mid-size. Quiet Mode. 100% output down to -10°C. Buffer tank required (30L min).',
    },
    {
      id: 'samsung-gen7-12',
      brand: 'Samsung', range: 'EHS Gen7 R290', model: 'AE120CXYDEK/EU',
      outputKw: 12, refrigerant: 'R290',
      copW35: 4.6, copW45: 3.8, copW55: 3.0,
      outputW35: 12.0, outputW45: 10.8, outputW55: 9.5,
      scopW35: 4.1, scopW55: 3.1,
      soundPowerDb: 59, soundPressureDb: 45,
      widthMm: 1160, heightMm: 1000, depthMm: 520, weightKg: 122,
      minOutdoorC: -25, maxFlowC: 75, phases: 1,
      warrantyYears: 5, mcsListed: true, productCode: 'AE120CXYDEK/EU',
      busEligible: true,
      notes: 'Larger unit. Buffer tank required (50L min). 1-phase supply.',
    },
    {
      id: 'samsung-gen7-16',
      brand: 'Samsung', range: 'EHS Gen7 R290', model: 'AE160CXYDEK/EU',
      outputKw: 16, refrigerant: 'R290',
      copW35: 4.4, copW45: 3.6, copW55: 2.9,
      outputW35: 16.0, outputW45: 14.5, outputW55: 12.8,
      scopW35: 3.9, scopW55: 3.0,
      soundPowerDb: 60, soundPressureDb: 46,
      widthMm: 1160, heightMm: 1000, depthMm: 520, weightKg: 135,
      minOutdoorC: -25, maxFlowC: 75, phases: 1,
      warrantyYears: 5, mcsListed: true, productCode: 'AE160CXYDEK/EU',
      busEligible: true,
      notes: '1-phase 16kW. Buffer tank required (50L min). For larger/poorly insulated properties.',
    },
  
    // ── Ideal HP290 ─────────────────────────────────────────────────────────────
    // Source: Ideal HP290 brochure — Midsummer Wholesale PDF (datasheets)
    // Full COP/SCOP data from brochure table
    {
      id: 'ideal-hp290-5',
      brand: 'Ideal', range: 'HP290', model: 'HP290 4.5kW',
      outputKw: 4.5, refrigerant: 'R290',
      copW35: 5.15, copW45: 4.2, copW55: 3.2,
      outputW35: 4.5, outputW45: 4.1, outputW55: 3.9,
      scopW35: 5.07, scopW55: 3.79,
      soundPowerDb: 55, soundPressureDb: 41,
      widthMm: 930, heightMm: 680, depthMm: 387, weightKg: 74,
      minOutdoorC: -25, maxFlowC: 70, phases: 1,
      warrantyYears: 2, mcsListed: true, productCode: '241486',
      busEligible: true,
      notes: 'A+++ rated. SCOP@35: 5.07. 2yr warranty (register within 30 days). UK support 364 days/yr.',
    },
    {
      id: 'ideal-hp290-6',
      brand: 'Ideal', range: 'HP290', model: 'HP290 6kW',
      outputKw: 6.2, refrigerant: 'R290',
      copW35: 4.9, copW45: 4.0, copW55: 3.2,
      outputW35: 6.2, outputW45: 5.7, outputW55: 5.3,
      scopW35: 4.89, scopW55: 3.82,
      soundPowerDb: 56, soundPressureDb: 42,
      widthMm: 930, heightMm: 680, depthMm: 387, weightKg: 74,
      minOutdoorC: -25, maxFlowC: 70, phases: 1,
      warrantyYears: 2, mcsListed: true, productCode: '241487',
      busEligible: true,
      notes: 'A+++ rated. Monobloc. Compatible with Ideal pre-plumbed HP cylinders.',
    },
    {
      id: 'ideal-hp290-10',
      brand: 'Ideal', range: 'HP290', model: 'HP290 10kW',
      outputKw: 10, refrigerant: 'R290',
      copW35: 4.7, copW45: 3.8, copW55: 3.0,
      outputW35: 10.0, outputW45: 9.2, outputW55: 8.5,
      scopW35: 5.07, scopW55: 3.82,
      soundPowerDb: 58, soundPressureDb: 44,
      widthMm: 930, heightMm: 680, depthMm: 387, weightKg: 82,
      minOutdoorC: -25, maxFlowC: 70, phases: 1,
      warrantyYears: 2, mcsListed: true, productCode: '241488',
      busEligible: true,
      notes: 'A+++ @35°C. Monobloc single phase. UK-designed for UK climate.',
    },
    {
      id: 'ideal-hp290-12',
      brand: 'Ideal', range: 'HP290', model: 'HP290 12kW',
      outputKw: 12, refrigerant: 'R290',
      copW35: 4.8, copW45: 3.9, copW55: 3.1,
      outputW35: 12.0, outputW45: 11.0, outputW55: 9.8,
      scopW35: 4.67, scopW55: 3.62,
      soundPowerDb: 58, soundPressureDb: 44,
      widthMm: 1050, heightMm: 790, depthMm: 415, weightKg: 96,
      minOutdoorC: -25, maxFlowC: 70, phases: 1,
      warrantyYears: 2, mcsListed: true, productCode: '241489',
      busEligible: true,
      notes: 'A+++ rated. COP@A7/W35: 4.8. UK customer service 364 days/year.',
    },
    {
      id: 'ideal-hp290-14',
      brand: 'Ideal', range: 'HP290', model: 'HP290 14kW',
      outputKw: 14, refrigerant: 'R290',
      copW35: 4.5, copW45: 3.7, copW55: 2.9,
      outputW35: 14.0, outputW45: 12.8, outputW55: 11.3,
      scopW35: 4.63, scopW55: 3.61,
      soundPowerDb: 59, soundPressureDb: 45,
      widthMm: 1050, heightMm: 790, depthMm: 415, weightKg: 104,
      minOutdoorC: -25, maxFlowC: 70, phases: 1,
      warrantyYears: 2, mcsListed: true, productCode: '241490',
      busEligible: true,
      notes: 'Large single-phase unit. A+++ @35°C.',
    },
    {
      id: 'ideal-hp290-15',
      brand: 'Ideal', range: 'HP290', model: 'HP290 15kW',
      outputKw: 15, refrigerant: 'R290',
      copW35: 4.4, copW45: 3.6, copW55: 2.8,
      outputW35: 15.0, outputW45: 13.7, outputW55: 12.1,
      scopW35: 4.59, scopW55: 3.57,
      soundPowerDb: 60, soundPressureDb: 46,
      widthMm: 1050, heightMm: 790, depthMm: 415, weightKg: 110,
      minOutdoorC: -25, maxFlowC: 70, phases: 1,
      warrantyYears: 2, mcsListed: true, productCode: '241491',
      busEligible: true,
      notes: 'Largest HP290 single phase. For larger/older properties.',
    },
  
    // ── Warmflow Zeno R290 ───────────────────────────────────────────────────────
    // Source: Warmflow website, City Plumbing, Quiet Mark, Plumbnation
    // 3 models: AS01 (6-10kW), AS02 (10-15kW), AS03 (15-22kW) — all variable speed
    {
      id: 'warmflow-zeno-10',
      brand: 'Warmflow', range: 'Zeno R290', model: 'AS01-R290 (10kW)',
      outputKw: 10, refrigerant: 'R290',
      copW35: 4.8, copW45: 3.9, copW55: 3.1,
      outputW35: 10.0, outputW45: 9.2, outputW55: 8.3,
      scopW35: 4.2, scopW55: 3.3,
      soundPowerDb: 55, soundPressureDb: 41,
      widthMm: 1050, heightMm: 750, depthMm: 430, weightKg: 95,
      minOutdoorC: -25, maxFlowC: 75, phases: 1,
      warrantyYears: 5, mcsListed: true, productCode: 'AS01-R290',
      busEligible: true,
      notes: 'Quiet Mark certified. 4G SIM built-in, no WiFi needed. Warmlink remote access. Variable speed 2–10kW. Full-colour touchscreen.',
    },
    {
      id: 'warmflow-zeno-15',
      brand: 'Warmflow', range: 'Zeno R290', model: 'AS02-R290 (15kW)',
      outputKw: 15, refrigerant: 'R290',
      copW35: 4.6, copW45: 3.7, copW55: 2.9,
      outputW35: 15.0, outputW45: 13.5, outputW55: 11.8,
      scopW35: 4.0, scopW55: 3.1,
      soundPowerDb: 57, soundPressureDb: 43,
      widthMm: 1100, heightMm: 800, depthMm: 450, weightKg: 108,
      minOutdoorC: -25, maxFlowC: 75, phases: 1,
      warrantyYears: 5, mcsListed: true, productCode: 'AS02-R290',
      busEligible: true,
      notes: 'Variable speed 7–15kW. Sound as low as 41 dB(A). Warmlink included. Irish manufacturer with UK support.',
    },
    {
      id: 'warmflow-zeno-22',
      brand: 'Warmflow', range: 'Zeno R290', model: 'AS03-R290 (22kW)',
      outputKw: 22, refrigerant: 'R290',
      copW35: 4.3, copW45: 3.5, copW55: 2.8,
      outputW35: 22.0, outputW45: 19.8, outputW55: 17.2,
      scopW35: 3.8, scopW55: 3.0,
      soundPowerDb: 60, soundPressureDb: 46,
      widthMm: 1200, heightMm: 900, depthMm: 500, weightKg: 130,
      minOutdoorC: -25, maxFlowC: 75, phases: 1,
      warrantyYears: 5, mcsListed: true, productCode: 'AS03-R290',
      busEligible: true,
      notes: 'One of only a few single-fan 22kW units on market. Single phase. For larger/older detached properties. Buffer tank required.',
    },
  ]
  
  // ─── CYLINDERS ────────────────────────────────────────────────────────────────
  
  export const CYLINDERS: Cylinder[] = [
  
    // ── Telford Tempest HP Range ─────────────────────────────────────────────────
    // Source: Telford-group.com, HeatDirect, Tradingdepot, Cylinders2Go
    // HP coil: 2m² (150L) or 3.3m² (200L+). Lifetime guarantee. Single or twin coil.
    {
      id: 'telford-tempest-150',
      brand: 'Telford', range: 'Tempest HP', model: 'TSMI150/HP',
      capacityL: 150, type: 'indirect',
      coilAreaM2: 2.0,
      reheatkwFromCold: 40, reheatMinFrom70: 25, standingLossKwhDay: 1.72,
      heightMm: 1060, diameterMm: 510, weightEmptyKg: 28,
      maxPressureBar: 3, immersionKw: 3,
      erpBand: 'C',
      warrantyYears: 2, guaranteeYears: 99,
      productCode: 'TSMI150/HP',
      vaillantOnly: false,
      notes: 'Duplex stainless steel. 2m² HP coil. Lifetime guarantee on inner. 3kW immersion backup. Twin coil option available (TSMI150/HP/TC).',
    },
    {
      id: 'telford-tempest-200',
      brand: 'Telford', range: 'Tempest HP', model: 'TSMI200/HP',
      capacityL: 200, type: 'indirect',
      coilAreaM2: 3.3,
      reheatkwFromCold: 33, reheatMinFrom70: 24, standingLossKwhDay: 2.04,
      heightMm: 1120, diameterMm: 580, weightEmptyKg: 36,
      maxPressureBar: 3, immersionKw: 3,
      erpBand: 'C',
      warrantyYears: 2, guaranteeYears: 99,
      productCode: 'TSMI200/HP',
      vaillantOnly: false,
      notes: '3.3m² HP coil. Standard smallest size with full-performance coil. Slimline version available. Lifetime guarantee.',
    },
    {
      id: 'telford-tempest-250',
      brand: 'Telford', range: 'Tempest HP', model: 'TSMI250/HP',
      capacityL: 250, type: 'indirect',
      coilAreaM2: 3.3,
      reheatkwFromCold: 35, reheatMinFrom70: 28, standingLossKwhDay: 2.20,
      heightMm: 1330, diameterMm: 580, weightEmptyKg: 42,
      maxPressureBar: 3, immersionKw: 3,
      erpBand: 'C',
      warrantyYears: 2, guaranteeYears: 99,
      productCode: 'TSMI250/HP',
      vaillantOnly: false,
      notes: '3.3m² HP coil. Good choice for 4-5 bed. Twin coil option for solar/boiler backup.',
    },
    {
      id: 'telford-tempest-300',
      brand: 'Telford', range: 'Tempest HP', model: 'TSMI300/HP',
      capacityL: 300, type: 'indirect',
      coilAreaM2: 3.3,
      reheatkwFromCold: 40, reheatMinFrom70: 29, standingLossKwhDay: 2.32,
      heightMm: 1650, diameterMm: 580, weightEmptyKg: 48,
      maxPressureBar: 3, immersionKw: 3,
      erpBand: 'C',
      warrantyYears: 2, guaranteeYears: 99,
      productCode: 'TSMI300/HP',
      vaillantOnly: false,
      notes: 'For 5+ bedrooms or high hot water demand. Lifetime guarantee.',
    },
    {
      id: 'telford-tempest-400',
      brand: 'Telford', range: 'Tempest HP', model: 'TSMI400/HP',
      capacityL: 400, type: 'indirect',
      coilAreaM2: 3.3,
      reheatkwFromCold: 45, reheatMinFrom70: 35, standingLossKwhDay: 2.58,
      heightMm: 1590, diameterMm: 710, weightEmptyKg: 58,
      maxPressureBar: 3, immersionKw: 3,
      erpBand: 'C',
      warrantyYears: 2, guaranteeYears: 99,
      productCode: 'TSMI400/HP',
      vaillantOnly: false,
      notes: 'Large capacity. Wider diameter. Lifetime guarantee.',
    },
  
    // ── Vaillant uniSTOR pure ────────────────────────────────────────────────────
    // Source: Vaillant technical brochure 2024, professional.vaillant.co.uk
    // 25-year anti-corrosion guarantee. Only available with Vaillant heat pumps.
    // Standby losses as low as 1.0 kWh/24h
    {
      id: 'vaillant-unistor-150',
      brand: 'Vaillant', range: 'uniSTOR pure', model: 'uniSTOR pure 150L',
      capacityL: 150, type: 'indirect',
      coilAreaM2: 2.5,
      reheatkwFromCold: 28, reheatMinFrom70: 18, standingLossKwhDay: 1.0,
      heightMm: 1190, diameterMm: 580, weightEmptyKg: 38,
      maxPressureBar: 7, immersionKw: 3,
      erpBand: 'B',
      warrantyYears: 2, guaranteeYears: 25,
      productCode: '0020235271',
      vaillantOnly: true,
      notes: 'Vaillant heat pumps only. Thermal injected insulation. 100% recyclable stainless steel. Lowest heat loss in class (1.0 kWh/24h). 25-year anti-corrosion guarantee. Pre-plumbed available.',
    },
    {
      id: 'vaillant-unistor-200',
      brand: 'Vaillant', range: 'uniSTOR pure', model: 'uniSTOR pure 200L',
      capacityL: 200, type: 'indirect',
      coilAreaM2: 3.0,
      reheatkwFromCold: 32, reheatMinFrom70: 20, standingLossKwhDay: 1.2,
      heightMm: 1390, diameterMm: 580, weightEmptyKg: 46,
      maxPressureBar: 7, immersionKw: 3,
      erpBand: 'B',
      warrantyYears: 2, guaranteeYears: 25,
      productCode: '0020235272',
      vaillantOnly: true,
      notes: 'Vaillant heat pumps only. Pre-plumbed variant available (0020237130). Optimised coil for Vaillant HP efficiency.',
    },
    {
      id: 'vaillant-unistor-250',
      brand: 'Vaillant', range: 'uniSTOR pure', model: 'uniSTOR pure 250L',
      capacityL: 250, type: 'indirect',
      coilAreaM2: 3.5,
      reheatkwFromCold: 35, reheatMinFrom70: 22, standingLossKwhDay: 1.4,
      heightMm: 1535, diameterMm: 595, weightEmptyKg: 61,
      maxPressureBar: 7, immersionKw: 3,
      erpBand: 'B',
      warrantyYears: 2, guaranteeYears: 25,
      productCode: '0020235273',
      vaillantOnly: true,
      notes: 'Vaillant HPs only. Larger coil for GSHP compatibility. 25-yr anti-corrosion guarantee.',
    },
    {
      id: 'vaillant-unistor-300',
      brand: 'Vaillant', range: 'uniSTOR pure', model: 'uniSTOR pure 300L',
      capacityL: 300, type: 'indirect',
      coilAreaM2: 4.0,
      reheatkwFromCold: 38, reheatMinFrom70: 25, standingLossKwhDay: 1.6,
      heightMm: 1745, diameterMm: 595, weightEmptyKg: 68,
      maxPressureBar: 7, immersionKw: 3,
      erpBand: 'B',
      warrantyYears: 2, guaranteeYears: 25,
      productCode: '0020235274',
      vaillantOnly: true,
      notes: 'Vaillant HPs only. GSHP compatible (larger coil). Pre-plumbed option available. Best for 5+ beds.',
    },
  ]
  
  // ─── Helpers ──────────────────────────────────────────────────────────────────
  
  // Get HP output at a given flow temperature (interpolated)
  export function getHpOutput(hp: HeatPump, flowTemp: number): number {
    if (flowTemp <= 35) return hp.outputW35
    if (flowTemp <= 45) {
      const t = (flowTemp - 35) / 10
      return hp.outputW35 + t * (hp.outputW45 - hp.outputW35)
    }
    if (flowTemp <= 55) {
      const t = (flowTemp - 45) / 10
      return hp.outputW45 + t * (hp.outputW55 - hp.outputW45)
    }
    // Beyond 55°C — extrapolate downward at same rate
    const rate = (hp.outputW55 - hp.outputW45) / 10
    return hp.outputW55 + (flowTemp - 55) * rate
  }
  
  // Get HP CoP at a given flow temperature
  export function getHpCoP(hp: HeatPump, flowTemp: number): number {
    if (flowTemp <= 35) return hp.copW35
    if (flowTemp <= 45) {
      const t = (flowTemp - 35) / 10
      return hp.copW35 + t * (hp.copW45 - hp.copW35)
    }
    if (flowTemp <= 55) {
      const t = (flowTemp - 45) / 10
      return hp.copW45 + t * (hp.copW55 - hp.copW45)
    }
    return hp.copW55 - (flowTemp - 55) * 0.05
  }
  
  // Get cylinders compatible with a given HP
  export function getCompatibleCylinders(hp: HeatPump | null): Cylinder[] {
    if (!hp) return CYLINDERS
    // If HP requires Vaillant cylinders
    if (hp.compatibleCylinders?.includes('vaillant')) {
      return CYLINDERS // Vaillant HPs can use any cylinder
    }
    // Non-Vaillant HPs can't use uniSTOR pure
    return CYLINDERS.filter(c => !c.vaillantOnly)
  }
  
  // MIS 3005-D minimum cylinder size
  export function minCylinderSize(bedrooms: number): number {
    if (bedrooms <= 2) return 150
    if (bedrooms <= 3) return 200
    if (bedrooms <= 4) return 250
    return 300
  }
  
  // DHW reheat time at HP flow temperature (simplified)
  // Time = (volume_L × 4.186 × ΔT) / (hpOutputW × 3600 / 1000) minutes
  export function calcReheatTime(cylinder: Cylinder, hp: HeatPump, flowTemp: number, inletTempC = 10, targetTempC = 55): number {
    const hpOutputKw = getHpOutput(hp, flowTemp)
    if (hpOutputKw <= 0) return 0
    const energyKwh = (cylinder.capacityL * 4.186 * (targetTempC - inletTempC)) / 3600
    return Math.round((energyKwh / hpOutputKw) * 60) // minutes
  }
  
  // Group HPs by brand
  export function getHpBrands(): string[] {
    return Array.from(new Set(HEAT_PUMPS.map(hp => hp.brand)))
  }
  
  // Filter HPs that meet minimum output at given flow temp
  export function suggestHeatPumps(minOutputKw: number, flowTemp: number): HeatPump[] {
    return HEAT_PUMPS
      .filter(hp => getHpOutput(hp, flowTemp) >= minOutputKw)
      .sort((a, b) => getHpOutput(a, flowTemp) - getHpOutput(b, flowTemp))
  }