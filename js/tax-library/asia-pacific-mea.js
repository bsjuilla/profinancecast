/* ============================================================
   asia-pacific-mea.js
   PFC Tax Library — Asia-Pacific, Middle East & Africa
   2025/2026 brackets where confident; flat-approx otherwise.
   Single-filer assumption. Pure JS IIFE. Estimates only.
   ============================================================ */
(function () {
  if (typeof window === 'undefined') return;
  window.PFCTaxLibrary = window.PFCTaxLibrary || { countries: {} };

  Object.assign(window.PFCTaxLibrary.countries, {

    /* ===================== ASIA-PACIFIC ===================== */

    AU: {
      name: 'Australia',
      currency: 'AUD',
      symbol: 'A$',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 18200,   rate: 0      },     // tax-free threshold
        { upTo: 45000,   rate: 0.16   },     // Stage-3 reformed rates 2024+
        { upTo: 135000,  rate: 0.30   },
        { upTo: 190000,  rate: 0.37   },
        { upTo: null,    rate: 0.45   }
      ],
      socialRate: 0.02,                      // Medicare levy 2% (most earners)
      notes: 'Federal income tax only — Australia has no state income tax. Medicare levy 2% on most earners. Medicare Levy Surcharge (1–1.5%) and HECS/HELP not modeled.'
    },

    NZ: {
      name: 'New Zealand',
      currency: 'NZD',
      symbol: 'NZ$',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 15600,   rate: 0.105 },
        { upTo: 53500,   rate: 0.175 },
        { upTo: 78100,   rate: 0.30  },
        { upTo: 180000,  rate: 0.33  },
        { upTo: null,    rate: 0.39  }
      ],
      socialRate: 0.0153,                    // ACC earner levy ~1.53%
      socialCap: 152790,                     // ACC earner levy cap (NZD/year, ~2025)
      notes: 'No general social security contributions; ACC earner levy ~1.53% capped. KiwiSaver is opt-in (3% employee default) and not included.'
    },

    JP: {
      name: 'Japan',
      currency: 'JPY',
      symbol: '¥',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 1950000,    rate: 0.05  },
        { upTo: 3300000,    rate: 0.10  },
        { upTo: 6950000,    rate: 0.20  },
        { upTo: 9000000,    rate: 0.23  },
        { upTo: 18000000,   rate: 0.33  },
        { upTo: 40000000,   rate: 0.40  },
        { upTo: null,       rate: 0.45  }
      ],
      socialRate: 0.15,                      // Health + pension + employment ~14-15% employee
      notes: 'National income tax brackets shown. Resident tax (~10% flat) and 2.1% reconstruction surtax not separately modeled — approximated within socialRate. Social insurance ~15% employee portion (health + pension + employment).'
    },

    KR: {
      name: 'South Korea',
      currency: 'KRW',
      symbol: '₩',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 14000000,    rate: 0.06  },
        { upTo: 50000000,    rate: 0.15  },
        { upTo: 88000000,    rate: 0.24  },
        { upTo: 150000000,   rate: 0.35  },
        { upTo: 300000000,   rate: 0.38  },
        { upTo: 500000000,   rate: 0.40  },
        { upTo: 1000000000,  rate: 0.42  },
        { upTo: null,        rate: 0.45  }
      ],
      socialRate: 0.092,                     // NPS 4.5% + NHI ~3.5% + EI 0.9% employee
      notes: 'National income tax. Local income tax 10% of national tax not separately modeled. Social insurance ~9% employee (national pension, national health, employment insurance).'
    },

    CN: {
      name: 'China (Mainland)',
      currency: 'CNY',
      symbol: '¥',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 36000,    rate: 0.03 },
        { upTo: 144000,   rate: 0.10 },
        { upTo: 300000,   rate: 0.20 },
        { upTo: 420000,   rate: 0.25 },
        { upTo: 660000,   rate: 0.30 },
        { upTo: 960000,   rate: 0.35 },
        { upTo: null,     rate: 0.45 }
      ],
      socialRate: 0.105,                     // Pension 8% + medical 2% + unemp 0.5% (typical)
      notes: 'IIT brackets apply to taxable income after CNY 60,000 standard deduction (not modeled here — apply to gross above 60k). Social insurance ~10–11% employee, varies by city. Housing fund (5–12%) not included.'
    },

    HK: {
      name: 'Hong Kong',
      currency: 'HKD',
      symbol: 'HK$',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 50000,    rate: 0.02  },
        { upTo: 100000,   rate: 0.06  },
        { upTo: 150000,   rate: 0.10  },
        { upTo: 200000,   rate: 0.14  },
        { upTo: null,     rate: 0.17  }
      ],
      socialRate: 0.05,                      // MPF 5% capped
      socialCap: 360000,                     // MPF relevant income cap HKD 30k/month
      notes: 'Salaries tax: lower of progressive (shown) vs standard rate 15% on net income — engine uses progressive. HKD 132,000 basic allowance not modeled. MPF 5% employee (capped at HKD 1,500/month).'
    },

    TW: {
      name: 'Taiwan',
      currency: 'TWD',
      symbol: 'NT$',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 590000,    rate: 0.05 },
        { upTo: 1330000,   rate: 0.12 },
        { upTo: 2660000,   rate: 0.20 },
        { upTo: 4980000,   rate: 0.30 },
        { upTo: null,      rate: 0.40 }
      ],
      socialRate: 0.055,                     // Labor + health insurance ~5.5% employee
      notes: 'Standard deduction (TWD 131k) and personal exemption not modeled. Labor insurance + national health insurance ~5–6% employee.'
    },

    SG: {
      name: 'Singapore',
      currency: 'SGD',
      symbol: 'S$',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 20000,    rate: 0      },
        { upTo: 30000,    rate: 0.02   },
        { upTo: 40000,    rate: 0.035  },
        { upTo: 80000,    rate: 0.07   },
        { upTo: 120000,   rate: 0.115  },
        { upTo: 160000,   rate: 0.15   },
        { upTo: 200000,   rate: 0.18   },
        { upTo: 240000,   rate: 0.19   },
        { upTo: 280000,   rate: 0.195  },
        { upTo: 320000,   rate: 0.20   },
        { upTo: 500000,   rate: 0.22   },
        { upTo: 1000000,  rate: 0.23   },
        { upTo: null,     rate: 0.24   }
      ],
      socialRate: 0.20,                      // CPF employee 20% (under-55 standard)
      socialCap: 102000,                     // CPF wage ceiling SGD/year (2026)
      notes: 'CPF rates step down for older workers — modeled at standard <55 rate. Singapore citizens & PRs only; foreigners contribute 0%.'
    },

    MY: {
      name: 'Malaysia',
      currency: 'MYR',
      symbol: 'RM',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 5000,      rate: 0     },
        { upTo: 20000,     rate: 0.01  },
        { upTo: 35000,     rate: 0.03  },
        { upTo: 50000,     rate: 0.06  },
        { upTo: 70000,     rate: 0.11  },
        { upTo: 100000,    rate: 0.19  },
        { upTo: 400000,    rate: 0.25  },
        { upTo: 600000,    rate: 0.26  },
        { upTo: 2000000,   rate: 0.28  },
        { upTo: null,      rate: 0.30  }
      ],
      socialRate: 0.115,                     // EPF 11% + SOCSO 0.5%
      notes: 'EPF 11% employee + SOCSO ~0.5% + EIS 0.2% on capped wages. Personal relief MYR 9,000 not modeled.'
    },

    TH: {
      name: 'Thailand',
      currency: 'THB',
      symbol: '฿',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 150000,    rate: 0     },
        { upTo: 300000,    rate: 0.05  },
        { upTo: 500000,    rate: 0.10  },
        { upTo: 750000,    rate: 0.15  },
        { upTo: 1000000,   rate: 0.20  },
        { upTo: 2000000,   rate: 0.25  },
        { upTo: 5000000,   rate: 0.30  },
        { upTo: null,      rate: 0.35  }
      ],
      socialRate: 0.05,                      // SSO 5% capped
      socialCap: 180000,                     // SSO cap THB 15,000/month
      notes: 'Personal allowance THB 60,000 + 50% employment expense (capped 100k) not modeled. Social security 5% capped at THB 750/month.'
    },

    ID: {
      name: 'Indonesia',
      currency: 'IDR',
      symbol: 'Rp',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 60000000,    rate: 0.05 },
        { upTo: 250000000,   rate: 0.15 },
        { upTo: 500000000,   rate: 0.25 },
        { upTo: 5000000000,  rate: 0.30 },
        { upTo: null,        rate: 0.35 }
      ],
      socialRate: 0.04,                      // BPJS Kesehatan 1% + Ketenagakerjaan ~3%
      notes: 'PTKP (non-taxable income) IDR 54M for single not modeled — apply rates above that threshold. BPJS health 1% + employment ~2-3% employee.'
    },

    PH: {
      name: 'Philippines',
      currency: 'PHP',
      symbol: '₱',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 250000,    rate: 0     },
        { upTo: 400000,    rate: 0.15  },
        { upTo: 800000,    rate: 0.20  },
        { upTo: 2000000,   rate: 0.25  },
        { upTo: 8000000,   rate: 0.30  },
        { upTo: null,      rate: 0.35  }
      ],
      socialRate: 0.06,                      // SSS 4.5% + PhilHealth 2.5% + Pag-IBIG (combined ~6% employee)
      notes: 'TRAIN law brackets effective 2023+. SSS, PhilHealth, Pag-IBIG combined employee share ~6% (capped on each).'
    },

    VN: {
      name: 'Vietnam',
      currency: 'VND',
      symbol: '₫',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 60000000,    rate: 0.05 },
        { upTo: 120000000,   rate: 0.10 },
        { upTo: 216000000,   rate: 0.15 },
        { upTo: 384000000,   rate: 0.20 },
        { upTo: 624000000,   rate: 0.25 },
        { upTo: 960000000,   rate: 0.30 },
        { upTo: null,        rate: 0.35 }
      ],
      socialRate: 0.105,                     // SI 8% + HI 1.5% + UI 1% = 10.5% employee
      notes: 'Personal deduction VND 11M/month + dependent VND 4.4M not modeled. Social/health/unemployment insurance 10.5% employee on capped wages.'
    },

    IN: {
      name: 'India (New Regime)',
      currency: 'INR',
      symbol: '₹',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 300000,    rate: 0     },
        { upTo: 600000,    rate: 0.05  },
        { upTo: 900000,    rate: 0.10  },
        { upTo: 1200000,   rate: 0.15  },
        { upTo: 1500000,   rate: 0.20  },
        { upTo: null,      rate: 0.30  }
      ],
      socialRate: 0.12,                      // EPF 12% on basic salary
      notes: 'New regime (default 2024+) — no deductions, lower rates. Section 87A rebate (full tax refund up to INR 7L) not modeled. 4% Health & Education cess on tax not separately added. EPF 12% on basic component (~50% of CTC typically). State professional tax ignored.'
    },

    PK: {
      name: 'Pakistan',
      currency: 'PKR',
      symbol: 'Rs',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 600000,    rate: 0     },
        { upTo: 1200000,   rate: 0.05  },
        { upTo: 2200000,   rate: 0.15  },
        { upTo: 3200000,   rate: 0.25  },
        { upTo: 4100000,   rate: 0.30  },
        { upTo: null,      rate: 0.35  }
      ],
      socialRate: 0.01,                      // EOBI ~1% (small flat capped contribution)
      notes: 'FY 2024-25 salaried slabs. EOBI contribution token amount (~PKR 370/month). 10% surcharge applies above PKR 10M not separately modeled.'
    },

    BD: {
      name: 'Bangladesh',
      currency: 'BDT',
      symbol: '৳',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 350000,    rate: 0     },
        { upTo: 450000,    rate: 0.05  },
        { upTo: 750000,    rate: 0.10  },
        { upTo: 1150000,   rate: 0.15  },
        { upTo: 1650000,   rate: 0.20  },
        { upTo: null,      rate: 0.25  },
        { upTo: null,      rate: 0.30  }
      ],
      socialRate: 0,
      notes: 'No mandatory social security contributions for private-sector employees. Top rate 30% applies above BDT 38.5L (collapsed to 25% for simplicity at this approximation).'
    },

    LK: {
      name: 'Sri Lanka',
      currency: 'LKR',
      symbol: 'Rs',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 1200000,    rate: 0     },
        { upTo: 1700000,    rate: 0.06  },
        { upTo: 2200000,    rate: 0.12  },
        { upTo: 2700000,    rate: 0.18  },
        { upTo: 3200000,    rate: 0.24  },
        { upTo: 3700000,    rate: 0.30  },
        { upTo: null,       rate: 0.36  }
      ],
      socialRate: 0.08,                      // EPF 8% employee
      notes: 'APIT slabs from 2025/26. EPF 8% employee + ETF 3% employer. Tax-free threshold LKR 1.2M.'
    },

    NP: {
      name: 'Nepal',
      currency: 'NPR',
      symbol: 'Rs',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 500000,    rate: 0.01  },     // 1% social security tax on first slab
        { upTo: 700000,    rate: 0.10  },
        { upTo: 1000000,   rate: 0.20  },
        { upTo: 2000000,   rate: 0.30  },
        { upTo: 5000000,   rate: 0.36  },
        { upTo: null,      rate: 0.39  }
      ],
      socialRate: 0.11,                      // SSF 11% employee (or PF 10%)
      notes: 'Single-filer slabs (married thresholds higher). 1% on first slab is social security tax. SSF contribution 11% employee (or Provident Fund equivalent).'
    },

    /* ===================== MIDDLE EAST ===================== */

    AE: {
      name: 'United Arab Emirates',
      currency: 'AED',
      symbol: 'AED',
      hasRegions: false,
      kind: 'flat',
      flatRate: 0,
      socialRate: 0,                         // 5% GPSSA for nationals only; expats 0
      notes: 'No personal income tax. GPSSA 5% applies to UAE/GCC nationals only — set 0 for expat majority. 9% corporate tax above AED 375k applies to businesses, not individuals.'
    },

    SA: {
      name: 'Saudi Arabia',
      currency: 'SAR',
      symbol: 'SAR',
      hasRegions: false,
      kind: 'flat',
      flatRate: 0,
      socialRate: 0,                         // GOSI 9.75% for Saudis only; expats 0
      notes: 'No personal income tax on wages. GOSI 9.75% for Saudi nationals; expats pay 0 (occupational hazard 0% employee). Set socialRate to 0.0975 for Saudi nationals.'
    },

    QA: {
      name: 'Qatar',
      currency: 'QAR',
      symbol: 'QAR',
      hasRegions: false,
      kind: 'flat',
      flatRate: 0,
      socialRate: 0,
      notes: 'No personal income tax. Social insurance 5% for Qatari nationals only; expats 0.'
    },

    KW: {
      name: 'Kuwait',
      currency: 'KWD',
      symbol: 'KD',
      hasRegions: false,
      kind: 'flat',
      flatRate: 0,
      socialRate: 0,
      notes: 'No personal income tax. Social security 8% for Kuwaiti nationals only; expats 0.'
    },

    OM: {
      name: 'Oman',
      currency: 'OMR',
      symbol: 'OMR',
      hasRegions: false,
      kind: 'flat',
      flatRate: 0,
      socialRate: 0,
      notes: 'No personal income tax (announced 5% income tax above OMR 42k from 2028 not yet effective). Social insurance 7% for Omani nationals only; expats 0.'
    },

    BH: {
      name: 'Bahrain',
      currency: 'BHD',
      symbol: 'BD',
      hasRegions: false,
      kind: 'flat',
      flatRate: 0,
      socialRate: 0.01,                      // SIO 1% unemployment contribution (all workers)
      notes: 'No personal income tax. SIO 1% unemployment for all workers; additional 7% pension for Bahraini nationals only.'
    },

    IL: {
      name: 'Israel',
      currency: 'ILS',
      symbol: '₪',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 84120,    rate: 0.10 },
        { upTo: 120720,   rate: 0.14 },
        { upTo: 193800,   rate: 0.20 },
        { upTo: 269280,   rate: 0.31 },
        { upTo: 560280,   rate: 0.35 },
        { upTo: 721560,   rate: 0.47 },
        { upTo: null,     rate: 0.50 }       // includes 3% surtax above ~ILS 721k
      ],
      socialRate: 0.12,                      // Bituach Leumi + health insurance employee combined ~12%
      notes: '2025 brackets. Personal credit points (~ILS 2,904 each) not modeled. National insurance + health combined ~12% employee at typical wages (lower below threshold, higher above).'
    },

    TR: {
      name: 'Turkey',
      currency: 'TRY',
      symbol: '₺',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 158000,    rate: 0.15 },
        { upTo: 330000,    rate: 0.20 },
        { upTo: 1200000,   rate: 0.27 },
        { upTo: 4300000,   rate: 0.35 },
        { upTo: null,      rate: 0.40 }
      ],
      socialRate: 0.15,                      // SGK 14% + unemployment 1%
      notes: '2025 employment income brackets (different thresholds for non-employment income). SGK 14% + unemployment 1% employee on capped wages.'
    },

    JO: {
      name: 'Jordan',
      currency: 'JOD',
      symbol: 'JD',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 9000,    rate: 0     },        // first JOD 9k after personal exemption
        { upTo: 14000,   rate: 0.05  },
        { upTo: 19000,   rate: 0.10  },
        { upTo: 24000,   rate: 0.15  },
        { upTo: 1000000, rate: 0.20  },
        { upTo: null,    rate: 0.25  }         // + 1% national contribution above 200k
      ],
      socialRate: 0.075,                     // Social security 7.5% employee
      notes: 'Personal exemption JOD 9,000 + dependant 9,000 not modeled — bracket 0% covers first 9k. Social security 7.5% employee.'
    },

    LB: {
      name: 'Lebanon',
      currency: 'LBP',
      symbol: 'L£',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 360000000,     rate: 0.02 },
        { upTo: 900000000,     rate: 0.04 },
        { upTo: 1800000000,    rate: 0.07 },
        { upTo: 3600000000,    rate: 0.11 },
        { upTo: 7200000000,    rate: 0.15 },
        { upTo: 13500000000,   rate: 0.20 },
        { upTo: null,          rate: 0.25 }
      ],
      socialRate: 0.03,                      // NSSF medical 3% (capped)
      notes: 'Salary tax brackets revised 2024 post-devaluation (LBP). Bands expressed in LBP — apply to gross wages. NSSF medical 3% capped + family allowance 0% employee.'
    },

    /* ===================== AFRICA ===================== */

    ZA: {
      name: 'South Africa',
      currency: 'ZAR',
      symbol: 'R',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 237100,    rate: 0.18 },
        { upTo: 370500,    rate: 0.26 },
        { upTo: 512800,    rate: 0.31 },
        { upTo: 673000,    rate: 0.36 },
        { upTo: 857900,    rate: 0.39 },
        { upTo: 1817000,   rate: 0.41 },
        { upTo: null,      rate: 0.45 }
      ],
      socialRate: 0.01,                      // UIF 1% capped
      notes: '2025/26 SARS brackets. Primary rebate ZAR 17,235 (under 65) reduces tax — not modeled. UIF 1% employee capped at ZAR 17,712/month.'
    },

    EG: {
      name: 'Egypt',
      currency: 'EGP',
      symbol: 'E£',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 40000,     rate: 0     },
        { upTo: 55000,     rate: 0.10  },
        { upTo: 70000,     rate: 0.15  },
        { upTo: 200000,    rate: 0.20  },
        { upTo: 400000,    rate: 0.225 },
        { upTo: 1200000,   rate: 0.25  },
        { upTo: null,      rate: 0.275 }
      ],
      socialRate: 0.11,                      // Social insurance 11% employee
      notes: '2024+ brackets. Personal exemption EGP 20,000 not modeled (built into 0% band approximately). Social insurance 11% on capped wages (capped at ~EGP 14,500/month).'
    },

    MA: {
      name: 'Morocco',
      currency: 'MAD',
      symbol: 'DH',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 40000,    rate: 0     },
        { upTo: 60000,    rate: 0.10  },
        { upTo: 80000,    rate: 0.20  },
        { upTo: 100000,   rate: 0.30  },
        { upTo: 180000,   rate: 0.34  },
        { upTo: null,     rate: 0.37  }
      ],
      socialRate: 0.0648,                    // CNSS 4.48% + AMO 2% employee
      notes: '2025 PAS brackets (raised from 2024 thresholds). CNSS 4.48% capped + AMO 2% uncapped employee. 30% professional expense deduction (capped) not modeled.'
    },

    TN: {
      name: 'Tunisia',
      currency: 'TND',
      symbol: 'DT',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 5000,     rate: 0     },
        { upTo: 10000,    rate: 0.15  },
        { upTo: 20000,    rate: 0.25  },
        { upTo: 30000,    rate: 0.30  },
        { upTo: 40000,    rate: 0.33  },
        { upTo: 50000,    rate: 0.36  },
        { upTo: 70000,    rate: 0.38  },
        { upTo: null,     rate: 0.40  }
      ],
      socialRate: 0.0918,                    // CNSS 9.18% employee
      notes: '2025 brackets (revised Finance Law 2025). CNSS 9.18% employee. Social solidarity contribution 1% on tax above threshold not modeled.'
    },

    DZ: {
      name: 'Algeria',
      currency: 'DZD',
      symbol: 'DA',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 240000,    rate: 0     },
        { upTo: 480000,    rate: 0.23  },
        { upTo: 960000,    rate: 0.27  },
        { upTo: 1920000,   rate: 0.30  },
        { upTo: 3840000,   rate: 0.33  },
        { upTo: null,      rate: 0.35  }
      ],
      socialRate: 0.09,                      // CNAS 9% employee
      notes: 'IRG salary brackets 2022+ (LFC 2022 reform). CNAS 9% employee social security.'
    },

    MU: {
      name: 'Mauritius',
      currency: 'MUR',
      symbol: 'Rs',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 390000,    rate: 0     },
        { upTo: 430000,    rate: 0.02  },
        { upTo: 470000,    rate: 0.04  },
        { upTo: 530000,    rate: 0.06  },
        { upTo: 590000,    rate: 0.08  },
        { upTo: 890000,    rate: 0.10  },
        { upTo: 1190000,   rate: 0.12  },
        { upTo: 1490000,   rate: 0.14  },
        { upTo: 1890000,   rate: 0.16  },
        { upTo: 2390000,   rate: 0.18  },
        { upTo: null,      rate: 0.20  }
      ],
      socialRate: 0.03,                      // CSG 3% employee on basic salary
      notes: 'MRA 2024/25 progressive bands replacing prior flat-15% regime. CSG (Contribution Sociale Generalisee) 3% employee on monthly basic up to MUR 50k, 6% above.'
    },

    KE: {
      name: 'Kenya',
      currency: 'KES',
      symbol: 'KSh',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 288000,     rate: 0.10 },
        { upTo: 388000,     rate: 0.25 },
        { upTo: 6000000,    rate: 0.30 },
        { upTo: 9600000,    rate: 0.325 },
        { upTo: null,       rate: 0.35 }
      ],
      socialRate: 0.0775,                    // NSSF 6% (Tier I+II, capped) + SHIF 2.75%
      notes: '2024+ PAYE brackets (Finance Act 2023 added 32.5%/35% top tiers). Personal relief KES 2,400/month not modeled. NSSF Tier I+II 6% capped at KES 4,320/month + SHIF 2.75% replaced NHIF.'
    },

    NG: {
      name: 'Nigeria',
      currency: 'NGN',
      symbol: '₦',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 300000,     rate: 0.07 },
        { upTo: 600000,     rate: 0.11 },
        { upTo: 1100000,    rate: 0.15 },
        { upTo: 1600000,    rate: 0.19 },
        { upTo: 3200000,    rate: 0.21 },
        { upTo: null,       rate: 0.24 }
      ],
      socialRate: 0.105,                     // Pension 8% + NHF 2.5%
      notes: 'PIT Act bands (taxable income after consolidated relief allowance — CRA = NGN 200k + 20% of gross — not modeled). Pension 8% + National Housing Fund 2.5% employee.'
    },

    GH: {
      name: 'Ghana',
      currency: 'GHS',
      symbol: 'GH₵',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 5880,      rate: 0     },
        { upTo: 7200,      rate: 0.05  },
        { upTo: 8760,      rate: 0.10  },
        { upTo: 47760,     rate: 0.175 },
        { upTo: 243960,    rate: 0.25  },
        { upTo: 600000,    rate: 0.30  },
        { upTo: null,      rate: 0.35  }
      ],
      socialRate: 0.055,                     // SSNIT Tier 1 5.5% employee
      notes: '2024 GRA annual brackets (top 35% added Q1 2024). SSNIT Tier 1 5.5% employee + Tier 2 5% mandatory occupational (not separately modeled).'
    },

    ET: {
      name: 'Ethiopia',
      currency: 'ETB',
      symbol: 'Br',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 7200,      rate: 0     },
        { upTo: 19200,     rate: 0.10  },
        { upTo: 38400,     rate: 0.15  },
        { upTo: 84000,     rate: 0.20  },
        { upTo: 126000,    rate: 0.25  },
        { upTo: 162000,    rate: 0.30  },
        { upTo: null,      rate: 0.35  }
      ],
      socialRate: 0.07,                      // Pension 7% private-sector employee
      notes: 'Annualized monthly PAYE bands. Pension 7% private-sector employee (11% public). No personal allowance — first ETB 600/month exempt is built into 0% band.'
    },

    TZ: {
      name: 'Tanzania',
      currency: 'TZS',
      symbol: 'TSh',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 3240000,    rate: 0     },
        { upTo: 6240000,    rate: 0.09  },
        { upTo: 9120000,    rate: 0.20  },
        { upTo: 12000000,   rate: 0.25  },
        { upTo: null,       rate: 0.30  }
      ],
      socialRate: 0.10,                      // NSSF/PSSSF 10% employee
      notes: 'TRA PAYE annual bands (TZS 270k/month threshold). NSSF or PSSSF 10% employee mandatory.'
    }

  });
})();
