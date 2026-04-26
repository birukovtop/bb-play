/**
 * BlackBears Play - static catalog used when an external catalog is not connected.
 */
const CATALOG = {
    food: {
        'Газ.вода': [
            { id: 'cool-cola-033', category: 'Газ.вода', name: 'COOL COLA', size: '0,33 л', price: 80 },
            { id: 'cool-cola-1', category: 'Газ.вода', name: 'COOL COLA', size: '1 л', price: 140 },
            { id: 'fancy-033', category: 'Газ.вода', name: 'FANCY', size: '0,33 л', price: 80 },
            { id: 'street-033', category: 'Газ.вода', name: 'STREET', size: '0,33 л', price: 80 },
            { id: 'tonic-033', category: 'Газ.вода', name: 'TONIC', size: '0,33 л', price: 80 },
            { id: 'kvass-ochakovo-05', category: 'Газ.вода', name: 'КВАС ОЧАКОВО', size: '0,5 л', price: 80 },
            { id: 'svyatoy-istochnik-05', category: 'Газ.вода', name: 'СВЯТОЙ ИСТОЧНИК', size: '0,5 л', price: 80 },
            { id: 'water-05', category: 'Газ.вода', name: 'ВОДА', size: '0,5 л', price: 65 }
        ],
        'Энергетики': [
            { id: 'gorilla-045', category: 'Энергетики', name: 'GORILLA (все вкусы)', size: '0,45 л', price: 110 },
            { id: 'shpilli-villi-05', category: 'Энергетики', name: 'ШПИЛЛИ ВИЛЛИ', size: '0,5 л', price: 80 },
            { id: 'varan-05', category: 'Энергетики', name: 'VARAN', size: '0,5 л', price: 80 }
        ],
        'Еда': [
            { id: 'snickers-30', category: 'Еда', name: 'SNICKERS', size: '30 гр', price: 80 },
            { id: 'bounty-30', category: 'Еда', name: 'BOUNTY', size: '30 гр', price: 80 },
            { id: 'twix-30', category: 'Еда', name: 'TWIX', size: '30 гр', price: 80 },
            { id: 'mars-30', category: 'Еда', name: 'MARS', size: '30 гр', price: 80 },
            { id: 'mms-40', category: 'Еда', name: "M&M'S", size: '40 гр', price: 85 }
        ],
        'Горячее (Астраханская)': [
            { id: 'tea-02', category: 'Горячее (Астраханская)', name: 'ЧАЙ', size: '0,2 л', price: 70 },
            { id: 'coffee-nespresso-02', category: 'Горячее (Астраханская)', name: 'КОФЕ НЕСПРЕССО', size: '0,2 л', price: 100 },
            { id: 'coffee-dolche-gusto-03', category: 'Горячее (Астраханская)', name: 'КОФЕ DOLCHE GUSTO', size: '0,3 л', price: 140 },
            { id: 'hot-dog', category: 'Горячее (Астраханская)', name: 'HOT DOG', size: '-', price: 199 }
        ]
    },

    games: [
        { name: 'Apex Legends', icon: 'assets/games/apex-legends.svg' },
        { name: 'CS 2', icon: 'assets/games/cs-2.svg' },
        { name: 'Dota 2', icon: 'assets/games/dota-2.svg' },
        { name: 'Dota Underlords', icon: 'assets/games/dota-underlords.svg' },
        { name: 'Dead by Daylight', icon: 'assets/games/dead-by-daylight.svg' },
        { name: 'Escape from Tarkov', icon: 'assets/games/escape-from-tarkov.svg' },
        { name: 'Warframe', icon: 'assets/games/warframe.svg' },
        { name: 'Warface', icon: 'assets/games/warface.svg' },
        { name: 'Fortnite', icon: 'assets/games/fortnite.svg' },
        { name: 'League of Legends', icon: 'assets/games/league-of-legends.svg' },
        { name: 'Overwatch 2', icon: 'assets/games/overwatch-2.svg' },
        { name: 'PUBG', icon: 'assets/games/pubg.svg' },
        { name: 'Genshin Impact', icon: 'assets/games/genshin-impact.svg' },
        { name: 'GTA V', icon: 'assets/games/gta-v.svg' },
        { name: 'Мир танков', icon: 'assets/games/world-of-tanks.svg' },
        { name: 'Мир кораблей', icon: 'assets/games/world-of-warships.svg' },
        { name: 'War Thunder', icon: 'assets/games/war-thunder.svg' },
        { name: 'Rust', icon: 'assets/games/rust.svg' },
        { name: 'Rainbow Six Siege', icon: 'assets/games/rainbow-six-siege.svg' },
        { name: 'Rocket League', icon: 'assets/games/rocket-league.svg' },
        { name: 'Valorant', icon: 'assets/games/valorant.svg' },
        { name: 'Hearthstone', icon: 'assets/games/hearthstone.svg' }
    ],

    promos: [
        {
            title: 'День рождения',
            description: 'Скидка 50% на день рождения.',
            details: 'Скидка единоразовая. Действует 3 дня до и 3 дня после дня рождения.',
            iconPath: './ui%20kit/icon/bulk/cake.svg'
        },
        {
            title: 'Оставь отзыв',
            description: '100₽ на баланс за отзыв.',
            details: 'Оставь отзыв на любом геосервисе и получи 100₽ на баланс.',
            iconPath: './ui%20kit/icon/bulk/star.svg'
        },
        {
            title: 'Дневной мишка',
            description: '3 часа = 200₽ в GameZone.',
            details: 'Только будни. До 18 лет. Астраханская: 09:00-15:00. Советская: 09:00-17:00.',
            iconPath: './ui%20kit/icon/bulk/gift.svg'
        }
    ]
};
