import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  initDatabase,
  createRoom,
  getRoom,
  updateRoomStatus,
  updateRoomQuestion,
  updateRoomQuestionStatus,
  addPlayer,
  getPlayers,
  getPlayersOrdered,
  updatePlayerScore,
  setPlayerActiveStatus,
  setPlayerTeam,
  deletePlayer,
  getQuestions,
  getQuestion,
  submitAnswer,
  getAnswersForQuestion,
  clearRoomData,
  addQuestion
} from './database.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123456';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize DB before starting server
initDatabase().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
});

// Helper: Generate random 4-digit room code
function generateRoomCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// In-memory active session timers to handle countdowns safely
const activeTimers = {};
const activeTurns = {};
// Track which questions have already been asked in each room (prevent repetition)
const askedQuestions = {};
// Trial mode: while true, no scores are awarded for the current question
const trialMode = {};
// In-memory answer store for the trial question (never touches DB because trial question ID=0 has no FK)
const trialAnswers = {};

async function fetchQuestion(questionId) {
  if (parseInt(questionId) === 0) return TRIAL_QUESTION;
  return await getQuestion(questionId);
}

// Hardcoded trial question — used for a practice round before the real game
const TRIAL_QUESTION = {
  id: 0, // sentinel — never collides with DB auto-increment IDs (which start at 1)
  question_text: '🎯 سؤال تجريبي: ما هي أطول سورة في القرآن الكريم؟',
  option1: 'سورة آل عمران',
  option2: 'سورة البقرة',
  option3: 'سورة النساء',
  option4: 'سورة الأعراف',
  correct_option: 2,
  difficulty: 'easy',
  category: 'general'
};

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Compute turn payload (index + team ID) so clients can resolve the active team by ID.
async function buildTurnPayload(roomCode) {
  const teamsInOrder = await getPlayersOrdered(roomCode);
  const index = activeTurns[roomCode] !== undefined ? activeTurns[roomCode] : 0;
  const activeTeam = teamsInOrder[index];
  return {
    index,
    activeTeamId: activeTeam ? activeTeam.id : null,
    orderedIds: teamsInOrder.map(t => t.id)
  };
}

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // 1. Create Room (Admin)
  socket.on('create-room', async ({ type, timerDuration, password, teamCount, roomCode, roomName }) => {
    if (password !== ADMIN_PASSWORD) {
      socket.emit('error-msg', 'رمز المرور غير صحيح');
      return;
    }

    let targetRoomCode = roomCode ? roomCode.trim().toString() : '';
    if (!targetRoomCode) {
      targetRoomCode = generateRoomCode();
    } else {
      if (!/^\d+$/.test(targetRoomCode)) {
        socket.emit('error-msg', 'رمز الغرفة المخصص يجب أن يحتوي على أرقام فقط');
        return;
      }
    }

    const targetRoomName = roomName ? roomName.trim() : `مسابقة ${targetRoomCode}`;

    try {
      const room = await createRoom(targetRoomCode, type, timerDuration, targetRoomName);
      
      // If team mode, pre-populate specified teams (2, 3, or 4)
      if (type === 'group') {
        const teamsNum = parseInt(teamCount) || 4;
        
        if (teamsNum >= 2) {
          await addPlayer(targetRoomCode + '-red', targetRoomCode, 'الفريق الأحمر', '#ff4757');
          await addPlayer(targetRoomCode + '-blue', targetRoomCode, 'الفريق الأزرق', '#1e90ff');
        }
        if (teamsNum >= 3) {
          await addPlayer(targetRoomCode + '-green', targetRoomCode, 'الفريق الأخضر', '#2ed573');
        }
        if (teamsNum >= 4) {
          await addPlayer(targetRoomCode + '-yellow', targetRoomCode, 'الفريق الأصفر', '#ffa502');
        }
        
        activeTurns[targetRoomCode] = 0; // Starts with Red Team (index 0)
      } else {
        delete activeTurns[targetRoomCode];
      }

      askedQuestions[targetRoomCode] = new Set();
      delete trialMode[targetRoomCode];
      delete trialAnswers[targetRoomCode];

      socket.emit('room-created', room);
      console.log(`Room created/reset: ${targetRoomCode} (${type}), Name: ${targetRoomName}, Teams: ${teamCount || 4}`);
    } catch (err) {
      socket.emit('error-msg', 'حدث خطأ أثناء إنشاء الغرفة');
      console.error(err);
    }
  });

  // 1.5 Check Room (Player Entrance Validation)
  socket.on('check-room', async ({ roomCode }) => {
    const cleanCode = roomCode ? roomCode.trim().toString() : '';
    if (!cleanCode) {
      socket.emit('room-checked', { exists: false, roomCode });
      return;
    }
    try {
      const room = await getRoom(cleanCode);
      if (room) {
        socket.emit('room-checked', { exists: true, roomCode: cleanCode, name: room.name || `مسابقة ${cleanCode}` });
      } else {
        socket.emit('room-checked', { exists: false, roomCode: cleanCode });
      }
    } catch (err) {
      socket.emit('room-checked', { exists: false, roomCode: cleanCode });
    }
  });

  // 1.8. Check Admin Password
  socket.on('check-password', ({ password }) => {
    if (password === ADMIN_PASSWORD) {
      socket.emit('password-checked', { success: true });
    } else {
      socket.emit('password-checked', { success: false });
    }
  });

  // 2. Join Room (Admin, Presenter, Player)
  socket.on('join-room', async ({ roomCode, role, name, color, password, playerId }) => {
    const cleanRoomCode = roomCode ? roomCode.toString().trim() : '';
    const room = await getRoom(cleanRoomCode);
    const cleanPlayerId = playerId ? playerId.toString().trim() : socket.id;
    console.log(`[Socket: ${socket.id}] Join room request: Code="${cleanRoomCode}" (Original: "${roomCode}"), Role=${role}, PlayerName="${name || ''}", RoomExists=${!!room}, PlayerId="${cleanPlayerId}"`);
    
    if (!room) {
      socket.emit('error-msg', 'غرفة غير موجودة');
      return;
    }

    socket.join(cleanRoomCode);
    socket.roomId = cleanRoomCode;
    socket.role = role;

    if (role === 'admin') {
      if (password !== ADMIN_PASSWORD) {
        socket.emit('error-msg', 'رمز المرور للوحة التحكم غير صحيح');
        return;
      }
      socket.emit('admin-joined', { room });
      // Send question list to admin
      const questionsList = await getQuestions();
      socket.emit('questions-list', questionsList);

      // Ensure asked-questions tracker exists for this room
      if (!askedQuestions[cleanRoomCode]) {
        askedQuestions[cleanRoomCode] = new Set();
      }
      socket.emit('asked-questions-update', Array.from(askedQuestions[cleanRoomCode]));

      const players = await getPlayers(cleanRoomCode);
      socket.emit('player-list-update', players);
      socket.emit('turn-updated', await buildTurnPayload(cleanRoomCode));

      // Sync active question for admin
      if (room.current_question_id && room.question_status !== 'idle') {
        const question = await fetchQuestion(room.current_question_id);
        const answers = await getAnswersForQuestion(cleanRoomCode, room.current_question_id);
        socket.emit('sync-question', {
          question,
          questionStatus: room.question_status,
          answeredCount: answers.length,
          timerDuration: room.timer_duration,
          startTime: room.question_start_time
        });
      }
    }
    else if (role === 'presenter') {
      socket.emit('presenter-joined', { room });
      const players = await getPlayers(cleanRoomCode);
      socket.emit('player-list-update', players);
      socket.emit('turn-updated', await buildTurnPayload(cleanRoomCode));
      
      // If there is an active question, sync it
      if (room.current_question_id && room.question_status !== 'idle') {
        const question = await getQuestion(room.current_question_id);
        const answers = await getAnswersForQuestion(cleanRoomCode, room.current_question_id);
        socket.emit('sync-question', {
          question,
          questionStatus: room.question_status,
          answeredCount: answers.length,
          timerDuration: room.timer_duration,
          startTime: room.question_start_time
        });
      }
    } 
    else if (role === 'player') {
      if (room.type === 'group') {
        socket.emit('error-msg', 'الوضع جماعي، التفاعل يتم عبر شاشة العرض فقط');
        return;
      }
      if (room.status === 'finished') {
        socket.emit('error-msg', 'المسابقة في هذه الغرفة قد انتهت');
        return;
      }

      socket.playerId = cleanPlayerId;
      socket.playerName = name;

      const existingPlayers = await getPlayers(cleanRoomCode);
      const reconnectingPlayer = existingPlayers.find(p => p.id === cleanPlayerId);

      if (reconnectingPlayer) {
        // Player is reconnecting! Update their active status to true
        await setPlayerActiveStatus(cleanPlayerId, true);
        socket.emit('player-joined', { player: reconnectingPlayer, room });
        
        // Notify others
        const players = await getPlayers(cleanRoomCode);
        io.to(cleanRoomCode).emit('player-list-update', players);
        console.log(`Player ${name} reconnected to room ${cleanRoomCode} with persistent ID ${cleanPlayerId}`);
        return;
      }

      // Check if player name already exists in this room (for another player ID)
      const nameExists = existingPlayers.some(p => p.name.trim().toLowerCase() === name.trim().toLowerCase() && p.id !== cleanPlayerId);
      if (nameExists) {
        socket.emit('error-msg', 'هذا الاسم مسجل بالفعل، يرجى اختيار اسم آخر');
        return;
      }

      try {
        const player = await addPlayer(cleanPlayerId, cleanRoomCode, name, color);
        socket.emit('player-joined', { player, room });
        
        // Notify others
        const players = await getPlayers(cleanRoomCode);
        io.to(cleanRoomCode).emit('player-list-update', players);
        console.log(`Player ${name} joined room ${cleanRoomCode} with persistent ID ${cleanPlayerId}`);
      } catch (err) {
        socket.emit('error-msg', 'خطأ أثناء الانضمام للغرفة');
        console.error(err);
      }
    }
  });

  // 3. Start Game (Admin)
  socket.on('start-game', async () => {
    const roomCode = socket.roomId;
    if (!roomCode || (socket.role !== 'admin' && socket.role !== 'presenter')) return;

    // Reset asked questions when starting a fresh game
    askedQuestions[roomCode] = new Set();
    io.to(roomCode).emit('asked-questions-update', []);

    await updateRoomStatus(roomCode, 'active');
    io.to(roomCode).emit('game-started');
  });

  // 4. Send/Show Question (Admin / Presenter)
  socket.on('show-question', async ({ questionId }) => {
    const roomCode = socket.roomId;
    if (!roomCode) return;
    await performShowQuestion(roomCode, questionId);
  });

  // 4b. Trial question (Admin) — practice round, no scoring
  socket.on('start-trial-question', async () => {
    const roomCode = socket.roomId;
    if (!roomCode || socket.role !== 'admin') return;
    io.to(roomCode).emit('trial-started', { question: TRIAL_QUESTION });
    await performShowQuestion(roomCode, 0, { isTrial: true });
  });

  // 4c. Random unasked question (Admin) — one-click "throw a random question"
  socket.on('admin-random-question', async () => {
    const roomCode = socket.roomId;
    if (!roomCode || socket.role !== 'admin') return;

    const questions = await getQuestions();
    if (questions.length === 0) {
      socket.emit('error-msg', 'لا توجد أسئلة في البنك');
      return;
    }
    if (!askedQuestions[roomCode]) askedQuestions[roomCode] = new Set();
    const remaining = questions.filter(q => !askedQuestions[roomCode].has(q.id));
    if (remaining.length === 0) {
      io.to(roomCode).emit('no-more-questions');
      return;
    }
    const nextQ = remaining[Math.floor(Math.random() * remaining.length)];
    await performShowQuestion(roomCode, nextQ.id);
  });

  // 5. Submit Answer (Player)
  socket.on('submit-answer', async ({ questionId, chosenOption }) => {
    const roomCode = socket.roomId;
    const playerId = socket.playerId;
    if (!roomCode || !playerId) return;

    const room = await getRoom(roomCode);
    if (!room || room.question_status !== 'showing') {
      socket.emit('error-msg', 'استقبال الإجابات مغلق حالياً');
      return;
    }

    const question = await fetchQuestion(questionId);
    if (!question) return;

    // Calculate time taken
    const timeSpent = (Date.now() - room.question_start_time) / 1000;
    if (timeSpent > room.timer_duration) {
      socket.emit('error-msg', 'انتهى الوقت المحدد للإجابة!');
      return;
    }

    const isCorrect = (parseInt(chosenOption) === question.correct_option);

    // Trial question: never touch DB (FK constraint would reject question_id=0), store in memory
    if (trialMode[roomCode]) {
      if (!trialAnswers[roomCode]) trialAnswers[roomCode] = [];
      if (trialAnswers[roomCode].find(a => a.player_id === playerId)) {
        socket.emit('error-msg', 'لقد قمت بالإجابة على هذا السؤال بالفعل');
        return;
      }
      trialAnswers[roomCode].push({
        player_id: playerId,
        chosen_option: parseInt(chosenOption),
        is_correct: isCorrect ? 1 : 0,
        answered_in_seconds: timeSpent
      });
      socket.emit('answer-submitted-ack', { isCorrect, chosenOption });
      const count = trialAnswers[roomCode].length;
      io.to(roomCode).emit('player-answered-count', count);

      const players = await getPlayers(roomCode);
      const activePlayers = players.filter(p => p.is_active === 1);
      if (count >= activePlayers.length && activePlayers.length > 0) {
        clearTimeout(activeTimers[roomCode]);
        await updateRoomQuestionStatus(roomCode, 'time_up');
        io.to(roomCode).emit('timer-expired');
      }
      return;
    }

    // Save to DB (real question)
    const success = await submitAnswer(roomCode, playerId, questionId, chosenOption, isCorrect, timeSpent);
    if (success) {
      socket.emit('answer-submitted-ack', { isCorrect, chosenOption });

      // Update count of answered players
      const answers = await getAnswersForQuestion(roomCode, questionId);
      io.to(roomCode).emit('player-answered-count', answers.length);

      // Check if all active players answered, if so, trigger early time-up
      const players = await getPlayers(roomCode);
      const activePlayers = players.filter(p => p.is_active === 1);
      if (answers.length >= activePlayers.length && activePlayers.length > 0) {
        clearTimeout(activeTimers[roomCode]);
        await updateRoomQuestionStatus(roomCode, 'time_up');
        io.to(roomCode).emit('timer-expired');
      }
    } else {
      socket.emit('error-msg', 'لقد قمت بالإجابة على هذا السؤال بالفعل');
    }
  });

  // 6. Reveal Answer (Admin)
  socket.on('reveal-answer', async () => {
    const roomCode = socket.roomId;
    if (!roomCode || (socket.role !== 'admin' && socket.role !== 'presenter')) return;

    const room = await getRoom(roomCode);
    if (!room || !room.current_question_id) return;

    // Clear countdown timer if still active
    if (activeTimers[roomCode]) {
      clearTimeout(activeTimers[roomCode]);
    }

    const isTrial = !!trialMode[roomCode];
    const question = await fetchQuestion(room.current_question_id);
    await updateRoomQuestionStatus(roomCode, 'revealed');

    // Answers come from DB for real questions, from in-memory buffer for trial
    const answers = isTrial
      ? (trialAnswers[roomCode] || [])
      : await getAnswersForQuestion(roomCode, room.current_question_id);

    // Award points only for real questions
    if (!isTrial) {
      for (const ans of answers) {
        if (ans.is_correct) {
          const timeTaken = ans.answered_in_seconds || 0;
          const maxTime = room.timer_duration;
          const speedBonus = Math.max(0, Math.round(((maxTime - timeTaken) / maxTime) * 50));
          const totalPoints = 100 + speedBonus;
          await updatePlayerScore(ans.player_id, totalPoints);
        }
      }
    }

    // Retrieve updated leaderboards
    const players = await getPlayers(roomCode);

    // Broadcast updated player list so admin dashboard updates and sorts scores immediately
    io.to(roomCode).emit('player-list-update', players);

    // Send reveal events to players with their status
    const playerSockets = await io.in(roomCode).fetchSockets();
    for (const playerSocket of playerSockets) {
      if (playerSocket.role === 'player') {
        const playerAnswer = answers.find(a => a.player_id === playerSocket.playerId);
        const scoreData = players.find(p => p.id === playerSocket.playerId);

        const earned = (!isTrial && playerAnswer && playerAnswer.is_correct)
          ? (100 + Math.max(0, Math.round(((room.timer_duration - playerAnswer.answered_in_seconds) / room.timer_duration) * 50)))
          : 0;

        playerSocket.emit('answer-revealed', {
          correctOption: question.correct_option,
          correctText: question[`option${question.correct_option}`],
          isCorrect: playerAnswer ? !!playerAnswer.is_correct : false,
          chosenOption: playerAnswer ? playerAnswer.chosen_option : null,
          pointsEarned: earned,
          totalScore: scoreData ? scoreData.score : 0,
          isTrial
        });
      }
    }

    // Send update to presenter and admin
    io.to(roomCode).emit('presenter-reveal', {
      correctOption: question.correct_option,
      correctText: question[`option${question.correct_option}`],
      players,
      isTrial,
      answersSummary: {
        total: answers.length,
        correct: answers.filter(a => a.is_correct).length,
        distribution: {
          1: answers.filter(a => a.chosen_option === 1).length,
          2: answers.filter(a => a.chosen_option === 2).length,
          3: answers.filter(a => a.chosen_option === 3).length,
          4: answers.filter(a => a.chosen_option === 4).length
        }
      }
    });

    // Clear trial mode after reveal so the real game can proceed
    if (isTrial) {
      trialMode[roomCode] = false;
      trialAnswers[roomCode] = [];
      io.to(roomCode).emit('trial-ended');
    }
  });

  // 7. Manual Score Adjustment (Admin)
  socket.on('adjust-score', async ({ playerId, adjustment }) => {
    const roomCode = socket.roomId;
    if (!roomCode || socket.role !== 'admin') return;

    await updatePlayerScore(playerId, parseInt(adjustment));
    const players = await getPlayers(roomCode);
    io.to(roomCode).emit('player-list-update', players);
  });

  // 7b. Assign Player to a Team (Admin OR Presenter — for individual-mode ad-hoc teams / drag-drop lobby)
  socket.on('assign-player-team', async ({ playerId, teamId }) => {
    const roomCode = socket.roomId;
    if (!roomCode) return;
    if (socket.role !== 'admin' && socket.role !== 'presenter') return;
    if (!playerId || !teamId) return;

    await setPlayerTeam(playerId, teamId);
    const players = await getPlayers(roomCode);
    io.to(roomCode).emit('player-list-update', players);
  });

  // 7c. Remove Player (Admin — hard-delete from the room)
  socket.on('remove-player', async ({ playerId }) => {
    const roomCode = socket.roomId;
    if (!roomCode || socket.role !== 'admin') return;
    if (!playerId) return;

    // Kick the player's socket(s) out of the room and tell them they were removed
    const roomSockets = await io.in(roomCode).fetchSockets();
    for (const s of roomSockets) {
      if (s.role === 'player' && s.playerId === playerId) {
        s.emit('kicked', { reason: 'تمت إزالتك من الغرفة بواسطة المقدم' });
        s.leave(roomCode);
      }
    }

    await deletePlayer(playerId);
    const players = await getPlayers(roomCode);
    io.to(roomCode).emit('player-list-update', players);
  });

  // 8. End Game (Admin)
  socket.on('end-game', async () => {
    const roomCode = socket.roomId;
    if (!roomCode || socket.role !== 'admin') return;

    await updateRoomStatus(roomCode, 'finished');
    const players = await getPlayers(roomCode);
    io.to(roomCode).emit('game-finished', { players });
  });

  // 9. Add Question (Admin)
  socket.on('add-new-question', async (qData) => {
    if (socket.role !== 'admin') return;
    try {
      await addQuestion(
        qData.question_text,
        qData.option1,
        qData.option2,
        qData.option3,
        qData.option4,
        parseInt(qData.correct_option),
        qData.difficulty,
        qData.category
      );
      const list = await getQuestions();
      socket.emit('questions-list', list);
      socket.emit('question-added-ack', 'تمت إضافة السؤال بنجاح!');
    } catch (err) {
      socket.emit('error-msg', 'خطأ أثناء إضافة السؤال');
      console.error(err);
    }
  });

  // 10. Import Questions (Admin)
  socket.on('import-questions', async ({ questions }) => {
    if (socket.role !== 'admin') return;
    try {
      for (const qData of questions) {
        await addQuestion(
          qData.question_text,
          qData.option1,
          qData.option2,
          qData.option3,
          qData.option4,
          parseInt(qData.correct_option),
          qData.difficulty || 'medium',
          qData.category || 'general'
        );
      }
      const list = await getQuestions();
      socket.emit('questions-list', list);
      socket.emit('question-added-ack', `تم استيراد ${questions.length} سؤال بنجاح!`);
    } catch (err) {
      socket.emit('error-msg', 'حدث خطأ أثناء استيراد الأسئلة');
      console.error(err);
    }
  });

  // 11. Group Mode: Set Active Turn (Admin / Presenter)
  socket.on('group-set-turn', async ({ turnIndex }) => {
    const roomCode = socket.roomId;
    if (!roomCode) return;
    activeTurns[roomCode] = parseInt(turnIndex);
    io.to(roomCode).emit('turn-updated', await buildTurnPayload(roomCode));
    console.log(`Active turn updated to index ${turnIndex} for room ${roomCode}`);
  });

  // 12. Group Mode: Choose Option (Presenter Control Screen)
  socket.on('group-choose-option', async ({ chosenOption }) => {
    const roomCode = socket.roomId;
    if (!roomCode) return;
    const room = await getRoom(roomCode);
    if (!room || !room.current_question_id) return;

    const question = await getQuestion(room.current_question_id);
    if (!question) return;

    const isCorrect = (question.correct_option === parseInt(chosenOption));
    // In group mode, use the fixed insertion order (rowid) so turn rotation is consistent
    // regardless of score changes.
    const teamsInOrder = await getPlayersOrdered(roomCode);
    const turnIndex = activeTurns[roomCode] !== undefined ? activeTurns[roomCode] : 0;
    const activePlayer = teamsInOrder[turnIndex];
    const pointsAwarded = isCorrect ? 100 : 0;

    if (isCorrect && activePlayer) {
      await updatePlayerScore(activePlayer.id, 100); // Standard 100 points for correct group answer
      console.log(`Option ${chosenOption} is CORRECT. Awarded 100 pts to team "${activePlayer.name}"`);
    } else {
      console.log(`Option ${chosenOption} is INCORRECT. Correct option is ${question.correct_option}`);
    }

    await updateRoomQuestionStatus(roomCode, 'revealed');

    // Advance turn to next team
    if (teamsInOrder.length > 0) {
      activeTurns[roomCode] = (turnIndex + 1) % teamsInOrder.length;
    }

    // Broadcast updates
    const updatedPlayers = await getPlayers(roomCode);
    io.to(roomCode).emit('player-list-update', updatedPlayers);
    io.to(roomCode).emit('turn-updated', await buildTurnPayload(roomCode));

    io.to(roomCode).emit('presenter-reveal', {
      correctOption: question.correct_option,
      correctText: question[`option${question.correct_option}`],
      players: updatedPlayers,
      groupMode: true,
      activeTeam: activePlayer ? {
        id: activePlayer.id,
        name: activePlayer.name,
        color: activePlayer.color,
        chosenOption: parseInt(chosenOption),
        chosenText: question[`option${chosenOption}`],
        isCorrect,
        pointsAwarded
      } : null,
      answersSummary: {
        total: 0,
        correct: 0,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0 }
      }
    });
  });

  // 13. Group Mode: Trigger Next Question Autoplay (Admin / Presenter)
  socket.on('group-next-question', async () => {
    const roomCode = socket.roomId;
    if (!roomCode) return;
    const room = await getRoom(roomCode);
    if (!room) return;

    const questions = await getQuestions();
    if (questions.length === 0) return;

    if (!askedQuestions[roomCode]) {
      askedQuestions[roomCode] = new Set();
    }
    const asked = askedQuestions[roomCode];

    // Pick a random unasked question
    const remaining = questions.filter(q => !asked.has(q.id));
    if (remaining.length === 0) {
      io.to(roomCode).emit('no-more-questions');
      console.log(`No more unasked questions for room ${roomCode}`);
      return;
    }

    const nextQ = remaining[Math.floor(Math.random() * remaining.length)];
    console.log(`Autoplay: picked random question ID ${nextQ.id} for room ${roomCode} (${asked.size + 1}/${questions.length})`);
    await performShowQuestion(roomCode, nextQ.id);
  });

  // Helper function to throw question
  async function performShowQuestion(roomCode, questionId, { isTrial = false } = {}) {
    const room = await getRoom(roomCode);
    const question = await fetchQuestion(questionId);
    if (!room || !question) return;

    // Set/clear trial mode for this room
    if (isTrial) {
      trialMode[roomCode] = true;
      trialAnswers[roomCode] = [];
    } else {
      trialMode[roomCode] = false;
      trialAnswers[roomCode] = [];
      // Track this question as asked (prevent repetition) — only for real questions
      if (!askedQuestions[roomCode]) {
        askedQuestions[roomCode] = new Set();
      }
      askedQuestions[roomCode].add(parseInt(questionId));
      io.to(roomCode).emit('asked-questions-update', Array.from(askedQuestions[roomCode]));
    }

    // Clear previous timers if any
    if (activeTimers[roomCode]) {
      clearTimeout(activeTimers[roomCode]);
    }

    // Broadcast preparation countdown (5 seconds) to room
    const prepSeconds = 5;
    io.to(roomCode).emit('prepare-question', { seconds: prepSeconds });
    console.log(`Starting 5s question prep countdown for room ${roomCode}`);

    // Set timeout for 5 seconds before showing the actual question
    activeTimers[roomCode] = setTimeout(async () => {
      // Re-fetch room in case state changed
      const freshRoom = await getRoom(roomCode);
      if (!freshRoom || freshRoom.status === 'finished') return;

      await updateRoomQuestion(roomCode, questionId, 'showing');

      // Clean options for players (hide correct answer)
      const playerQuestion = {
        id: question.id,
        question_text: question.question_text,
        option1: question.option1,
        option2: question.option2,
        option3: question.option3,
        option4: question.option4,
        category: question.category,
        difficulty: question.difficulty
      };

      // Compute progress counter (trial doesn't count toward the asked total)
      const allQuestions = await getQuestions();
      const askedCount = (askedQuestions[roomCode] && !trialMode[roomCode]) ? askedQuestions[roomCode].size : 0;
      const totalQuestions = allQuestions.length;

      // Broadcast question to all in the room
      io.to(roomCode).emit('question-shown', {
        question: playerQuestion,
        timerDuration: freshRoom.timer_duration,
        isTrial: !!trialMode[roomCode],
        askedCount,
        totalQuestions
      });

      // Set server-side fallback timer to mark time-up automatically
      activeTimers[roomCode] = setTimeout(async () => {
        await updateRoomQuestionStatus(roomCode, 'time_up');
        io.to(roomCode).emit('timer-expired');
        console.log(`Timer expired for room ${roomCode}`);
      }, freshRoom.timer_duration * 1000);
      
    }, prepSeconds * 1000);
  }

  // Disconnection handler
  socket.on('disconnect', async () => {
    console.log('Socket disconnected:', socket.id);
    const roomCode = socket.roomId;
    const playerId = socket.playerId;

    if (roomCode && playerId) {
      // Mark player inactive
      await setPlayerActiveStatus(playerId, false);
      const players = await getPlayers(roomCode);
      io.to(roomCode).emit('player-list-update', players);
    }
  });
});
