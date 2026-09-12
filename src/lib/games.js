// The 6 free games. Images are the exact user-supplied assets (one generated
// only for Formula Racing, which had no supplied image).
const BASE = "https://media.base44.com/images/public/user_6aa5b6794b20a238746064f4/";

export const GAMES = [
  { key: "train", name: "رحلة القطار", image: BASE + "29da2d32c_1789155167203.jpg" },
  { key: "kids_cars", name: "سيارات الأطفال", image: BASE + "e01b791af_1789154927136.jpg" },
  { key: "golf_cars", name: "سيارات الجولف", image: BASE + "ac05555cc_IMG__.jpg" },
  { key: "formula", name: "سباق الفورميلا", image: "https://media.base44.com/images/public/6aa5b70f8b0528558cb05b1f/0a72074f2_generated_image.png" },
  { key: "sand_games", name: "الألعاب الرملية", image: BASE + "f04546fe3_1789155453203.jpg" },
  { key: "trampoline", name: "الترومبولين", image: BASE + "2b974b0d7_1789155514283.jpg" }
];

export const GAME_BY_KEY = (key) => GAMES.find((g) => g.key === key);