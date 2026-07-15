// Shared constants/types for ReleaseWizard. Source of truth — серверная схема,
// здесь только UI-удобства (метки, дефолты, лимиты валидации формы).
import type {
  TrackDisplayArtist, TrackWriter, TrackPerformer, TrackProductionMember,
  ReleaseArtistRefRole,
} from "@workspace/api-client-react";

export const RELEASE_TYPES = [
  { value: "single",      label: "Сингл" },
  { value: "album",       label: "Альбом" },
  { value: "ep",          label: "EP" },
  { value: "compilation", label: "Сборник" },
] as const;

export const GENRES = [
  "Pop", "Rock", "Hip-Hop / Rap", "R&B / Soul", "Dance", "Electronic",
  "House", "Techno", "Trance", "Drum & Bass", "Dubstep", "Lo-Fi",
  "Indie", "Alternative", "Jazz", "Blues", "Country", "Folk",
  "Classical", "Opera", "Instrumental", "New Age", "Ambient", "Easy Listening",
  "Funk", "Disco", "Punk", "Metal", "Reggae", "Ska",
  "Latin", "Afrobeat", "Afrobeats", "Gospel", "Religious", "Christian",
  "Traditional", "World Music", "Soundtrack", "Anime", "Bollywood", "Experimental",
  "Vocal", "Singer/Songwriter", "Audiobook", "Spoken Word", "Comedy", "Karaoke",
  "Children's Music", "Holiday", "Arabic", "African", "Indian", "Punjabi",
  "Chinese", "Japanese", "Korean", "Brazilian", "Persian", "Afghan",
  "Tajik", "Uzbek", "Kazakh", "Kyrgyz", "Turkmen", "Turkish",
  "Central Asian", "Other",
] as const;

