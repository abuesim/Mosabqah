import { sounds } from './sounds.js';

document.addEventListener('DOMContentLoaded', () => {
  const socket = io();
  
  // State variables
  let currentRoom = null;
  let playerDetails = null;
  let currentQuestion = null;
  let countdownInterval = null;
  let selectedColor = '#ff4757'; // Default selected red color
  let activeScore = 0;

  // Generate or retrieve persistent 6-digit Player ID from localStorage
  let playerId = localStorage.getItem('mosabqah_player_id');
  if (!playerId) {
    playerId = Math.floor(100000 + Math.random() * 900000).toString();
    localStorage.setItem('mosabqah_player_id', playerId);
  }

  // DOM Elements
  const screens = {
    join: document.getElementById('screen-join'),
    lobby: document.getElementById('screen-lobby'),
    question: document.getElementById('screen-question'),
    feedback: document.getElementById('screen-feedback'),
    finished: document.getElementById('screen-finished'),
    prepare: document.getElementById('screen-prepare')
  };

  const errorToast = document.getElementById('error-toast');
  const btnJoin = document.getElementById('btn-join');
  const roomCodeInput = document.getElementById('room-code');
  const playerNameInput = document.getElementById('player-name');
  const colorPicker = document.getElementById('color-picker');

  // Step-by-step join fields
  const joinStep1 = document.getElementById('join-step-1');
  const joinStep2 = document.getElementById('join-step-2');
  const btnCheckCode = document.getElementById('btn-check-code');
  const playerScoreboardOverlay = document.getElementById('player-scoreboard-overlay');
  const playerScoreboardList = document.getElementById('player-scoreboard-list');
  let allPlayers = [];
  const btnBackToStep1 = document.getElementById('btn-back-to-step-1');
  const validatedRoomName = document.getElementById('validated-room-name');
  const validatedRoomCode = document.getElementById('validated-room-code');
  
  const lobbyWelcome = document.getElementById('lobby-welcome');
  const lobbyColorIndicator = document.getElementById('lobby-color-indicator');
  
  const playerHudName = document.getElementById('player-hud-name');
  const playerScoreVal = document.getElementById('player-score-val');
  const questionCategory = document.getElementById('question-category');
  const questionText = document.getElementById('question-text');
  const timerBar = document.getElementById('timer-bar');
  const timerText = document.getElementById('timer-text');
  const optionButtons = document.querySelectorAll('.option-btn');
  
  const feedbackIcon = document.getElementById('feedback-icon');
  const feedbackTitle = document.getElementById('feedback-title');
  const feedbackDesc = document.getElementById('feedback-desc');
  const scoreEarnedPanel = document.getElementById('score-earned-panel');
  const feedbackPoints = document.getElementById('feedback-points');
  const feedbackTotalScore = document.getElementById('feedback-total-score');
  
  const finalTotalScore = document.getElementById('final-total-score');
  const connectionStatus = document.getElementById('connection-status');

  // Pre-fill room code from URL parameter if present
  const urlParams = new URLSearchParams(window.location.search);
  const urlRoomCode = urlParams.get('room');
  if (urlRoomCode) {
    roomCodeInput.value = urlRoomCode;
    const roomCodeGroup = document.getElementById('room-code-group');
    const roomCodeChip = document.getElementById('room-code-chip');
    const roomCodeChipValue = document.getElementById('room-code-chip-value');
    if (roomCodeGroup) roomCodeGroup.style.display = 'none';
    if (roomCodeChip) roomCodeChip.style.display = 'block';
    if (roomCodeChipValue) roomCodeChipValue.textContent = urlRoomCode;

    // Transition directly to Step 2 since we already have the room code
    if (joinStep1) joinStep1.style.display = 'none';
    if (joinStep2) joinStep2.style.display = 'block';
    if (validatedRoomCode) validatedRoomCode.textContent = urlRoomCode;
    if (validatedRoomName) validatedRoomName.textContent = `مسابقة ${urlRoomCode}`;

    // Verify room and fetch its actual name in the background
    socket.emit('check-room', { roomCode: urlRoomCode });

    setTimeout(() => playerNameInput.focus(), 100);
  }

  // Pressing Enter in the code field checks the code
  roomCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      btnCheckCode.click();
    }
  });

  // Pressing Enter in the name field submits (fast QR join flow)
  playerNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      btnJoin.click();
    }
  });


  // Initialize Sound Manager on first interaction
  document.body.addEventListener('click', () => {
    sounds.init();
  }, { once: true });

  // 1. Color Picker behavior
  colorPicker.addEventListener('click', (e) => {
    const option = e.target.closest('.color-option');
    if (!option) return;
    
    // Deselect all
    colorPicker.querySelectorAll('.color-option').forEach(el => el.classList.remove('selected'));
    
    // Select clicked
    option.classList.add('selected');
    selectedColor = option.dataset.color;
  });

  // Helper to switch screens
  function showScreen(screenId) {
    Object.keys(screens).forEach(key => {
      if (key === screenId) {
        screens[key].classList.add('active');
      } else {
        screens[key].classList.remove('active');
      }
    });
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Show Toast Error Helper
  function showError(msg) {
    errorToast.textContent = msg;
    errorToast.style.display = 'block';
    sounds.playIncorrect(); // Play buzzer sound for error
    setTimeout(() => {
      errorToast.style.display = 'none';
    }, 4000);
  }

  // 1.5. Step-by-Step Join Event Handlers
  if (btnCheckCode) {
    btnCheckCode.addEventListener('click', () => {
      const code = roomCodeInput.value.trim();
      if (!code || code.length < 4) {
        showError('الرجاء إدخال رمز غرفة صحيح يتكون من 4 أرقام على الأقل');
        return;
      }
      socket.emit('check-room', { roomCode: code });
    });
  }

  if (btnBackToStep1) {
    btnBackToStep1.addEventListener('click', () => {
      if (joinStep2) joinStep2.style.display = 'none';
      if (joinStep1) joinStep1.style.display = 'block';
      roomCodeInput.value = '';
      const roomCodeGroup = document.getElementById('room-code-group');
      const roomCodeChip = document.getElementById('room-code-chip');
      if (roomCodeGroup) roomCodeGroup.style.display = 'block';
      if (roomCodeChip) roomCodeChip.style.display = 'none';
      setTimeout(() => roomCodeInput.focus(), 100);
    });
  }

  socket.on('room-checked', ({ exists, roomCode, name }) => {
    if (exists) {
      if (validatedRoomCode) validatedRoomCode.textContent = roomCode;
      if (validatedRoomName) validatedRoomName.textContent = name;
      
      if (joinStep1) joinStep1.style.display = 'none';
      if (joinStep2) joinStep2.style.display = 'block';
      setTimeout(() => playerNameInput.focus(), 100);
    } else {
      showError('عذراً، رقم المسابقة أو الغرفة غير موجود. يرجى التأكد من الرقم.');
    }
  });

  // 2. Join Room button click
  btnJoin.addEventListener('click', () => {
    const roomCode = roomCodeInput.value.trim();
    const playerName = playerNameInput.value.trim();

    if (!roomCode || roomCode.length < 4) {
      showError('الرجاء إدخال رمز غرفة صحيح يتكون من 4 أرقام');
      return;
    }
    if (!playerName) {
      showError('الرجاء إدخال اسمك الكريم للانضمام');
      return;
    }

    // Join room with persistent playerId
    socket.emit('join-room', {
      roomCode,
      role: 'player',
      name: playerName,
      color: selectedColor,
      playerId: playerId
    });
  });

  // Socket: Error handling
  socket.on('error-msg', (msg) => {
    showError(msg);
  });

  // Socket: Player was removed by admin
  socket.on('kicked', ({ reason }) => {
    // Clear persistent playerId so they don't auto-rejoin as the same removed identity
    try { localStorage.removeItem('mosabqah_player_id'); } catch (e) {}
    alert(reason || 'تمت إزالتك من الغرفة.');
    window.location.href = 'index.html';
  });

  // Socket: Joined room successfully
  socket.on('player-joined', ({ player, room }) => {
    currentRoom = room;
    playerDetails = player;
    activeScore = player.score;
    
    lobbyWelcome.textContent = `أهلاً بك يا ${player.name}!`;
    lobbyColorIndicator.style.color = player.color;
    lobbyColorIndicator.style.backgroundColor = player.color;
    
    // Display player name in HUD navbar
    playerHudName.textContent = player.name;
    playerHudName.style.display = 'block';

    if (room.show_scoreboard) {
      playerScoreboardOverlay.style.display = 'block';
    } else {
      playerScoreboardOverlay.style.display = 'none';
    }
    
    showScreen('lobby');
  });

  // Socket: Sync list update (useful for score synchronizations)
  socket.on('player-list-update', (players) => {
    allPlayers = players;
    if (playerDetails) {
      const self = players.find(p => p.id === playerDetails.id);
      if (self) {
        activeScore = self.score;
        playerScoreVal.textContent = activeScore;
      }
    }
    // Update player scoreboard overlay in real time if visible
    if (playerScoreboardOverlay && playerScoreboardOverlay.style.display === 'block') {
      renderPlayerScoreboardOverlay();
    }
  });

  socket.on('scoreboard-visibility-update', ({ visible, players }) => {
    if (players) allPlayers = players;
    if (visible) {
      playerScoreboardOverlay.style.display = 'block';
      renderPlayerScoreboardOverlay();
    } else {
      playerScoreboardOverlay.style.display = 'none';
    }
  });

  function renderPlayerScoreboardOverlay() {
    if (!playerScoreboardList) return;
    playerScoreboardList.innerHTML = '';
    const sorted = [...allPlayers].sort((a, b) => (b.score || 0) - (a.score || 0));
    sorted.forEach((p, idx) => {
      const item = document.createElement('div');
      item.className = 'leaderboard-item';
      
      let rankClass = '';
      if (idx === 0) rankClass = 'rank-1';
      else if (idx === 1) rankClass = 'rank-2';
      else if (idx === 2) rankClass = 'rank-3';

      const isSelf = playerDetails && p.id === playerDetails.id;

      item.innerHTML = `
        <div class="leaderboard-rank ${rankClass}">${idx + 1}</div>
        <div class="player-info">
          <div class="player-dot" style="color: ${p.color}; background-color: ${p.color}"></div>
          <span class="player-name" style="${isSelf ? 'font-weight: bold; color: var(--color-yellow);' : ''}">${p.name} ${isSelf ? '⭐ (أنت)' : ''}</span>
        </div>
        <span class="player-score">${p.score} نقطة</span>
      `;
      playerScoreboardList.appendChild(item);
    });
  }

  // Socket: Question Preparation Countdown
  socket.on('prepare-question', ({ seconds }) => {
    const prepCountdown = document.getElementById('prepare-countdown');
    prepCountdown.textContent = seconds;
    showScreen('prepare');

    let count = seconds;
    sounds.playTick(); // Tick sound for the first second
    const interval = setInterval(() => {
      count--;
      if (count >= 1) {
        prepCountdown.textContent = count;
        sounds.playTick();
      } else {
        clearInterval(interval);
      }
    }, 1000);
  });

  // Socket: Question Received
  socket.on('question-shown', ({ question, timerDuration, isTrial, askedCount, totalQuestions }) => {
    currentQuestion = question;

    // Fill text and options
    if (isTrial) {
      questionCategory.textContent = '🎯 تجريبي';
      questionCategory.style.background = 'rgba(255, 165, 2, 0.2)';
      questionCategory.style.color = 'var(--color-yellow)';
    } else {
      questionCategory.style.background = 'rgba(112, 161, 255, 0.15)';
      questionCategory.style.color = 'var(--primary-accent)';
      questionCategory.textContent = question.category === 'islamic' ? 'إسلامي' :
                                     question.category === 'riddles' ? 'لغز' :
                                     question.category === 'science' ? 'علوم' : 'عام';
    }

    // Progress badge (hidden during trial)
    const progressBadge = document.getElementById('question-progress');
    const progressNum = document.getElementById('question-progress-num');
    const progressTotal = document.getElementById('question-progress-total');
    if (progressBadge && progressNum && progressTotal) {
      if (isTrial || !askedCount) {
        progressBadge.style.display = 'none';
      } else {
        progressBadge.style.display = 'inline-block';
        progressNum.textContent = askedCount;
        progressTotal.textContent = totalQuestions || askedCount;
      }
    }
    questionText.textContent = question.question_text;
    
    document.getElementById('opt-text-1').textContent = question.option1;
    document.getElementById('opt-text-2').textContent = question.option2;
    document.getElementById('opt-text-3').textContent = question.option3;
    document.getElementById('opt-text-4').textContent = question.option4;
    
    // Re-enable and reset options (hiding empty ones dynamically)
    optionButtons.forEach(btn => {
      const optNum = btn.getAttribute('data-opt');
      const optVal = question[`option${optNum}`];
      
      if (optVal && optVal.trim() !== '') {
        btn.style.display = 'flex';
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.transform = 'none';
        btn.classList.remove('selected-option');
      } else {
        btn.style.display = 'none';
      }
    });

    // Start Timer
    let secondsLeft = timerDuration;
    timerText.textContent = secondsLeft;
    timerBar.style.width = '100%';
    timerBar.style.transition = 'none';

    // Force browser reflow to reset transition
    timerBar.getBoundingClientRect();

    timerBar.style.transition = `width ${timerDuration}s linear`;
    timerBar.style.width = '0%';

    clearInterval(countdownInterval);
    // Start heartbeat (accelerates in the last 5 seconds for tension)
    sounds.startHeartbeat(900);
    countdownInterval = setInterval(() => {
      secondsLeft--;
      timerText.textContent = secondsLeft;

      // Speed up the heartbeat in the final 5 seconds
      if (secondsLeft === 5) {
        sounds.startHeartbeat(450);
      }

      if (secondsLeft <= 0) {
        clearInterval(countdownInterval);
        sounds.stopHeartbeat();
      }
    }, 1000);

    showScreen('question');
  });

  // Send player choice to server
  optionButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const chosen = btn.dataset.opt;
      
      // Highlight selection locally
      optionButtons.forEach(b => {
        if (b === btn) {
          b.classList.add('selected-option');
        } else {
          b.style.opacity = '0.5';
        }
        b.disabled = true;
      });

      // Stop countdown ticking locally
      clearInterval(countdownInterval);
      sounds.stopHeartbeat();

      // Emit
      socket.emit('submit-answer', {
        questionId: currentQuestion.id,
        chosenOption: chosen
      });
    });
  });

  const correctAnswerBox = document.getElementById('correct-answer-box');
  const correctAnswerText = document.getElementById('correct-answer-text');

  // Socket: Answer submitted ack
  socket.on('answer-submitted-ack', ({ isCorrect, chosenOption }) => {
    sounds.stopHeartbeat();
    feedbackIcon.textContent = '⏳';
    feedbackTitle.textContent = 'تم تسجيل الإجابة!';
    feedbackDesc.textContent = 'بانتظار المقدم لكشف النتيجة أو انتهاء وقت البقية...';
    scoreEarnedPanel.style.display = 'none';
    if (correctAnswerBox) correctAnswerBox.style.display = 'none';
    feedbackTotalScore.textContent = activeScore;

    showScreen('feedback');
  });

  // Socket: Timer expired
  socket.on('timer-expired', () => {
    clearInterval(countdownInterval);
    sounds.stopHeartbeat();
    // If player didn't answer yet, lock options
    if (screens.question.classList.contains('active')) {
      optionButtons.forEach(b => b.disabled = true);
      feedbackIcon.textContent = '⏰';
      feedbackTitle.textContent = 'انتهى الوقت!';
      feedbackDesc.textContent = 'بانتظار المقدم لكشف النتيجة...';
      scoreEarnedPanel.style.display = 'none';
      if (correctAnswerBox) correctAnswerBox.style.display = 'none';
      feedbackTotalScore.textContent = activeScore;
      showScreen('feedback');
    }
  });

  // Socket: Reveal Answer results
  socket.on('answer-revealed', ({ correctOption, correctText, isCorrect, chosenOption, pointsEarned, totalScore, isTrial }) => {
    activeScore = totalScore;
    feedbackTotalScore.textContent = totalScore;
    sounds.stopHeartbeat();

    if (isCorrect) {
      feedbackIcon.textContent = isTrial ? '🎯' : '✅';
      feedbackTitle.textContent = isTrial ? 'إجابة صحيحة (تجريبي)' : 'إجابة صحيحة!';
      feedbackTitle.style.color = 'var(--color-green)';
      feedbackDesc.textContent = isTrial
        ? 'أحسنت! هذا كان سؤالاً تجريبياً — لم تُحتسب نقاط.'
        : 'أحسنت! إجابتك صحيحة.';

      // Show correct-answer box (green) with the confirmed answer
      if (correctAnswerBox && correctAnswerText) {
        correctAnswerText.textContent = correctText;
        correctAnswerBox.style.display = 'block';
      }

      // In trial mode, don't show the "+N points" panel since nothing is awarded
      if (isTrial) {
        scoreEarnedPanel.style.display = 'none';
      } else {
        scoreEarnedPanel.style.display = 'block';
        feedbackPoints.textContent = `+${pointsEarned}`;
        feedbackPoints.style.color = 'var(--color-green)';
      }

      sounds.playCorrect();
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    } else {
      feedbackIcon.textContent = '❌';
      feedbackTitle.textContent = 'إجابة خاطئة!';
      feedbackTitle.style.color = 'var(--color-red)';
      feedbackDesc.textContent = chosenOption
        ? 'لقد اخترت إجابة خاطئة.'
        : 'فاتك الوقت للأسف!';

      // Show correct-answer box (green) with the right answer
      if (correctAnswerBox && correctAnswerText) {
        correctAnswerText.textContent = correctText;
        correctAnswerBox.style.display = 'block';
      }

      scoreEarnedPanel.style.display = 'none';

      sounds.playIncorrect();
      if (navigator.vibrate) navigator.vibrate(300);
    }

    showScreen('feedback');
  });

  // Socket: Game Finished
  socket.on('game-finished', ({ players }) => {
    finalTotalScore.textContent = activeScore;

    if (playerDetails && players && players.length > 0) {
      const myId = playerDetails.id;
      const myScore = activeScore;

      // Find all players with the same score (excluding self)
      const coWinners = players.filter(p => p.score === myScore && p.id !== myId);
      
      // Calculate exact rank: how many players have a strictly higher score?
      const higherScorersCount = players.filter(p => p.score > myScore).length;
      const myRank = higherScorersCount + 1;

      // Format rank text
      let rankText = '';
      if (myRank === 1) rankText = 'المركز الأول 🏆🥇';
      else if (myRank === 2) rankText = 'المركز الثاني 🥈';
      else if (myRank === 3) rankText = 'المركز الثالث 🥉';
      else rankText = `المركز ${myRank}`;

      // Set rank text on screen
      const playerRankDisplay = document.getElementById('player-final-rank');
      if (playerRankDisplay) {
        playerRankDisplay.textContent = rankText;
        playerRankDisplay.style.display = 'block';
      }

      // Display ties / co-winners if any
      const coWinnersPanel = document.getElementById('co-winners-panel');
      const coWinnersNames = document.getElementById('co-winners-names');
      if (coWinnersPanel && coWinnersNames) {
        if (coWinners.length > 0) {
          const namesStr = coWinners.map(p => p.name).join('، ');
          coWinnersNames.textContent = namesStr;
          coWinnersPanel.style.display = 'block';
        } else {
          coWinnersPanel.style.display = 'none';
        }
      }
    }

    showScreen('finished');
  });

  // Handle Socket.io Disconnects
  socket.on('disconnect', () => {
    connectionStatus.textContent = 'منقطع 🔴';
    connectionStatus.style.color = 'var(--color-red)';
  });

  socket.on('connect', () => {
    connectionStatus.textContent = 'متصل 🟢';
    connectionStatus.style.color = 'var(--color-green)';
    // Rejoin if already registered
    if (currentRoom && playerDetails) {
      socket.emit('join-room', {
        roomCode: currentRoom.id,
        role: 'player',
        name: playerDetails.name,
        color: playerDetails.color,
        playerId: playerId
      });
    }
  });
});
