import { db } from './index.js';
import { watchModels, marketPrices } from './schema.js';

type SeedModel = {
  brand: string;
  model: string;
  reference: string;
  // Prix d'amorçage EUR — remplacé par la vraie cote (market:refresh) dès que possible
  price: number;
  // Tendance ~6 mois, ex. 0.04 = +4%
  trend: number;
};

const MODELS: SeedModel[] = [
  // ——— Rolex ———
  { brand: 'Rolex', model: 'Submariner Date', reference: '126610LN', price: 12800, trend: 0.03 },
  { brand: 'Rolex', model: 'Submariner', reference: '124060', price: 11500, trend: 0.02 },
  { brand: 'Rolex', model: 'GMT-Master II "Batman"', reference: '126710BLNR', price: 15800, trend: 0.05 },
  { brand: 'Rolex', model: 'GMT-Master II "Pepsi"', reference: '126710BLRO', price: 19000, trend: 0.04 },
  { brand: 'Rolex', model: 'Daytona', reference: '126500LN', price: 27500, trend: -0.02 },
  { brand: 'Rolex', model: 'Datejust 36', reference: '126234', price: 8900, trend: 0.01 },
  { brand: 'Rolex', model: 'Datejust 41', reference: '126334', price: 10400, trend: 0.02 },
  { brand: 'Rolex', model: 'Oyster Perpetual 36', reference: '126000', price: 5900, trend: 0.02 },
  { brand: 'Rolex', model: 'Oyster Perpetual 41', reference: '124300', price: 6600, trend: 0.02 },
  { brand: 'Rolex', model: 'Day-Date 40', reference: '228238', price: 38500, trend: 0.01 },
  { brand: 'Rolex', model: 'Explorer', reference: '124270', price: 7800, trend: 0.02 },
  { brand: 'Rolex', model: 'Explorer II', reference: '226570', price: 9600, trend: 0.01 },
  { brand: 'Rolex', model: 'Sea-Dweller', reference: '126600', price: 11900, trend: 0.0 },
  { brand: 'Rolex', model: 'Deepsea', reference: '136660', price: 13600, trend: 0.0 },
  { brand: 'Rolex', model: 'Air-King', reference: '126900', price: 7300, trend: 0.01 },
  { brand: 'Rolex', model: 'Milgauss', reference: '116400GV', price: 10800, trend: 0.04 },
  { brand: 'Rolex', model: 'Yacht-Master 40', reference: '126622', price: 14200, trend: 0.01 },
  { brand: 'Rolex', model: 'Sky-Dweller', reference: '336934', price: 17800, trend: 0.0 },
  { brand: 'Rolex', model: 'Lady-Datejust 28', reference: '279160', price: 6900, trend: 0.01 },
  { brand: 'Rolex', model: 'Cellini Moonphase', reference: '50535', price: 24000, trend: 0.02 },

  // ——— Omega ———
  { brand: 'Omega', model: 'Speedmaster Professional Moonwatch', reference: '310.30.42.50.01.001', price: 5900, trend: 0.01 },
  { brand: 'Omega', model: 'Speedmaster Reduced', reference: '3510.50.00', price: 2600, trend: 0.03 },
  { brand: 'Omega', model: "Speedmaster '57", reference: '332.10.41.51.01.001', price: 7600, trend: 0.0 },
  { brand: 'Omega', model: 'Seamaster Diver 300M', reference: '210.30.42.20.01.001', price: 3900, trend: 0.0 },
  { brand: 'Omega', model: 'Seamaster 300 Heritage', reference: '234.30.41.21.01.001', price: 5400, trend: 0.01 },
  { brand: 'Omega', model: 'Seamaster Planet Ocean 600M', reference: '215.30.44.21.01.001', price: 5100, trend: 0.0 },
  { brand: 'Omega', model: 'Seamaster Aqua Terra', reference: '220.10.41.21.03.004', price: 4300, trend: 0.01 },
  { brand: 'Omega', model: 'Constellation', reference: '131.10.39.20.01.001', price: 4100, trend: 0.0 },
  { brand: 'Omega', model: 'De Ville Prestige', reference: '424.10.40.20.02.001', price: 2700, trend: -0.01 },
  { brand: 'Omega', model: 'Railmaster', reference: '220.10.40.20.01.001', price: 3700, trend: 0.0 },
  { brand: 'Omega', model: 'MoonSwatch Mission to the Moon', reference: 'SO33M100', price: 310, trend: 0.02 },

  // ——— Cartier ———
  { brand: 'Cartier', model: 'Santos de Cartier Large', reference: 'WSSA0018', price: 6800, trend: 0.04 },
  { brand: 'Cartier', model: 'Santos de Cartier Medium', reference: 'WSSA0029', price: 6300, trend: 0.03 },
  { brand: 'Cartier', model: 'Tank Must Large', reference: 'WSTA0041', price: 2900, trend: 0.02 },
  { brand: 'Cartier', model: 'Tank Française Medium', reference: 'WSTA0074', price: 3900, trend: 0.02 },
  { brand: 'Cartier', model: 'Ballon Bleu 42', reference: 'WSBB0026', price: 5400, trend: 0.01 },
  { brand: 'Cartier', model: 'Pasha de Cartier 41', reference: 'WSPA0009', price: 5100, trend: 0.0 },

  // ——— Tudor ———
  { brand: 'Tudor', model: 'Black Bay 58', reference: '79030N', price: 3100, trend: -0.01 },
  { brand: 'Tudor', model: 'Black Bay 54', reference: '79000N', price: 3300, trend: 0.0 },
  { brand: 'Tudor', model: 'Black Bay 41', reference: '7941A1A0NU', price: 3400, trend: 0.0 },
  { brand: 'Tudor', model: 'Black Bay GMT', reference: '79830RB', price: 3500, trend: 0.0 },
  { brand: 'Tudor', model: 'Black Bay Chrono', reference: '79360N', price: 4700, trend: 0.01 },
  { brand: 'Tudor', model: 'Pelagos', reference: '25600TN', price: 3600, trend: 0.0 },
  { brand: 'Tudor', model: 'Pelagos 39', reference: '25407N', price: 4100, trend: 0.01 },
  { brand: 'Tudor', model: 'Ranger', reference: '79950', price: 2400, trend: -0.01 },
  { brand: 'Tudor', model: 'Royal 41', reference: '28600', price: 2200, trend: 0.0 },

  // ——— Audemars Piguet ———
  { brand: 'Audemars Piguet', model: 'Royal Oak Selfwinding 41', reference: '15510ST.OO.1320ST.01', price: 48000, trend: -0.03 },
  { brand: 'Audemars Piguet', model: 'Royal Oak Chronograph 41', reference: '26240ST.OO.1320ST.01', price: 58000, trend: -0.02 },
  { brand: 'Audemars Piguet', model: 'Royal Oak Offshore 42', reference: '26238ST.OO.2000ST.01', price: 45000, trend: -0.02 },

  // ——— Patek Philippe ———
  { brand: 'Patek Philippe', model: 'Nautilus', reference: '5811/1G-001', price: 105000, trend: -0.04 },
  { brand: 'Patek Philippe', model: 'Aquanaut', reference: '5167A-001', price: 68000, trend: -0.02 },
  { brand: 'Patek Philippe', model: 'Calatrava', reference: '6119G-001', price: 27500, trend: 0.0 },

  // ——— Jaeger-LeCoultre ———
  { brand: 'Jaeger-LeCoultre', model: 'Reverso Classic Medium', reference: 'Q2438522', price: 6900, trend: 0.01 },
  { brand: 'Jaeger-LeCoultre', model: 'Master Control Date', reference: 'Q4018420', price: 6400, trend: 0.0 },
  { brand: 'Jaeger-LeCoultre', model: 'Polaris Automatic', reference: 'Q9008180', price: 7100, trend: 0.0 },

  // ——— IWC ———
  { brand: 'IWC', model: 'Portugieser Chronograph', reference: 'IW371605', price: 7200, trend: 0.0 },
  { brand: 'IWC', model: 'Pilot Mark XX', reference: 'IW328201', price: 4300, trend: 0.01 },
  { brand: 'IWC', model: "Pilot's Chronograph 41", reference: 'IW388101', price: 5900, trend: 0.0 },
  { brand: 'IWC', model: 'Big Pilot 43', reference: 'IW329301', price: 8300, trend: -0.01 },
  { brand: 'IWC', model: 'Portofino Automatic', reference: 'IW356501', price: 3700, trend: 0.0 },

  // ——— Panerai ———
  { brand: 'Panerai', model: 'Luminor Marina', reference: 'PAM01312', price: 5300, trend: -0.01 },
  { brand: 'Panerai', model: 'Radiomir', reference: 'PAM00992', price: 4600, trend: -0.01 },
  { brand: 'Panerai', model: 'Submersible', reference: 'PAM00973', price: 6800, trend: 0.0 },

  // ——— Breitling ———
  { brand: 'Breitling', model: 'Navitimer B01 Chronograph 43', reference: 'AB0138211B1P1', price: 7500, trend: 0.0 },
  { brand: 'Breitling', model: 'Chronomat B01 42', reference: 'AB0134101B1A1', price: 6400, trend: 0.0 },
  { brand: 'Breitling', model: 'Superocean Automatic 42', reference: 'A17375E71C1S1', price: 3400, trend: 0.0 },
  { brand: 'Breitling', model: 'Premier B01 Chronograph 42', reference: 'AB0145211G1P1', price: 5700, trend: 0.0 },

  // ——— Zenith ———
  { brand: 'Zenith', model: 'Chronomaster Sport', reference: '03.3100.3600/69.M3100', price: 9200, trend: 0.01 },
  { brand: 'Zenith', model: 'Chronomaster Original', reference: '03.3200.3600/69.C902', price: 7500, trend: 0.0 },
  { brand: 'Zenith', model: 'Defy Skyline', reference: '03.9300.3620/01.I001', price: 7800, trend: -0.01 },

  // ——— Grand Seiko / Seiko ———
  { brand: 'Grand Seiko', model: 'Snowflake', reference: 'SBGA211', price: 5200, trend: 0.02 },
  { brand: 'Grand Seiko', model: 'White Birch', reference: 'SLGH005', price: 8100, trend: 0.01 },
  { brand: 'Grand Seiko', model: 'Elegance', reference: 'SBGW231', price: 3500, trend: 0.01 },
  { brand: 'Seiko', model: 'Prospex "Turtle"', reference: 'SRPE93K1', price: 420, trend: 0.0 },
  { brand: 'Seiko', model: 'Prospex 62MAS', reference: 'SPB143J1', price: 950, trend: 0.01 },
  { brand: 'Seiko', model: 'Prospex "Samurai"', reference: 'SRPB51K1', price: 430, trend: 0.0 },
  { brand: 'Seiko', model: '5 Sports', reference: 'SRPD55K1', price: 250, trend: 0.0 },
  { brand: 'Seiko', model: 'Presage Cocktail Time', reference: 'SRPB41J1', price: 390, trend: 0.0 },
  { brand: 'Seiko', model: 'SKX007', reference: 'SKX007K2', price: 380, trend: 0.03 },

  // ——— Longines / Tissot / Oris / Nomos ———
  { brand: 'Longines', model: 'Spirit Zulu Time', reference: 'L3.812.4.63.6', price: 2700, trend: 0.01 },
  { brand: 'Longines', model: 'HydroConquest 41', reference: 'L3.781.4.56.6', price: 1400, trend: 0.0 },
  { brand: 'Longines', model: 'Legend Diver', reference: 'L3.774.4.50.0', price: 2000, trend: 0.0 },
  { brand: 'Longines', model: 'Master Collection Moonphase', reference: 'L2.909.4.78.3', price: 2500, trend: 0.0 },
  { brand: 'Tissot', model: 'PRX Powermatic 80', reference: 'T137.407.11.041.00', price: 620, trend: 0.01 },
  { brand: 'Tissot', model: 'Seastar 1000 Powermatic 80', reference: 'T120.407.11.041.03', price: 650, trend: 0.0 },
  { brand: 'Tissot', model: 'Le Locle Powermatic 80', reference: 'T006.407.11.033.00', price: 520, trend: 0.0 },
  { brand: 'Oris', model: 'Aquis Date 41.5', reference: '01 733 7766 4135-07 4 22 05PEB', price: 1800, trend: 0.0 },
  { brand: 'Oris', model: 'Divers Sixty-Five', reference: '01 733 7707 4064-07 5 20 22', price: 1900, trend: 0.0 },
  { brand: 'Oris', model: 'Big Crown Pointer Date', reference: '01 754 7741 4065-07 5 20 63', price: 1500, trend: 0.0 },
  { brand: 'Nomos', model: 'Tangente 38', reference: '165', price: 1700, trend: 0.01 },
  { brand: 'Nomos', model: 'Club Campus 36', reference: '708.1', price: 1250, trend: 0.0 },
  { brand: 'Nomos', model: 'Metro Neomatik', reference: '1114', price: 2600, trend: 0.0 },

  // ——— Haute horlogerie & divers ———
  { brand: 'Vacheron Constantin', model: 'Overseas Automatic', reference: '4500V/110A-B483', price: 26500, trend: -0.02 },
  { brand: 'Vacheron Constantin', model: 'Patrimony', reference: '85180/000G-9230', price: 17500, trend: 0.0 },
  { brand: 'A. Lange & Söhne', model: 'Lange 1', reference: '191.032', price: 34500, trend: 0.0 },
  { brand: 'A. Lange & Söhne', model: 'Saxonia Thin', reference: '211.026', price: 14500, trend: 0.0 },
  { brand: 'Blancpain', model: 'Fifty Fathoms Automatique', reference: '5015-1130-52A', price: 11500, trend: 0.0 },
  { brand: 'Breguet', model: 'Classique 5177', reference: '5177BB/29/9V6', price: 16500, trend: -0.01 },
  { brand: 'Girard-Perregaux', model: 'Laureato 42', reference: '81010-11-431-11A', price: 9200, trend: -0.01 },
  { brand: 'Piaget', model: 'Polo Date', reference: 'G0A41002', price: 8800, trend: -0.01 },
  { brand: 'Hublot', model: 'Classic Fusion Titanium 42', reference: '542.NX.1171.RX', price: 6800, trend: -0.02 },
  { brand: 'Hublot', model: 'Big Bang Unico 42', reference: '441.NX.1171.RX', price: 14500, trend: -0.02 },
  { brand: 'TAG Heuer', model: 'Carrera Chronograph', reference: 'CBN2A1B.BA0643', price: 4800, trend: -0.01 },
  { brand: 'TAG Heuer', model: 'Monaco Calibre 11', reference: 'CAW211P.FC6356', price: 6500, trend: 0.0 },
  { brand: 'TAG Heuer', model: 'Aquaracer Professional 300', reference: 'WBP2010.BA0632', price: 2600, trend: -0.01 },
  { brand: 'Bell & Ross', model: 'BR 03-92 Black Matte', reference: 'BR0392-BL-CE', price: 3200, trend: -0.01 },
  { brand: 'Bulgari', model: 'Octo Finissimo Automatic', reference: '103464', price: 13500, trend: 0.0 },
  { brand: 'Chopard', model: 'Alpine Eagle 41', reference: '298600-3001', price: 12800, trend: 0.0 },
  { brand: 'Richard Mille', model: 'RM 011 Felipe Massa', reference: 'RM011', price: 165000, trend: -0.03 },
  { brand: 'Ulysse Nardin', model: 'Diver 42', reference: '8163-175/92', price: 5900, trend: -0.01 },

  // ——— Accessible / entrée de gamme ———
  { brand: 'Hamilton', model: 'Khaki Field Mechanical', reference: 'H69439931', price: 520, trend: 0.01 },
  { brand: 'Hamilton', model: 'Khaki Field Auto 42', reference: 'H70555533', price: 600, trend: 0.0 },
  { brand: 'Hamilton', model: 'Jazzmaster Open Heart', reference: 'H32675540', price: 850, trend: 0.0 },
  { brand: 'Sinn', model: '556 I', reference: '556.010', price: 1250, trend: 0.0 },
  { brand: 'Sinn', model: '104 St Sa I', reference: '104.010', price: 1500, trend: 0.0 },
  { brand: 'Junghans', model: 'Max Bill Automatic', reference: '027/3500.02', price: 1000, trend: 0.0 },
  { brand: 'Rado', model: 'Captain Cook Automatic 42', reference: 'R32505203', price: 1900, trend: 0.0 },
  { brand: 'Mido', model: 'Ocean Star 200C', reference: 'M042.430.11.041.00', price: 850, trend: 0.0 },
  { brand: 'Certina', model: 'DS PH200M', reference: 'C036.407.16.050.00', price: 700, trend: 0.0 },
  { brand: 'Frederique Constant', model: 'Classics Index Automatic', reference: 'FC-303NN5B6B', price: 900, trend: 0.0 },
  { brand: 'Casio', model: 'G-Shock "CasiOak"', reference: 'GA-2100-1A1ER', price: 100, trend: 0.0 },
  { brand: 'Casio', model: 'F-91W', reference: 'F-91W-1YER', price: 15, trend: 0.0 },
  { brand: 'Swatch', model: 'Sistem51', reference: 'SUTB400', price: 150, trend: 0.0 },
];

