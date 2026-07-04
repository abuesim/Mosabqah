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
  updatePlayerScore,
  setPlayerActiveStatus,
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

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // 1. Create Room (Admin)
  socket.on('create-room', async ({ type, timerDuration, password }) => {
    if (password !== ADMIN_PASSWORD) {
      socket.emit('error-msg', 'رمز المرور غير صحيح');
      return;
    }

    const roomCode = generateRoomCode();
    try {
      const room = await createRoom(roomCode, type, timerDuration);
      
      // If team mode, pre-populate 4 standard teams
      if (type === 'group') {
        await addPlayer(roomCode + '-red', roomCode, 'الفريق الأحمر', '#ff4757');
        await addPlayer(roomCode + '-blue', roomCode, 'الفريق الأزرق', '#1e90ff');
        await addPlayer(roomCode + '-green', roomCode, 'الفريق الأخضر', '#2ed573');
        await addPlayer(roomCode + '-yellow', roomCode, 'الفريق الأصفر', '#ffa502');
        activeTurns[roomCode] = 0; // Starts with Red Team (index 0)
      }

      socket.emit('room-created', room);
      console.log(`Room created: ${roomCode} (${type})`);
    } catch (err) {
      socket.emit('error-msg', 'حدث خطأ أثناء إنشاء الغرفة');
      console.error(err);
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

      const players = await getPlayers(cleanRoomCode);
      socket.emit('player-list-update', players);
      socket.emit('turn-updated', activeTurns[cleanRoomCode] !== undefined ? activeTurns[cleanRoomCode] : 0);
    } 
    else if (role === 'presenter') {
      socket.emit('presenter-joined', { room });
      const players = await getPlayers(cleanRoomCode);
      socket.emit('player-list-update', players);
      socket.emit('turn-updated', activeTurns[cleanRoomCode] !== undefined ? activeTurns[cleanRoomCode] : 0);
      
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
    if (!roomCode || socket.role !== 'admin') return;

    await updateRoomStatus(roomCode, 'active');
    io.to(roomCode).emit('game-started');
  });

  // 4. Send/Show Question (Admin / Presenter)
  socket.on('show-question', async ({ questionId }) => {
    const roomCode = socket.roomId;
    if (!roomCode) return;
    await performShowQuestion(roomCode, questionId);
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

    const question = await getQuestion(questionId);
    if (!question) return;

    // Calculate time taken
    const timeSpent = (Date.now() - room.question_start_time) / 1000;
    if (timeSpent > room.timer_duration) {
      socket.emit('error-msg', 'انتهى الوقت المحدد للإجابة!');
      return;
    }

    const isCorrect = (parseInt(chosenOption) === question.correct_option);
    
    // Save to DB
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
    if (!roomCode || socket.role !== 'admin') return;

    const room = await getRoom(roomCode);
    if (!room || !room.current_question_id) return;

    // Clear countdown timer if still active
    if (activeTimers[roomCode]) {
      clearTimeout(activeTimers[roomCode]);
    }

    const question = await getQuestion(room.current_question_id);
    await updateRoomQuestionStatus(roomCode, 'revealed');

    // Calculate and update scores for all players who answered correctly
    const answers = await getAnswersForQuestion(roomCode, room.current_question_id);
    
    for (const ans of answers) {
      if (ans.is_correct) {
        // Base points: 100. Speed bonus: up to 50 points based on speed
        const timeTaken = ans.answered_in_seconds || 0;
        const maxTime = room.timer_duration;
        const speedBonus = Math.max(0, Math.round(((maxTime - timeTaken) / maxTime) * 50));
        const totalPoints = 100 + speedBonus;

        await updatePlayerScore(ans.player_id, totalPoints);
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
        
        playerSocket.emit('answer-revealed', {
          correctOption: question.correct_option,
          correctText: question[`option${question.correct_option}`],
          isCorrect: playerAnswer ? !!playerAnswer.is_correct : false,
          chosenOption: playerAnswer ? playerAnswer.chosen_option : null,
          pointsEarned: playerAnswer && playerAnswer.is_correct ? (100 + Math.max(0, Math.round(((room.timer_duration - playerAnswer.answered_in_seconds) / room.timer_duration) * 50))) : 0,
          totalScore: scoreData ? scoreData.score : 0
        });
      }
    }

    // Send update to presenter and admin
    io.to(roomCode).emit('presenter-reveal', {
      correctOption: question.correct_option,
      correctText: question[`option${question.correct_option}`],
      players,
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
  });

  // 7. Manual Score Adjustment (Admin)
  socket.on('adjust-score', async ({ playerId, adjustment }) => {
    const roomCode = socket.roomId;
    if (!roomCode || socket.role !== 'admin') return;

    await updatePlayerScore(playerId, parseInt(adjustment));
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
    io.to(roomCode).emit('turn-updated', activeTurns[roomCode]);
    console.log(`Active turn updated to index ${turnIndex} for room ${roomCode}`);
  });

  // 12. Group Mode: Answer Result (Admin / Presenter)
  socket.on('group-answer-result', async ({ isCorrect }) => {
    const roomCode = socket.roomId;
    if (!roomCode) return;
    const room = await getRoom(roomCode);
    if (!room || !room.current_question_id) return;

    const players = await getPlayers(roomCode);
    const turnIndex = activeTurns[roomCode] !== undefined ? activeTurns[roomCode] : 0;
    const activePlayer = players[turnIndex];

    if (isCorrect && activePlayer) {
      await updatePlayerScore(activePlayer.id, 100); // Standard 100 points for correct group answer
      console.log(`Awarded 100 pts to team "${activePlayer.name}"`);
    }

    const question = await getQuestion(room.current_question_id);
    await updateRoomQuestionStatus(roomCode, 'revealed');

    // Advance turn to next team
    if (players.length > 0) {
      activeTurns[roomCode] = (turnIndex + 1) % players.length;
    }

    // Broadcast updates
    const updatedPlayers = await getPlayers(roomCode);
    io.to(roomCode).emit('player-list-update', updatedPlayers);
    io.to(roomCode).emit('turn-updated', activeTurns[roomCode]);

    io.to(roomCode).emit('presenter-reveal', {
      correctOption: question.correct_option,
      correctText: question[`option${question.correct_option}`],
      players: updatedPlayers,
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

    let nextQIndex = 0;
    if (room.current_question_id) {
      const currentIdx = questions.findIndex(q => q.id === room.current_question_id);
      nextQIndex = (currentIdx + 1) % questions.length;
    }

    const nextQ = questions[nextQIndex];
    if (nextQ) {
      console.log(`Autoplay: throwing next question ID ${nextQ.id} for room ${roomCode}`);
      await performShowQuestion(roomCode, nextQ.id);
    }
  });

  // Helper function to throw question
  async function performShowQuestion(roomCode, questionId) {
    const room = await getRoom(roomCode);
    const question = await getQuestion(questionId);
    if (!room || !question) return;

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

      // Broadcast question to all in the room
      io.to(roomCode).emit('question-shown', {
        question: playerQuestion,
        timerDuration: freshRoom.timer_duration
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
