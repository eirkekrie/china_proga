import type { CardStatus, LearningStage, ReviewGrade } from "@/lib/types";

export const STORAGE_KEY = "hanzi-study-state-v1";

export const STAGE_LABELS: Record<LearningStage, string> = {
  hanzi_to_translation: "Stage 1 · Иероглиф → перевод",
  translation_to_hanzi: "Stage 2 · Перевод → иероглиф",
  hanzi_to_pinyin: "Stage 3 · Иероглиф → пиньинь",
  hanzi_to_pronunciation: "Stage 4 · Иероглиф → произношение",
};

export const STAGE_SHORT_LABELS: Record<LearningStage, string> = {
  hanzi_to_translation: "Перевод",
  translation_to_hanzi: "Иероглиф",
  hanzi_to_pinyin: "Пиньинь",
  hanzi_to_pronunciation: "Произношение",
};

export const STAGE_PROMPTS: Record<LearningStage, string> = {
  hanzi_to_translation: "Вспомните перевод",
  translation_to_hanzi: "Вспомните иероглиф",
  hanzi_to_pinyin: "Вспомните пиньинь",
  hanzi_to_pronunciation: "Вспомните произношение",
};

export const STAGE_HINTS: Record<LearningStage, string> = {
  hanzi_to_translation: "Сначала закрепляем смысл. Карточка должна уверенно узнавать перевод.",
  translation_to_hanzi: "После смысла идёт активное вспоминание иероглифа по русскому переводу.",
  hanzi_to_pinyin: "Когда значение держится уверенно, подключаем чтение и тон.",
  hanzi_to_pronunciation: "Финальный этап: произношение, сверка с пиньинем и будущим аудио.",
};

export const STAGE_SUCCESS_THRESHOLD: Record<LearningStage, number> = {
  hanzi_to_translation: 100,
  translation_to_hanzi: 100,
  hanzi_to_pinyin: 100,
  hanzi_to_pronunciation: 100,
};

export const STAGE_REQUIRED_STREAK: Record<LearningStage, number> = {
  hanzi_to_translation: 3,
  translation_to_hanzi: 3,
  hanzi_to_pinyin: 4,
  hanzi_to_pronunciation: 4,
};

export const STAGE_BASE_INTERVAL_DAYS: Record<LearningStage, number> = {
  hanzi_to_translation: 0.75,
  translation_to_hanzi: 1.2,
  hanzi_to_pinyin: 1.8,
  hanzi_to_pronunciation: 2.4,
};

export const STATUS_LABELS: Record<CardStatus, string> = {
  new: "Новая",
  learning: "В изучении",
  review: "Повторение",
  mastered: "Освоена",
};

export const REVIEW_GRADE_LABELS: Record<ReviewGrade, string> = {
  again: "Не знаю",
  hard: "Трудно",
  good: "Знаю",
};

export const STARTER_CARD_LINES = `人;rén<br>Человек
你;nǐ<br>Ты, вы
小;xiǎo<br>Маленький
大;dà<br>Большой
好;hǎo<br>Хорошо
马;mǎ<br>Лошадь
吗;ma<br>Вопросительная частица для образования общего вопроса
妈妈;māma<br>Мама
我;wǒ<br>Я
很;hěn<br>Очень
呢;ne<br>Вопросительная частица для переспроса
也;yě<br>Тоже, также
一;yī<br>Один
二;èr<br>Два
三;sān<br>Три
四;sì<br>Четыре
五;wǔ<br>Пять
六;liù<br>Шесть
七;qī<br>Семь
八;bā<br>Восемь
九;jiǔ<br>Девять
十;shí<br>Десять
十一;shí yī<br>Одиннадцать
十二;shí èr<br>Двенадцать
叫;jiào<br>Звать
什么;shénme<br>Что, какой
名字;míngzi<br>Имя
贵;guì<br>Дорогой
姓;xìng<br>Фамилия
认识;rènshi<br>Быть знакомым с ...
高;gāo<br>Высокий
高兴;gāoxìng<br>Рад
朋友;péngyou<br>Друг
老师;lǎoshī<br>Учитель
家;jiā<br>Семья, дом
大家;dàjiā<br>Все
我们;wǒmen<br>Мы
你们;nǐmen<br>Вы (множественное число)
您;nín<br>Вы (уважительное)
他;tā<br>Он
她;tā<br>Она
它;tā<br>Он, она, оно
对;duì<br>Верно, правильно, да
不;bù<br>Нет, не
对不起;duìbuqǐ<br>Извините
没;méi<br>Нет (в прошедшем времени)
没关系;méi guānxi<br>Ничего страшного
谢谢;xièxie<br>Спасибо
不客气;bùkèqi<br>Пожалуйста
再见;zàijiàn<br>До свидания
是;shì<br>Быть, являться`;
