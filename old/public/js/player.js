import { sounds } from './sounds.js';

document.addEventListener('DOMContentLoaded', () => {
  const socket = io();
  
  // State variables
  let currentRoom = null;
  let playerDetails = null;
  let currentQuestion = null;
  let countdownInterval = null;
  let secondsLeft = 0;
  let selectedColor = '#ff4757'; // Default selected red color
  let activeScore = 0;
  let lifelinesRemaining = 2;
  let lifelinesTimeRemaining = 2;
  let lifelineUsedThisQuestion = false;
  let lifelineTimeUsedThisQuestion = false;
  let currentStreak = 0;

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

  const btnLifeline5050 = document.getElementById('btn-lifeline-5050');
  const lifelineRemainingVal = document.getElementById('lifeline-remaining-val');
  const btnLifelineTime = document.getElementById('btn-lifeline-time');
  const lifelineTimeRemainingVal = document.getElementById('lifeline-time-remaining-val');
  const playerStreakBadge = document.getElementById('player-streak-badge');
  const playerStreakVal = document.getElementById('player-streak-val');

  // Update the lifeline buttons' enabled/disabled state and label
  function updateLifelineButtonUI(visibleOptionsCount) {
    if (btnLifeline5050 && lifelineRemainingVal) {
      lifelineRemainingVal.textContent = lifelinesRemaining;
      const notEnoughOptions = typeof visibleOptionsCount === 'number' && visibleOptionsCount <= 2;
      const disabled = lifelinesRemaining <= 0 || lifelineUsedThisQuestion || notEnoughOptions;
      btnLifeline5050.disabled = disabled;
      btnLifeline5050.style.opacity = disabled ? '0.4' : '1';
      btnLifeline5050.style.cursor = disabled ? 'not-allowed' : 'pointer';
    }

    if (btnLifelineTime && lifelineTimeRemainingVal) {
      lifelineTimeRemainingVal.textContent = lifelinesTimeRemaining;
      const disabledTime = lifelinesTimeRemaining <= 0 || lifelineTimeUsedThisQuestion;
      btnLifelineTime.disabled = disabledTime;
      btnLifelineTime.style.opacity = disabledTime ? '0.4' : '1';
      btnLifelineTime.style.cursor = disabledTime ? 'not-allowed' : 'pointer';
    }
  }

  function updateStreakBadgeUI() {
    if (!playerStreakBadge || !playerStreakVal) return;
    if (currentStreak >= 3) {
      playerStreakVal.textContent = currentStreak;
      playerStreakBadge.style.display = 'inline';
    } else {
      playerStreakBadge.style.display = 'none';
    }
  }

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
    lifelinesRemaining = (player.lifelines_remaining !== undefined && player.lifelines_remaining !== null) ? player.lifelines_remaining : 2;
    lifelinesTimeRemaining = (player.lifelines_time_remaining !== undefined && player.lifelines_time_remaining !== null) ? player.lifelines_time_remaining : 2;
    currentStreak = player.streak || 0;
    updateLifelineButtonUI();
    updateStreakBadgeUI();

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
        lifelinesRemaining = (self.lifelines_remaining !== undefined && self.lifelines_remaining !== null) ? self.lifelines_remaining : lifelinesRemaining;
        lifelinesTimeRemaining = (self.lifelines_time_remaining !== undefined && self.lifelines_time_remaining !== null) ? self.lifelines_time_remaining : lifelinesTimeRemaining;
        currentStreak = self.streak || 0;
        updateLifelineButtonUI();
        updateStreakBadgeUI();
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

  const TEAM_COLOR_NAMES = {
    '#ff4757': 'الأحمر',
    '#1e90ff': 'الأزرق',
    '#2ed573': 'الأخضر',
    '#ffa502': 'الأصفر',
    '#a55eea': 'البنفسجي'
  };

  function renderPlayerScoreboardOverlay() {
    renderPlayerScoreboardTeams();

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
      const teamColor = p.team_id || p.color;
      const streakBadge = (p.streak || 0) >= 3 ? ` 🔥${p.streak}` : '';

      // Color the whole card with the player's team color
      item.style.background = `${teamColor}22`;
      item.style.border = `1px solid ${teamColor}88`;
      item.style.boxShadow = `0 0 12px ${teamColor}30`;

      item.innerHTML = `
        <div class="leaderboard-rank ${rankClass}">${idx + 1}</div>
        <div class="player-info">
          <div class="player-dot" style="color: ${p.color}; background-color: ${p.color}"></div>
          <span class="player-name" style="${isSelf ? 'font-weight: bold; color: var(--color-yellow);' : ''}">${p.name}${streakBadge} ${isSelf ? '⭐ (أنت)' : ''}</span>
        </div>
        <span class="player-score">${p.score} نقطة</span>
      `;
      playerScoreboardList.appendChild(item);
    });
  }

  function renderPlayerScoreboardTeams() {
    const panel = document.getElementById('player-scoreboard-teams-panel');
    const list = document.getElementById('player-scoreboard-teams-list');
    if (!panel || !list) return;

    const map = new Map();
    allPlayers.forEach(p => {
      const tid = (p.team_id || p.color || '').toLowerCase();
      const entry = map.get(tid) || { color: p.team_id || p.color, total: 0, count: 0 };
      entry.total += (p.score || 0);
      entry.count += 1;
      map.set(tid, entry);
    });
    const teams = [...map.values()].sort((a, b) => b.total - a.total);

    if (teams.length < 2) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = 'block';
    list.innerHTML = '';
    teams.forEach((t, idx) => {
      const rankBadge = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
      const name = TEAM_COLOR_NAMES[(t.color || '').toLowerCase()] || t.color;
      const row = document.createElement('div');
      row.style.cssText = `
        display: flex; justify-content: space-between; align-items: center;
        padding: 10px 14px; border-radius: var(--radius-sm);
        background: ${t.color}22; border: 1px solid ${t.color}88;
        box-shadow: 0 0 12px ${t.color}30;
      `;
      row.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 16px; font-weight: 800;">${rankBadge}</span>
          <span style="width: 12px; height: 12px; border-radius: 50%; background: ${t.color}; box-shadow: 0 0 8px ${t.color};"></span>
          <span style="font-weight: 800; color: ${t.color};">فريق ${name}</span>
          <span style="font-size: 11px; color: var(--text-secondary);">(${t.count} لاعب)</span>
        </div>
        <span style="font-size: 18px; font-weight: 900; color: var(--color-yellow);">${t.total} نقطة</span>
      `;
      list.appendChild(row);
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
    let visibleOptionsCount = 0;
    optionButtons.forEach(btn => {
      const optNum = btn.getAttribute('data-opt');
      const optVal = question[`option${optNum}`];

      if (optVal && optVal.trim() !== '') {
        btn.style.display = 'flex';
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.transform = 'none';
        btn.classList.remove('selected-option');
        visibleOptionsCount++;
      } else {
        btn.style.display = 'none';
      }
    });

    // Reset the lifelines for the new question (not usable during trial rounds)
    lifelineUsedThisQuestion = false;
    lifelineTimeUsedThisQuestion = false;
    if (btnLifeline5050) {
      btnLifeline5050.style.display = isTrial ? 'none' : 'inline-block';
    }
    if (btnLifelineTime) {
      btnLifelineTime.style.display = isTrial ? 'none' : 'inline-block';
    }
    updateLifelineButtonUI(visibleOptionsCount);

    // Start Timer
    secondsLeft = timerDuration;
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

  // 50/50 Lifeline button click
  if (btnLifeline5050) {
    btnLifeline5050.addEventListener('click', () => {
      if (!currentQuestion || btnLifeline5050.disabled) return;
      socket.emit('use-lifeline-5050', { questionId: currentQuestion.id });
    });
  }

  // Socket: 50/50 lifeline result — hide the given wrong options
  socket.on('lifeline-5050-result', ({ hiddenOptions, remaining }) => {
    lifelineUsedThisQuestion = true;
    lifelinesRemaining = remaining;
    updateLifelineButtonUI();

    (hiddenOptions || []).forEach(optNum => {
      const btn = document.querySelector(`.option-btn[data-opt="${optNum}"]`);
      if (btn) {
        btn.style.transition = 'opacity 0.4s ease';
        btn.style.opacity = '0';
        setTimeout(() => { btn.style.display = 'none'; }, 400);
        btn.disabled = true;
      }
    });
  });

  // Time Extension Lifeline button click
  if (btnLifelineTime) {
    btnLifelineTime.addEventListener('click', () => {
      if (!currentQuestion || btnLifelineTime.disabled) return;
      socket.emit('use-lifeline-time', { questionId: currentQuestion.id });
    });
  }

  // Socket: Time Extension lifeline result
  socket.on('lifeline-time-result', ({ remaining }) => {
    lifelineTimeUsedThisQuestion = true;
    lifelinesTimeRemaining = remaining;
    updateLifelineButtonUI();
  });

  // Socket: Room timer was extended by someone
  socket.on('timer-extended', ({ remainingSeconds, playerName }) => {
    secondsLeft = remainingSeconds;
    timerText.textContent = secondsLeft;

    // Reset the progress bar animation to animate over new remaining duration
    timerBar.style.width = '100%';
    timerBar.style.transition = 'none';
    timerBar.getBoundingClientRect(); // force reflow
    timerBar.style.transition = `width ${secondsLeft}s linear`;
    timerBar.style.width = '0%';

    showSuccess(`قام ${playerName} بتمديد الوقت لـ 20 ثانية إضافية! ⏱️`);
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
    const streakBanner1 = document.getElementById('streak-bonus-banner');
    if (streakBanner1) streakBanner1.style.display = 'none';
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
      const streakBanner2 = document.getElementById('streak-bonus-banner');
      if (streakBanner2) streakBanner2.style.display = 'none';
      feedbackTotalScore.textContent = activeScore;
      showScreen('feedback');
    }
  });

  // Socket: Reveal Answer results
  socket.on('answer-revealed', ({ correctOption, correctText, isCorrect, chosenOption, pointsEarned, totalScore, isTrial, streak, streakBonus }) => {
    activeScore = totalScore;
    feedbackTotalScore.textContent = totalScore;
    sounds.stopHeartbeat();

    if (!isTrial && typeof streak === 'number') {
      currentStreak = streak;
      updateStreakBadgeUI();
    }

    const streakBonusBanner = document.getElementById('streak-bonus-banner');
    const streakBonusCount = document.getElementById('streak-bonus-count');
    if (streakBonusBanner) {
      if (streakBonus) {
        if (streakBonusCount) streakBonusCount.textContent = streak;
        streakBonusBanner.style.display = 'block';
      } else {
        streakBonusBanner.style.display = 'none';
      }
    }

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
