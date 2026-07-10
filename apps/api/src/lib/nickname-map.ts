// Surnoms de collectionneurs des références iconiques — zéro token IA.
// Le surnom désigne LA référence exacte, pas la gamme (une « Pepsi » est une
// GMT-Master II 126710BLRO, pas n'importe quelle GMT). Ne jamais inventer.
export const NICKNAMES: Record<string, string> = {
  // Rolex GMT-Master II
  '126710BLNR': 'Batman',
  '116710BLNR': 'Batman',
  '126710BLRO': 'Pepsi',
  '16710': 'Pepsi',
  '126711CHNR': 'Root Beer',
  '126715CHNR': 'Root Beer',
  '126720VTNR': 'Sprite',
  // Rolex Submariner
  '116610LV': 'Hulk',
  '16610LV': 'Kermit',
  '126610LV': 'Starbucks',
  '116619LB': 'Smurf',
  '126619LB': 'Cookie Monster',
  // Rolex Daytona
  '116500LN': 'Panda',
  '116508': 'John Mayer',
  // Rolex Explorer II — 16570/226570 exclus : « Polar » ne vaut que pour le
  // cadran blanc, or la référence couvre aussi le noir
  '1655': 'Freccione',
  // Omega Speedmaster
  '310.30.42.50.01.001': 'Moonwatch',
  '311.30.42.30.01.005': 'Moonwatch',
  '310.32.42.50.02.001': 'Snoopy',
  // Audemars Piguet / Patek — gammes iconiques sans surnom de réf : rien (ne pas inventer)
  // Tudor Black Bay
  'M79830RB-0001': 'Pepsi',
  'M7939G1A0NRU-0001': 'Coke',
};

const BY_REFERENCE = new Map(
  Object.entries(NICKNAMES).map(([reference, nickname]) => [reference.toLowerCase(), nickname])
);

/** Surnom établi pour une référence exacte (insensible à la casse), sinon null. */
export function nicknameForReference(reference: string | null | undefined): string | null {
  if (!reference) return null;
  return BY_REFERENCE.get(reference.trim().toLowerCase()) ?? null;
}
