/* ProFinanceCast — Tax Library: Europe
 * File:      js/tax-library/europe.js
 * Schema:    v1
 * Generated: 2026-05-10
 * Scope:     EU + EEA + UK + CH + small states, single filer, no deps.
 * Maintenance: bracket rates change annually — review every January.
 *   Prefer kind:'flat-approx' over fabricated bracket numbers.
 * Not a tax-filing tool. Not modeled: church tax, solidarity
 * surcharges, filing-status variants, allowances, communal
 * multipliers, wealth/real-estate taxes.
 */
(function () {
  if (typeof window === 'undefined') return;
  window.PFCTaxLibrary = window.PFCTaxLibrary || { countries: {} };

  Object.assign(window.PFCTaxLibrary.countries, {

    /* -------- United Kingdom (re-exports rUK + Scotland bands) -------- */
    GB: {
      name: 'United Kingdom',
      currency: 'GBP',
      symbol: '£',
      hasRegions: true,
      kind: 'progressive',
      // Default brackets shown here are rUK (England/Wales/NI) 2026/27,
      // assuming a full personal allowance (PA = 12570). The engine
      // tapers PA above £100k separately; band data here is the
      // representative single-filer view.
      brackets: [
        { upTo: 12570,  rate: 0    },
        { upTo: 50270,  rate: 0.20 },
        { upTo: 125140, rate: 0.40 },
        { upTo: null,   rate: 0.45 }
      ],
      socialRate: 0.08,    // Class 1 employee NIC main rate (8% 2026/27)
      socialCap: 50270,    // upper earnings limit; 2% above
      regions: {
        ENG: { name: 'England',          usesParentBrackets: true },
        WLS: { name: 'Wales',            usesParentBrackets: true },
        NIR: { name: 'Northern Ireland', usesParentBrackets: true },
        SCT: {
          name: 'Scotland',
          // SY26/27 legislated bands (HMRC). Mirrors pfc-tax-engine.js.
          brackets: [
            { upTo: 12570,  rate: 0    },     // personal allowance
            { upTo: 15397,  rate: 0.19 },     // starter
            { upTo: 27491,  rate: 0.20 },     // basic
            { upTo: 43662,  rate: 0.21 },     // intermediate
            { upTo: 75000,  rate: 0.42 },     // higher
            { upTo: 125140, rate: 0.45 },     // advanced
            { upTo: null,   rate: 0.48 }      // top
          ]
        }
      },
      notes: 'Personal allowance (£12,570) tapers above £100k; not modeled here. Scotland has its own bands above PA. NIC shown as employee Class 1 main rate.'
    },

    /* -------- Germany -------- */
    DE: {
      name: 'Germany',
      currency: 'EUR',
      symbol: '€',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 12096,  rate: 0    },   // Grundfreibetrag 2026 (approx)
        { upTo: 17443,  rate: 0.14 },   // band 1 simplified
        { upTo: 68480,  rate: 0.30 },   // band 2 simplified
        { upTo: 277826, rate: 0.42 },   // upper band
        { upTo: null,   rate: 0.45 }    // Reichensteuer
      ],
      socialRate: 0.205,   // pension 9.3 + health ~8.2 + unemp 1.3 + care ~1.7 (employee share)
      socialCap: 96600,    // 2026 west pension contribution ceiling, approx
      notes: 'Solidaritätszuschlag (only top earners) and church tax not modeled. Income tax uses formula in reality; bands here are linear approximation.'
    },

    /* -------- France -------- */
    FR: {
      name: 'France',
      currency: 'EUR',
      symbol: '€',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 11497,  rate: 0    },   // 2026 indexation
        { upTo: 29315,  rate: 0.11 },
        { upTo: 83823,  rate: 0.30 },
        { upTo: 180294, rate: 0.41 },
        { upTo: null,   rate: 0.45 }
      ],
      socialRate: 0.22,   // CSG/CRDS + cotisations salariales typical employee blended
      notes: 'Quotient familial, PAS withholding, exceptional contribution on high income (CEHR) not modeled. Single-part filer.'
    },

    /* -------- Spain (with autonomous communities) -------- */
    ES: {
      name: 'Spain',
      currency: 'EUR',
      symbol: '€',
      hasRegions: true,
      kind: 'progressive',
      // State-level half of IRPF (the autonomous community adds its own tramo).
      // For a representative national view we show the combined indicative
      // brackets used by the AEAT default scale (state + default autonomous).
      brackets: [
        { upTo: 12450,  rate: 0.19 },
        { upTo: 20200,  rate: 0.24 },
        { upTo: 35200,  rate: 0.30 },
        { upTo: 60000,  rate: 0.37 },
        { upTo: 300000, rate: 0.45 },
        { upTo: null,   rate: 0.47 }
      ],
      socialRate: 0.0635,   // employee SS contribution
      socialCap: 59059,     // 2026 base máxima (approx)
      regions: {
        // Rates here are the regional ADJUSTMENT (delta vs default scale)
        // expressed as an effective % nudge on middle-bracket take-home.
        // Positive = higher tax than default; negative = lower.
        MD: { name: 'Madrid',          rateDelta: -0.015, note: 'lowest top rate in Spain' },
        CT: { name: 'Catalonia',       rateDelta:  0.020, note: 'highest top marginal nationwide' },
        AN: { name: 'Andalusia',       rateDelta: -0.010, note: 'reduced post-2023 reform' },
        VC: { name: 'Valencia',        rateDelta:  0.010 },
        PV: { name: 'Basque Country',  rateDelta: -0.005, note: 'foral regime — own IRPF' },
        NC: { name: 'Navarre',         rateDelta: -0.005, note: 'foral regime — own IRPF' },
        GA: { name: 'Galicia',         rateDelta: -0.005 },
        CL: { name: 'Castile and León', rateDelta: -0.005 },
        AR: { name: 'Aragon',          rateDelta:  0.005 },
        AS: { name: 'Asturias',        rateDelta:  0.015 },
        CN: { name: 'Canary Islands',  rateDelta:  0.000 },
        CB: { name: 'Cantabria',       rateDelta:  0.000 },
        CM: { name: 'Castilla-La Mancha', rateDelta: 0.000 },
        EX: { name: 'Extremadura',     rateDelta:  0.005 },
        IB: { name: 'Balearic Islands', rateDelta: 0.005 },
        RI: { name: 'La Rioja',        rateDelta: -0.005 },
        MC: { name: 'Murcia',          rateDelta: -0.005 }
      },
      notes: 'Spain splits IRPF 50/50 state + autonomous community. Madrid lowest, Catalonia/Asturias highest. Basque Country and Navarre have foral regimes (own tax code) — modeled as small delta only.'
    },

    /* -------- Italy (with regional surcharges) -------- */
    IT: {
      name: 'Italy',
      currency: 'EUR',
      symbol: '€',
      hasRegions: true,
      kind: 'progressive',
      // IRPEF 2026 (3-band reform retained from 2024+).
      brackets: [
        { upTo: 28000,  rate: 0.23 },
        { upTo: 50000,  rate: 0.35 },
        { upTo: null,   rate: 0.43 }
      ],
      socialRate: 0.0919,   // INPS employee dependent worker
      regions: {
        // addizionale regionale IRPEF — flat % on top of national IRPEF
        ABR: { name: 'Abruzzo',                rate: 0.0173 },
        BAS: { name: 'Basilicata',             rate: 0.0173 },
        CAL: { name: 'Calabria',               rate: 0.0203 },
        CAM: { name: 'Campania',               rate: 0.0203 },
        EMR: { name: 'Emilia-Romagna',         rate: 0.0173 },
        FVG: { name: 'Friuli-Venezia Giulia',  rate: 0.0123 },
        LAZ: { name: 'Lazio',                  rate: 0.0203 },
        LIG: { name: 'Liguria',                rate: 0.0181 },
        LOM: { name: 'Lombardy',               rate: 0.0173 },
        MAR: { name: 'Marche',                 rate: 0.0173 },
        MOL: { name: 'Molise',                 rate: 0.0203 },
        PIE: { name: 'Piedmont',               rate: 0.0193 },
        PUG: { name: 'Apulia',                 rate: 0.0173 },
        SAR: { name: 'Sardinia',               rate: 0.0173 },
        SIC: { name: 'Sicily',                 rate: 0.0173 },
        TOS: { name: 'Tuscany',                rate: 0.0173 },
        TAA: { name: 'Trentino-Alto Adige',    rate: 0.0123, note: 'lowest — autonomy' },
        UMB: { name: 'Umbria',                 rate: 0.0173 },
        VDA: { name: 'Aosta Valley',           rate: 0.0123, note: 'autonomy region' },
        VEN: { name: 'Veneto',                 rate: 0.0123 }
      },
      notes: 'Regional addizionale IRPEF added. Communal addizionale (~0.4-0.9%) varies by city — not modeled. Top-up solidarity contribution on >€300k not modeled.'
    },

    /* -------- Netherlands -------- */
    NL: {
      name: 'Netherlands',
      currency: 'EUR',
      symbol: '€',
      hasRegions: false,
      kind: 'progressive',
      // Box 1 — wages, 2026 schedule (combined wage + premium), simplified.
      brackets: [
        { upTo: 38883,  rate: 0.3582 },   // schijf 1 (incl. AOW premium)
        { upTo: 76817,  rate: 0.3748 },   // schijf 2
        { upTo: null,   rate: 0.4950 }    // top rate
      ],
      socialRate: 0.0,    // social premiums folded into Box 1 schijf 1
      notes: 'Heffingskortingen (algemene + arbeidskorting) not modeled — they significantly reduce effective rate at low/mid incomes. Box 2 (substantial holdings) and Box 3 (savings) not modeled.'
    },

    /* -------- Belgium (3 regions) -------- */
    BE: {
      name: 'Belgium',
      currency: 'EUR',
      symbol: '€',
      hasRegions: true,
      kind: 'progressive',
      // Federal IPP 2026 (indexed). Regional surcharges apply via
      // additional centimes; variation between regions is small (<1%
      // effective) but flagged for completeness.
      brackets: [
        { upTo: 16320,  rate: 0.25 },
        { upTo: 28800,  rate: 0.40 },
        { upTo: 49850,  rate: 0.45 },
        { upTo: null,   rate: 0.50 }
      ],
      socialRate: 0.1307,   // ONSS employee
      regions: {
        FL: { name: 'Flanders',          rateDelta: -0.003 },
        WA: { name: 'Wallonia',          rateDelta:  0.000 },
        BR: { name: 'Brussels-Capital',  rateDelta:  0.002 }
      },
      notes: 'Regional taxe additionnelle / opcentiemen are small. Communal surcharge (avg ~7% of federal tax) not modeled separately — folded into typical national view.'
    },

    /* -------- Switzerland (all 26 cantons) -------- */
    CH: {
      name: 'Switzerland',
      currency: 'CHF',
      symbol: 'CHF',
      hasRegions: true,
      kind: 'progressive',
      // Federal direct tax (IFD) 2026 simplified bands — single, no kids.
      brackets: [
        { upTo: 15200,  rate: 0     },
        { upTo: 33200,  rate: 0.0077 },
        { upTo: 43500,  rate: 0.0088 },
        { upTo: 58000,  rate: 0.0264 },
        { upTo: 76100,  rate: 0.0297 },
        { upTo: 103600, rate: 0.0594 },
        { upTo: 134600, rate: 0.0660 },
        { upTo: 176000, rate: 0.0880 },
        { upTo: 755200, rate: 0.1100 },
        { upTo: null,   rate: 0.1150 }
      ],
      socialRate: 0.0625,   // AHV/IV/EO 5.3 + ALV 1.1 (employee share, capped/uncapped split simplified)
      regions: {
        // Effective cantonal+communal rate at typical CHF 100k single — middle-bracket approx.
        ZH: { name: 'Zürich',                rate: 0.115 },
        BE: { name: 'Bern',                  rate: 0.140 },
        LU: { name: 'Lucerne',               rate: 0.105 },
        UR: { name: 'Uri',                   rate: 0.100 },
        SZ: { name: 'Schwyz',                rate: 0.085 },
        OW: { name: 'Obwalden',              rate: 0.095 },
        NW: { name: 'Nidwalden',             rate: 0.090 },
        GL: { name: 'Glarus',                rate: 0.115 },
        ZG: { name: 'Zug',                   rate: 0.060, note: 'lowest in CH' },
        FR: { name: 'Fribourg',              rate: 0.135 },
        SO: { name: 'Solothurn',             rate: 0.130 },
        BS: { name: 'Basel-Stadt',           rate: 0.135 },
        BL: { name: 'Basel-Landschaft',      rate: 0.130 },
        SH: { name: 'Schaffhausen',          rate: 0.115 },
        AR: { name: 'Appenzell Ausserrhoden', rate: 0.110 },
        AI: { name: 'Appenzell Innerrhoden', rate: 0.095 },
        SG: { name: 'St. Gallen',            rate: 0.115 },
        GR: { name: 'Graubünden',            rate: 0.115 },
        AG: { name: 'Aargau',                rate: 0.115 },
        TG: { name: 'Thurgau',               rate: 0.110 },
        TI: { name: 'Ticino',                rate: 0.135 },
        VD: { name: 'Vaud',                  rate: 0.150 },
        VS: { name: 'Valais',                rate: 0.130 },
        NE: { name: 'Neuchâtel',             rate: 0.155 },
        GE: { name: 'Geneva',                rate: 0.165, note: 'highest in CH' },
        JU: { name: 'Jura',                  rate: 0.150 }
      },
      notes: 'Federal IFD is a small slice; canton + commune dominate. Effective rates above are canton+commune middle-bracket estimates for a single filer. Real liability depends on commune multiplier.'
    },

    /* -------- Austria -------- */
    AT: {
      name: 'Austria',
      currency: 'EUR',
      symbol: '€',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 13308,   rate: 0    },
        { upTo: 21617,   rate: 0.20 },
        { upTo: 35836,   rate: 0.30 },
        { upTo: 69166,   rate: 0.40 },
        { upTo: 103072,  rate: 0.48 },
        { upTo: 1000000, rate: 0.50 },
        { upTo: null,    rate: 0.55 }
      ],
      socialRate: 0.1812,   // employee SV contribution
      socialCap: 6450 * 12, // monthly Höchstbeitragsgrundlage approx
      notes: 'Rates indexed annually for cold progression. AbgÄG reforms continuously adjust low bands.'
    },

    /* -------- Ireland -------- */
    IE: {
      name: 'Ireland',
      currency: 'EUR',
      symbol: '€',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 44000, rate: 0.20 },   // single, 2026 (indicative)
        { upTo: null,  rate: 0.40 }
      ],
      socialRate: 0.0815,   // PRSI 4.1% + USC ~4% blended typical
      notes: 'Tax credits (personal + PAYE) reduce liability — not modeled. USC has its own progressive scale folded into socialRate here.'
    },

    /* -------- Portugal -------- */
    PT: {
      name: 'Portugal',
      currency: 'EUR',
      symbol: '€',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 8059,    rate: 0.130 },
        { upTo: 12160,   rate: 0.165 },
        { upTo: 17233,   rate: 0.220 },
        { upTo: 22306,   rate: 0.250 },
        { upTo: 28400,   rate: 0.320 },
        { upTo: 41629,   rate: 0.355 },
        { upTo: 44987,   rate: 0.435 },
        { upTo: 83696,   rate: 0.450 },
        { upTo: null,    rate: 0.480 }
      ],
      socialRate: 0.11,   // Segurança Social employee
      notes: 'Madeira and Azores have separate (lower) regional rates — not modeled as full regions due to small population share. Solidarity surcharge on >€80k not modeled.'
    },

    /* -------- Sweden -------- */
    SE: {
      name: 'Sweden',
      currency: 'SEK',
      symbol: 'kr',
      hasRegions: false,
      kind: 'progressive',
      // Municipal income tax (avg ~32%) + state tax above threshold.
      brackets: [
        { upTo: 24238,  rate: 0     },   // grundavdrag floor (approx)
        { upTo: 643100, rate: 0.32  },   // municipal avg
        { upTo: null,   rate: 0.52  }    // + 20% statlig skatt
      ],
      socialRate: 0.07,   // pension fee 7% (deductible in practice)
      notes: 'Municipal rate varies 29-35% depending on kommun — using national average (~32%). Värnskatt abolished 2020.'
    },

    /* -------- Norway -------- */
    NO: {
      name: 'Norway',
      currency: 'NOK',
      symbol: 'kr',
      hasRegions: false,
      kind: 'progressive',
      // Combined: 22% flat alminnelig inntekt + trinnskatt (step tax).
      brackets: [
        { upTo: 217400,  rate: 0.220 },
        { upTo: 306050,  rate: 0.237 },   // +1.7% step
        { upTo: 697150,  rate: 0.260 },   // +4.0% step
        { upTo: 942400,  rate: 0.356 },   // +13.6% step
        { upTo: 1410750, rate: 0.386 },
        { upTo: null,    rate: 0.396 }
      ],
      socialRate: 0.078,   // trygdeavgift employee
      notes: 'Personfradrag (personal allowance) and minstefradrag not modeled. Wealth tax not modeled.'
    },

    /* -------- Denmark -------- */
    DK: {
      name: 'Denmark',
      currency: 'DKK',
      symbol: 'kr',
      hasRegions: false,
      kind: 'progressive',
      // Combined: AM-bidrag 8% + bottom 12.09% + municipal (~25%) + top tax 15% above threshold.
      brackets: [
        { upTo: 51600,  rate: 0.080 },   // AM-bidrag only below personfradrag
        { upTo: 611800, rate: 0.371 },   // bottom + municipal avg
        { upTo: null,   rate: 0.521 }    // + top tax
      ],
      socialRate: 0.0,    // AM-bidrag folded in above
      notes: 'Municipal rate varies 23-27% by kommune. Church tax (~0.7%, opt-in) not modeled. Top tax kicks in around DKK 611,800 (2026).'
    },

    /* -------- Finland -------- */
    FI: {
      name: 'Finland',
      currency: 'EUR',
      symbol: '€',
      hasRegions: false,
      kind: 'progressive',
      // State income tax + municipal (~7.5% post-2024 reform shifted weight to state).
      brackets: [
        { upTo: 21200,  rate: 0.1264 },
        { upTo: 31500,  rate: 0.1925 },
        { upTo: 52100,  rate: 0.3025 },
        { upTo: 88200,  rate: 0.3400 },
        { upTo: 150000, rate: 0.4175 },
        { upTo: null,   rate: 0.4425 }
      ],
      socialRate: 0.0964,   // employee TyEL pension + unemp + health
      notes: 'Post-SOTE reform 2024: municipal income tax dropped ~12.6pp; state took the slack. Church tax (1-2%, opt-in) not modeled.'
    },

    /* -------- Iceland -------- */
    IS: {
      name: 'Iceland',
      currency: 'ISK',
      symbol: 'kr',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 5353634,  rate: 0.3148 },   // state 17.0% + municipal avg 14.48%
        { upTo: 15030014, rate: 0.3798 },
        { upTo: null,     rate: 0.4628 }
      ],
      socialRate: 0.04,   // pension 4% employee minimum
      notes: 'Personal tax credit (persónuafsláttur) not modeled. Municipal rate caps at 14.97% — using avg.'
    },

    /* -------- Luxembourg -------- */
    LU: {
      name: 'Luxembourg',
      currency: 'EUR',
      symbol: '€',
      hasRegions: false,
      kind: 'flat-approx',
      effectiveRate: 0.30,
      socialRate: 0.1245,
      notes: '2026 typical middle-bracket effective rate, single filer (class 1). LU has 23 progressive bands — collapsed to flat-approx for library compactness; consult a tax professional for exact figures.'
    },

    /* -------- Greece -------- */
    GR: {
      name: 'Greece',
      currency: 'EUR',
      symbol: '€',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 10000, rate: 0.09 },
        { upTo: 20000, rate: 0.22 },
        { upTo: 30000, rate: 0.28 },
        { upTo: 40000, rate: 0.36 },
        { upTo: null,  rate: 0.44 }
      ],
      socialRate: 0.1387,   // EFKA employee
      notes: 'Solidarity contribution suspended for private-sector employees since 2021. Special expat regimes not modeled.'
    },

    /* -------- Poland -------- */
    PL: {
      name: 'Poland',
      currency: 'PLN',
      symbol: 'zł',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 30000,  rate: 0    },   // kwota wolna (tax-free amount)
        { upTo: 120000, rate: 0.12 },
        { upTo: null,   rate: 0.32 }
      ],
      socialRate: 0.1371,   // ZUS employee (pension + disability + sickness)
      notes: 'Zdrowotna (health contribution 9%) added to socialRate. Polski Ład reforms ongoing — verify annually.'
    },

    /* -------- Czech Republic -------- */
    CZ: {
      name: 'Czech Republic',
      currency: 'CZK',
      symbol: 'Kč',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 1582812, rate: 0.15 },   // 36x avg wage threshold
        { upTo: null,    rate: 0.23 }
      ],
      socialRate: 0.110,   // 6.5% social + 4.5% health (employee)
      notes: 'Sleva na poplatníka (taxpayer credit) ~CZK 30,840/yr not modeled.'
    },

    /* -------- Hungary -------- */
    HU: {
      name: 'Hungary',
      currency: 'HUF',
      symbol: 'Ft',
      hasRegions: false,
      kind: 'flat',
      brackets: [
        { upTo: null, rate: 0.15 }
      ],
      socialRate: 0.185,   // 10% pension + 7% health + 1.5% labour (employee)
      notes: 'Flat 15% PIT. Family allowances and under-25/under-30 exemptions not modeled.'
    },

    /* -------- Romania -------- */
    RO: {
      name: 'Romania',
      currency: 'RON',
      symbol: 'lei',
      hasRegions: false,
      kind: 'flat',
      brackets: [
        { upTo: null, rate: 0.10 }
      ],
      socialRate: 0.35,   // CAS 25% pension + CASS 10% health (employee)
      notes: 'Flat 10% PIT. IT/construction/agri sector exemptions not modeled.'
    },

    /* -------- Bulgaria -------- */
    BG: {
      name: 'Bulgaria',
      currency: 'BGN',
      symbol: 'лв',
      hasRegions: false,
      kind: 'flat',
      brackets: [
        { upTo: null, rate: 0.10 }
      ],
      socialRate: 0.1378,   // employee social + health
      notes: 'Flat 10% PIT — one of the lowest in EU.'
    },

    /* -------- Croatia -------- */
    HR: {
      name: 'Croatia',
      currency: 'EUR',
      symbol: '€',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 50400, rate: 0.20 },
        { upTo: null,  rate: 0.30 }
      ],
      socialRate: 0.20,   // pension 1st + 2nd pillar (employee)
      notes: 'Local prirez (city surcharge, 0-18%) abolished 2024 in favour of higher national rates. Personal allowance ~€600/mo not modeled.'
    },

    /* -------- Slovakia -------- */
    SK: {
      name: 'Slovakia',
      currency: 'EUR',
      symbol: '€',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 47537, rate: 0.19 },   // 176.8 x living minimum
        { upTo: null,  rate: 0.25 }
      ],
      socialRate: 0.134,   // employee social + health
      notes: 'Non-taxable part per taxpayer not modeled.'
    },

    /* -------- Slovenia -------- */
    SI: {
      name: 'Slovenia',
      currency: 'EUR',
      symbol: '€',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 9210,  rate: 0.16 },
        { upTo: 27089, rate: 0.26 },
        { upTo: 54178, rate: 0.33 },
        { upTo: 78016, rate: 0.39 },
        { upTo: null,  rate: 0.50 }
      ],
      socialRate: 0.221,   // employee social contributions
      notes: 'General allowance ~€5,000 not modeled.'
    },

    /* -------- Estonia -------- */
    EE: {
      name: 'Estonia',
      currency: 'EUR',
      symbol: '€',
      hasRegions: false,
      kind: 'flat',
      brackets: [
        { upTo: null, rate: 0.22 }
      ],
      socialRate: 0.036,   // unemployment 1.6 + funded pension 2.0 (employee)
      notes: 'Flat 22% from 2025 (raised from 20%). Tax-free basic exemption €700/mo (€7,848/yr 2026), tapered for high earners — not modeled.'
    },

    /* -------- Latvia -------- */
    LV: {
      name: 'Latvia',
      currency: 'EUR',
      symbol: '€',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 20004, rate: 0.20 },
        { upTo: 78100, rate: 0.23 },
        { upTo: null,  rate: 0.31 }
      ],
      socialRate: 0.105,   // employee VSAOI
      notes: 'Differential non-taxable minimum (up to €6,000/yr) not modeled.'
    },

    /* -------- Lithuania -------- */
    LT: {
      name: 'Lithuania',
      currency: 'EUR',
      symbol: '€',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 126532, rate: 0.20 },   // 60x avg wage threshold
        { upTo: null,   rate: 0.32 }
      ],
      socialRate: 0.1952,   // Sodra employee (pension + sickness + health)
      notes: 'NPD (tax-free amount) not modeled.'
    },

    /* -------- Cyprus -------- */
    CY: {
      name: 'Cyprus',
      currency: 'EUR',
      symbol: '€',
      hasRegions: false,
      kind: 'progressive',
      brackets: [
        { upTo: 19500, rate: 0    },
        { upTo: 28000, rate: 0.20 },
        { upTo: 36300, rate: 0.25 },
        { upTo: 60000, rate: 0.30 },
        { upTo: null,  rate: 0.35 }
      ],
      socialRate: 0.084,   // employee SI 8.3% + GHS approx
      notes: 'Non-dom 50% exemption regime for high earners not modeled.'
    },

    /* -------- Malta -------- */
    MT: {
      name: 'Malta',
      currency: 'EUR',
      symbol: '€',
      hasRegions: false,
      kind: 'progressive',
      // Single computation, 2026 indicative.
      brackets: [
        { upTo: 12000, rate: 0    },
        { upTo: 16000, rate: 0.15 },
        { upTo: 60000, rate: 0.25 },
        { upTo: null,  rate: 0.35 }
      ],
      socialRate: 0.10,   // SSC Class 1 employee
      notes: 'Married/parent computations differ — single filer modeled. Highly Qualified Persons regime not modeled.'
    }

  });
})();
