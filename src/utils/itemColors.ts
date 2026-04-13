const ITEM_COLORS = [
    "magenta", "red", "volcano", "orange", "gold",
    "lime", "green", "cyan", "blue", "geekblue", "purple"
];

export const getItemColor = (name: string): string => {
    if (!name) return "default";
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return ITEM_COLORS[Math.abs(hash) % ITEM_COLORS.length];
};
