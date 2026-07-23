export type MetadataLanguageOption = { value: string; label: string };

export const DEFAULT_METADATA_LANGUAGE = "English";

// Product-level metadata languages. Keep this list independent from the Broma16
// technical dictionary: that dictionary contains codes and aliases intended for
// delivery integrations, while these values are stored in release/track metadata.
const PRIORITY_LANGUAGES: MetadataLanguageOption[] = [
  { value: "Russian", label: "Russian" },
  { value: "Tajik", label: "Tajik" },
  { value: "English", label: "English" },
  { value: "Persian", label: "Persian (Farsi)" },
  { value: "Spanish", label: "Spanish" },
  { value: "Dari", label: "Dari" },
  { value: "Portuguese", label: "Portuguese" },
  { value: "Pashto", label: "Pashto" },
  { value: "French", label: "French" },
  { value: "Uzbek", label: "Uzbek" },
  { value: "German", label: "German" },
  { value: "Kazakh", label: "Kazakh" },
  { value: "Italian", label: "Italian" },
  { value: "Kyrgyz", label: "Kyrgyz" },
  { value: "Turkmen", label: "Turkmen" },
  { value: "Ukrainian", label: "Ukrainian" },
  { value: "Turkish", label: "Turkish" },
  { value: "Polish", label: "Polish" },
  { value: "Arabic", label: "Arabic" },
  { value: "Hindi", label: "Hindi" },
  { value: "Korean", label: "Korean" },
  { value: "Japanese", label: "Japanese" },
  { value: "Other", label: "Other" },
];

const OTHER_LANGUAGE_NAMES = [
  "Abkhazian", "Afrikaans", "Albanian", "Amharic", "Aragonese", "Armenian",
  "Assamese", "Avaric", "Avestan", "Aymara", "Azerbaijani", "Bambara",
  "Bashkir", "Basque", "Belarusian", "Bengali", "Bihari", "Bislama",
  "Bosnian", "Breton", "Bulgarian", "Burmese", "Catalan", "Chamorro",
  "Chechen", "Chinese", "Chinese (Simplified)", "Chinese (Traditional)",
  "Chuvash", "Cornish", "Corsican", "Cree", "Croatian", "Czech", "Danish",
  "Dutch", "Esperanto", "Estonian", "Ewe", "Faroese", "Fijian", "Finnish",
  "Fula (Fulah / Pulaar / Pular)", "Galician", "Georgian", "Greek", "Guarani",
  "Gujarati", "Haitian Creole", "Hausa", "Hawaiian", "Hebrew", "Herero",
  "Hiri Motu", "Hungarian", "Icelandic", "Ido", "Igbo", "Indonesian",
  "Interlingua", "Inuktitut", "Inupiaq", "Irish", "Javanese", "Kalaallisut",
  "Kannada", "Kanuri", "Kashmiri", "Kikuyu", "Kinyarwanda", "Kirundi",
  "Komi", "Kongo", "Kurdish", "Kwanyama", "Lao", "Latin", "Latvian",
  "Lemko", "Limburgish", "Lingala", "Lithuanian", "Luba-Katanga", "Luganda",
  "Luxembourgish", "Macedonian", "Malagasy", "Malay", "Malayalam", "Maldivian",
  "Maltese", "Manx", "Maori", "Marathi", "Marshallese", "Mongolian", "Nauru",
  "Navajo", "Ndonga", "Nepali", "Norwegian", "Nuer", "Occitan", "Odia",
  "Ojibwe", "Old Church Slavonic", "Oromo", "Ossetian", "Pali", "Punjabi",
  "Romanian", "Romansh", "Samoan", "Sango", "Sanskrit", "Sardinian",
  "Serbian", "Shona", "Sindhi", "Sinhala", "Slovak", "Slovene", "Somali",
  "Southern Sotho", "South Ndebele", "Sundanese", "Swahili", "Swati",
  "Swedish", "Tagalog", "Tahitian", "Tamil", "Tatar", "Telugu", "Thai",
  "Tibetan", "Tigrinya", "Tonga", "Tsonga", "Tswana", "Urdu", "Uyghur",
  "Venda", "Vietnamese", "Volapuk", "Walloon", "Welsh", "Western Frisian",
  "Wolof", "Xhosa", "Yiddish", "Yoruba", "Zhuang", "Zulu",
] as const;

export const METADATA_LANGUAGE_OPTIONS: MetadataLanguageOption[] = [
  ...PRIORITY_LANGUAGES,
  ...OTHER_LANGUAGE_NAMES.map((name) => ({ value: name, label: name })),
];

/** Preserve a legacy/custom stored value without polluting the canonical list. */
export function metadataLanguageOptionsWith(current?: string | null): MetadataLanguageOption[] {
  const value = current?.trim();
  if (!value || METADATA_LANGUAGE_OPTIONS.some((option) => option.value === value)) {
    return METADATA_LANGUAGE_OPTIONS;
  }
  return [...METADATA_LANGUAGE_OPTIONS, { value, label: value }];
}
