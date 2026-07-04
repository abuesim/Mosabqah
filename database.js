import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Promisify database methods for clean async/await
const dbRun = promisify(db.run.bind(db));
const dbAll = promisify(db.all.bind(db));
const dbGet = promisify(db.get.bind(db));

export async function initDatabase() {
  console.log('Initializing SQLite Database at:', dbPath);

  // Enable foreign keys
  await dbRun('PRAGMA foreign_keys = ON');

  // Create tables
  await dbRun(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,          -- 'individual' or 'group'
      status TEXT NOT NULL,        -- 'waiting', 'active', 'finished'
      current_question_id INTEGER,
      question_status TEXT DEFAULT 'idle', -- 'idle', 'showing', 'revealed'
      timer_duration INTEGER DEFAULT 30,
      question_start_time INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      score INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_text TEXT NOT NULL,
      option1 TEXT NOT NULL,
      option2 TEXT NOT NULL,
      option3 TEXT NOT NULL,
      option4 TEXT NOT NULL,
      correct_option INTEGER NOT NULL, -- 1, 2, 3, or 4
      difficulty TEXT DEFAULT 'medium', -- 'easy', 'medium', 'hard'
      category TEXT DEFAULT 'general'
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS player_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      question_id INTEGER NOT NULL,
      chosen_option INTEGER NOT NULL,
      is_correct INTEGER NOT NULL,
      answered_in_seconds REAL,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
      FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
      UNIQUE(room_id, player_id, question_id)
    )
  `);

  // Insert default questions if questions table is empty
  const count = await dbGet('SELECT COUNT(*) as count FROM questions');
  if (count.count === 0) {
    console.log('Inserting default family questions...');
    const defaultQuestions = [
      {
        question_text: "ما هي أطول سورة في القرآن الكريم؟",
        option1: "سورة آل عمران",
        option2: "سورة البقرة",
        option3: "سورة النساء",
        option4: "سورة الأعراف",
        correct_option: 2,
        difficulty: "easy",
        category: "islamic"
      },
      {
        question_text: "كم عدد قارات العالم؟",
        option1: "5 قارات",
        option2: "6 قارات",
        option3: "7 قارات",
        option4: "8 قارات",
        correct_option: 3,
        difficulty: "easy",
        category: "general"
      },
      {
        question_text: "من هو أول نبي صام؟",
        option1: "آدم عليه السلام",
        option2: "نوح عليه السلام",
        option3: "إبراهيم عليه السلام",
        option4: "سليمان عليه السلام",
        correct_option: 1,
        difficulty: "medium",
        category: "islamic"
      },
      {
        question_text: "ما هو الشيء الذي يكتب ولا يقرأ؟",
        option1: "الكتاب",
        option2: "الرسالة",
        option3: "القلم",
        option4: "الجريدة",
        correct_option: 3,
        difficulty: "easy",
        category: "riddles"
      },
      {
        question_text: "ما هو العنصر الكيميائي الأكثر وفرة في الكون؟",
        option1: "الأكسجين",
        option2: "الهيدروجين",
        option3: "النيتروجين",
        option4: "الكربون",
        correct_option: 2,
        difficulty: "hard",
        category: "science"
      },
      {
        question_text: "في أي سنة هجرية وقعت غزوة بدر الكبرى؟",
        option1: "السنة الأولى هجرية",
        option2: "السنة الثانية هجرية",
        option3: "السنة الثالثة هجرية",
        option4: "السنة الرابعة هجرية",
        correct_option: 2,
        difficulty: "medium",
        category: "islamic"
      },
      {
        question_text: "ما هو أسرع حيوان بري في العالم؟",
        option1: "الأسد",
        option2: "الفهد",
        option3: "الغزال",
        option4: "النمر",
        correct_option: 2,
        difficulty: "easy",
        category: "science"
      },
      {
        question_text: "كم عدد عيون النحلة؟",
        option1: "عينان اثنتان",
        option2: "ثلاث عيون",
        option3: "خمس عيون",
        option4: "ثمان عيون",
        correct_option: 3,
        difficulty: "hard",
        category: "science"
      },
      {
        question_text: "ما هو الشيء الذي كلما أخذت منه كبر وكلما أضفت إليه صغر؟",
        option1: "الحفرة",
        option2: "العمر",
        option3: "العلم",
        option4: "المال",
        correct_option: 1,
        difficulty: "medium",
        category: "riddles"
      },
      {
        question_text: "من هو مخترع المصباح الكهربائي؟",
        option1: "ألكسندر غراهام بيل",
        option2: "توماس إديسون",
        option3: "نيكولا تسلا",
        option4: "ألبرت أينشتاين",
        correct_option: 2,
        difficulty: "easy",
        category: "science"
      },
      {
        question_text: "ما هي عاصمة أستراليا؟",
        option1: "سيدني",
        option2: "ملبورن",
        option3: "كانبرا",
        option4: "بيرث",
        correct_option: 3,
        difficulty: "medium",
        category: "general"
      },
      {
        question_text: "كم عدد الكروموسومات في الخلية البشرية الطبيعية؟",
        option1: "23 كروموسوم",
        option2: "46 كروموسوم",
        option3: "48 كروموسوم",
        option4: "32 كروموسوم",
        correct_option: 2,
        difficulty: "medium",
        category: "science"
      },
      {
        question_text: "ما هو البحر الأكثر ملوحة في العالم؟",
        option1: "البحر الأحمر",
        option2: "البحر الميت",
        option3: "البحر الأبيض المتوسط",
        option4: "الخليج العربي",
        correct_option: 2,
        difficulty: "easy",
        category: "general"
      },
      {
        question_text: "من هو أول صحابي حيى الرسول بتحية الإسلام؟",
        option1: "أبو بكر الصديق",
        option2: "علي بن أبي طالب",
        option3: "أبو ذر الغفاري",
        option4: "عمر بن الخطاب",
        correct_option: 3,
        difficulty: "hard",
        category: "islamic"
      },
      {
        question_text: "أمشي بدون رجلين وأطير بدون جناحين وأبكي بدون عينين، فمن أنا؟",
        option1: "السحاب",
        option2: "الهواء",
        option3: "الظل",
        option4: "الوقت",
        correct_option: 1,
        difficulty: "medium",
        category: "riddles"
      }
    ];

    const stmt = db.prepare(`
      INSERT INTO questions (question_text, option1, option2, option3, option4, correct_option, difficulty, category)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const q of defaultQuestions) {
      stmt.run(q.question_text, q.option1, q.option2, q.option3, q.option4, q.correct_option, q.difficulty, q.category);
    }
    stmt.finalize();
  }
}

