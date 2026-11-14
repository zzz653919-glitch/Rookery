// FIDE federation codes -> ISO 3166-1 alpha-2 (for flags and localised names through Intl.DisplayNames). Shared by the site and the server.
const RAW = `AFG:AF ALB:AL ALG:DZ AND:AD ANG:AO ARG:AR ARM:AM AUS:AU AUT:AT AZE:AZ BAN:BD BAR:BB BEL:BE BEN:BJ BIH:BA BLR:BY BOL:BO BOT:BW BRA:BR BRN:BH BUL:BG CAN:CA CHI:CL CHN:CN COL:CO CRC:CR CRO:HR CUB:CU CYP:CY CZE:CZ DEN:DK DOM:DO ECU:EC EGY:EG ENG:GB ESA:SV ESP:ES EST:EE ETH:ET FIJ:FJ FIN:FI FRA:FR GEO:GE GER:DE GHA:GH GRE:GR GUA:GT HKG:HK HON:HN HUN:HU INA:ID IND:IN IRI:IR IRL:IE IRQ:IQ ISL:IS ISR:IL ITA:IT JAM:JM JOR:JO JPN:JP KAZ:KZ KEN:KE KGZ:KG KOR:KR KOS:XK KSA:SA KUW:KW LAT:LV LBA:LY LIE:LI LTU:LT LUX:LU MAR:MA MAS:MY MDA:MD MEX:MX MGL:MN MKD:MK MLT:MT MNE:ME MON:MC MOZ:MZ MYA:MM NAM:NA NED:NL NEP:NP NGR:NG NOR:NO NZL:NZ OMA:OM PAK:PK PAN:PA PAR:PY PER:PE PHI:PH PLE:PS POL:PL POR:PT PUR:PR QAT:QA ROU:RO RSA:ZA RUS:RU SCO:GB SGP:SG SLO:SI SMR:SM SRB:RS SRI:LK SUI:CH SUR:SR SVK:SK SWE:SE SYR:SY THA:TH TJK:TJ TKM:TM TUN:TN TUR:TR UAE:AE UGA:UG UKR:UA URU:UY USA:US UZB:UZ VEN:VE VIE:VN WLS:GB YEM:YE ZAM:ZM ZIM:ZW FID:UN`;
export const FIDE_TO_ISO2 = Object.fromEntries(RAW.split(/\s+/).map((p) => p.split(':')));
export const iso2 = (fed) => FIDE_TO_ISO2[String(fed || '').toUpperCase()] || null;
export function flagEmoji(fed) {
  const c = iso2(fed); if (!c || c === 'UN' || c === 'XK') return '';
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1a5 + ch.charCodeAt(0)));
}
const SPECIAL = { SCO: 'Scotland', ENG: 'England', WLS: 'Wales', FID: 'FIDE', KOS: 'Kosovo' };
export function countryName(fed, lang = 'en') {
  const f = String(fed || '').toUpperCase(); const c = iso2(f);
  if (!c) return f || '';
  if (SPECIAL[f] && lang === 'en') return SPECIAL[f];
  try { return new Intl.DisplayNames([lang], { type: 'region' }).of(c) || f; } catch { return SPECIAL[f] || f; }
}
export const allFederations = () => Object.keys(FIDE_TO_ISO2).filter((k) => k !== 'FID');