const HISTORY_MONTHS = 6;

function historyPoints(watchModelId: string, m: SeedModel) {
  // Historique mensuel interpolé de (price / (1+trend)) vers price,
  // avec une légère ondulation déterministe pour éviter les droites parfaites.
  const startPrice = m.price / (1 + m.trend);
  const points = [];
  for (let i = HISTORY_MONTHS; i >= 0; i--) {
    const progress = (HISTORY_MONTHS - i) / HISTORY_MONTHS;
    const wobble = 1 + 0.008 * Math.sin(i * 2.7 + (m.price % 7));
    const price = startPrice + (m.price - startPrice) * progress;
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    points.push({
      watchModelId,
      price: (Math.round(price * wobble * 100) / 100).toFixed(2),
      currency: 'EUR',
      source: 'seed',
      fetchedAt: date,
    });
  }
  return points;
}

async function seed() {
  const existing = await db
    .select({ canonicalName: watchModels.canonicalName })
    .from(watchModels);
  const known = new Set(existing.map((r) => r.canonicalName));

  let inserted = 0;
  for (const m of MODELS) {
    const canonicalName = `${m.brand} ${m.model} ${m.reference}`;
    if (known.has(canonicalName)) continue;

    const [created] = await db
      .insert(watchModels)
      .values({ brand: m.brand, model: m.model, reference: m.reference, canonicalName })
      .returning();

    await db.insert(marketPrices).values(historyPoints(created.id, m));
    inserted++;
    console.log(`✓ ${canonicalName}`);
  }

  console.log(
    `\n${inserted} nouveau(x) modèle(s) — ${known.size} déjà présents, catalogue cible ${MODELS.length}.`
  );
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
