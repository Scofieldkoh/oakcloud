import { CharacterConfig } from '@/game/types';
// Genshin Impact characters
import { GenshinNahida } from './genshin-nahida';
import { GenshinKlee } from './genshin-klee';
import { GenshinHuTao } from './genshin-hu-tao';
import { GenshinGanyu } from './genshin-ganyu';
import { GenshinVenti } from './genshin-venti';
import { GenshinZhongli } from './genshin-zhongli';
import { GenshinZhongliYs } from './genshin-zhongli-ys';
import { GenshinAyaka } from './genshin-ayaka';
import { GenshinKazuha } from './genshin-kazuha';
import { GenshinKazuhaXll } from './genshin-kazuha-xll';
import { GenshinYoimiya } from './genshin-yoimiya';
import { GenshinThoma } from './genshin-thoma';
import { GenshinChilde } from './genshin-childe';
import { GenshinChildeElectro } from './genshin-childe-electro';
import { GenshinAlbedo } from './genshin-albedo';
import { GenshinLumine } from './genshin-lumine';
import { GenshinRosaria } from './genshin-rosaria';
import { GenshinXingqiu } from './genshin-xingqiu';
import { GenshinChongyun } from './genshin-chongyun';
import { GenshinXiaoCat } from './genshin-xiao-cat';
// Anime characters
import { AnimeNezuko } from './anime-nezuko';
import { AnimeJotaro } from './anime-jotaro';
import { AnimeSanji } from './anime-sanji';
// Pokemon characters
import { PokemonGengar } from './pokemon-gengar';
import { PokemonGrowlithe } from './pokemon-growlithe';
import { PokemonLavenderGhost } from './pokemon-lavender-ghost';
// Touhou characters
import { TouhouMarisa } from './touhou-marisa';
// Fate characters
import { FateTamamo } from './fate-tamamo';
// VTuber characters
import { VtuberKizunaAI } from './vtuber-kizuna-ai';
// Undertale characters
import { UndertaleBlooky } from './undertale-blooky';
// Lobotomy Corporation characters
import { LobotomyPunishingBird } from './lobotomy-punishing-bird';
// Animator vs Animation characters
import { AvaChosenOne } from './ava-chosen-one';
import { AvaTheKing } from './ava-the-king';
// Dynasty Warriors characters
import { DynastyYuanJi } from './dynasty-yuan-ji';
import { DynastyZuoCi } from './dynasty-zuo-ci';
// Nekotalia characters
import { NekotaliaCaneko } from './nekotalia-caneko';
import { NekotaliaGermouser } from './nekotalia-germouser';
import { NekotaliaKoreaCat } from './nekotalia-koreacat';
import { NekotaliaTurkat } from './nekotalia-turkat';
// Misc characters
import { Misc68 } from './misc-68';
import { MiscPusheen } from './misc-pusheen';
import { MiscSpongebob } from './misc-spongebob';
import { MiscSpiderman } from './misc-spiderman';
import { MiscSlugcat } from './misc-slugcat';
import { MiscKuro } from './misc-kuro';
import { MiscNekoJapan } from './misc-neko-japan';
import { MiscHoneyChurros } from './misc-honey-churros';
import { MiscDearla } from './misc-dearla';
import { MiscPuro } from './misc-puro';
import { MiscStarphin } from './misc-starphin';

// Character registry - add new characters here
export const CHARACTERS: Record<string, CharacterConfig> = {
  // Genshin Impact
  'genshin-nahida': GenshinNahida,
  'genshin-klee': GenshinKlee,
  'genshin-hu-tao': GenshinHuTao,
  'genshin-ganyu': GenshinGanyu,
  'genshin-venti': GenshinVenti,
  'genshin-zhongli': GenshinZhongli,
  'genshin-zhongli-ys': GenshinZhongliYs,
  'genshin-ayaka': GenshinAyaka,
  'genshin-kazuha': GenshinKazuha,
  'genshin-kazuha-xll': GenshinKazuhaXll,
  'genshin-yoimiya': GenshinYoimiya,
  'genshin-thoma': GenshinThoma,
  'genshin-childe': GenshinChilde,
  'genshin-childe-electro': GenshinChildeElectro,
  'genshin-albedo': GenshinAlbedo,
  'genshin-lumine': GenshinLumine,
  'genshin-rosaria': GenshinRosaria,
  'genshin-xingqiu': GenshinXingqiu,
  'genshin-chongyun': GenshinChongyun,
  'genshin-xiao-cat': GenshinXiaoCat,
  // Anime
  'anime-nezuko': AnimeNezuko,
  'anime-jotaro': AnimeJotaro,
  'anime-sanji': AnimeSanji,
  // Pokemon
  'pokemon-gengar': PokemonGengar,
  'pokemon-growlithe': PokemonGrowlithe,
  'pokemon-lavender-ghost': PokemonLavenderGhost,
  // Touhou
  'touhou-marisa': TouhouMarisa,
  // Fate
  'fate-tamamo': FateTamamo,
  // VTuber
  'vtuber-kizuna-ai': VtuberKizunaAI,
  // Undertale
  'undertale-blooky': UndertaleBlooky,
  // Lobotomy Corporation
  'lobotomy-punishing-bird': LobotomyPunishingBird,
  // Animator vs Animation
  'ava-chosen-one': AvaChosenOne,
  'ava-the-king': AvaTheKing,
  // Dynasty Warriors
  'dynasty-yuan-ji': DynastyYuanJi,
  'dynasty-zuo-ci': DynastyZuoCi,
  // Nekotalia
  'nekotalia-caneko': NekotaliaCaneko,
  'nekotalia-germouser': NekotaliaGermouser,
  'nekotalia-koreacat': NekotaliaKoreaCat,
  'nekotalia-turkat': NekotaliaTurkat,
  // Misc
  'misc-68': Misc68,
  'misc-pusheen': MiscPusheen,
  'misc-spongebob': MiscSpongebob,
  'misc-spiderman': MiscSpiderman,
  'misc-slugcat': MiscSlugcat,
  'misc-kuro': MiscKuro,
  'misc-neko-japan': MiscNekoJapan,
  'misc-honey-churros': MiscHoneyChurros,
  'misc-dearla': MiscDearla,
  'misc-puro': MiscPuro,
  'misc-starphin': MiscStarphin,
};

// Helper to get character by ID
export function getCharacter(id: string): CharacterConfig | null {
  return CHARACTERS[id] || null;
}

// Get all available character IDs
export function getCharacterIds(): string[] {
  return Object.keys(CHARACTERS);
}

// Get all character configs
export function getAllCharacters(): CharacterConfig[] {
  return Object.values(CHARACTERS);
}