export const SUBGENRES: Record<string, string[]> = {
  "Pop": ["Dance Pop", "Teen Pop", "Synth Pop", "Electropop", "Indie Pop", "Dream Pop", "Art Pop", "Pop Rock", "Pop Folk", "Pop Funk", "Acoustic Pop", "Europop", "French Pop", "German Pop", "Russian Pop", "Korean Pop", "Japanese Pop"],
  "Rock": ["Alternative Rock", "Hard Rock", "Soft Rock", "Classic Rock", "Progressive Rock", "Indie Rock", "Garage Rock", "Folk Rock", "Symphonic Rock", "Space Rock", "Blues Rock", "Rap Rock", "Slow Rock", "Arena Rock", "Southern Rock"],
  "Hip-Hop / Rap": ["Rap", "Hip-Hop", "Trap", "Drill", "Gangsta Rap", "Conscious Rap", "Alternative Rap", "Underground Rap", "Boom Bap", "East Coast Rap", "West Coast Rap", "Latin Rap", "Christian Rap", "Russian Rap", "Trap Soul", "Mumble Rap"],
  "R&B / Soul": ["Contemporary R&B", "Soul", "Neo Soul", "Rhythmic Soul", "Funk", "Motown", "Afro Soul"],
  "Dance": ["Dance Pop", "Eurodance", "Club Dance", "Electronic Dance", "Progressive Dance", "Vocal Dance", "Latin Dance", "Disco Dance", "Freestyle", "Hi-NRG", "Italo Dance", "Big Room", "Tropical Dance", "Electro Dance", "Urban Dance", "Dancehall", "Deep Dance", "Afro Dance", "Pop Dance", "Remix Dance", "Dance EDM", "EDM", "House Dance", "Tech Dance"],
  "Electronic": ["EDM", "Electro", "Electronica", "Electro House", "Electropop", "Electro Folk", "Breakbeat", "Acid Techno", "Techno", "House", "Trance", "Dubstep", "Drum & Bass", "Pop", "Jungle", "Drumstep", "Progressive House", "Deep House", "Tech House", "Future House", "Bass House", "Hardstyle", "Electro Pop", "Electro Rock", "IDM", "Experimental Electronic", "Digital Pop", "Synthwave", "Future Bass", "Chill Electronic"],
  "House": ["Deep House", "Tech House", "Progressive House", "Bass House", "Afro House", "Club House", "Vocal House", "French House", "Euro House", "Future House", "Tropical House"],
  "Techno": ["Minimal Techno", "Detroit Techno", "Acid Techno", "Industrial Techno", "Hard Techno", "Melodic Techno", "Peak Time Techno", "Progr"],
  "Trance": ["Hard Trance", "Progressive Trance", "Psytrance", "Uplifting Trance", "Vocal Trance"],
  "Drum & Bass": ["Liquid DnB", "Neurofunk", "Jungle", "Jump Up", "Darkstep", "Drumstep", "Atmospheric DnB"],
  "Dubstep": ["Brostep", "Melodic Dubstep", "Chill Dubstep", "Heavy Dubstep", "Future Dubstep", "Experimental Dubstep"],
  "Lo-Fi": ["Lo-Fi Hip-Hop", "Chillhop", "Study Beats", "Jazzhop", "Ambient Lo-Fi", "Lo-Fi Chill"],
  "Indie": ["Indie Pop", "Indie Rock", "Indie Folk", "Indie Dance", "Indie Electronic", "Indie Alternative", "Bedroom Pop", "Lo-Fi Indie"],
  "Alternative": ["Alternative Rock", "Alternative Pop", "Alternative Hip-Hop", "Alternative Metal", "Indie Alternative", "Experimental Alternative", "Post Alternative"],
  "Jazz": ["Smooth Jazz", "Vocal Jazz", "Bebop", "Swing", "Big Band", "Acid Jazz", "Latin Jazz", "Jazz Fusion", "Contemporary Jazz", "Free Jazz"],
  "Blues": ["Blues Rock", "Delta Blues", "Chicago Blues", "Acoustic Blues", "Modern Blues", "Electric Blues"],
  "Country": ["Country Pop", "Country Rock", "Traditional Country", "Bluegrass", "Modern Country", "Folk Country", "Americana Country"],
  "Folk": ["Folk Rock", "Indie Folk", "Traditional Folk", "Acoustic Folk", "Celtic Folk", "Modern Folk", "World Folk"],
  "Classical": ["Baroque", "Romantic Classical", "Modern Classical", "Orchestral", "Chamber Music", "Piano Classical", "Symphony", "Minimal Classical"],
  "Opera": ["Classical Opera", "Modern Opera", "Crossover Opera", "Vocal Opera", "Symphonic Opera"],
  "Instrumental": ["Instrumental Pop", "Instrumental Rock", "Piano Instrumental", "Cinematic Instrumental", "Acoustic Instrumental", "Ambient Instrumental"],
  "New Age": ["Meditation Music", "Healing Music", "Spiritual New Age", "Nature Sounds", "Relaxation Music", "Yoga Music"],
  "Ambient": ["Dark Ambient", "Space Ambient", "Drone Ambient", "Cinematic Ambient", "Chill Ambient", "Minimal Ambient"],
  "Easy Listening": ["Soft Pop", "Lounge Music", "Background Music", "Romantic Easy Listening", "Acoustic Easy Listening"],
  "Funk": ["Funk Rock", "Jazz Funk", "Disco Funk", "Pop Funk", "Afro Funk", "Electro Funk"],
  "Disco": ["Classic Disco", "Nu Disco", "Disco Pop", "Funk Disco", "Italo Disco"],
  "Punk": ["Punk Rock", "Pop Punk", "Hardcore Punk", "Post Punk", "Ska Punk", "Indie Punk"],
  "Metal": ["Heavy Metal", "Death Metal", "Black Metal", "Power Metal", "Progressive Metal", "Nu Metal", "Alternative Metal"],
  "Reggae": ["Roots Reggae", "Dub Reggae", "Dancehall", "Reggae Fusion", "Lovers Rock"],
  "Ska": ["Traditional Ska", "Ska Punk", "2 Tone Ska", "Reggae Ska Fusion"],
  "Latin": ["Latin Pop", "Latin Urban", "Latin Trap", "Latin Rock", "Salsa", "Bachata", "Reggaeton", "Latin Jazz", "Merengue"],
  "Afrobeat": ["Afro Pop", "Afro House", "Afro Fusion", "Afro Dance", "Afro Trap", "Afro Soul", "Afro Hip-Hop"],
  "Afrobeats": ["Afro Pop", "Afro House", "Afro Fusion", "Afro Dance", "Afro Trap", "Afro Soul", "Afro Hip-Hop"],
  "Gospel": ["Contemporary Gospel", "Traditional Gospel", "Gospel Choir", "Urban Gospel", "Christian Gospel"],
  "Religious": ["Spiritual Music", "Devotional Music", "Islamic Nasheed", "Mantra Music", "Sacred Music"],
  "Christian": ["Christian Pop", "Christian Rock", "Christian Rap", "Worship Music", "Praise Music"],
  "Traditional": ["Ethnic Traditional", "Regional Traditional", "Folk Traditional", "Ceremonial Music", "Heritage Music"],
  "World Music": ["World Fusion", "Ethnic Fusion", "Global Beats", "Traditional World", "Modern World Fusion"],
  "Soundtrack": ["Film Score", "TV Soundtrack", "Trailer Music", "Game Soundtrack", "Cinematic Score", "Background Score"],
  "Anime": ["Anime OST", "Anime Pop", "Anime Rock", "Anime Instrumental", "J-Anime Fusion"],
  "Bollywood": ["Bollywood Pop", "Bollywood Soundtrack", "Bollywood Dance", "Bollywood Romantic", "Bollywood Classical Fusion"],
  "Experimental": ["Avant-Garde", "Noise Music", "Experimental Electronic", "Experimental Rock", "Sound Art", "Minimal Experimental"],
  "Vocal": ["Male Vocal", "Female Vocal", "Duet", "Choir", "A Cappella", "Vocal Pop", "Vocal Jazz", "Vocal House", "Opera Vocal"],
  "Singer/Songwriter": ["Acoustic Singer/Songwriter", "Indie Singer/Songwriter", "Folk Singer/Songwriter", "Pop Singer/Songwriter", "Emotional Ballads", "Storytelling Songs"],
  "Audiobook": ["Fiction Audiobook", "Non-Fiction Audiobook", "Educational Audiobook", "Self-Help Audiobook", "Biography Audiobook", "Story Audiobook"],
  "Spoken Word": ["Poetry", "Speech", "Storytelling", "Performance Poetry", "Political Speech", "Motivational Speech"],
  "Comedy": ["Stand-up Comedy", "Sketch Comedy", "Satire", "Parody", "Comedy Story", "Improvisation"],
  "Karaoke": ["Pop Karaoke", "Rock Karaoke", "Classic Karaoke", "Instrumental Karaoke", "Party Karaoke", "Regional Karaoke"],
  "Children's Music": ["Nursery Rhymes", "Educational Songs", "Lullabies", "Cartoon Songs", "Kids Pop", "Kids Folk"],
  "Holiday": ["Christmas Music", "New Year Music", "Ramadan Music", "Eid Music", "Easter Music", "Valentine’s Day Music", "Halloween Music", "National Holiday Music"],
  "Arabic": ["Arabic Pop", "Arabic Folk", "Arabic Traditional", "Arabic Classical", "Arabic Dance", "Arabic Rock", "Arabic Hip-Hop", "Arabic Rap", "Arabic R&B", "Arabic Electronic", "Khaliji", "Levantine", "Egyptian Pop", "Egyptian Rap", "Egyptian Hip-Hop", "Egyptian Rock", "Maghrebi", "Rai", "Bedouin", "Mahraganat"],
  "African": ["Afrobeat", "Afrobeats", "Afro Pop", "Afro House", "Afro Soul", "Highlife", "Amapiano", "Soukous", "Afro Jazz", "Afro Fusion"],
  "Indian": ["Bollywood", "Indian Pop", "Indian Classical", "Bhangra", "Tamil Pop", "Telugu Pop", "Punjabi Folk", "Filmi", "Devotional", "Indian Fusion"],
  "Punjabi": ["Punjabi Pop", "Punjabi Folk", "Bhangra", "Punjabi Rap", "Punjabi Romantic", "Punjabi Hip-Hop", "Gurbani", "Punjabi Remix"],
  "Chinese": ["C-Pop", "Mandopop", "Cantopop", "Chinese Folk", "Chinese Classical", "Chinese Hip-Hop", "Chinese Rock", "Chinese Indie", "Chinese Traditional", "Chinese EDM"],
  "Japanese": ["J-Pop", "J-Rock", "Anime Music", "Vocaloid", "Japanese Hip-Hop", "City Pop", "Japanese Folk", "Enka", "Japanese EDM", "Japanese Indie"],
  "Korean": ["K-Pop", "K-Hip-Hop", "K-R&B", "K-Indie", "K-Rock", "K-Ballad", "Korean EDM", "Korean Folk", "Korean Trap", "Korean Dance"],
  "Brazilian": ["Sertanejo", "Funk Carioca", "MPB (Música Popular Brasileira)", "Brazilian Pop", "Samba", "Bossa Nova", "Pagode", "Brazilian Hip-Hop", "Brazilian Funk", "Forró"],
  "Persian": ["Persian Pop", "Persian Traditional", "Persian Classical", "Persian Folk", "Persian Rock", "Persian Rap", "Persian Dance", "Persian Instrumental", "Persian Dari", "Persian Hip-Hop", "Persian R&B"],
  "Afghan": ["Afghan Pop", "Afghan Traditional", "Afghan Folk", "Dari Music", "Pashto Music", "Afghan Rap", "Afghan Rock", "Afghan Dance", "Afghan Classical", "Afghan Hip-Hop", "Afghan Instrumental"],
  "Tajik": ["Tajik Pop", "Tajik Folk", "Tajik Traditional", "Falak", "Shashmaqom", "Pamiri", "Badakhshani", "Tajik Dance", "Tajik Rap", "Tajik Hip-Hop", "Tajik Rock", "Tajik Instrumental", "Tajik Classical", "Tajik Wedding", "Tajik Modern", "Tajik Acoustic", "Tajik Vocal", "Tajik Duet", "Tajik Children's", "Tajik Music"],
  "Uzbek": ["Uzbek Pop", "Uzbek Folk", "Uzbek Traditional", "Uzbek Classical", "Uzbek Dance", "Uzbek Rock", "Uzbek Rap", "Uzbek Hip-Hop", "Uzbek Trap", "Uzbek Modern", "Uzbek Indie", "Uzbek Instrumental", "Uzbek Wedding Music", "Uzbek Religious", "Uzbek Spiritual"],
  "Kazakh": ["Kazakh Pop", "Kazakh Folk", "Kazakh Traditional", "Kazakh Dance", "Kazakh Rock", "Kazakh Hip-Hop", "Kazakh Rap", "Kazakh Instrumental", "Kazakh Modern Folk", "Kazakh Classical Folk"],
  "Kyrgyz": ["Kyrgyz Pop", "Kyrgyz Folk", "Kyrgyz Traditional", "Kyrgyz Dance", "Kyrgyz Rock", "Kyrgyz Hip-Hop", "Kyrgyz Rap", "Kyrgyz Instrumental", "Kyrgyz Modern Folk", "Kyrgyz Ethnic"],
  "Turkmen": ["Turkmen Pop", "Turkmen Folk", "Turkmen Traditional", "Turkmen Dance", "Turkmen Rock", "Turkmen Instrumental", "Turkmen Modern Folk", "Turkmen Ethnic", "Turkmen Classical Folk", "Turkmen Spiritual"],
  "Turkish": ["Turkish Pop", "Turkish Folk", "Turkish Rock", "Turkish Classical", "Turkish Dance", "Turkish Rap", "Turkish Hip-Hop", "Turkish Trap", "Turkish Drill", "Turkish Arabesque", "Turkish Alternative", "Turkish Indie", "Turkish Electronic", "Turkish House", "Turkish Deep House", "Turkish Techno", "Turkish Trance", "Turkish Rap Pop (Hybrid)", "Turkish Instrumental", "Turkish Traditional", "Turkish Wedding Music", "Anatolian Rock", "Anatolian Folk", "Sufi Music"],
  "Central Asian": ["Central Asian Pop", "Central Asian Folk", "Central Asian Traditional", "Central Asian Dance", "Central Asian Rock", "Central Asian Hip-Hop", "Central Asian Rap", "Central Asian Electronic", "Central Asian House", "Central Asian Instrumental", "Central Asian Classical", "Central Asian Jazz", "Central Asian Fusion", "Central Asian Modern", "Central Asian Spiritual", "Central Asian Wedding Music", "Central Asian Chill", "Central Asian Experimental"],
  "Other": [],
};