// Database helper functions
export async function createRoom(roomId, type, timerDuration = 30) {
  await dbRun(
    'INSERT INTO rooms (id, type, status, timer_duration) VALUES (?, ?, ?, ?)',
    [roomId, type, 'waiting', timerDuration]
  );
  return { id: roomId, type, status: 'waiting', timer_duration: timerDuration };
}

export async function getRoom(roomId) {
  return await dbGet('SELECT * FROM rooms WHERE id = ?', [roomId]);
}

export async function updateRoomStatus(roomId, status) {
  await dbRun('UPDATE rooms SET status = ? WHERE id = ?', [status, roomId]);
}

export async function updateRoomQuestion(roomId, questionId, status = 'showing') {
  await dbRun(
    'UPDATE rooms SET current_question_id = ?, question_status = ?, question_start_time = ? WHERE id = ?',
    [questionId, status, Date.now(), roomId]
  );
}

export async function updateRoomQuestionStatus(roomId, status) {
  await dbRun('UPDATE rooms SET question_status = ? WHERE id = ?', [status, roomId]);
}

export async function addPlayer(playerId, roomId, name, color) {
  await dbRun(
    'INSERT INTO users (id, room_id, name, color, score, is_active) VALUES (?, ?, ?, ?, 0, 1)',
    [playerId, roomId, name, color]
  );
  return { id: playerId, room_id: roomId, name, color, score: 0, is_active: 1 };
}

export async function getPlayers(roomId) {
  return await dbAll('SELECT * FROM users WHERE room_id = ? ORDER BY score DESC', [roomId]);
}

export async function updatePlayerScore(playerId, scoreToAdd) {
  await dbRun('UPDATE users SET score = score + ? WHERE id = ?', [scoreToAdd, playerId]);
}

export async function setPlayerActiveStatus(playerId, isActive) {
  await dbRun('UPDATE users SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, playerId]);
}

export async function getQuestions() {
  return await dbAll('SELECT * FROM questions');
}

export async function getQuestion(questionId) {
  return await dbGet('SELECT * FROM questions WHERE id = ?', [questionId]);
}

export async function addQuestion(questionText, opt1, opt2, opt3, opt4, correctOpt, difficulty = 'medium', category = 'general') {
  const result = await dbRun(
    `INSERT INTO questions (question_text, option1, option2, option3, option4, correct_option, difficulty, category)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [questionText, opt1, opt2, opt3, opt4, correctOpt, difficulty, category]
  );
  return result;
}

export async function submitAnswer(roomId, playerId, questionId, chosenOption, isCorrect, answeredInSeconds) {
  try {
    await dbRun(
      `INSERT INTO player_answers (room_id, player_id, question_id, chosen_option, is_correct, answered_in_seconds)
       VALUES (?, ?, ?, ?, ?, ? )`,
      [roomId, playerId, questionId, chosenOption, isCorrect ? 1 : 0, answeredInSeconds]
    );
    return true;
  } catch (error) {
    // If they already answered, ignore or return false
    console.error('Answer already submitted or error:', error.message);
    return false;
  }
}

export async function getAnswersForQuestion(roomId, questionId) {
  return await dbAll('SELECT * FROM player_answers WHERE room_id = ? AND question_id = ?', [roomId, questionId]);
}

export async function clearRoomData(roomId) {
  await dbRun('DELETE FROM player_answers WHERE room_id = ?', [roomId]);
  await dbRun('DELETE FROM users WHERE room_id = ?', [roomId]);
  await dbRun('DELETE FROM rooms WHERE id = ?', [roomId]);
}
