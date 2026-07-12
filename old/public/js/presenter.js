import { sounds } from './sounds.js';

document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  // State variables
  let currentRoomId = null;
  let countdownInterval = null;
  let secondsLeft = 0;

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
  const teamLobbyBoard = document.getElementById('team-lobby-board');
  const teamLobbyHint = document.getElementById('team-lobby-hint');
  const soundControl = document.getElementById('sound-control');

  const LOBBY_TEAM_COLORS = ['#ff4757', '#1e90ff', '#2ed573', '#ffa502'];

  const qCategory = document.getElementById('q-category');
  const qText = document.getElementById('q-text');
  const qImageContainer = document.getElementById('q-image-container');
  const qImage = document.getElementById('q-image');
  const qTimerBar = document.getElementById('q-timer-bar');
  const qTimerText = document.getElementById('q-timer-text');
  const answeredCount = document.getElementById('answered-count');
  const qOptions = {
    1: document.getElementById('q-opt-1'),
    2: document.getElementById('q-opt-2'),
    3: document.getElementById('q-opt-3'),
    4: document.getElementById('q-opt-4')
  };

  // Show/hide the question image (multimedia questions)
  function updateQuestionImage(imageUrl) {
    if (!qImageContainer || !qImage) return;
    if (imageUrl && imageUrl.trim() !== '') {
      qImage.src = imageUrl;
      qImageContainer.style.display = 'block';
    } else {
      qImage.src = '';
      qImageContainer.style.display = 'none';
    }
  }

  const resultQText = document.getElementById('result-q-text');
  const correctAnswerDisplay = document.getElementById('correct-answer-display');
  const resultsLeaderboardContainer = document.getElementById('results-leaderboard-container');
  const resultsTeamsPanel = document.getElementById('results-teams-panel');
  const resultsTeamsContainer = document.getElementById('results-teams-container');

  const TEAM_COLOR_NAMES = {
    '#ff4757': 'الأحمر',
    '#1e90ff': 'الأزرق',
    '#2ed573': 'الأخضر',
    '#ffa502': 'الأصفر',
    '#a55eea': 'البنفسجي'
  };

  function renderTeamStandings(players) {
    if (!resultsTeamsPanel || !resultsTeamsContainer) return;
    if (roomType === 'group') {
      resultsTeamsPanel.style.display = 'none';
      return;
    }
    const map = new Map();
    (players || []).forEach(p => {
      const tid = (p.team_id || p.color || '').toLowerCase();
      const entry = map.get(tid) || { color: p.team_id || p.color, total: 0, count: 0 };
      entry.total += (p.score || 0);
      entry.count += 1;
      map.set(tid, entry);
    });
    const teams = [...map.values()].sort((a, b) => b.total - a.total);
    if (teams.length < 2) {
      resultsTeamsPanel.style.display = 'none';
      return;
    }
    resultsTeamsPanel.style.display = 'block';
    resultsTeamsContainer.innerHTML = '';
    teams.forEach((t, idx) => {
      const rankBadge = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
      const name = TEAM_COLOR_NAMES[(t.color || '').toLowerCase()] || t.color;
      const row = document.createElement('div');
      row.style.cssText = `
        display: flex; justify-content: space-between; align-items: center;
        padding: 10px 14px; border-radius: var(--radius-sm);
        background: ${t.color}18; border: 1px solid ${t.color}66;
        box-shadow: 0 0 12px ${t.color}22;
      `;
      row.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 18px; font-weight: 800;">${rankBadge}</span>
          <span style="width: 14px; height: 14px; border-radius: 50%; background: ${t.color}; box-shadow: 0 0 10px ${t.color};"></span>
          <div>
            <div style="font-weight: 800; color: ${t.color};">فريق ${name}</div>
            <div style="font-size: 11px; color: var(--text-secondary);">${t.count} لاعب</div>
          </div>
        </div>
        <div style="font-size: 22px; font-weight: 900; color: var(--color-yellow);">${t.total} <span style="font-size: 12px; color: var(--text-secondary);">نقطة</span></div>
      `;
      resultsTeamsContainer.appendChild(row);
    });
  }

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

  // State variables
  let roomType = 'individual';
  let playersList = [];
  let currentTurnIndex = 0;
  let currentActiveTeamId = null;
  let currentQuestionStatus = 'idle';

  // Group turn indicator elements
  const presenterTurnIndicator = document.getElementById('presenter-turn-indicator');
  const presenterActiveTeamName = document.getElementById('presenter-active-team-name');
  
  // Floating controls elements
  const presenterControlsBar = document.getElementById('presenter-controls-bar');
  const ctrlStartGame = document.getElementById('ctrl-start-game');
  const ctrlNextQ = document.getElementById('ctrl-next-q');
  const ctrlReveal = document.getElementById('ctrl-reveal');
  const ctrlGroupControls = document.getElementById('ctrl-group-controls');
  const ctrlActiveTeamName = document.getElementById('ctrl-active-team-name');

  // Parse Room ID from URL query parameters
  const urlParams = new URLSearchParams(window.location.search);
  let roomCode = urlParams.get('room');
  const enableControl = urlParams.get('control') === 'true';

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

  // If control mode is enabled, show the floating controls bar and bind events
  if (enableControl && presenterControlsBar) {
    presenterControlsBar.style.display = 'flex';
    ctrlStartGame.addEventListener('click', () => {
      socket.emit('start-game');
    });
    ctrlNextQ.addEventListener('click', () => {
      socket.emit('group-next-question');
    });
    ctrlReveal.addEventListener('click', () => {
      socket.emit('reveal-answer');
    });

    // Make option cards clickable in presenter controls mode
    Object.keys(qOptions).forEach(k => {
      qOptions[k].style.cursor = 'pointer';
      qOptions[k].addEventListener('click', () => {
        if (currentQuestionStatus === 'showing') {
          socket.emit('group-choose-option', { chosenOption: parseInt(k) });
        }
      });
    });
  }

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
    roomType = room.type;

    if (roomType === 'group') {
      const qrcodeInstructions = document.getElementById('qrcode-instructions');
      if (qrcodeInstructions) {
        qrcodeInstructions.style.display = 'none';
      }
      if (ctrlGroupControls) {
        ctrlGroupControls.style.display = 'flex';
      }
    } else {
      if (ctrlGroupControls) {
        ctrlGroupControls.style.display = 'none';
      }
    }

    // Toggle start vs play control buttons based on active room status
    if (room.status === 'active' || room.status === 'waiting') {
      if (ctrlStartGame) ctrlStartGame.style.display = 'none';
      if (ctrlNextQ) ctrlNextQ.style.display = 'inline-block';
      if (ctrlReveal) ctrlReveal.style.display = 'inline-block';
    } else {
      if (ctrlStartGame) ctrlStartGame.style.display = 'inline-block';
      if (ctrlNextQ) ctrlNextQ.style.display = 'none';
      if (ctrlReveal) ctrlReveal.style.display = 'none';
    }

    // Build URL for players to join
    const playerJoinUrl = `${window.location.origin}/player.html?room=${room.id}`;

    // Generate QR Code using the reliable API (small icon + large modal version)
    const qrcodeImg = document.getElementById('qrcode');
    const qrcodeLarge = document.getElementById('qrcode-large');
    const qrModalRoomCode = document.getElementById('qr-modal-room-code');
    if (roomType !== 'group') {
      if (qrcodeImg) qrcodeImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(playerJoinUrl)}`;
      if (qrcodeLarge) qrcodeLarge.src = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(playerJoinUrl)}`;
      if (qrModalRoomCode) qrModalRoomCode.textContent = room.id;
    }

    showScreen('lobby');
  });

  // Wire the QR modal (open/close)
  const qrModal = document.getElementById('qr-modal');
  const btnShowQr = document.getElementById('btn-show-qr');
  const btnCloseQr = document.getElementById('btn-close-qr');
  if (btnShowQr && qrModal) {
    btnShowQr.addEventListener('click', () => {
      try { qrModal.showModal(); } catch (e) { qrModal.setAttribute('open', ''); }
    });
  }
  if (btnCloseQr && qrModal) {
    btnCloseQr.addEventListener('click', () => qrModal.close());
  }
  // Click on the backdrop (outside the panel) closes too
  if (qrModal) {
    qrModal.addEventListener('click', (e) => {
      const rect = qrModal.getBoundingClientRect();
      const inDialog = (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom);
      if (!inDialog) qrModal.close();
    });
  }

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
    currentQuestionStatus = questionStatus;
    if (questionStatus === 'showing') {
      // Transition to showing
      qCategory.textContent = question.category === 'islamic' ? 'إسلامي' : 
                               question.category === 'riddles' ? 'لغز' : 
                               question.category === 'science' ? 'علوم' : 'عام';
      qText.textContent = question.question_text;
      updateQuestionImage(question.image_url);

      document.getElementById('q-opt-text-1').textContent = question.option1;
      document.getElementById('q-opt-text-2').textContent = question.option2;
      document.getElementById('q-opt-text-3').textContent = question.option3;
      document.getElementById('q-opt-text-4').textContent = question.option4;

      answeredCount.textContent = ansCount;

      // Reset options styling (only display non-empty options)
      Object.keys(qOptions).forEach(key => {
        const optVal = question[`option${key}`];
        if (optVal && optVal.trim() !== '') {
          qOptions[key].style.display = 'flex';
          qOptions[key].style.opacity = '1';
          qOptions[key].style.border = '2px solid transparent';
        } else {
          qOptions[key].style.display = 'none';
        }
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
    playersList = players;
    playersCount.textContent = players.length;

    // Individual mode + pre-game → show 4-column team board with drag-and-drop
    const useTeamBoard = (roomType === 'individual');
    if (useTeamBoard && teamLobbyBoard) {
      teamLobbyBoard.style.display = 'grid';
      if (teamLobbyHint) teamLobbyHint.style.display = 'block';
      playersContainer.style.display = 'none';
      renderTeamLobbyBoard(players);
    } else {
      if (teamLobbyBoard) teamLobbyBoard.style.display = 'none';
      if (teamLobbyHint) teamLobbyHint.style.display = 'none';
      playersContainer.style.display = 'flex';
      renderFlatPlayersList(players);
    }

    updateTurnDisplay();
  });

  function renderFlatPlayersList(players) {
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
  }

  function renderTeamLobbyBoard(players) {
    // Clear all columns first
    LOBBY_TEAM_COLORS.forEach(color => {
      const col = teamLobbyBoard.querySelector(`.team-players[data-team="${color}"]`);
      if (col) col.innerHTML = '';
    });

    // Group by team_id (falls back to color); unknown / off-palette teams go to red as a safe default
    const bucketed = { '#ff4757': [], '#1e90ff': [], '#2ed573': [], '#ffa502': [] };
    players.forEach(p => {
      const teamKey = (p.team_id || p.color || '').toLowerCase();
      const target = LOBBY_TEAM_COLORS.find(c => c.toLowerCase() === teamKey) || '#ff4757';
      bucketed[target].push(p);
    });

    LOBBY_TEAM_COLORS.forEach(color => {
      const col = teamLobbyBoard.querySelector(`.team-players[data-team="${color}"]`);
      const countEl = teamLobbyBoard.querySelector(`.team-column[data-team="${color}"] .team-count`);
      const columnEl = teamLobbyBoard.querySelector(`.team-column[data-team="${color}"]`);
      if (!col || !countEl) return;

      countEl.textContent = bucketed[color].length;

      if (bucketed[color].length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'text-align: center; color: var(--text-muted); font-size: 12px; padding: 15px 0; opacity: 0.5;';
        empty.textContent = 'اسحب لاعباً هنا';
        col.appendChild(empty);
      } else {
        bucketed[color].forEach(p => col.appendChild(buildDraggablePlayerCard(p)));
      }

      // Attach drop targets (idempotent — re-attaching to a node just replaces the handler bindings by adding new ones,
      // so we set the listeners on the column once by tracking via a data attribute)
      if (columnEl && !columnEl.dataset.dropBound) {
        columnEl.dataset.dropBound = '1';
        columnEl.addEventListener('dragover', (e) => {
          e.preventDefault();
          columnEl.style.background = `${color}25`;
          columnEl.style.borderStyle = 'solid';
          columnEl.style.transform = 'scale(1.02)';
        });
        columnEl.addEventListener('dragleave', () => {
          columnEl.style.background = `${color}14`;
          columnEl.style.borderStyle = 'dashed';
          columnEl.style.transform = 'scale(1)';
        });
        columnEl.addEventListener('drop', (e) => {
          e.preventDefault();
          columnEl.style.background = `${color}14`;
          columnEl.style.borderStyle = 'dashed';
          columnEl.style.transform = 'scale(1)';
          const pid = e.dataTransfer.getData('text/plain');
          const targetTeam = columnEl.dataset.team;
          if (!pid || !targetTeam) return;
          // Optimistic UI: emit assignment; server will echo player-list-update
          socket.emit('assign-player-team', { playerId: pid, teamId: targetTeam });
        });
      }
    });
  }

  function buildDraggablePlayerCard(player) {
    const card = document.createElement('div');
    card.draggable = true;
    card.dataset.playerId = player.id;
    const isDead = player.is_active === 0;
    card.style.cssText = `
      padding: 8px 12px;
      background: rgba(255,255,255,0.06);
      border: 1px solid ${player.color};
      border-radius: var(--radius-sm);
      color: var(--text-primary);
      font-weight: 700;
      font-size: 14px;
      display: flex; align-items: center; gap: 8px;
      cursor: grab;
      user-select: none;
      transition: all 0.15s ease;
      ${isDead ? 'opacity: 0.5;' : ''}
    `;
    card.innerHTML = `
      <span style="width: 10px; height: 10px; border-radius: 50%; background: ${player.color}; box-shadow: 0 0 6px ${player.color};"></span>
      <span style="flex-grow: 1;">${isDead ? `<s>${player.name}</s>` : player.name}</span>
      <span style="font-size: 11px; color: var(--text-muted);">⋮⋮</span>
    `;
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', player.id);
      e.dataTransfer.effectAllowed = 'move';
      card.style.opacity = '0.35';
    });
    card.addEventListener('dragend', () => {
      card.style.opacity = isDead ? '0.5' : '1';
    });
    return card;
  }


  // Socket: Update Active Turn
  socket.on('turn-updated', (payload) => {
    if (typeof payload === 'object' && payload !== null) {
      currentTurnIndex = payload.index || 0;
      currentActiveTeamId = payload.activeTeamId || null;
    } else {
      currentTurnIndex = payload || 0;
      currentActiveTeamId = null;
    }
    updateTurnDisplay();
  });

  // Helper: Update turn display in both Presenter View and Control Bar
  function updateTurnDisplay() {
    if (roomType === 'group' && playersList.length > 0) {
      // Prefer looking up by activeTeamId (stable across score-sorted list), fallback to index.
      const activeTeam = currentActiveTeamId
        ? playersList.find(p => p.id === currentActiveTeamId)
        : playersList[currentTurnIndex];
      if (activeTeam) {
        presenterActiveTeamName.textContent = activeTeam.name;
        
        // Full color blend for the entire row!
        presenterTurnIndicator.style.backgroundColor = `${activeTeam.color}35`; // Hex color + 35 (approx 20% opacity)
        presenterTurnIndicator.style.borderColor = activeTeam.color;
        presenterTurnIndicator.style.color = '#ffffff';
        presenterTurnIndicator.style.textShadow = `0 0 10px ${activeTeam.color}, 0 0 20px ${activeTeam.color}`;
        presenterTurnIndicator.style.boxShadow = `0 0 20px ${activeTeam.color}40, inset 0 0 15px ${activeTeam.color}20`;
        presenterTurnIndicator.style.display = 'block';

        if (ctrlActiveTeamName) {
          ctrlActiveTeamName.textContent = activeTeam.name;
          ctrlActiveTeamName.style.color = activeTeam.color;
        }
      }
    } else {
      if (presenterTurnIndicator) {
        presenterTurnIndicator.style.display = 'none';
      }
    }
  }

  // Socket: Game Started
  socket.on('game-started', () => {
    // Hide start game button and show next/reveal controls
    if (ctrlStartGame) ctrlStartGame.style.display = 'none';
    if (ctrlNextQ) ctrlNextQ.style.display = 'inline-block';
    if (ctrlReveal) ctrlReveal.style.display = 'inline-block';

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
  socket.on('question-shown', ({ question, timerDuration, isTrial, askedCount, totalQuestions }) => {
    currentQuestionStatus = 'showing';
    if (isTrial) {
      qCategory.textContent = '🎯 سؤال تجريبي';
      qCategory.style.background = 'rgba(255, 165, 2, 0.2)';
      qCategory.style.color = 'var(--color-yellow)';
    } else {
      qCategory.style.background = 'rgba(165, 94, 234, 0.2)';
      qCategory.style.color = 'var(--primary-purple)';
      qCategory.textContent = question.category === 'islamic' ? 'إسلامي' :
                               question.category === 'riddles' ? 'لغز' :
                               question.category === 'science' ? 'علوم' : 'عام';
    }

    // Progress badge (hidden during trial)
    const qProgress = document.getElementById('q-progress');
    const qProgressNum = document.getElementById('q-progress-num');
    const qProgressTotal = document.getElementById('q-progress-total');
    if (qProgress && qProgressNum && qProgressTotal) {
      if (isTrial || !askedCount) {
        qProgress.style.display = 'none';
      } else {
        qProgress.style.display = 'inline-block';
        qProgressNum.textContent = askedCount;
        qProgressTotal.textContent = totalQuestions || askedCount;
      }
    }
    qText.textContent = question.question_text;
    updateQuestionImage(question.image_url);

    document.getElementById('q-opt-text-1').textContent = question.option1;
    document.getElementById('q-opt-text-2').textContent = question.option2;
    document.getElementById('q-opt-text-3').textContent = question.option3;
    document.getElementById('q-opt-text-4').textContent = question.option4;

    answeredCount.textContent = '0';

    // Show options only if they contain text
    Object.keys(qOptions).forEach(k => {
      const optVal = question[`option${k}`];
      if (optVal && optVal.trim() !== '') {
        qOptions[k].style.display = 'flex';
        qOptions[k].style.opacity = '1';
        qOptions[k].style.border = '2px solid transparent';
        qOptions[k].style.boxShadow = 'var(--shadow-sm)';
      } else {
        qOptions[k].style.display = 'none';
      }
    });

    // Reset countdown
    qTimerText.textContent = timerDuration;
    qTimerBar.style.width = '100%';
    qTimerBar.style.transition = 'none';
    qTimerBar.getBoundingClientRect(); // reflow
    qTimerBar.style.transition = `width ${timerDuration}s linear`;
    qTimerBar.style.width = '0%';

    clearInterval(countdownInterval);
    secondsLeft = timerDuration;
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

  // Socket: Room timer extended
  socket.on('timer-extended', ({ remainingSeconds }) => {
    secondsLeft = remainingSeconds;
    qTimerText.textContent = secondsLeft;

    // Reset progress bar animation
    qTimerBar.style.width = '100%';
    qTimerBar.style.transition = 'none';
    qTimerBar.getBoundingClientRect(); // force reflow
    qTimerBar.style.transition = `width ${secondsLeft}s linear`;
    qTimerBar.style.width = '0%';

    // Recreate countdown interval to keep it ticking on the TV screen!
    clearInterval(countdownInterval);
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
  });

  // Socket: Update Answered count
  socket.on('player-answered-count', (count) => {
    answeredCount.textContent = count;
  });

  // Socket: Timer expired
  socket.on('timer-expired', () => {
    currentQuestionStatus = 'revealed';
    clearInterval(countdownInterval);
    qTimerText.textContent = 'انتهى الوقت!';
    sounds.playIncorrect(); // Play buzzer tone
  });

  // Socket: Answer revealed (TV layout update)
  socket.on('presenter-reveal', ({ correctOption, correctText, players, answersSummary, groupMode, activeTeam }) => {
    currentQuestionStatus = 'revealed';
    clearInterval(countdownInterval);

    // 1. Populate Result statistics
    resultQText.textContent = qText.textContent;
    correctAnswerDisplay.textContent = correctText;

    // Fill options text in result
    document.getElementById('res-text-1').textContent = document.getElementById('q-opt-text-1').textContent;
    document.getElementById('res-text-2').textContent = document.getElementById('q-opt-text-2').textContent;
    document.getElementById('res-text-3').textContent = document.getElementById('q-opt-text-3').textContent;
    document.getElementById('res-text-4').textContent = document.getElementById('q-opt-text-4').textContent;

    const answerBarsSection = document.getElementById('answer-bars-section');
    const groupResultCard = document.getElementById('group-result-card');

    if (groupMode) {
      // Hide per-player distribution, show team-answered card instead
      if (answerBarsSection) answerBarsSection.style.display = 'none';
      if (groupResultCard && activeTeam) {
        groupResultCard.style.display = 'block';
        groupResultCard.style.borderColor = activeTeam.color;
        groupResultCard.style.background = `${activeTeam.color}15`;
        groupResultCard.style.boxShadow = `0 0 20px ${activeTeam.color}40`;

        const teamLabel = document.getElementById('group-result-team-name');
        const chosenLabel = document.getElementById('group-result-chosen');
        const verdictLabel = document.getElementById('group-result-verdict');
        const pointsLabel = document.getElementById('group-result-points');

        if (teamLabel) {
          teamLabel.textContent = activeTeam.name;
          teamLabel.style.color = activeTeam.color;
          teamLabel.style.textShadow = `0 0 10px ${activeTeam.color}`;
        }
        if (chosenLabel) chosenLabel.textContent = `اختار: ${activeTeam.chosenText || '—'}`;
        if (verdictLabel) {
          if (activeTeam.isCorrect) {
            verdictLabel.textContent = '✅ إجابة صحيحة';
            verdictLabel.style.color = 'var(--color-green)';
          } else {
            verdictLabel.textContent = '❌ إجابة خاطئة';
            verdictLabel.style.color = 'var(--color-red)';
          }
        }
        if (pointsLabel) {
          pointsLabel.textContent = activeTeam.isCorrect
            ? `حصل على ${activeTeam.pointsAwarded} نقطة 🎉`
            : 'لم يحصل على نقاط لهذا السؤال';
        }
      }
    } else {
      if (answerBarsSection) answerBarsSection.style.display = 'flex';
      if (groupResultCard) groupResultCard.style.display = 'none';

      // Answer counts and percentages (individual mode only)
      const totalAns = (answersSummary && answersSummary.total) || 1; // prevent div by zero
      for (let opt = 1; opt <= 4; opt++) {
        const optionTextVal = document.getElementById(`q-opt-text-${opt}`).textContent;
        const container = document.getElementById(`res-container-${opt}`);

        if (optionTextVal && optionTextVal.trim() !== '') {
          if (container) container.style.display = 'block';
          const count = (answersSummary && answersSummary.distribution[opt]) || 0;
          const percent = Math.round((count / totalAns) * 100);

          document.getElementById(`res-count-${opt}`).textContent = `${count} لاعب (${percent}%)`;
          document.getElementById(`res-bar-${opt}`).style.width = `${percent}%`;

          if (opt === correctOption) {
            document.getElementById(`res-bar-${opt}`).style.background = 'var(--color-green)';
          } else {
            document.getElementById(`res-bar-${opt}`).style.background = '#555';
          }
        } else {
          if (container) container.style.display = 'none';
        }
      }
    }

    // 2. Populate Team standings (color-based) then individual leaderboard
    renderTeamStandings(players);

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

      const streakBadge = (player.streak || 0) >= 3 ? ` 🔥${player.streak}` : '';

      item.innerHTML = `
        <div class="leaderboard-rank ${rankClass}">${idx + 1}</div>
        <div class="player-info">
          <div class="player-dot" style="color: ${player.color}; background-color: ${player.color}"></div>
          <span class="player-name">${player.name}${streakBadge}</span>
        </div>
        <span class="player-score">${player.score} نقطة</span>
      `;

      resultsLeaderboardContainer.appendChild(item);
    });

    sounds.playCorrect(); // Play pleasant ding sound on reveal
    showScreen('result');
  });

  // Socket: Game Finished (TV Podium layout update)
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

    // Populate full standings (Individual General Standings)
    fullFinishedStandings.innerHTML = '';
    players.forEach((player, idx) => {
      const item = document.createElement('div');
      item.className = 'leaderboard-item';
      
      let rankClass = '';
      if (idx === 0) rankClass = 'rank-1';
      else if (idx === 1) rankClass = 'rank-2';
      else if (idx === 2) rankClass = 'rank-3';

      const streakBadge = (player.streak || 0) >= 3 ? ` 🔥${player.streak}` : '';

      item.innerHTML = `
        <div class="leaderboard-rank ${rankClass}">${idx + 1}</div>
        <div class="player-info">
          <div class="player-dot" style="color: ${player.color}; background-color: ${player.color}"></div>
          <span class="player-name">${player.name}${streakBadge}</span>
        </div>
        <span class="player-score">${player.score} نقطة</span>
      `;
      fullFinishedStandings.appendChild(item);
    });

    // Populate Team Standings (Group Score totals by color)
    const teamFinishedStandings = document.getElementById('team-finished-standings');
    if (teamFinishedStandings) {
      teamFinishedStandings.innerHTML = '';
      
      const teamStats = {};
      players.forEach(p => {
        const color = p.color || '#ffffff';
        if (!teamStats[color]) {
          teamStats[color] = {
            color: color,
            score: 0,
            playerCount: 0
          };
        }
        teamStats[color].score += (p.score || 0);
        teamStats[color].playerCount += 1;
      });

      const colorNames = {
        '#ff4757': 'الفريق الأحمر 🔴',
        '#2ed573': 'الفريق الأخضر 🟢',
        '#70a1ff': 'الفريق الأزرق 🔵',
        '#ffa502': 'الفريق الأصفر 🟡',
        'red': 'الفريق الأحمر 🔴',
        'green': 'الفريق الأخضر 🟢',
        'blue': 'الفريق الأزرق 🔵',
        'yellow': 'الفريق الأصفر 🟡'
      };

      const sortedTeams = Object.values(teamStats).sort((a, b) => b.score - a.score);

      sortedTeams.forEach((team, idx) => {
        const item = document.createElement('div');
        item.className = 'leaderboard-item';
        
        let rankClass = '';
        if (idx === 0) rankClass = 'rank-1';
        else if (idx === 1) rankClass = 'rank-2';
        else if (idx === 2) rankClass = 'rank-3';

        const teamName = colorNames[team.color.toLowerCase()] || `فريق ${team.color}`;

        item.innerHTML = `
          <div class="leaderboard-rank ${rankClass}">${idx + 1}</div>
          <div class="player-info">
            <div class="player-dot" style="color: ${team.color}; background-color: ${team.color}"></div>
            <span class="player-name" style="font-weight: bold; color: ${team.color};">${teamName} <small style="font-size: 11px; opacity: 0.7; color: var(--text-secondary);">(${team.playerCount} لاعب)</small></span>
          </div>
          <span class="player-score" style="color: ${team.color}; font-weight: bold;">${team.score} نقطة</span>
        `;
        teamFinishedStandings.appendChild(item);
      });
    }

    sounds.playSuccess(); // Play victory fanfare
    showScreen('finished');
  });

  socket.on('no-more-questions', () => {
    alert('تم عرض جميع الأسئلة المتاحة! يمكنك إنهاء المسابقة أو إضافة أسئلة جديدة.');
  });

  socket.on('error-msg', (msg) => {
    alert(`خطأ: ${msg}`);
  });
});