export const GENRE_OPTIONS: Array<{ value: string; label: string }> = GENRES.map((g) => ({ value: g, label: g }));

/**
 * Опции жанров (68 из справочника документа). Если у записи уже сохранён жанр,
 * которого нет в списке (напр. старое значение из каталога Broma16), он
 * добавляется первым, чтобы не пропасть из выпадающего списка.
 */
export function genreOptionsWith(current?: string | null): Array<{ value: string; label: string }> {
  if (current && !(GENRES as readonly string[]).includes(current)) {
    return [{ value: current, label: current }, ...GENRE_OPTIONS];
  }
  return GENRE_OPTIONS;
}

/**
 * Поджанры ТОЛЬКО выбранного жанра (иерархия из документа). Если жанр не выбран —
 * пустой список. Уже сохранённый поджанр добавляется, чтобы не пропасть из списка.
 */
export function subgenreOptionsFor(
  genre?: string | null,
  current?: string | null,
): Array<{ value: string; label: string }> {
  const base = (genre && SUBGENRES[genre] ? SUBGENRES[genre] : []).map((s) => ({ value: s, label: s }));
  if (current && !base.some((o) => o.value === current)) {
    return [{ value: current, label: current }, ...base];
  }
  return base;
}

export const SUBGENRE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "2 Tone Ska", label: "2 Tone Ska" }, { value: "A Cappella", label: "A Cappella" }, { value: "Acid Jazz", label: "Acid Jazz" }, { value: "Acid Techno", label: "Acid Techno" },
  { value: "Acoustic Blues", label: "Acoustic Blues" }, { value: "Acoustic Easy Listening", label: "Acoustic Easy Listening" }, { value: "Acoustic Folk", label: "Acoustic Folk" }, { value: "Acoustic Instrumental", label: "Acoustic Instrumental" },
  { value: "Acoustic Pop", label: "Acoustic Pop" }, { value: "Acoustic Singer/Songwriter", label: "Acoustic Singer/Songwriter" }, { value: "Afghan Classical", label: "Afghan Classical" }, { value: "Afghan Dance", label: "Afghan Dance" },
  { value: "Afghan Folk", label: "Afghan Folk" }, { value: "Afghan Hip-Hop", label: "Afghan Hip-Hop" }, { value: "Afghan Instrumental", label: "Afghan Instrumental" }, { value: "Afghan Pop", label: "Afghan Pop" },
  { value: "Afghan Rap", label: "Afghan Rap" }, { value: "Afghan Rock", label: "Afghan Rock" }, { value: "Afghan Traditional", label: "Afghan Traditional" }, { value: "Afro Dance", label: "Afro Dance" },
  { value: "Afro Funk", label: "Afro Funk" }, { value: "Afro Fusion", label: "Afro Fusion" }, { value: "Afro Hip-Hop", label: "Afro Hip-Hop" }, { value: "Afro House", label: "Afro House" },
  { value: "Afro Jazz", label: "Afro Jazz" }, { value: "Afro Pop", label: "Afro Pop" }, { value: "Afro Soul", label: "Afro Soul" }, { value: "Afro Trap", label: "Afro Trap" },
  { value: "Afrobeat", label: "Afrobeat" }, { value: "Afrobeats", label: "Afrobeats" }, { value: "Alternative Hip-Hop", label: "Alternative Hip-Hop" }, { value: "Alternative Metal", label: "Alternative Metal" },
  { value: "Alternative Pop", label: "Alternative Pop" }, { value: "Alternative Rap", label: "Alternative Rap" }, { value: "Alternative Rock", label: "Alternative Rock" }, { value: "Amapiano", label: "Amapiano" },
  { value: "Ambient Instrumental", label: "Ambient Instrumental" }, { value: "Ambient Lo-Fi", label: "Ambient Lo-Fi" }, { value: "Americana Country", label: "Americana Country" }, { value: "Anatolian Folk", label: "Anatolian Folk" },
  { value: "Anatolian Rock", label: "Anatolian Rock" }, { value: "Anime Instrumental", label: "Anime Instrumental" }, { value: "Anime Music", label: "Anime Music" }, { value: "Anime OST", label: "Anime OST" },
  { value: "Anime Pop", label: "Anime Pop" }, { value: "Anime Rock", label: "Anime Rock" }, { value: "Arabic Classical", label: "Arabic Classical" }, { value: "Arabic Dance", label: "Arabic Dance" },
  { value: "Arabic Electronic", label: "Arabic Electronic" }, { value: "Arabic Folk", label: "Arabic Folk" }, { value: "Arabic Hip-Hop", label: "Arabic Hip-Hop" }, { value: "Arabic Pop", label: "Arabic Pop" },
  { value: "Arabic R&B", label: "Arabic R&B" }, { value: "Arabic Rap", label: "Arabic Rap" }, { value: "Arabic Rock", label: "Arabic Rock" }, { value: "Arabic Traditional", label: "Arabic Traditional" },
  { value: "Arena Rock", label: "Arena Rock" }, { value: "Art Pop", label: "Art Pop" }, { value: "Atmospheric DnB", label: "Atmospheric DnB" }, { value: "Avant-Garde", label: "Avant-Garde" },
  { value: "Bachata", label: "Bachata" }, { value: "Background Music", label: "Background Music" }, { value: "Background Score", label: "Background Score" }, { value: "Badakhshani", label: "Badakhshani" },
  { value: "Baroque", label: "Baroque" }, { value: "Bass House", label: "Bass House" }, { value: "Bebop", label: "Bebop" }, { value: "Bedouin", label: "Bedouin" },
  { value: "Bedroom Pop", label: "Bedroom Pop" }, { value: "Bhangra", label: "Bhangra" }, { value: "Big Band", label: "Big Band" }, { value: "Big Room", label: "Big Room" },
  { value: "Biography Audiobook", label: "Biography Audiobook" }, { value: "Black Metal", label: "Black Metal" }, { value: "Bluegrass", label: "Bluegrass" }, { value: "Blues Rock", label: "Blues Rock" },
  { value: "Bollywood", label: "Bollywood" }, { value: "Bollywood Classical Fusion", label: "Bollywood Classical Fusion" }, { value: "Bollywood Dance", label: "Bollywood Dance" }, { value: "Bollywood Pop", label: "Bollywood Pop" },
  { value: "Bollywood Romantic", label: "Bollywood Romantic" }, { value: "Bollywood Soundtrack", label: "Bollywood Soundtrack" }, { value: "Boom Bap", label: "Boom Bap" }, { value: "Bossa Nova", label: "Bossa Nova" },
  { value: "Brazilian Funk", label: "Brazilian Funk" }, { value: "Brazilian Hip-Hop", label: "Brazilian Hip-Hop" }, { value: "Brazilian Pop", label: "Brazilian Pop" }, { value: "Breakbeat", label: "Breakbeat" },
  { value: "Brostep", label: "Brostep" }, { value: "C-Pop", label: "C-Pop" }, { value: "Cantopop", label: "Cantopop" }, { value: "Cartoon Songs", label: "Cartoon Songs" },
  { value: "Celtic Folk", label: "Celtic Folk" }, { value: "Central Asian Chill", label: "Central Asian Chill" }, { value: "Central Asian Classical", label: "Central Asian Classical" }, { value: "Central Asian Dance", label: "Central Asian Dance" },
  { value: "Central Asian Electronic", label: "Central Asian Electronic" }, { value: "Central Asian Experimental", label: "Central Asian Experimental" }, { value: "Central Asian Folk", label: "Central Asian Folk" }, { value: "Central Asian Fusion", label: "Central Asian Fusion" },
  { value: "Central Asian Hip-Hop", label: "Central Asian Hip-Hop" }, { value: "Central Asian House", label: "Central Asian House" }, { value: "Central Asian Instrumental", label: "Central Asian Instrumental" }, { value: "Central Asian Jazz", label: "Central Asian Jazz" },
  { value: "Central Asian Modern", label: "Central Asian Modern" }, { value: "Central Asian Pop", label: "Central Asian Pop" }, { value: "Central Asian Rap", label: "Central Asian Rap" }, { value: "Central Asian Rock", label: "Central Asian Rock" },
  { value: "Central Asian Spiritual", label: "Central Asian Spiritual" }, { value: "Central Asian Traditional", label: "Central Asian Traditional" }, { value: "Central Asian Wedding Music", label: "Central Asian Wedding Music" }, { value: "Ceremonial Music", label: "Ceremonial Music" },
  { value: "Chamber Music", label: "Chamber Music" }, { value: "Chicago Blues", label: "Chicago Blues" }, { value: "Chill Ambient", label: "Chill Ambient" }, { value: "Chill Dubstep", label: "Chill Dubstep" },
  { value: "Chill Electronic", label: "Chill Electronic" }, { value: "Chillhop", label: "Chillhop" }, { value: "Chinese Classical", label: "Chinese Classical" }, { value: "Chinese EDM", label: "Chinese EDM" },
  { value: "Chinese Folk", label: "Chinese Folk" }, { value: "Chinese Hip-Hop", label: "Chinese Hip-Hop" }, { value: "Chinese Indie", label: "Chinese Indie" }, { value: "Chinese Rock", label: "Chinese Rock" },
  { value: "Chinese Traditional", label: "Chinese Traditional" }, { value: "Choir", label: "Choir" }, { value: "Christian Gospel", label: "Christian Gospel" }, { value: "Christian Pop", label: "Christian Pop" },
  { value: "Christian Rap", label: "Christian Rap" }, { value: "Christian Rock", label: "Christian Rock" }, { value: "Christmas Music", label: "Christmas Music" }, { value: "Cinematic Ambient", label: "Cinematic Ambient" },
  { value: "Cinematic Instrumental", label: "Cinematic Instrumental" }, { value: "Cinematic Score", label: "Cinematic Score" }, { value: "City Pop", label: "City Pop" }, { value: "Classic Disco", label: "Classic Disco" },
  { value: "Classic Karaoke", label: "Classic Karaoke" }, { value: "Classic Rock", label: "Classic Rock" }, { value: "Classical Opera", label: "Classical Opera" }, { value: "Club Dance", label: "Club Dance" },
  { value: "Club House", label: "Club House" }, { value: "Comedy Story", label: "Comedy Story" }, { value: "Conscious Rap", label: "Conscious Rap" }, { value: "Contemporary Gospel", label: "Contemporary Gospel" },
  { value: "Contemporary Jazz", label: "Contemporary Jazz" }, { value: "Contemporary R&B", label: "Contemporary R&B" }, { value: "Country Pop", label: "Country Pop" }, { value: "Country Rock", label: "Country Rock" },
  { value: "Crossover Opera", label: "Crossover Opera" }, { value: "Dance EDM", label: "Dance EDM" }, { value: "Dance Pop", label: "Dance Pop" }, { value: "Dancehall", label: "Dancehall" },
  { value: "Dari Music", label: "Dari Music" }, { value: "Dark Ambient", label: "Dark Ambient" }, { value: "Darkstep", label: "Darkstep" }, { value: "Death Metal", label: "Death Metal" },
  { value: "Deep Dance", label: "Deep Dance" }, { value: "Deep House", label: "Deep House" }, { value: "Delta Blues", label: "Delta Blues" }, { value: "Detroit Techno", label: "Detroit Techno" },
  { value: "Devotional", label: "Devotional" }, { value: "Devotional Music", label: "Devotional Music" }, { value: "Digital Pop", label: "Digital Pop" }, { value: "Disco Dance", label: "Disco Dance" },
  { value: "Disco Funk", label: "Disco Funk" }, { value: "Disco Pop", label: "Disco Pop" }, { value: "Dream Pop", label: "Dream Pop" }, { value: "Drill", label: "Drill" },
  { value: "Drone Ambient", label: "Drone Ambient" }, { value: "Drum & Bass", label: "Drum & Bass" }, { value: "Drumstep", label: "Drumstep" }, { value: "Dub Reggae", label: "Dub Reggae" },
  { value: "Dubstep", label: "Dubstep" }, { value: "Duet", label: "Duet" }, { value: "East Coast Rap", label: "East Coast Rap" }, { value: "Easter Music", label: "Easter Music" },
  { value: "EDM", label: "EDM" }, { value: "Educational Audiobook", label: "Educational Audiobook" }, { value: "Educational Songs", label: "Educational Songs" }, { value: "Egyptian Hip-Hop", label: "Egyptian Hip-Hop" },
  { value: "Egyptian Pop", label: "Egyptian Pop" }, { value: "Egyptian Rap", label: "Egyptian Rap" }, { value: "Egyptian Rock", label: "Egyptian Rock" }, { value: "Eid Music", label: "Eid Music" },
  { value: "Electric Blues", label: "Electric Blues" }, { value: "Electro", label: "Electro" }, { value: "Electro Dance", label: "Electro Dance" }, { value: "Electro Folk", label: "Electro Folk" },
  { value: "Electro Funk", label: "Electro Funk" }, { value: "Electro House", label: "Electro House" }, { value: "Electro Pop", label: "Electro Pop" }, { value: "Electro Rock", label: "Electro Rock" },
  { value: "Electronic Dance", label: "Electronic Dance" }, { value: "Electronica", label: "Electronica" }, { value: "Electropop", label: "Electropop" }, { value: "Emotional Ballads", label: "Emotional Ballads" },
  { value: "Enka", label: "Enka" }, { value: "Ethnic Fusion", label: "Ethnic Fusion" }, { value: "Ethnic Traditional", label: "Ethnic Traditional" }, { value: "Euro House", label: "Euro House" },
  { value: "Eurodance", label: "Eurodance" }, { value: "Europop", label: "Europop" }, { value: "Experimental Alternative", label: "Experimental Alternative" }, { value: "Experimental Dubstep", label: "Experimental Dubstep" },
  { value: "Experimental Electronic", label: "Experimental Electronic" }, { value: "Experimental Rock", label: "Experimental Rock" }, { value: "Falak", label: "Falak" }, { value: "Female Vocal", label: "Female Vocal" },
  { value: "Fiction Audiobook", label: "Fiction Audiobook" }, { value: "Film Score", label: "Film Score" }, { value: "Filmi", label: "Filmi" }, { value: "Folk Country", label: "Folk Country" },
  { value: "Folk Rock", label: "Folk Rock" }, { value: "Folk Singer/Songwriter", label: "Folk Singer/Songwriter" }, { value: "Folk Traditional", label: "Folk Traditional" }, { value: "Forró", label: "Forró" },
  { value: "Free Jazz", label: "Free Jazz" }, { value: "Freestyle", label: "Freestyle" }, { value: "French House", label: "French House" }, { value: "French Pop", label: "French Pop" },
  { value: "Funk", label: "Funk" }, { value: "Funk Carioca", label: "Funk Carioca" }, { value: "Funk Disco", label: "Funk Disco" }, { value: "Funk Rock", label: "Funk Rock" },
  { value: "Future Bass", label: "Future Bass" }, { value: "Future Dubstep", label: "Future Dubstep" }, { value: "Future House", label: "Future House" }, { value: "Game Soundtrack", label: "Game Soundtrack" },
  { value: "Gangsta Rap", label: "Gangsta Rap" }, { value: "Garage Rock", label: "Garage Rock" }, { value: "German Pop", label: "German Pop" }, { value: "Global Beats", label: "Global Beats" },
  { value: "Gospel Choir", label: "Gospel Choir" }, { value: "Gurbani", label: "Gurbani" }, { value: "Halloween Music", label: "Halloween Music" }, { value: "Hard Rock", label: "Hard Rock" },
  { value: "Hard Techno", label: "Hard Techno" }, { value: "Hard Trance", label: "Hard Trance" }, { value: "Hardcore Punk", label: "Hardcore Punk" }, { value: "Hardstyle", label: "Hardstyle" },
  { value: "Healing Music", label: "Healing Music" }, { value: "Heavy Dubstep", label: "Heavy Dubstep" }, { value: "Heavy Metal", label: "Heavy Metal" }, { value: "Heritage Music", label: "Heritage Music" },
  { value: "Hi-NRG", label: "Hi-NRG" }, { value: "Highlife", label: "Highlife" }, { value: "Hip-Hop", label: "Hip-Hop" }, { value: "House", label: "House" },
  { value: "House Dance", label: "House Dance" }, { value: "IDM", label: "IDM" }, { value: "Improvisation", label: "Improvisation" }, { value: "Indian Classical", label: "Indian Classical" },
  { value: "Indian Fusion", label: "Indian Fusion" }, { value: "Indian Pop", label: "Indian Pop" }, { value: "Indie Alternative", label: "Indie Alternative" }, { value: "Indie Dance", label: "Indie Dance" },
  { value: "Indie Electronic", label: "Indie Electronic" }, { value: "Indie Folk", label: "Indie Folk" }, { value: "Indie Pop", label: "Indie Pop" }, { value: "Indie Punk", label: "Indie Punk" },
  { value: "Indie Rock", label: "Indie Rock" }, { value: "Indie Singer/Songwriter", label: "Indie Singer/Songwriter" }, { value: "Industrial Techno", label: "Industrial Techno" }, { value: "Instrumental Karaoke", label: "Instrumental Karaoke" },
  { value: "Instrumental Pop", label: "Instrumental Pop" }, { value: "Instrumental Rock", label: "Instrumental Rock" }, { value: "Islamic Nasheed", label: "Islamic Nasheed" }, { value: "Italo Dance", label: "Italo Dance" },
  { value: "Italo Disco", label: "Italo Disco" }, { value: "J-Anime Fusion", label: "J-Anime Fusion" }, { value: "J-Pop", label: "J-Pop" }, { value: "J-Rock", label: "J-Rock" },
  { value: "Japanese EDM", label: "Japanese EDM" }, { value: "Japanese Folk", label: "Japanese Folk" }, { value: "Japanese Hip-Hop", label: "Japanese Hip-Hop" }, { value: "Japanese Indie", label: "Japanese Indie" },
  { value: "Japanese Pop", label: "Japanese Pop" }, { value: "Jazz Funk", label: "Jazz Funk" }, { value: "Jazz Fusion", label: "Jazz Fusion" }, { value: "Jazzhop", label: "Jazzhop" },
  { value: "Jump Up", label: "Jump Up" }, { value: "Jungle", label: "Jungle" }, { value: "K-Ballad", label: "K-Ballad" }, { value: "K-Hip-Hop", label: "K-Hip-Hop" },
  { value: "K-Indie", label: "K-Indie" }, { value: "K-Pop", label: "K-Pop" }, { value: "K-R&B", label: "K-R&B" }, { value: "K-Rock", label: "K-Rock" },
  { value: "Kazakh Classical Folk", label: "Kazakh Classical Folk" }, { value: "Kazakh Dance", label: "Kazakh Dance" }, { value: "Kazakh Folk", label: "Kazakh Folk" }, { value: "Kazakh Hip-Hop", label: "Kazakh Hip-Hop" },
  { value: "Kazakh Instrumental", label: "Kazakh Instrumental" }, { value: "Kazakh Modern Folk", label: "Kazakh Modern Folk" }, { value: "Kazakh Pop", label: "Kazakh Pop" }, { value: "Kazakh Rap", label: "Kazakh Rap" },
  { value: "Kazakh Rock", label: "Kazakh Rock" }, { value: "Kazakh Traditional", label: "Kazakh Traditional" }, { value: "Khaliji", label: "Khaliji" }, { value: "Kids Folk", label: "Kids Folk" },
  { value: "Kids Pop", label: "Kids Pop" }, { value: "Korean Dance", label: "Korean Dance" }, { value: "Korean EDM", label: "Korean EDM" }, { value: "Korean Folk", label: "Korean Folk" },
  { value: "Korean Pop", label: "Korean Pop" }, { value: "Korean Trap", label: "Korean Trap" }, { value: "Kyrgyz Dance", label: "Kyrgyz Dance" }, { value: "Kyrgyz Ethnic", label: "Kyrgyz Ethnic" },
  { value: "Kyrgyz Folk", label: "Kyrgyz Folk" }, { value: "Kyrgyz Hip-Hop", label: "Kyrgyz Hip-Hop" }, { value: "Kyrgyz Instrumental", label: "Kyrgyz Instrumental" }, { value: "Kyrgyz Modern Folk", label: "Kyrgyz Modern Folk" },
  { value: "Kyrgyz Pop", label: "Kyrgyz Pop" }, { value: "Kyrgyz Rap", label: "Kyrgyz Rap" }, { value: "Kyrgyz Rock", label: "Kyrgyz Rock" }, { value: "Kyrgyz Traditional", label: "Kyrgyz Traditional" },
  { value: "Latin Dance", label: "Latin Dance" }, { value: "Latin Jazz", label: "Latin Jazz" }, { value: "Latin Pop", label: "Latin Pop" }, { value: "Latin Rap", label: "Latin Rap" },
  { value: "Latin Rock", label: "Latin Rock" }, { value: "Latin Trap", label: "Latin Trap" }, { value: "Latin Urban", label: "Latin Urban" }, { value: "Levantine", label: "Levantine" },
  { value: "Liquid DnB", label: "Liquid DnB" }, { value: "Lo-Fi Chill", label: "Lo-Fi Chill" }, { value: "Lo-Fi Hip-Hop", label: "Lo-Fi Hip-Hop" }, { value: "Lo-Fi Indie", label: "Lo-Fi Indie" },
  { value: "Lounge Music", label: "Lounge Music" }, { value: "Lovers Rock", label: "Lovers Rock" }, { value: "Lullabies", label: "Lullabies" }, { value: "Maghrebi", label: "Maghrebi" },
  { value: "Mahraganat", label: "Mahraganat" }, { value: "Male Vocal", label: "Male Vocal" }, { value: "Mandopop", label: "Mandopop" }, { value: "Mantra Music", label: "Mantra Music" },
  { value: "Meditation Music", label: "Meditation Music" }, { value: "Melodic Dubstep", label: "Melodic Dubstep" }, { value: "Melodic Techno", label: "Melodic Techno" }, { value: "Merengue", label: "Merengue" },
  { value: "Minimal Ambient", label: "Minimal Ambient" }, { value: "Minimal Classical", label: "Minimal Classical" }, { value: "Minimal Experimental", label: "Minimal Experimental" }, { value: "Minimal Techno", label: "Minimal Techno" },
  { value: "Modern Blues", label: "Modern Blues" }, { value: "Modern Classical", label: "Modern Classical" }, { value: "Modern Country", label: "Modern Country" }, { value: "Modern Folk", label: "Modern Folk" },
  { value: "Modern Opera", label: "Modern Opera" }, { value: "Modern World Fusion", label: "Modern World Fusion" }, { value: "Motivational Speech", label: "Motivational Speech" }, { value: "Motown", label: "Motown" },
  { value: "MPB (Música Popular Brasileira)", label: "MPB (Música Popular Brasileira)" }, { value: "Mumble Rap", label: "Mumble Rap" }, { value: "National Holiday Music", label: "National Holiday Music" }, { value: "Nature Sounds", label: "Nature Sounds" },
  { value: "Neo Soul", label: "Neo Soul" }, { value: "Neurofunk", label: "Neurofunk" }, { value: "New Year Music", label: "New Year Music" }, { value: "Noise Music", label: "Noise Music" },
  { value: "Non-Fiction Audiobook", label: "Non-Fiction Audiobook" }, { value: "Nu Disco", label: "Nu Disco" }, { value: "Nu Metal", label: "Nu Metal" }, { value: "Nursery Rhymes", label: "Nursery Rhymes" },
  { value: "Opera Vocal", label: "Opera Vocal" }, { value: "Orchestral", label: "Orchestral" }, { value: "Pagode", label: "Pagode" }, { value: "Pamiri", label: "Pamiri" },
  { value: "Parody", label: "Parody" }, { value: "Party Karaoke", label: "Party Karaoke" }, { value: "Pashto Music", label: "Pashto Music" }, { value: "Peak Time Techno", label: "Peak Time Techno" },
  { value: "Performance Poetry", label: "Performance Poetry" }, { value: "Persian Classical", label: "Persian Classical" }, { value: "Persian Dance", label: "Persian Dance" }, { value: "Persian Dari", label: "Persian Dari" },
  { value: "Persian Folk", label: "Persian Folk" }, { value: "Persian Hip-Hop", label: "Persian Hip-Hop" }, { value: "Persian Instrumental", label: "Persian Instrumental" }, { value: "Persian Pop", label: "Persian Pop" },
  { value: "Persian R&B", label: "Persian R&B" }, { value: "Persian Rap", label: "Persian Rap" }, { value: "Persian Rock", label: "Persian Rock" }, { value: "Persian Traditional", label: "Persian Traditional" },
  { value: "Piano Classical", label: "Piano Classical" }, { value: "Piano Instrumental", label: "Piano Instrumental" }, { value: "Poetry", label: "Poetry" }, { value: "Political Speech", label: "Political Speech" },
  { value: "Pop", label: "Pop" }, { value: "Pop Dance", label: "Pop Dance" }, { value: "Pop Folk", label: "Pop Folk" }, { value: "Pop Funk", label: "Pop Funk" },
  { value: "Pop Karaoke", label: "Pop Karaoke" }, { value: "Pop Punk", label: "Pop Punk" }, { value: "Pop Rock", label: "Pop Rock" }, { value: "Pop Singer/Songwriter", label: "Pop Singer/Songwriter" },
  { value: "Post Alternative", label: "Post Alternative" }, { value: "Post Punk", label: "Post Punk" }, { value: "Power Metal", label: "Power Metal" }, { value: "Praise Music", label: "Praise Music" },
  { value: "Progr", label: "Progr" }, { value: "Progressive Dance", label: "Progressive Dance" }, { value: "Progressive House", label: "Progressive House" }, { value: "Progressive Metal", label: "Progressive Metal" },
  { value: "Progressive Rock", label: "Progressive Rock" }, { value: "Progressive Trance", label: "Progressive Trance" }, { value: "Psytrance", label: "Psytrance" }, { value: "Punjabi Folk", label: "Punjabi Folk" },
  { value: "Punjabi Hip-Hop", label: "Punjabi Hip-Hop" }, { value: "Punjabi Pop", label: "Punjabi Pop" }, { value: "Punjabi Rap", label: "Punjabi Rap" }, { value: "Punjabi Remix", label: "Punjabi Remix" },
  { value: "Punjabi Romantic", label: "Punjabi Romantic" }, { value: "Punk Rock", label: "Punk Rock" }, { value: "Rai", label: "Rai" }, { value: "Ramadan Music", label: "Ramadan Music" },
  { value: "Rap", label: "Rap" }, { value: "Rap Rock", label: "Rap Rock" }, { value: "Reggae Fusion", label: "Reggae Fusion" }, { value: "Reggae Ska Fusion", label: "Reggae Ska Fusion" },
  { value: "Reggaeton", label: "Reggaeton" }, { value: "Regional Karaoke", label: "Regional Karaoke" }, { value: "Regional Traditional", label: "Regional Traditional" }, { value: "Relaxation Music", label: "Relaxation Music" },
  { value: "Remix Dance", label: "Remix Dance" }, { value: "Rhythmic Soul", label: "Rhythmic Soul" }, { value: "Rock Karaoke", label: "Rock Karaoke" }, { value: "Romantic Classical", label: "Romantic Classical" },
  { value: "Romantic Easy Listening", label: "Romantic Easy Listening" }, { value: "Roots Reggae", label: "Roots Reggae" }, { value: "Russian Pop", label: "Russian Pop" }, { value: "Russian Rap", label: "Russian Rap" },
  { value: "Sacred Music", label: "Sacred Music" }, { value: "Salsa", label: "Salsa" }, { value: "Samba", label: "Samba" }, { value: "Satire", label: "Satire" },
  { value: "Self-Help Audiobook", label: "Self-Help Audiobook" }, { value: "Sertanejo", label: "Sertanejo" }, { value: "Shashmaqom", label: "Shashmaqom" }, { value: "Ska Punk", label: "Ska Punk" },
  { value: "Sketch Comedy", label: "Sketch Comedy" }, { value: "Slow Rock", label: "Slow Rock" }, { value: "Smooth Jazz", label: "Smooth Jazz" }, { value: "Soft Pop", label: "Soft Pop" },
  { value: "Soft Rock", label: "Soft Rock" }, { value: "Soukous", label: "Soukous" }, { value: "Soul", label: "Soul" }, { value: "Sound Art", label: "Sound Art" },
  { value: "Southern Rock", label: "Southern Rock" }, { value: "Space Ambient", label: "Space Ambient" }, { value: "Space Rock", label: "Space Rock" }, { value: "Speech", label: "Speech" },
  { value: "Spiritual Music", label: "Spiritual Music" }, { value: "Spiritual New Age", label: "Spiritual New Age" }, { value: "Stand-up Comedy", label: "Stand-up Comedy" }, { value: "Story Audiobook", label: "Story Audiobook" },
  { value: "Storytelling", label: "Storytelling" }, { value: "Storytelling Songs", label: "Storytelling Songs" }, { value: "Study Beats", label: "Study Beats" }, { value: "Sufi Music", label: "Sufi Music" },
  { value: "Swing", label: "Swing" }, { value: "Symphonic Opera", label: "Symphonic Opera" }, { value: "Symphonic Rock", label: "Symphonic Rock" }, { value: "Symphony", label: "Symphony" },
  { value: "Synth Pop", label: "Synth Pop" }, { value: "Synthwave", label: "Synthwave" }, { value: "Tajik Acoustic", label: "Tajik Acoustic" }, { value: "Tajik Children's", label: "Tajik Children's" },
  { value: "Tajik Classical", label: "Tajik Classical" }, { value: "Tajik Dance", label: "Tajik Dance" }, { value: "Tajik Duet", label: "Tajik Duet" }, { value: "Tajik Folk", label: "Tajik Folk" },
  { value: "Tajik Hip-Hop", label: "Tajik Hip-Hop" }, { value: "Tajik Instrumental", label: "Tajik Instrumental" }, { value: "Tajik Modern", label: "Tajik Modern" }, { value: "Tajik Music", label: "Tajik Music" },
  { value: "Tajik Pop", label: "Tajik Pop" }, { value: "Tajik Rap", label: "Tajik Rap" }, { value: "Tajik Rock", label: "Tajik Rock" }, { value: "Tajik Traditional", label: "Tajik Traditional" },
  { value: "Tajik Vocal", label: "Tajik Vocal" }, { value: "Tajik Wedding", label: "Tajik Wedding" }, { value: "Tamil Pop", label: "Tamil Pop" }, { value: "Tech Dance", label: "Tech Dance" },
  { value: "Tech House", label: "Tech House" }, { value: "Techno", label: "Techno" }, { value: "Teen Pop", label: "Teen Pop" }, { value: "Telugu Pop", label: "Telugu Pop" },
  { value: "Traditional Country", label: "Traditional Country" }, { value: "Traditional Folk", label: "Traditional Folk" }, { value: "Traditional Gospel", label: "Traditional Gospel" }, { value: "Traditional Ska", label: "Traditional Ska" },
  { value: "Traditional World", label: "Traditional World" }, { value: "Trailer Music", label: "Trailer Music" }, { value: "Trance", label: "Trance" }, { value: "Trap", label: "Trap" },
  { value: "Trap Soul", label: "Trap Soul" }, { value: "Tropical Dance", label: "Tropical Dance" }, { value: "Tropical House", label: "Tropical House" }, { value: "Turkish Alternative", label: "Turkish Alternative" },
  { value: "Turkish Arabesque", label: "Turkish Arabesque" }, { value: "Turkish Classical", label: "Turkish Classical" }, { value: "Turkish Dance", label: "Turkish Dance" }, { value: "Turkish Deep House", label: "Turkish Deep House" },
  { value: "Turkish Drill", label: "Turkish Drill" }, { value: "Turkish Electronic", label: "Turkish Electronic" }, { value: "Turkish Folk", label: "Turkish Folk" }, { value: "Turkish Hip-Hop", label: "Turkish Hip-Hop" },
  { value: "Turkish House", label: "Turkish House" }, { value: "Turkish Indie", label: "Turkish Indie" }, { value: "Turkish Instrumental", label: "Turkish Instrumental" }, { value: "Turkish Pop", label: "Turkish Pop" },
  { value: "Turkish Rap", label: "Turkish Rap" }, { value: "Turkish Rap Pop (Hybrid)", label: "Turkish Rap Pop (Hybrid)" }, { value: "Turkish Rock", label: "Turkish Rock" }, { value: "Turkish Techno", label: "Turkish Techno" },
  { value: "Turkish Traditional", label: "Turkish Traditional" }, { value: "Turkish Trance", label: "Turkish Trance" }, { value: "Turkish Trap", label: "Turkish Trap" }, { value: "Turkish Wedding Music", label: "Turkish Wedding Music" },
  { value: "Turkmen Classical Folk", label: "Turkmen Classical Folk" }, { value: "Turkmen Dance", label: "Turkmen Dance" }, { value: "Turkmen Ethnic", label: "Turkmen Ethnic" }, { value: "Turkmen Folk", label: "Turkmen Folk" },
  { value: "Turkmen Instrumental", label: "Turkmen Instrumental" }, { value: "Turkmen Modern Folk", label: "Turkmen Modern Folk" }, { value: "Turkmen Pop", label: "Turkmen Pop" }, { value: "Turkmen Rock", label: "Turkmen Rock" },
  { value: "Turkmen Spiritual", label: "Turkmen Spiritual" }, { value: "Turkmen Traditional", label: "Turkmen Traditional" }, { value: "TV Soundtrack", label: "TV Soundtrack" }, { value: "Underground Rap", label: "Underground Rap" },
  { value: "Uplifting Trance", label: "Uplifting Trance" }, { value: "Urban Dance", label: "Urban Dance" }, { value: "Urban Gospel", label: "Urban Gospel" }, { value: "Uzbek Classical", label: "Uzbek Classical" },
  { value: "Uzbek Dance", label: "Uzbek Dance" }, { value: "Uzbek Folk", label: "Uzbek Folk" }, { value: "Uzbek Hip-Hop", label: "Uzbek Hip-Hop" }, { value: "Uzbek Indie", label: "Uzbek Indie" },
  { value: "Uzbek Instrumental", label: "Uzbek Instrumental" }, { value: "Uzbek Modern", label: "Uzbek Modern" }, { value: "Uzbek Pop", label: "Uzbek Pop" }, { value: "Uzbek Rap", label: "Uzbek Rap" },
  { value: "Uzbek Religious", label: "Uzbek Religious" }, { value: "Uzbek Rock", label: "Uzbek Rock" }, { value: "Uzbek Spiritual", label: "Uzbek Spiritual" }, { value: "Uzbek Traditional", label: "Uzbek Traditional" },
  { value: "Uzbek Trap", label: "Uzbek Trap" }, { value: "Uzbek Wedding Music", label: "Uzbek Wedding Music" }, { value: "Valentine’s Day Music", label: "Valentine’s Day Music" }, { value: "Vocal Dance", label: "Vocal Dance" },
  { value: "Vocal House", label: "Vocal House" }, { value: "Vocal Jazz", label: "Vocal Jazz" }, { value: "Vocal Opera", label: "Vocal Opera" }, { value: "Vocal Pop", label: "Vocal Pop" },
  { value: "Vocal Trance", label: "Vocal Trance" }, { value: "Vocaloid", label: "Vocaloid" }, { value: "West Coast Rap", label: "West Coast Rap" }, { value: "World Folk", label: "World Folk" },
  { value: "World Fusion", label: "World Fusion" }, { value: "Worship Music", label: "Worship Music" }, { value: "Yoga Music", label: "Yoga Music" },
];

