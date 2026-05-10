/* ============================================================
   tax-library/americas.js
   Americas section of the global PFC tax-rate library.
   Pure-JS IIFE — adds country entries to window.PFCTaxLibrary.countries.
   Tax data: 2025/2026 representative figures. All figures are
   estimates for planning. Not tax advice. Single-filer assumptions.
   ============================================================ */
(function () {
  if (typeof window === 'undefined') return;
  window.PFCTaxLibrary = window.PFCTaxLibrary || { countries: {} };

  Object.assign(window.PFCTaxLibrary.countries, {

    /* ---------- United States ---------- */
    US: {
      name: 'United States',
      currency: 'USD',
      symbol: '$',
      hasRegions: true,
      kind: 'progressive',
      brackets: [
        /* 2026 federal single-filer (projected, inflation-adjusted from IRS 2025) */
        { upTo: 11925,  rate: 0.10 },
        { upTo: 48475,  rate: 0.12 },
        { upTo: 103350, rate: 0.22 },
        { upTo: 197300, rate: 0.24 },
        { upTo: 250525, rate: 0.32 },
        { upTo: 626350, rate: 0.35 },
        { upTo: null,   rate: 0.37 }
      ],
      socialRate: 0.0765,        // FICA: SS 6.2% + Medicare 1.45%
      socialCap: 176100,         // SS wage base 2026
      regions: {
        /* State rates mirror js/pfc-tax-engine.js#US_STATES — must stay in sync. */
        AL: { name: 'Alabama',         rate: 0.045,  note: 'approx middle bracket' },
        AK: { name: 'Alaska',          rate: 0.000,  note: 'no state income tax' },
        AZ: { name: 'Arizona',         rate: 0.025,  note: 'flat rate (2026)' },
        AR: { name: 'Arkansas',        rate: 0.039,  note: 'approx top bracket' },
        CA: { name: 'California',      rate: 0.060,  note: 'approx middle bracket' },
        CO: { name: 'Colorado',        rate: 0.044,  note: 'flat rate' },
        CT: { name: 'Connecticut',     rate: 0.050,  note: 'approx middle bracket' },
        DE: { name: 'Delaware',        rate: 0.052,  note: 'approx middle bracket' },
        DC: { name: 'District of Columbia', rate: 0.0675, note: 'approx middle bracket' },
        FL: { name: 'Florida',         rate: 0.000,  note: 'no state income tax' },
        GA: { name: 'Georgia',         rate: 0.0539, note: 'flat rate (2026)' },
        HI: { name: 'Hawaii',          rate: 0.072,  note: 'approx middle bracket' },
        ID: { name: 'Idaho',           rate: 0.058,  note: 'flat rate' },
        IL: { name: 'Illinois',        rate: 0.0495, note: 'flat rate' },
        IN: { name: 'Indiana',         rate: 0.0305, note: 'flat rate' },
        IA: { name: 'Iowa',            rate: 0.038,  note: 'flat rate (2026)' },
        KS: { name: 'Kansas',          rate: 0.052,  note: 'approx middle bracket' },
        KY: { name: 'Kentucky',        rate: 0.040,  note: 'flat rate (2026)' },
        LA: { name: 'Louisiana',       rate: 0.030,  note: 'flat rate (2025+)' },
        ME: { name: 'Maine',           rate: 0.0675, note: 'approx middle bracket' },
        MD: { name: 'Maryland',        rate: 0.0475, note: 'approx middle bracket' },
        MA: { name: 'Massachusetts',   rate: 0.050,  note: 'flat rate' },
        MI: { name: 'Michigan',        rate: 0.0425, note: 'flat rate' },
        MN: { name: 'Minnesota',       rate: 0.068,  note: 'approx middle bracket' },
        MS: { name: 'Mississippi',     rate: 0.044,  note: 'flat rate (2026)' },
        MO: { name: 'Missouri',        rate: 0.047,  note: 'approx top bracket' },
        MT: { name: 'Montana',         rate: 0.059,  note: 'approx top bracket' },
        NE: { name: 'Nebraska',        rate: 0.052,  note: 'approx middle bracket' },
        NV: { name: 'Nevada',          rate: 0.000,  note: 'no state income tax' },
        NH: { name: 'New Hampshire',   rate: 0.000,  note: 'no wage tax (interest/dividends only)' },
        NJ: { name: 'New Jersey',      rate: 0.0637, note: 'approx middle bracket' },
        NM: { name: 'New Mexico',      rate: 0.049,  note: 'approx middle bracket' },
        NY: { name: 'New York',        rate: 0.055,  note: 'approx middle bracket' },
        NC: { name: 'North Carolina',  rate: 0.0425, note: 'flat rate (2026)' },
        ND: { name: 'North Dakota',    rate: 0.0204, note: 'approx top bracket' },
        OH: { name: 'Ohio',            rate: 0.035,  note: 'approx top bracket' },
        OK: { name: 'Oklahoma',        rate: 0.0475, note: 'approx top bracket' },
        OR: { name: 'Oregon',          rate: 0.088,  note: 'approx middle bracket' },
        PA: { name: 'Pennsylvania',    rate: 0.0307, note: 'flat rate' },
        RI: { name: 'Rhode Island',    rate: 0.0475, note: 'approx middle bracket' },
        SC: { name: 'South Carolina',  rate: 0.062,  note: 'approx top bracket' },
        SD: { name: 'South Dakota',    rate: 0.000,  note: 'no state income tax' },
        TN: { name: 'Tennessee',       rate: 0.000,  note: 'no wage tax (interest/dividends only)' },
        TX: { name: 'Texas',           rate: 0.000,  note: 'no state income tax' },
        UT: { name: 'Utah',            rate: 0.0455, note: 'flat rate (2026)' },
        VT: { name: 'Vermont',         rate: 0.066,  note: 'approx middle bracket' },
        VA: { name: 'Virginia',        rate: 0.0575, note: 'approx top bracket' },
        WA: { name: 'Washington',      rate: 0.000,  note: 'no state income tax' },
        WV: { name: 'West Virginia',   rate: 0.0482, note: 'approx middle bracket' },
        WI: { name: 'Wisconsin',       rate: 0.053,  note: 'approx middle bracket' },
        WY: { name: 'Wyoming',         rate: 0.000,  note: 'no state income tax' }
      },
      notes: 'Federal single-filer brackets (2026 projected). Married-filing-jointly not modeled. State rate is flat-effective approximation; progressive states approximated at typical middle/top bracket. Mirrors js/pfc-tax-engine.js#US_STATES.'
    },

    /* ---------- Canada ---------- */
    CA: {
      name: 'Canada',
      currency: 'CAD',
      symbol: 'CA$',
      hasRegions: true,
      kind: 'progressive',
      brackets: [
        /* Federal 2025 brackets — applied before provincial */
        { upTo: 57375,   rate: 0.15  },
        { upTo: 114750,  rate: 0.205 },
        { upTo: 177882,  rate: 0.26  },
        { upTo: 253414,  rate: 0.29  },
        { upTo: null,    rate: 0.33  }
      ],
      socialRate: 0.0566,         // CPP 5.95% + EI ~1.66% combined approx (employee portion)
      socialCap: 71300,           // CPP YMPE 2025
      regions: {
        ON: { name: 'Ontario',          kind: 'progressive', brackets: [
          { upTo: 51446,  rate: 0.0505 },
          { upTo: 102894, rate: 0.0915 },
          { upTo: 150000, rate: 0.1116 },
          { upTo: 220000, rate: 0.1216 },
          { upTo: null,   rate: 0.1316 }
        ]},
        QC: { name: 'Quebec',           kind: 'progressive', brackets: [
          { upTo: 53255,  rate: 0.14 },
          { upTo: 106495, rate: 0.19 },
          { upTo: 129590, rate: 0.24 },
          { upTo: null,   rate: 0.2575 }
        ], note: 'Quebec also runs RRQ instead of CPP — contribution structure differs.' },
        BC: { name: 'British Columbia', kind: 'progressive', brackets: [
          { upTo: 49279,  rate: 0.0506 },
          { upTo: 98560,  rate: 0.077  },
          { upTo: 113158, rate: 0.105  },
          { upTo: 137407, rate: 0.1229 },
          { upTo: 186306, rate: 0.147  },
          { upTo: 259829, rate: 0.168  },
          { upTo: null,   rate: 0.205  }
        ]},
        AB: { name: 'Alberta',          kind: 'progressive', brackets: [
          { upTo: 151234, rate: 0.10 },
          { upTo: 181481, rate: 0.12 },
          { upTo: 241974, rate: 0.13 },
          { upTo: 362961, rate: 0.14 },
          { upTo: null,   rate: 0.15 }
        ]},
        MB: { name: 'Manitoba',         kind: 'progressive', brackets: [
          { upTo: 47000,  rate: 0.108 },
          { upTo: 100000, rate: 0.1275 },
          { upTo: null,   rate: 0.174 }
        ]},
        SK: { name: 'Saskatchewan',     kind: 'progressive', brackets: [
          { upTo: 53463,  rate: 0.105 },
          { upTo: 152750, rate: 0.125 },
          { upTo: null,   rate: 0.145 }
        ]},
        NS: { name: 'Nova Scotia',      kind: 'progressive', brackets: [
          { upTo: 30507,  rate: 0.0879 },
          { upTo: 61015,  rate: 0.1495 },
          { upTo: 95883,  rate: 0.1667 },
          { upTo: 154650, rate: 0.175  },
          { upTo: null,   rate: 0.21   }
        ]},
        NB: { name: 'New Brunswick',    kind: 'progressive', brackets: [
          { upTo: 51306,  rate: 0.094 },
          { upTo: 102614, rate: 0.14  },
          { upTo: 190060, rate: 0.16  },
          { upTo: null,   rate: 0.195 }
        ]},
        NL: { name: 'Newfoundland and Labrador', kind: 'progressive', brackets: [
          { upTo: 44192,   rate: 0.087  },
          { upTo: 88382,   rate: 0.145  },
          { upTo: 157792,  rate: 0.158  },
          { upTo: 220910,  rate: 0.178  },
          { upTo: 282214,  rate: 0.198  },
          { upTo: 564429,  rate: 0.208  },
          { upTo: 1128858, rate: 0.213  },
          { upTo: null,    rate: 0.218  }
        ]},
        PE: { name: 'Prince Edward Island', kind: 'progressive', brackets: [
          { upTo: 33328,  rate: 0.095  },
          { upTo: 64656,  rate: 0.1347 },
          { upTo: 105000, rate: 0.166  },
          { upTo: 140000, rate: 0.1762 },
          { upTo: null,   rate: 0.19   }
        ]},
        YT: { name: 'Yukon',            kind: 'progressive', brackets: [
          { upTo: 57375,  rate: 0.064 },
          { upTo: 114750, rate: 0.09  },
          { upTo: 177882, rate: 0.109 },
          { upTo: 500000, rate: 0.128 },
          { upTo: null,   rate: 0.15  }
        ]},
        NT: { name: 'Northwest Territories', kind: 'progressive', brackets: [
          { upTo: 51964,  rate: 0.059  },
          { upTo: 103930, rate: 0.086  },
          { upTo: 168967, rate: 0.122  },
          { upTo: null,   rate: 0.1405 }
        ]},
        NU: { name: 'Nunavut',          kind: 'progressive', brackets: [
          { upTo: 54707,  rate: 0.04 },
          { upTo: 109413, rate: 0.07 },
          { upTo: 177881, rate: 0.09 },
          { upTo: null,   rate: 0.115 }
        ]}
      },
      notes: 'Provincial brackets are stacked on top of federal — total marginal rate = federal + provincial. Quebec runs RRQ (Regime de rentes du Quebec) instead of CPP; QPIP also adds ~0.494% employee. 2025 figures.'
    },

    /* ---------- Mexico ---------- */
    MX: {
      name: 'Mexico',
      currency: 'MXN',
      symbol: 'MX$',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        /* ISR 2025 simplified bands (annual, MXN) */
        { upTo: 8952,     rate: 0.0192 },
        { upTo: 75984,    rate: 0.064  },
        { upTo: 133536,   rate: 0.1088 },
        { upTo: 155229,   rate: 0.16   },
        { upTo: 185852,   rate: 0.1792 },
        { upTo: 374837,   rate: 0.2136 },
        { upTo: 590795,   rate: 0.2352 },
        { upTo: 1127926,  rate: 0.30   },
        { upTo: 1503902,  rate: 0.32   },
        { upTo: 4511707,  rate: 0.34   },
        { upTo: null,     rate: 0.35   }
      ],
      socialRate: 0.025,           // IMSS employee portion approx (varies by salary band)
      notes: 'ISR (Impuesto sobre la Renta) 2025 federal brackets, employee. Subsidio para el empleo not modeled. State payroll taxes paid by employer; not modeled.'
    },

    /* ---------- Brazil ---------- */
    BR: {
      name: 'Brazil',
      currency: 'BRL',
      symbol: 'R$',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        /* IRPF 2025 monthly thresholds annualized (x12) */
        { upTo: 26963.20,  rate: 0.00  },
        { upTo: 33919.80,  rate: 0.075 },
        { upTo: 45012.60,  rate: 0.15  },
        { upTo: 55976.16,  rate: 0.225 },
        { upTo: null,      rate: 0.275 }
      ],
      socialRate: 0.11,            // INSS employee portion approx (capped); progressive 7.5%-14%
      socialCap: 95058.36,         // INSS ceiling 2025 annualized
      notes: 'IRPF (Imposto de Renda Pessoa Fisica) 2025. INSS is actually progressive 7.5/9/12/14% with cap; 11% used as effective approximation.'
    },

    /* ---------- Argentina ---------- */
    AR: {
      name: 'Argentina',
      currency: 'ARS',
      symbol: 'AR$',
      hasRegions: false,
      kind: 'flat-approx',
      rate: 0.27,
      socialRate: 0.17,            // jubilacion 11% + obra social 3% + PAMI 3%
      notes: 'Argentine Impuesto a las Ganancias is highly progressive (5-35%) with frequent inflation indexing. Flat-approx 27% used as middle-bracket effective rate.'
    },

    /* ---------- Chile ---------- */
    CL: {
      name: 'Chile',
      currency: 'CLP',
      symbol: 'CL$',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        /* Impuesto Unico de Segunda Categoria 2025 — annualized in CLP, simplified */
        { upTo: 10500000,  rate: 0.00  },
        { upTo: 23300000,  rate: 0.04  },
        { upTo: 38900000,  rate: 0.08  },
        { upTo: 54400000,  rate: 0.135 },
        { upTo: 70000000,  rate: 0.23  },
        { upTo: 93400000,  rate: 0.304 },
        { upTo: 241300000, rate: 0.35  },
        { upTo: null,      rate: 0.40  }
      ],
      socialRate: 0.20,            // AFP ~10% + health 7% + unemployment ~0.6% + others
      notes: 'Annual Global Complementario approximation using monthly IUSC 2025 bands x12. Pension (AFP) and health (Isapre/Fonasa) bundled into socialRate.'
    },

    /* ---------- Colombia ---------- */
    CO: {
      name: 'Colombia',
      currency: 'COP',
      symbol: 'CO$',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        /* 2025 in UVT converted to COP at UVT=49799 (approx) */
        { upTo: 56766860,   rate: 0.00 },
        { upTo: 88842217,   rate: 0.19 },
        { upTo: 213635422,  rate: 0.28 },
        { upTo: 459248534,  rate: 0.33 },
        { upTo: 593605095,  rate: 0.35 },
        { upTo: 977019406,  rate: 0.37 },
        { upTo: null,       rate: 0.39 }
      ],
      socialRate: 0.08,            // health 4% + pension 4% (employee)
      notes: '2025 brackets in COP (converted from UVT). Income tax is computed in UVTs; values shift annually with the UVT.'
    },

    /* ---------- Peru ---------- */
    PE: {
      name: 'Peru',
      currency: 'PEN',
      symbol: 'S/',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        /* 2025 in UIT (S/5,350). Bands in PEN */
        { upTo: 26750,   rate: 0.08 },
        { upTo: 107000,  rate: 0.14 },
        { upTo: 187250,  rate: 0.17 },
        { upTo: 240750,  rate: 0.20 },
        { upTo: null,    rate: 0.30 }
      ],
      socialRate: 0.13,            // ONP 13% or AFP ~12.5% + health (employer)
      notes: 'Impuesto a la Renta Quinta Categoria 2025. Bands defined in UIT (Unidad Impositiva Tributaria); UIT 2025 = S/5,350. First 7 UIT (~S/37,450) deductible from gross before applying brackets — not modeled here.'
    },

    /* ---------- Venezuela ---------- */
    VE: {
      name: 'Venezuela',
      currency: 'VES',
      symbol: 'Bs.',
      hasRegions: false,
      kind: 'flat-approx',
      rate: 0.20,
      socialRate: 0.04,            // IVSS employee approx
      notes: 'ISLR is progressive in UT (Unidades Tributarias) but extreme inflation makes UT-based brackets unstable. Flat 20% approximation. Use with caution.'
    },

    /* ---------- Uruguay ---------- */
    UY: {
      name: 'Uruguay',
      currency: 'UYU',
      symbol: 'UY$',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        /* IRPF Categoria II 2025, annualized in UYU using BPC ~6,106 */
        { upTo: 512904,   rate: 0.00 },
        { upTo: 732720,   rate: 0.10 },
        { upTo: 1099080,  rate: 0.15 },
        { upTo: 2198160,  rate: 0.24 },
        { upTo: 3663600,  rate: 0.25 },
        { upTo: 5495400,  rate: 0.27 },
        { upTo: 8425280,  rate: 0.31 },
        { upTo: null,     rate: 0.36 }
      ],
      socialRate: 0.18,            // BPS jubilacion 15% + FONASA 3-8%
      notes: 'IRPF Categoria II (labor) 2025. Bands in BPC (Base de Prestaciones y Contribuciones); BPC 2025 ~UYU 6,106.'
    },

    /* ---------- Costa Rica ---------- */
    CR: {
      name: 'Costa Rica',
      currency: 'CRC',
      symbol: 'CRC',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        /* Impuesto sobre la Renta empleados 2025 — monthly bands x12 */
        { upTo: 11164800, rate: 0.00 },
        { upTo: 16412400, rate: 0.10 },
        { upTo: 28800000, rate: 0.15 },
        { upTo: 57624000, rate: 0.20 },
        { upTo: null,     rate: 0.25 }
      ],
      socialRate: 0.1067,          // CCSS employee
      notes: 'Wage-earner brackets 2025 (monthly x12). CCSS (Caja Costarricense del Seguro Social) employee contribution ~10.67%.'
    },

    /* ---------- Panama ---------- */
    PA: {
      name: 'Panama',
      currency: 'PAB',
      symbol: 'B/.',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        /* Impuesto sobre la Renta 2025 */
        { upTo: 11000,  rate: 0.00 },
        { upTo: 50000,  rate: 0.15 },
        { upTo: null,   rate: 0.25 }
      ],
      socialRate: 0.0975,          // CSS employee
      notes: 'Panama PAB pegged 1:1 to USD. Caja del Seguro Social (CSS) employee ~9.75%; education tax adds 1.25%.'
    },

    /* ---------- Dominican Republic ---------- */
    DO: {
      name: 'Dominican Republic',
      currency: 'DOP',
      symbol: 'RD$',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        /* ISR personas fisicas 2025 */
        { upTo: 416220,  rate: 0.00 },
        { upTo: 624329,  rate: 0.15 },
        { upTo: 867123,  rate: 0.20 },
        { upTo: null,    rate: 0.25 }
      ],
      socialRate: 0.0587,          // SFS 3.04% + AFP 2.87%
      notes: 'ISR 2025 brackets. TSS (Tesoreria de la Seguridad Social) employee contributions: SFS health 3.04% + AFP pension 2.87%.'
    },

    /* ---------- Jamaica ---------- */
    JM: {
      name: 'Jamaica',
      currency: 'JMD',
      symbol: 'J$',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        /* PAYE 2025: 0% up to threshold, 25% to ~JMD 6M, 30% above */
        { upTo: 1700088, rate: 0.00 },
        { upTo: 6000000, rate: 0.25 },
        { upTo: null,    rate: 0.30 }
      ],
      socialRate: 0.055,           // NIS 3% + NHT 2% + Education tax 2.25% (employee)
      notes: 'PAYE 2025. Statutory deductions also include NIS, NHT, and Education Tax (bundled into socialRate approx).'
    },

    /* ---------- Trinidad and Tobago ---------- */
    TT: {
      name: 'Trinidad and Tobago',
      currency: 'TTD',
      symbol: 'TT$',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        /* PAYE 2025 */
        { upTo: 1000000, rate: 0.25 },
        { upTo: null,    rate: 0.30 }
      ],
      socialRate: 0.04,            // NIS employee approx
      notes: 'PAYE 2025. Personal allowance TTD 90,000 not modeled here. Health Surcharge fixed weekly amount also applies.'
    },

    /* ---------- Bolivia ---------- */
    BO: {
      name: 'Bolivia',
      currency: 'BOB',
      symbol: 'Bs',
      hasRegions: false,
      kind: 'flat-approx',
      rate: 0.13,
      socialRate: 0.1271,          // AFP 10% + RC-IVA effects + others
      notes: 'RC-IVA (Regimen Complementario al IVA) is effectively a 13% flat tax on labor income, offsetable against VAT receipts.'
    },

    /* ---------- Ecuador ---------- */
    EC: {
      name: 'Ecuador',
      currency: 'USD',
      symbol: '$',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        /* Impuesto a la Renta personas naturales 2025 (USD — Ecuador is dollarized) */
        { upTo: 11902,   rate: 0.00 },
        { upTo: 15159,   rate: 0.05 },
        { upTo: 19682,   rate: 0.10 },
        { upTo: 26031,   rate: 0.12 },
        { upTo: 34255,   rate: 0.15 },
        { upTo: 45407,   rate: 0.20 },
        { upTo: 60450,   rate: 0.25 },
        { upTo: 80605,   rate: 0.30 },
        { upTo: 107199,  rate: 0.35 },
        { upTo: null,    rate: 0.37 }
      ],
      socialRate: 0.0945,          // IESS employee
      notes: 'Ecuador uses USD. IESS (Instituto Ecuatoriano de Seguridad Social) employee contribution 9.45%.'
    },

    /* ---------- Paraguay ---------- */
    PY: {
      name: 'Paraguay',
      currency: 'PYG',
      symbol: 'Gs',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        /* IRP 2025 — three brackets above an 80M threshold */
        { upTo: 50000000,  rate: 0.00 },
        { upTo: 80000000,  rate: 0.08 },
        { upTo: 150000000, rate: 0.09 },
        { upTo: null,      rate: 0.10 }
      ],
      socialRate: 0.09,            // IPS employee
      notes: 'IRP (Impuesto a la Renta Personal) 2025. IPS (Instituto de Prevision Social) employee 9%.'
    },

    /* ---------- Guatemala ---------- */
    GT: {
      name: 'Guatemala',
      currency: 'GTQ',
      symbol: 'Q',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        /* ISR rentas del trabajo 2025 */
        { upTo: 300000, rate: 0.05 },
        { upTo: null,   rate: 0.07 }
      ],
      socialRate: 0.0483,          // IGSS employee
      notes: 'ISR rentas del trabajo 2025. IGSS (Instituto Guatemalteco de Seguridad Social) employee 4.83%.'
    },

    /* ---------- Bahamas ---------- */
    BS: {
      name: 'Bahamas',
      currency: 'BSD',
      symbol: 'B$',
      hasRegions: false,
      kind: 'flat-approx',
      rate: 0.00,
      socialRate: 0.0398,          // NIB employee
      notes: 'No personal income tax. NIB (National Insurance Board) employee contribution 3.9% up to a ceiling.'
    }

  });
})();
