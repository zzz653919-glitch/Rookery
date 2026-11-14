// Built-in articles that ship with Rookery, in English, Uzbek (Latin) and Russian. They appear in News next to the
// articles written in the admin panel, so the page is never empty on a fresh installation.
const A = (id, published_at, tr) => ({ id, published_at, author: 'Rookery', tr });

export const ARTICLES = [
  A('welcome-to-rookery', '2026-11-12T09:00:00.000Z', {
    en: { title: 'Welcome to Rookery', summary: 'A chess platform with rated online games, Stockfish, lessons, puzzles and tournaments.',
      body: '<p>Rookery brings everything you need to enjoy chess into one place: <strong>rated games against real players</strong>, Stockfish at eight strengths, lessons, puzzles, an opening explorer, an endgame trainer and an analysis board.</p><h3>Where to start</h3><ul><li><strong>Play</strong> — find an opponent in seconds or send a private link to a friend.</li><li><strong>Learn</strong> — a placement test finds your level, then lessons and puzzles lead the way.</li><li><strong>Tournaments</strong> — arena events run every day.</li></ul><p>Create a free account to get a rating, keep your history and sync your progress between devices.</p>' },
    uz: { title: 'Rookery\'ga xush kelibsiz', summary: 'Onlayn reytingli o\'yinlar, Stockfish, darslar, masalalar va turnirlar bilan shaxmat platformasi.',
      body: '<p>Rookery shaxmatdan zavqlanish uchun kerak hamma narsani bir joyga jamlaydi: <strong>haqiqiy o\'yinchilar bilan reytingli o\'yinlar</strong>, sakkiz darajali Stockfish, darslar, masalalar, debyutlar kitobi, endshpil mashqlari va tahlil taxtasi.</p><h3>Qayerdan boshlash kerak</h3><ul><li><strong>O\'ynash</strong> — soniyalarda raqib toping yoki do\'stingizga shaxsiy havola yuboring.</li><li><strong>O\'rganish</strong> — dastlabki test darajangizni aniqlaydi, so\'ng darslar va masalalar yo\'l ko\'rsatadi.</li><li><strong>Turnirlar</strong> — arena turnirlari har kuni o\'tkaziladi.</li></ul><p>Reyting olish, o\'yinlar tarixini saqlash va natijalaringizni qurilmalar orasida sinxronlash uchun bepul hisob oching.</p>' },
    ru: { title: 'Добро пожаловать в Rookery', summary: 'Шахматная платформа с рейтинговыми партиями онлайн, Stockfish, уроками, задачами и турнирами.',
      body: '<p>Rookery собирает всё для игры в шахматы в одном месте: <strong>рейтинговые партии с живыми соперниками</strong>, Stockfish восьми уровней, уроки, задачи, справочник дебютов, тренажёр эндшпилей и доску анализа.</p><h3>С чего начать</h3><ul><li><strong>Играть</strong> — найдите соперника за секунды или отправьте другу личную ссылку.</li><li><strong>Обучение</strong> — вступительный тест определит ваш уровень, затем вас поведут уроки и задачи.</li><li><strong>Турниры</strong> — арена-турниры проходят каждый день.</li></ul><p>Создайте бесплатный аккаунт, чтобы получить рейтинг, хранить историю партий и синхронизировать прогресс между устройствами.</p>' },
  }),
  A('how-ratings-work', '2026-11-10T09:00:00.000Z', {
    en: { title: 'How ratings and time controls work', summary: 'Four separate Elo ratings, one for each kind of game.',
      body: '<p>Rookery keeps a separate Elo rating for <strong>bullet</strong>, <strong>blitz</strong>, <strong>rapid</strong> and <strong>classical</strong> games, plus one for puzzles. A game belongs to a category by its estimated length: base time plus 40 increments.</p><ul><li>Bullet — under 3 minutes</li><li>Blitz — under 8 minutes</li><li>Rapid — under 25 minutes</li><li>Classical — everything longer</li></ul><p>New players start at 1200 with a provisional rating that moves faster for the first games. Casual games never change a rating.</p>' },
    uz: { title: 'Reytinglar va vaqt nazorati qanday ishlaydi', summary: 'To\'rtta alohida Elo reyting — har bir o\'yin turi uchun bittadan.',
      body: '<p>Rookery <strong>bullet</strong>, <strong>blitz</strong>, <strong>rapid</strong> va <strong>klassik</strong> o\'yinlar uchun alohida Elo reytingni, shuningdek masalalar uchun ham reytingni yuritadi. O\'yin turi taxminiy davomiyligi bo\'yicha aniqlanadi: asosiy vaqt plyus 40 ta qo\'shimcha.</p><ul><li>Bullet — 3 daqiqadan kam</li><li>Blitz — 8 daqiqadan kam</li><li>Rapid — 25 daqiqadan kam</li><li>Klassik — undan uzunroq hamma narsa</li></ul><p>Yangi o\'yinchilar 1200 dan boshlaydi, dastlabki o\'yinlarda reyting tezroq o\'zgaradi. Oddiy (reytingsiz) o\'yinlar reytingni o\'zgartirmaydi.</p>' },
    ru: { title: 'Как работают рейтинги и контроль времени', summary: 'Четыре отдельных рейтинга Эло — по одному для каждого вида партий.',
      body: '<p>Rookery ведёт отдельный рейтинг Эло для <strong>пули</strong>, <strong>блица</strong>, <strong>рапида</strong> и <strong>классики</strong>, а также рейтинг задач. Вид партии определяется её ожидаемой длиной: основное время плюс 40 добавлений.</p><ul><li>Пуля — меньше 3 минут</li><li>Блиц — меньше 8 минут</li><li>Рапид — меньше 25 минут</li><li>Классика — всё, что дольше</li></ul><p>Новички начинают с 1200, а в первых партиях рейтинг меняется быстрее. Товарищеские партии рейтинг не меняют.</p>' },
  }),
  A('play-stockfish', '2026-11-08T09:00:00.000Z', {
    en: { title: 'Play Stockfish at eight strengths', summary: 'Stockfish 19 runs in your browser — no account and no connection needed.',
      body: '<p>Pick a level from <em>Starter</em> to <em>Master</em> and play against Stockfish 19. The engine runs locally in your browser, so it works offline and your games stay private.</p><p>Turn on <strong>training mode</strong> for take-backs and hints, and review any finished game on the analysis board to find your mistakes.</p>' },
    uz: { title: 'Stockfish bilan sakkiz darajada o\'ynang', summary: 'Stockfish 19 brauzeringizda ishlaydi — hisob ham, internet ham shart emas.',
      body: '<p><em>Boshlang\'ich</em> darajadan <em>Usta</em> darajagacha tanlang va Stockfish 19 bilan o\'ynang. Dvigatel brauzeringizda mahalliy ishlaydi, shuning uchun oflayn ham ishlaydi va o\'yinlaringiz sizda qoladi.</p><p>Yurishni qaytarish va maslahatlar uchun <strong>mashq rejimini</strong> yoqing, tugagan o\'yinni tahlil taxtasida ko\'rib chiqib xatolaringizni toping.</p>' },
    ru: { title: 'Играйте со Stockfish на восьми уровнях', summary: 'Stockfish 19 работает прямо в браузере — аккаунт и интернет не нужны.',
      body: '<p>Выберите уровень от <em>Начального</em> до <em>Мастера</em> и сыграйте со Stockfish 19. Движок работает локально в вашем браузере, поэтому он доступен офлайн, а ваши партии остаются приватными.</p><p>Включите <strong>режим тренировки</strong> для отмены ходов и подсказок, а законченную партию разберите на доске анализа, чтобы найти ошибки.</p>' },
  }),
  A('learning-center', '2026-11-05T09:00:00.000Z', {
    en: { title: 'The learning center: lessons, puzzles, openings, endgames', summary: 'A path from the first move to confident play.',
      body: '<p>The <strong>Learn</strong> section has 29 lessons grouped by level, a placement test, hundreds of puzzles with a daily puzzle and its own rating, an <strong>opening explorer</strong> with more than 90 verified lines and an <strong>endgame trainer</strong> with positions checked by Stockfish.</p><p>Your progress is saved on this device and, when you are signed in, synced to your account.</p>' },
    uz: { title: 'O\'quv markazi: darslar, masalalar, debyutlar, endshpillar', summary: 'Birinchi yurishdan ishonchli o\'yingacha bo\'lgan yo\'l.',
      body: '<p><strong>O\'rganish</strong> bo\'limida darajalar bo\'yicha 29 ta dars, dastlabki test, kundalik masalali va o\'z reytingli yuzlab masalalar, 90 dan ortiq tekshirilgan variantli <strong>debyutlar kitobi</strong> va Stockfish tekshirgan pozitsiyalarli <strong>endshpil mashqlari</strong> bor.</p><p>Natijalaringiz shu qurilmada saqlanadi, tizimga kirgan bo\'lsangiz hisobingizga sinxronlanadi.</p>' },
    ru: { title: 'Учебный центр: уроки, задачи, дебюты, эндшпили', summary: 'Путь от первого хода до уверенной игры.',
      body: '<p>В разделе <strong>Обучение</strong> — 29 уроков по уровням, вступительный тест, сотни задач с задачей дня и собственным рейтингом, <strong>справочник дебютов</strong> с более чем 90 проверенными линиями и <strong>тренажёр эндшпилей</strong> с позициями, проверенными Stockfish.</p><p>Прогресс сохраняется на этом устройстве, а после входа синхронизируется с аккаунтом.</p>' },
  }),
  A('arena-tournaments', '2026-11-02T09:00:00.000Z', {
    en: { title: 'Arena tournaments every day', summary: 'Join, play as many games as you can, climb the standings.',
      body: '<p>In an arena you play continuously against whoever is free until the clock runs out. A win scores <strong>2 points</strong>, a draw <strong>1</strong>, and two wins in a row double the points of the next win.</p><p>Evergreen Blitz runs daily, with Bullet on Fridays and Rapid on Wednesdays and Sundays. Open the <em>Tournaments</em> page, press <em>Join</em>, then <em>Play</em> when the arena is running.</p>' },
    uz: { title: 'Har kuni arena turnirlari', summary: 'Qo\'shiling, imkon qadar ko\'p o\'ynang va jadvalda ko\'tariling.',
      body: '<p>Arenada vaqt tugaguncha bo\'sh turgan raqiblar bilan to\'xtovsiz o\'ynaysiz. G\'alaba <strong>2 ochko</strong>, durang <strong>1</strong> ochko beradi, ketma-ket ikki g\'alabadan keyingi g\'alaba ochkosi ikki baravar bo\'ladi.</p><p>Evergreen Blitz har kuni, Bullet juma kunlari, Rapid chorshanba va yakshanba kunlari o\'tkaziladi. <em>Turnirlar</em> sahifasini oching, <em>Qo\'shilish</em> ni bosing, arena boshlanganda <em>O\'ynash</em> ni bosing.</p>' },
    ru: { title: 'Арена-турниры каждый день', summary: 'Присоединяйтесь, играйте как можно больше партий и поднимайтесь в таблице.',
      body: '<p>На арене вы непрерывно играете с теми, кто свободен, пока не истечёт время. Победа приносит <strong>2 очка</strong>, ничья — <strong>1</strong>, а после двух побед подряд следующая победа даёт вдвое больше очков.</p><p>Evergreen Blitz проходит ежедневно, Bullet — по пятницам, Rapid — по средам и воскресеньям. Откройте страницу <em>Турниры</em>, нажмите <em>Участвовать</em>, а когда арена начнётся — <em>Играть</em>.</p>' },
  }),
];

export const builtinList = (lang) => ARTICLES.map((a) => { const t = a.tr[lang] || a.tr.en; return { id: a.id, title: t.title, summary: t.summary, author: a.author, published_at: a.published_at }; });
export const builtinGet = (id, lang) => { const a = ARTICLES.find((x) => x.id === id); if (!a) return null; const t = a.tr[lang] || a.tr.en; return { id: a.id, title: t.title, summary: t.summary, body: t.body, author: a.author, published_at: a.published_at }; };

// Recurring arenas. Slots for the coming days are created on demand (see ensureSchedule in routes/community.mjs).
export const SCHEDULE = [
  { name: 'Evergreen Blitz Arena', days: [0, 1, 2, 3, 4, 5, 6], hour: 17, base: 180, inc: 2, minutes: 60 },
  { name: 'Friday Bullet Arena', days: [5], hour: 19, base: 60, inc: 0, minutes: 45 },
  { name: 'Wednesday Rapid Arena', days: [3], hour: 15, base: 600, inc: 0, minutes: 90 },
  { name: 'Sunday Rapid Arena', days: [0], hour: 14, base: 900, inc: 10, minutes: 120 },
];
