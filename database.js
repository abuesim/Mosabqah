import { createClient } from '@libsql/client';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Storage strategy:
// - Production (Render Free tier): set TURSO_URL + TURSO_AUTH_TOKEN → cloud SQLite that
//   persists across redeploys. libSQL is a SQLite-compatible protocol.
// - Local dev / self-hosted with persistent disk: fall back to a file: URL. If DATA_DIR is
//   set (e.g. mounted disk at /data), store under it; otherwise store in the project dir.
let client;
if (process.env.TURSO_URL) {
  client = createClient({
    url: process.env.TURSO_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
    intMode: 'number'
  });
  console.log('Using Turso cloud database:', process.env.TURSO_URL);
} else {
  const dataDir = process.env.DATA_DIR || __dirname;
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  } catch (err) {
    console.error(`Could not create DATA_DIR "${dataDir}":`, err.message);
  }
  const dbPath = path.resolve(dataDir, 'database.sqlite');
  client = createClient({
    url: `file:${dbPath}`,
    intMode: 'number'
  });
  console.log('Using local SQLite file:', dbPath);
}

// libSQL-friendly helpers with the same shape as the previous sqlite3 wrappers
async function dbRun(sql, args = []) {
  await client.execute({ sql, args });
}
async function dbAll(sql, args = []) {
  const res = await client.execute({ sql, args });
  return res.rows;
}
async function dbGet(sql, args = []) {
  const res = await client.execute({ sql, args });
  return res.rows[0];
}

export async function initDatabase() {
  console.log('Initializing database...');

  // Enable foreign keys
  await dbRun('PRAGMA foreign_keys = ON');

  // Create tables
  await dbRun(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT,
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
      team_id TEXT,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    )
  `);

  // Safe migration for existing databases: add team_id column if missing
  try {
    const cols = await dbAll("PRAGMA table_info(users)");
    if (!cols.some(c => c.name === 'team_id')) {
      await dbRun('ALTER TABLE users ADD COLUMN team_id TEXT');
      // Backfill: default team_id = color for existing rows
      await dbRun("UPDATE users SET team_id = color WHERE team_id IS NULL");
    }
  } catch (err) {
    console.error('team_id migration error:', err.message);
  }

  // Safe migration for existing databases: add name column to rooms if missing
  try {
    const roomsCols = await dbAll("PRAGMA table_info(rooms)");
    if (!roomsCols.some(c => c.name === 'name')) {
      await dbRun('ALTER TABLE rooms ADD COLUMN name TEXT');
      console.log('Migration: Added name column to rooms table.');
    }
  } catch (err) {
    console.error('rooms name migration error:', err.message);
  }

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

    for (const q of defaultQuestions) {
      await dbRun(
        `INSERT INTO questions (question_text, option1, option2, option3, option4, correct_option, difficulty, category)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [q.question_text, q.option1, q.option2, q.option3, q.option4, q.correct_option, q.difficulty, q.category]
      );
    }
  }
}

// Database helper functions
export async function createRoom(roomId, type, timerDuration = 30, name = null) {
  const existing = await getRoom(roomId);
  const roomName = name || `مسابقة ${roomId}`;
  if (existing) {
    // Clean up players and answers associated with the room to start fresh
    await dbRun('DELETE FROM users WHERE room_id = ?', [roomId]);
    await dbRun('DELETE FROM player_answers WHERE room_id = ?', [roomId]);
    // Reset room properties
    await dbRun(
      'UPDATE rooms SET name = ?, type = ?, status = ?, current_question_id = NULL, question_status = \'idle\', timer_duration = ? WHERE id = ?',
      [roomName, type, 'waiting', timerDuration, roomId]
    );
    return { id: roomId, name: roomName, type, status: 'waiting', timer_duration: timerDuration };
  } else {
    await dbRun(
      'INSERT INTO rooms (id, name, type, status, timer_duration) VALUES (?, ?, ?, ?, ?)',
      [roomId, roomName, type, 'waiting', timerDuration]
    );
    return { id: roomId, name: roomName, type, status: 'waiting', timer_duration: timerDuration };
  }
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
  // Default team_id = the player's color, so same-color players are one team by default
  await dbRun(
    'INSERT INTO users (id, room_id, name, color, score, is_active, team_id) VALUES (?, ?, ?, ?, 0, 1, ?)',
    [playerId, roomId, name, color, color]
  );
  return { id: playerId, room_id: roomId, name, color, score: 0, is_active: 1, team_id: color };
}

export async function setPlayerTeam(playerId, teamId) {
  await dbRun('UPDATE users SET team_id = ? WHERE id = ?', [teamId, playerId]);
}

export async function deletePlayer(playerId) {
  // player_answers has ON DELETE CASCADE on player_id → cleaned automatically
  await dbRun('DELETE FROM users WHERE id = ?', [playerId]);
}

export async function getPlayers(roomId) {
  return await dbAll('SELECT * FROM users WHERE room_id = ? ORDER BY score DESC', [roomId]);
}

// For group mode: return teams in a stable insertion order (rowid) so turn rotation is consistent
export async function getPlayersOrdered(roomId) {
  return await dbAll('SELECT * FROM users WHERE room_id = ? ORDER BY rowid ASC', [roomId]);
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