export const LANGS: Array<{ value: string; label: string }> = [
  { value: "Tajik",   label: "Tajik" },
  { value: "Russian", label: "Russian" },
  { value: "English", label: "English" },
  { value: "Persian", label: "Persian" },
  { value: "Uzbek",   label: "Uzbek" },
  { value: "Arabic",  label: "Arabic" },
  { value: "Turkish", label: "Turkish" },
];

export const ARTIST_ROLES: Array<{ value: ReleaseArtistRefRole; label: string }> = [
  { value: "primary",   label: "Primary" },
  { value: "featuring", label: "Featuring" },
  { value: "with",      label: "With" },
  { value: "remixer",   label: "Remixer" },
];

export const WRITER_ROLES: Array<{ value: TrackWriter["role"]; label: string }> = [
  { value: "composer",   label: "Composer" },
  { value: "lyricist",   label: "Lyricist" },
  { value: "songwriter", label: "Songwriter" },
  { value: "arranger",   label: "Arranger" },
];

export const DISPLAY_ARTIST_ROLES: Array<{ value: TrackDisplayArtist["role"]; label: string }> = [
  { value: "primary",   label: "Primary" },
  { value: "featuring", label: "Featuring" },
  { value: "with",      label: "With" },
  { value: "remixer",   label: "Remixer" },
];

