import { sounds } from './sounds.js';

document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  // State variables
  let currentRoomId = null;
  let countdownInterval = null;

  // DOM Elements
  const screens = {
    lobby: document.getElementById('screen-lobby'),
    question: document.getElementById('screen-question'),
    result: document.getElementById('screen-result'),
    finished: document.getElementById('screen-finished'),
    prepare: document.getElementById('screen-prepare')
  };

  const roomCodeDisplay = document.getElementById('room-code-display');
  const playersCount = document.getElementById('players-count');
  const playersContainer = document.getElementById('players-container');
  const soundControl = document.getElementById('sound-control');

  const qCategory = document.getElementById('q-category');
  const qText = document.getElementById('q-text');
  const qTimerBar = document.getElementById('q-timer-bar');
  const qTimerText = document.getElementById('q-timer-text');
  const answeredCount = document.getElementById('answered-count');
  const qOptions = {
    1: document.getElementById('q-opt-1'),
    2: document.getElementById('q-opt-2'),
    3: document.getElementById('q-opt-3'),
    4: document.getElementById('q-opt-4')
  };

  const resultQText = document.getElementById('result-q-text');
  const correctAnswerDisplay = document.getElementById('correct-answer-display');
  const resultsLeaderboardContainer = document.getElementById('results-leaderboard-container');

  const podiumNames = {
    1: document.getElementById('podium-name-1'),
    2: document.getElementById('podium-name-2'),
    3: document.getElementById('podium-name-3')
  };
  const podiumScores = {
    1: document.getElementById('podium-score-1'),
    2: document.getElementById('podium-score-2'),
    3: document.getElementById('podium-score-3')
  };
  const fullFinishedStandings = document.getElementById('full-finished-standings');

  // Parse Room ID from URL query parameters
  const urlParams = new URLSearchParams(window.location.search);
  let roomCode = urlParams.get('room');

  // If no room code, prompt user
  if (!roomCode) {
    roomCode = prompt('يرجى إدخال رمز الغرفة للتشغيل:');
  }

  if (!roomCode) {
    alert('عذراً، يجب إدخال رمز غرفة صالح للتشغيل.');
    window.location.href = 'index.html';
    return;
  }

  roomCode = roomCode.trim();

  // Initialize Sound Manager on first interaction
  document.body.addEventListener('click', () => {
    sounds.init();
  }, { once: true });

  // Sound mute toggle
  soundControl.addEventListener('click', () => {
    const isMuted = sounds.toggleMute();
    soundControl.textContent = isMuted ? '🔇' : '🔊';
  });

  // Helper: Switch screens
  function showScreen(screenId) {
    Object.keys(screens).forEach(key => {
      if (key === screenId) {
        screens[key].classList.add('active');
      } else {
        screens[key].classList.remove('active');
      }
    });
  }

  // Join Room as presenter
  socket.emit('join-room', {
    roomCode: roomCode,
    role: 'presenter'
  });

  // Socket: Presenter Joined
  socket.on('presenter-joined', ({ room }) => {
    currentRoomId = room.id;
    roomCodeDisplay.textContent = room.id;

    // Build URL for players to join
    const playerJoinUrl = `${window.location.origin}/player.html?room=${room.id}`;
    
    // Generate QR Code using the reliable API
    const qrcodeImg = document.getElementById('qrcode');
    if (qrcodeImg) {
      qrcodeImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(playerJoinUrl)}`;
    }

    showScreen('lobby');
  });

  // Socket: Question Preparation Countdown
  socket.on('prepare-question', ({ seconds }) => {
    const tvPrepCountdown = document.getElementById('tv-prepare-countdown');
    tvPrepCountdown.textContent = seconds;
    showScreen('prepare');

    let count = seconds;
    sounds.playTick(); // Tick sound for the first second
    const interval = setInterval(() => {
      count--;
      if (count >= 1) {
        tvPrepCountdown.textContent = count;
        sounds.playTick();
      } else {
        clearInterval(interval);
      }
    }, 1000);
  });

  // Socket: Sync existing questions (in case of reloads)
  socket.on('sync-question', ({ question, questionStatus, answeredCount: ansCount, timerDuration, startTime }) => {
    if (questionStatus === 'showing') {
      // Transition to showing
      qCategory.textContent = question.category === 'islamic' ? 'إسلامي' : 
                               question.category === 'riddles' ? 'لغز' : 
                               question.category === 'science' ? 'علوم' : 'عام';
      qText.textContent = question.question_text;
      
      document.getElementById('q-opt-text-1').textContent = question.option1;
      document.getElementById('q-opt-text-2').textContent = question.option2;
      document.getElementById('q-opt-text-3').textContent = question.option3;
      document.getElementById('q-opt-text-4').textContent = question.option4;
      
      answeredCount.textContent = ansCount;

      // Reset options styling
      Object.keys(qOptions).forEach(key => {
        qOptions[key].style.opacity = '1';
        qOptions[key].style.border = '2px solid transparent';
      });

      // Synchronize timer bar
      const timeElapsed = (Date.now() - startTime) / 1000;
      const timeLeft = Math.max(0, timerDuration - timeElapsed);
      
      qTimerText.textContent = Math.round(timeLeft);
      qTimerBar.style.width = '100%';
      qTimerBar.style.transition = 'none';
      qTimerBar.getBoundingClientRect();
      
      qTimerBar.style.transition = `width ${timeLeft}s linear`;
      qTimerBar.style.width = '0%';

      clearInterval(countdownInterval);
      let secondsLeft = Math.round(timeLeft);
      countdownInterval = setInterval(() => {
        secondsLeft--;
        qTimerText.textContent = Math.max(0, secondsLeft);
        if (secondsLeft <= 5 && secondsLeft > 0) {
          sounds.playTick();
        }
        if (secondsLeft <= 0) {
          clearInterval(countdownInterval);
        }
      }, 1000);

      showScreen('question');
    }
  });

  // Socket: Update Player List
  socket.on('player-list-update', (players) => {
    playersCount.textContent = players.length;
    playersContainer.innerHTML = '';

    if (players.length === 0) {
      playersContainer.innerHTML = '<div style="color: var(--text-muted); width: 100%; text-align: center; padding: 40px 0;">بانتظار انضمام أول لاعب...</div>';
      return;
    }

    players.forEach(player => {
      const badge = document.createElement('div');
      badge.style.cssText = `
        padding: 10px 18px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid ${player.color};
        color: var(--text-primary);
        font-weight: bold;
        font-size: 16px;
        border-radius: var(--radius-md);
        display: flex;
        align-items: center;
        gap: 8px;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
        transition: all 0.3s ease;
      `;
      
      if (player.is_active === 0) {
        badge.style.opacity = '0.5';
        badge.innerHTML = `<span style="width: 8px; height: 8px; border-radius: 50%; background: #6b7280;"></span> <s>${player.name}</s>`;
      } else {
        badge.innerHTML = `<span style="width: 10px; height: 10px; border-radius: 50%; background: ${player.color}; box-shadow: 0 0 8px ${player.color}"></span> ${player.name}`;
      }

      playersContainer.appendChild(badge);
    });
  });

  // Socket: Game Started
  socket.on('game-started', () => {
    // Show empty question screen or wait screen
    qText.textContent = 'بانتظار طرح السؤال الأول من المقدم...';
    Object.keys(qOptions).forEach(k => {
      qOptions[k].style.display = 'none';
    });
    qTimerBar.style.width = '0';
    qTimerText.textContent = '';
    showScreen('question');
  });

  // Socket: Question shown on TV
  socket.on('question-shown', ({ question, timerDuration }) => {
    qCategory.textContent = question.category === 'islamic' ? 'إسلامي' : 
                             question.category === 'riddles' ? 'لغز' : 
                             question.category === 'science' ? 'علوم' : 'عام';
    qText.textContent = question.question_text;
    
    document.getElementById('q-opt-text-1').textContent = question.option1;
    document.getElementById('q-opt-text-2').textContent = question.option2;
    document.getElementById('q-opt-text-3').textContent = question.option3;
    document.getElementById('q-opt-text-4').textContent = question.option4;
    
    answeredCount.textContent = '0';

    // Show options
    Object.keys(qOptions).forEach(k => {
      qOptions[k].style.display = 'flex';
      qOptions[k].style.opacity = '1';
      qOptions[k].style.border = '2px solid transparent';
      qOptions[k].style.boxShadow = 'var(--shadow-sm)';
    });

    // Reset countdown
    qTimerText.textContent = timerDuration;
    qTimerBar.style.width = '100%';
    qTimerBar.style.transition = 'none';
    qTimerBar.getBoundingClientRect(); // reflow
    qTimerBar.style.transition = `width ${timerDuration}s linear`;
    qTimerBar.style.width = '0%';

    clearInterval(countdownInterval);
    let secondsLeft = timerDuration;
    countdownInterval = setInterval(() => {
      secondsLeft--;
      qTimerText.textContent = Math.max(0, secondsLeft);
      
      if (secondsLeft <= 5 && secondsLeft > 0) {
        sounds.playTick();
      }
      
      if (secondsLeft <= 0) {
        clearInterval(countdownInterval);
      }
    }, 1000);

    showScreen('question');
  });

  // Socket: Update Answered count
  socket.on('player-answered-count', (count) => {
    answeredCount.textContent = count;
  });

  // Socket: Timer expired
  socket.on('timer-expired', () => {
    clearInterval(countdownInterval);
    qTimerText.textContent = 'انتهى الوقت!';
    sounds.playIncorrect(); // Play buzzer tone
  });

  // Socket: Answer revealed (TV layout update)
  socket.on('presenter-reveal', ({ correctOption, correctText, players, answersSummary }) => {
    clearInterval(countdownInterval);

    // 1. Populate Result statistics
    resultQText.textContent = qText.textContent;
    correctAnswerDisplay.textContent = correctText;

    // Fill options text in result
    document.getElementById('res-text-1').textContent = document.getElementById('q-opt-text-1').textContent;
    document.getElementById('res-text-2').textContent = document.getElementById('q-opt-text-2').textContent;
    document.getElementById('res-text-3').textContent = document.getElementById('q-opt-text-3').textContent;
    document.getElementById('res-text-4').textContent = document.getElementById('q-opt-text-4').textContent;

    // Answer counts and percentages
    const totalAns = answersSummary.total || 1; // prevent div by zero
    for (let opt = 1; opt <= 4; opt++) {
      const count = answersSummary.distribution[opt] || 0;
      const percent = Math.round((count / totalAns) * 100);
      
      document.getElementById(`res-count-${opt}`).textContent = `${count} لاعب (${percent}%)`;
      document.getElementById(`res-bar-${opt}`).style.width = `${percent}%`;
      
      // If it is the correct answer, give it a special style
      if (opt === correctOption) {
        document.getElementById(`res-bar-${opt}`).style.background = 'var(--color-green)';
      } else {
        document.getElementById(`res-bar-${opt}`).style.background = '#555';
      }
    }

    // 2. Populate Leaderboard
    resultsLeaderboardContainer.innerHTML = '';
    
    // Take Top 5 players
    const topPlayers = players.slice(0, 5);
    topPlayers.forEach((player, idx) => {
      const item = document.createElement('div');
      item.className = 'leaderboard-item';
      
      let rankClass = '';
      if (idx === 0) rankClass = 'rank-1';
      else if (idx === 1) rankClass = 'rank-2';
      else if (idx === 2) rankClass = 'rank-3';

      item.innerHTML = `
        <div class="leaderboard-rank ${rankClass}">${idx + 1}</div>
        <div class="player-info">
          <div class="player-dot" style="color: ${player.color}; background-color: ${player.color}"></div>
          <span class="player-name">${player.name}</span>
        </div>
        <span class="player-score">${player.score} نقطة</span>
      `;
      
      resultsLeaderboardContainer.appendChild(item);
    });

    sounds.playCorrect(); // Play pleasant ding sound on reveal
    showScreen('result');
  });

  // Socket: Game Finished (TV Podium layout update)
  socket.on('game-finished', ({ players }) => {
    // Top 3 players
    const p1 = players[0] || { name: 'لا يوجد', score: 0 };
    const p2 = players[1] || { name: 'لا يوجد', score: 0 };
    const p3 = players[2] || { name: 'لا يوجد', score: 0 };

    podiumNames[1].textContent = p1.name;
    podiumScores[1].textContent = `${p1.score} نقطة`;
    if (p1.color) {
      document.getElementById('podium-1').style.color = p1.color;
    }

    podiumNames[2].textContent = p2.name;
    podiumScores[2].textContent = `${p2.score} نقطة`;
    if (p2.color) {
      document.getElementById('podium-2').style.color = p2.color;
    }

    podiumNames[3].textContent = p3.name;
    podiumScores[3].textContent = `${p3.score} نقطة`;
    if (p3.color) {
      document.getElementById('podium-3').style.color = p3.color;
    }

    // Populate full standings
    fullFinishedStandings.innerHTML = '';
    players.forEach((player, idx) => {
      const item = document.createElement('div');
      item.className = 'leaderboard-item';
      
      let rankClass = '';
      if (idx === 0) rankClass = 'rank-1';
      else if (idx === 1) rankClass = 'rank-2';
      else if (idx === 2) rankClass = 'rank-3';

      item.innerHTML = `
        <div class="leaderboard-rank ${rankClass}">${idx + 1}</div>
        <div class="player-info">
          <div class="player-dot" style="color: ${player.color}; background-color: ${player.color}"></div>
          <span class="player-name">${player.name}</span>
        </div>
        <span class="player-score">${player.score} نقطة</span>
      `;
      fullFinishedStandings.appendChild(item);
    });

    sounds.playSuccess(); // Play victory fanfare
    showScreen('finished');
  });

  socket.on('error-msg', (msg) => {
    alert(`خطأ: ${msg}`);
  });
});
