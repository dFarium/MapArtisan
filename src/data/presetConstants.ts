export const BASIC_COLORS = [
    'white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray',
    'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'
];

/**
 * The Basic preset: one wool block per dye color. Matched by block ID because palette
 * color names follow Mojang's map colors (snow, color_orange, color_light_green...),
 * not dye names.
 */
export const BASIC_WOOL_BLOCKS = BASIC_COLORS.map(color => `minecraft:${color}_wool`);

export const EASY_KEYWORDS = [
    'dirt', 'cobblestone', 'stone', 'sand', 'gravel', 'netherrack', 'oak_planks',
    'deepslate', 'andesite', 'granite', 'diorite'
];