export const PERFORMER_ROLES = [
  "vocals", "background_vocals", "guitar", "bass", "drums",
  "keyboards", "music_producer", "piano", "violin", "other",
] as const;

export const PRODUCTION_ROLES = [
  "producer", "recording_engineer", "mixing_engineer", "mastering_engineer", "other",
] as const;

export const COUNTRIES: Array<{ code: string; name: string }> = [
  { code: "TJ", name: "Tajikistan" },
  { code: "RU", name: "Russia" },
  { code: "UZ", name: "Uzbekistan" },
  { code: "KZ", name: "Kazakhstan" },
  { code: "KG", name: "Kyrgyzstan" },
  { code: "TR", name: "Turkey" },
  { code: "IR", name: "Iran" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
];

export const DSP_CATEGORY_LABELS: Record<string, string> = {
  streaming: "Стриминг",
  download:  "Загрузки",
  social:    "Социальные / TikTok",
  video:     "Видео",
  regional:  "Региональные",
};

export const STEPS = [
  { key: "details",    label: "Информация о релизе" },
  { key: "tracks",     label: "Треки" },
  { key: "delivery",   label: "Доставка на DSP" },
  { key: "submission", label: "Отправка на модерацию" },
] as const;

export type StepKey = (typeof STEPS)[number]["key"];

export type ContribDA = TrackDisplayArtist;
export type ContribW = TrackWriter;
export type ContribP = TrackPerformer;
export type ContribProd = TrackProductionMember;
