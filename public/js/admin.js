document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  // State
  let currentRoom = null;
  let adminPassword = '';
  let questionsList = [];
  let playersList = [];
  let askedQuestionsSet = new Set();

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // DOM Elements
  const screens = {
    setup: document.getElementById('admin-screen-setup'),
    dashboard: document.getElementById('admin-screen-dashboard')
  };

  const adminPassInput = document.getElementById('admin-pass');
  const roomNameInput = document.getElementById('room-name-input');
  const roomCodeInput = document.getElementById('room-code-input');
  const gameTypeSelect = document.getElementById('game-type');
  const timerSecSelect = document.getElementById('timer-sec');
  const btnCreateRoom = document.getElementById('btn-create-room');

  const dashboardRoomCode = document.getElementById('dashboard-room-code');
  const dashboardRoomType = document.getElementById('dashboard-room-type');
  const dashboardRoomStatus = document.getElementById('dashboard-room-status');
  const btnStartGame = document.getElementById('btn-start-game');
  const btnEndGame = document.getElementById('btn-end-game');
  const linkTvPresenter = document.getElementById('link-tv-presenter');
  const linkTvPresenterControl = document.getElementById('link-tv-presenter-control');

  const activeQuestionNone = document.getElementById('active-question-none');
  const activeQuestionDetails = document.getElementById('active-question-details');
  const activeQText = document.getElementById('active-q-text');
  const activeQStatus = document.getElementById('active-q-status');
  const activeQAnswers = document.getElementById('active-q-answers');
  const btnRevealAnswer = document.getElementById('btn-reveal-answer');

  const questionsPool = document.getElementById('questions-pool');
  const adminPlayersList = document.getElementById('admin-players-list');
  const adminTeamTotalsPanel = document.getElementById('admin-team-totals');
  const adminTeamTotalsList = document.getElementById('admin-team-totals-list');
  const btnExportCsv = document.getElementById('btn-export-csv');

  // Team color palette (for team badges / reassignment picker)
  const TEAM_COLORS = [
    { hex: '#ff4757', name: 'الأحمر' },
    { hex: '#1e90ff', name: 'الأزرق' },
    { hex: '#2ed573', name: 'الأخضر' },
    { hex: '#ffa502', name: 'الأصفر' },
    { hex: '#a55eea', name: 'البنفسجي' }
  ];
  function teamNameFor(hex) {
    const t = TEAM_COLORS.find(c => c.hex.toLowerCase() === (hex || '').toLowerCase());
    return t ? t.name : (hex || '—');
  }

  // Dialog elements
  const dialogAddQuestion = document.getElementById('dialog-add-question');
  const btnOpenAddDialog = document.getElementById('btn-open-add-dialog');
  const btnCloseDialog = document.getElementById('btn-close-dialog');
  const formAddQuestion = document.getElementById('form-add-question');
  const btnImportCsv = document.getElementById('btn-import-csv');
  const csvFileInput = document.getElementById('csv-file-input');

  const adminError = document.getElementById('admin-error');
  const adminSuccess = document.getElementById('admin-success');

  // Helper: show error alert
  function showError(msg) {
    adminError.textContent = msg;
    adminError.style.display = 'block';
    setTimeout(() => { adminError.style.display = 'none'; }, 4000);
  }

  // Helper: show success message
  function showSuccess(msg) {
    adminSuccess.textContent = msg;
    adminSuccess.style.display = 'block';
    setTimeout(() => { adminSuccess.style.display = 'none'; }, 3000);
  }

  // Tab switching
  const tabButtons = document.querySelectorAll('.admin-tab-btn');
  const tabContents = document.querySelectorAll('.admin-tab-content');
  function activateTab(tabName) {
    tabButtons.forEach(btn => {
      const isActive = btn.dataset.tab === tabName;
      btn.classList.toggle('active', isActive);
      btn.style.background = isActive ? 'rgba(112, 161, 255, 0.15)' : 'transparent';
      btn.style.borderBottomColor = isActive ? 'var(--primary-accent)' : 'transparent';
      btn.style.color = isActive ? 'var(--text-primary)' : 'var(--text-secondary)';
    });
    tabContents.forEach(c => {
      c.style.display = (c.dataset.tab === tabName) ? 'block' : 'none';
    });
  }
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });

  const tabQuestionsCount = document.getElementById('tab-questions-count');
  const tabPlayersCount = document.getElementById('tab-players-count');

  // Trial question button
  const btnTrialQuestion = document.getElementById('btn-trial-question');
  const trialBadge = document.getElementById('trial-badge');
  const trialPanel = document.getElementById('trial-panel');
  if (btnTrialQuestion) {
    btnTrialQuestion.addEventListener('click', () => {
      socket.emit('start-trial-question');
      showSuccess('جارٍ عرض السؤال التجريبي على الشاشات...');
      activateTab('control');
    });
  }

  // Random question button (one-click, non-repeating)
  const btnRandomQuestion = document.getElementById('btn-random-question');
  const askedProgressBadge = document.getElementById('asked-progress-badge');
  if (btnRandomQuestion) {
    btnRandomQuestion.addEventListener('click', () => {
      socket.emit('admin-random-question');
      showSuccess('جارٍ اختيار سؤال عشوائي جديد...');
    });
  }

  // "Manual pick" link goes to the questions tab
  const linkGotoQuestionsTab = document.getElementById('link-goto-questions-tab');
  if (linkGotoQuestionsTab) {
    linkGotoQuestionsTab.addEventListener('click', (e) => {
      e.preventDefault();
      activateTab('questions');
    });
  }

  function refreshProgressBadge() {
    if (!askedProgressBadge) return;
    const asked = askedQuestionsSet ? askedQuestionsSet.size : 0;
    const total = questionsList ? questionsList.length : 0;
    askedProgressBadge.textContent = `${asked} / ${total}`;
  }

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

  // Handle CSV Import
  btnImportCsv.addEventListener('click', () => {
    csvFileInput.click();
  });

  csvFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(evt) {
      try {
        const text = evt.target.result;
        const questions = parseCSV(text);
        if (questions.length === 0) {
          showError('لم يتم العثور على أسئلة صالحة في الملف');
          return;
        }

        // Emit questions to server
        socket.emit('import-questions', { questions });
        showSuccess(`جاري استيراد ${questions.length} سؤال...`);
        csvFileInput.value = ''; // clear input
      } catch (err) {
        showError('حدث خطأ أثناء قراءة الملف، تأكد من مطابقة الصيغة');
        console.error(err);
      }
    };
    reader.readAsText(file, 'UTF-8');
  });

  // Basic CSV Parser that handles quotes and Arabic characters safely
  function parseCSV(text) {
    const lines = text.split(/\r?\n/);
    if (lines.length <= 1) return [];

    const result = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const entries = [];
      let currentVal = '';
      let inQuotes = false;

      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          entries.push(currentVal.trim().replace(/^["']|["']$/g, ''));
          currentVal = '';
        } else {
          currentVal += char;
        }
      }
      entries.push(currentVal.trim().replace(/^["']|["']$/g, ''));

      if (entries.length >= 6 && entries[0]) {
        result.push({
          question_text: entries[0],
          option1: entries[1],
          option2: entries[2],
          option3: entries[3],
          option4: entries[4],
          correct_option: parseInt(entries[5]) || 1,
          category: entries[6] || 'general',
          difficulty: entries[7] || 'medium'
        });
      }
    }
    return result;
  }

  // Handle Game Mode Card selection (Individual vs Group)
  const btnModeIndividual = document.getElementById('btn-mode-individual');
  const btnModeGroup = document.getElementById('btn-mode-group');
  const teamCountContainer = document.getElementById('team-count-container');

  if (btnModeIndividual && btnModeGroup) {
    btnModeIndividual.addEventListener('click', () => {
      gameTypeSelect.value = 'individual';
      btnModeIndividual.style.borderColor = 'var(--primary-accent)';
      btnModeIndividual.style.background = 'rgba(112, 161, 255, 0.15)';
      btnModeIndividual.style.boxShadow = '0 0 15px rgba(112, 161, 255, 0.2)';
      
      btnModeGroup.style.borderColor = 'var(--glass-border)';
      btnModeGroup.style.background = 'rgba(255,255,255,0.02)';
      btnModeGroup.style.boxShadow = 'none';
      if (teamCountContainer) teamCountContainer.style.display = 'none';
    });

    btnModeGroup.addEventListener('click', () => {
      gameTypeSelect.value = 'group';
      btnModeGroup.style.borderColor = 'var(--primary-accent)';
      btnModeGroup.style.background = 'rgba(112, 161, 255, 0.15)';
      btnModeGroup.style.boxShadow = '0 0 15px rgba(112, 161, 255, 0.2)';
      
      btnModeIndividual.style.borderColor = 'var(--glass-border)';
      btnModeIndividual.style.background = 'rgba(255,255,255,0.02)';
      btnModeIndividual.style.boxShadow = 'none';
      if (teamCountContainer) teamCountContainer.style.display = 'block';
    });
  }

  // Handle team count radio button styles dynamically
  const teamCountRadios = document.querySelectorAll('input[name="team-count"]');
  teamCountRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      teamCountRadios.forEach(r => {
        const parent = r.closest('label');
        if (r.checked) {
          parent.style.borderColor = 'var(--primary-accent)';
          parent.style.background = 'rgba(112, 161, 255, 0.15)';
        } else {
          parent.style.borderColor = 'var(--glass-border)';
          parent.style.background = 'transparent';
        }
      });
    });
  });

  // Handle Dialog Actions
  btnOpenAddDialog.addEventListener('click', () => {
    dialogAddQuestion.showModal();
  });

  btnCloseDialog.addEventListener('click', () => {
    dialogAddQuestion.close();
  });

  // 1. Create Room submission
  btnCreateRoom.addEventListener('click', () => {
    const password = adminPassInput.value.trim();
    const type = gameTypeSelect.value;
    const timer = parseInt(timerSecSelect.value);
    const selectedTeamCountRadio = document.querySelector('input[name="team-count"]:checked');
    const teamCount = selectedTeamCountRadio ? parseInt(selectedTeamCountRadio.value) : 4;
    const roomName = roomNameInput ? roomNameInput.value.trim() : '';
    const roomCode = roomCodeInput ? roomCodeInput.value.trim() : '';

    if (!password) {
      showError('يرجى إدخال كلمة المرور للمتابعة');
      return;
    }

    if (roomCode && !/^\d+$/.test(roomCode)) {
      showError('رمز الغرفة المخصص يجب أن يحتوي على أرقام فقط');
      return;
    }

    adminPassword = password;
    socket.emit('create-room', {
      type,
      timerDuration: timer,
      password,
      teamCount,
      roomName,
      roomCode
    });
  });

  // Socket: Room Created
  socket.on('room-created', (room) => {
    currentRoom = room;
    
    // Auto-join room as admin
    socket.emit('join-room', {
      roomCode: room.id,
      role: 'admin',
      password: adminPassword
    });
  });

  // Socket: Admin Joined Room
  socket.on('admin-joined', ({ room }) => {
    currentRoom = room;
    dashboardRoomCode.textContent = room.id;
    dashboardRoomType.textContent = room.type === 'individual' ? 'لعب فردي' : 'لعب جماعي';
    dashboardRoomStatus.textContent = 'بانتظار البدء';
    linkTvPresenter.href = `presenter.html?room=${room.id}`;
    linkTvPresenterControl.href = `presenter.html?room=${room.id}&control=true`;
    
    showScreen('dashboard');
  });

  // Socket: Questions pool received (shuffle so admin sees random order 1st, 10th, 15th, 3rd...)
  socket.on('questions-list', (list) => {
    questionsList = shuffle(list);
    if (tabQuestionsCount) tabQuestionsCount.textContent = list.length;
    renderQuestionsPool();
    refreshProgressBadge();
  });

  // Socket: Asked questions update (mark used questions in the pool)
  socket.on('asked-questions-update', (askedIds) => {
    askedQuestionsSet = new Set((askedIds || []).map(id => parseInt(id)));
    renderQuestionsPool();
    refreshProgressBadge();
  });

  // Socket: Players list update
  socket.on('player-list-update', (players) => {
    playersList = players;
    if (tabPlayersCount) tabPlayersCount.textContent = players.length;
    renderPlayersList();
    if (players.length > 0) {
      btnExportCsv.style.display = 'inline-flex';
    } else {
      btnExportCsv.style.display = 'none';
    }
  });

  // Socket: Trial question started
  socket.on('trial-started', ({ question }) => {
    if (trialBadge) trialBadge.style.display = 'block';
    if (trialPanel) {
      trialPanel.style.background = 'rgba(255, 165, 2, 0.15)';
      trialPanel.style.boxShadow = '0 0 20px rgba(255, 165, 2, 0.25)';
    }
    // Sync active question panel
    if (activeQuestionNone) activeQuestionNone.style.display = 'none';
    if (activeQuestionDetails) activeQuestionDetails.style.display = 'block';
    if (activeQText) activeQText.textContent = question.question_text;
    if (activeQStatus) {
      activeQStatus.textContent = 'معروض ويستقبل الإجابات (تجريبي)';
      activeQStatus.style.color = 'var(--color-yellow)';
    }
    if (activeQAnswers) activeQAnswers.textContent = '0';
    if (btnRevealAnswer) {
      btnRevealAnswer.disabled = false;
      btnRevealAnswer.style.opacity = '1';
    }
  });

  // Socket: Trial question ended (real game can proceed)
  socket.on('trial-ended', () => {
    if (trialBadge) trialBadge.style.display = 'none';
    if (trialPanel) {
      trialPanel.style.background = 'rgba(255, 165, 2, 0.05)';
      trialPanel.style.boxShadow = 'none';
    }
  });

  // Render Questions list in panel
  function renderQuestionsPool() {
    questionsPool.innerHTML = '';
    if (questionsList.length === 0) {
      questionsPool.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 20px;">لا توجد أسئلة مضافة حالياً.</div>';
      return;
    }

    // Show asked questions greyed out at the bottom, unasked at the top
    const unasked = questionsList.filter(q => !askedQuestionsSet.has(parseInt(q.id)));
    const asked = questionsList.filter(q => askedQuestionsSet.has(parseInt(q.id)));
    [...unasked, ...asked].forEach(q => {
      const isAsked = askedQuestionsSet.has(parseInt(q.id));
      const card = document.createElement('div');
      card.style.cssText = `
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid var(--glass-border);
        border-radius: var(--radius-sm);
        padding: 15px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 15px;
        ${isAsked ? 'opacity: 0.45; filter: grayscale(0.6);' : ''}
      `;

      const categoryText = q.category === 'islamic' ? 'إسلامي' :
                           q.category === 'riddles' ? 'لغز' :
                           q.category === 'science' ? 'علوم' : 'عام';

      const askedBadge = isAsked
        ? '<span style="background: var(--color-red); color: white; font-size: 10px; padding: 2px 8px; border-radius: 10px; margin-inline-start: 6px;">✓ تم عرضه</span>'
        : '';

      card.innerHTML = `
        <div style="flex-grow: 1;">
          <div style="font-weight: bold; margin-bottom: 5px;">${q.question_text}${askedBadge}</div>
          <div style="font-size: 12px; color: var(--text-secondary);">
            التصنيف: <strong>${categoryText}</strong> |
            الإجابة الصحيحة: <span style="color: var(--color-green); font-weight: bold;">${q['option' + q.correct_option]}</span>
          </div>
        </div>
        <button class="btn btn-send-q" data-id="${q.id}" ${isAsked ? 'disabled' : ''} style="font-size: 13px; padding: 8px 16px; flex-shrink: 0; ${isAsked ? 'cursor: not-allowed; background: #555;' : ''}">
          ${isAsked ? 'تم عرضه' : 'طرح السؤال 🚀'}
        </button>
      `;

      questionsPool.appendChild(card);
    });

    // Add listeners to throw questions (only unasked)
    questionsPool.querySelectorAll('.btn-send-q:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => {
        const qId = btn.dataset.id;
        
        // Hide start button if playing
        btnStartGame.style.display = 'none';
        btnEndGame.style.display = 'inline-flex';

        // Emit Question
        socket.emit('show-question', { questionId: qId });
        
        // Show details in active question panel
        const question = questionsList.find(q => q.id == qId);
        activeQuestionNone.style.display = 'none';
        activeQuestionDetails.style.display = 'block';
        activeQText.textContent = question.question_text;
        activeQStatus.textContent = 'معروض ويستقبل الإجابات';
        activeQStatus.style.color = 'var(--color-yellow)';
        activeQAnswers.textContent = '0';
        btnRevealAnswer.disabled = false;
        btnRevealAnswer.style.opacity = '1';
      });
    });
  }

  // Render team totals (aggregates by team_id — hidden if only one team present or in native group mode)
  function renderTeamTotals() {
    if (!adminTeamTotalsPanel || !adminTeamTotalsList) return;

    // Skip team totals panel in native group mode (that mode already shows teams as first-class players)
    if (currentRoom && currentRoom.type === 'group') {
      adminTeamTotalsPanel.style.display = 'none';
      return;
    }

    // Aggregate scores by team_id (falls back to color)
    const teamMap = new Map();
    playersList.forEach(p => {
      const tid = (p.team_id || p.color || 'unknown').toLowerCase();
      const entry = teamMap.get(tid) || { teamId: tid, color: p.team_id || p.color, total: 0, members: [] };
      entry.total += (p.score || 0);
      entry.members.push(p);
      teamMap.set(tid, entry);
    });

    const teams = [...teamMap.values()].sort((a, b) => b.total - a.total);

    // Only show if there are 2+ distinct teams
    if (teams.length < 2) {
      adminTeamTotalsPanel.style.display = 'none';
      return;
    }
    adminTeamTotalsPanel.style.display = 'block';

    adminTeamTotalsList.innerHTML = '';
    teams.forEach((t, idx) => {
      const rankBadge = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
      const row = document.createElement('div');
      row.style.cssText = `
        display: flex; justify-content: space-between; align-items: center;
        padding: 10px 14px; border-radius: var(--radius-sm);
        background: ${t.color}18; border: 1px solid ${t.color}55;
        box-shadow: 0 0 12px ${t.color}20;
      `;
      const memberNames = t.members.map(m => m.name).join('، ');
      row.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 18px; font-weight: 800;">${rankBadge}</span>
          <span style="width: 14px; height: 14px; border-radius: 50%; background: ${t.color}; box-shadow: 0 0 8px ${t.color};"></span>
          <div>
            <div style="font-weight: 800; color: ${t.color};">فريق ${teamNameFor(t.color)}</div>
            <div style="font-size: 11px; color: var(--text-secondary);">${memberNames}</div>
          </div>
        </div>
        <div style="font-size: 22px; font-weight: 900; color: var(--color-yellow);">${t.total} <span style="font-size: 12px; color: var(--text-secondary);">نقطة</span></div>
      `;
      adminTeamTotalsList.appendChild(row);
    });
  }

  // Render connected players or teams
  function renderPlayersList() {
    adminPlayersList.innerHTML = '';
    if (playersList.length === 0) {
      adminPlayersList.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 20px;">لا يوجد لاعبون منضمون حالياً...</div>';
      renderTeamTotals();
      return;
    }

    // Sort by score DESC on the client too (server already does this, defense-in-depth)
    const sorted = [...playersList].sort((a, b) => (b.score || 0) - (a.score || 0));
    sorted.forEach((player, idx) => {
      const item = document.createElement('div');
      item.className = 'leaderboard-item';
      item.style.flexDirection = 'column';
      item.style.alignItems = 'stretch';
      item.style.gap = '12px';
      item.style.borderRight = `4px solid ${player.color}`;

      const dotColor = player.is_active === 1 ? player.color : '#6b7280';
      const textDecor = player.is_active === 1 ? '' : 'text-decoration: line-through; opacity: 0.6;';
      const rankBadge = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;

      const safeId = `pid-${btoa(unescape(encodeURIComponent(player.id))).replace(/=/g, '')}`;
      const currentTeam = (player.team_id || player.color || '').toLowerCase();

      // Team-picker swatches (only for individual mode; native group-mode teams don't need this)
      const showTeamPicker = currentRoom && currentRoom.type !== 'group';
      const teamPickerHtml = showTeamPicker ? `
        <div style="display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: rgba(0,0,0,0.2); border-radius: var(--radius-sm); border: 1px dashed rgba(255,255,255,0.08);">
          <span style="font-size: 11px; color: var(--text-secondary); white-space: nowrap;">الفريق:</span>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            ${TEAM_COLORS.map(c => `
              <button class="team-swatch" data-id="${player.id}" data-team="${c.hex}"
                title="فريق ${c.name}"
                style="width: 24px; height: 24px; border-radius: 50%; background: ${c.hex}; cursor: pointer;
                       border: 3px solid ${currentTeam === c.hex.toLowerCase() ? '#fff' : 'transparent'};
                       box-shadow: 0 0 8px ${c.hex}${currentTeam === c.hex.toLowerCase() ? '' : '00'};
                       transition: all 0.2s ease;"></button>
            `).join('')}
          </div>
        </div>
      ` : '';

      item.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; ${textDecor}">
          <div class="player-info" style="gap: 10px;">
            <span style="font-weight: 800; font-size: 18px; min-width: 30px;">${rankBadge}</span>
            <div class="player-dot" style="color: ${dotColor}; background-color: ${dotColor}"></div>
            <span class="player-name">${player.name}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <span class="player-score" id="score-val-${safeId}" style="font-size: 22px;">${player.score} نقطة</span>
            <button class="btn-remove-player" data-id="${player.id}" data-name="${player.name}"
              title="حذف اللاعب"
              style="background: rgba(255, 71, 87, 0.15); border: 1px solid rgba(255, 71, 87, 0.4); color: var(--color-red); width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease;">
              🗑️
            </button>
          </div>
        </div>

        ${teamPickerHtml}

        <!-- Points Adjustment controls -->
        <div style="display: flex; gap: 8px; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.25); padding: 8px 10px; border-radius: var(--radius-sm); border: 1px dashed rgba(255,255,255,0.1);">
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-quick-plus" data-id="${player.id}" data-amt="10" style="padding: 6px 10px; font-size: 12px; background: rgba(46, 213, 115, 0.9); box-shadow: none;">+10</button>
            <button class="btn btn-quick-plus" data-id="${player.id}" data-amt="50" style="padding: 6px 10px; font-size: 12px; background: rgba(46, 213, 115, 0.9); box-shadow: none;">+50</button>
            <button class="btn btn-quick-plus" data-id="${player.id}" data-amt="100" style="padding: 6px 10px; font-size: 12px; background: rgba(46, 213, 115, 0.9); box-shadow: none;">+100</button>
          </div>
          <div style="display: flex; gap: 6px; align-items: center;">
            <input type="number" id="adjust-input-${safeId}" class="form-input" value="50" min="1" style="width: 65px; padding: 4px 8px; font-size: 13px; text-align: center;">
            <button class="btn btn-adjust-plus" data-id="${player.id}" data-safe="${safeId}" style="padding: 6px 10px; font-size: 12px; background: var(--color-green); box-shadow: none;">➕ إضافة</button>
            <button class="btn btn-adjust-minus" data-id="${player.id}" data-safe="${safeId}" style="padding: 6px 10px; font-size: 12px; background: var(--color-red); box-shadow: none;">➖ خصم</button>
          </div>
        </div>
      `;

      adminPlayersList.appendChild(item);
    });

    // Team reassignment
    adminPlayersList.querySelectorAll('.team-swatch').forEach(btn => {
      btn.addEventListener('click', () => {
        const pId = btn.dataset.id;
        const teamId = btn.dataset.team;
        socket.emit('assign-player-team', { playerId: pId, teamId });
        showSuccess(`تم نقل اللاعب إلى فريق ${teamNameFor(teamId)}`);
      });
    });

    // Remove player (with confirmation)
    adminPlayersList.querySelectorAll('.btn-remove-player').forEach(btn => {
      btn.addEventListener('click', () => {
        const pId = btn.dataset.id;
        const pName = btn.dataset.name || 'اللاعب';
        if (!confirm(`هل أنت متأكد من حذف "${pName}" نهائياً من الغرفة؟\nسيتم مسح كل نقاطه وإجاباته.`)) return;
        socket.emit('remove-player', { playerId: pId });
        showSuccess(`تم حذف اللاعب "${pName}"`);
      });
    });

    // Quick +N buttons
    adminPlayersList.querySelectorAll('.btn-quick-plus').forEach(btn => {
      btn.addEventListener('click', () => {
        const pId = btn.dataset.id;
        const amt = parseInt(btn.dataset.amt) || 0;
        socket.emit('adjust-score', { playerId: pId, adjustment: amt });
        showSuccess(`تمت إضافة ${amt} نقطة`);
      });
    });

    // Custom-amount + / - buttons
    adminPlayersList.querySelectorAll('.btn-adjust-plus').forEach(btn => {
      btn.addEventListener('click', () => {
        const pId = btn.dataset.id;
        const safe = btn.dataset.safe;
        const val = parseInt(document.getElementById(`adjust-input-${safe}`).value) || 0;
        if (val <= 0) { showError('أدخل رقماً موجباً'); return; }
        socket.emit('adjust-score', { playerId: pId, adjustment: val });
        showSuccess(`تمت إضافة ${val} نقطة`);
      });
    });

    adminPlayersList.querySelectorAll('.btn-adjust-minus').forEach(btn => {
      btn.addEventListener('click', () => {
        const pId = btn.dataset.id;
        const safe = btn.dataset.safe;
        const val = parseInt(document.getElementById(`adjust-input-${safe}`).value) || 0;
        if (val <= 0) { showError('أدخل رقماً موجباً'); return; }
        socket.emit('adjust-score', { playerId: pId, adjustment: -val });
        showSuccess(`تم خصم ${val} نقطة`);
      });
    });

    renderTeamTotals();
  }

  // Socket: Player Answered event to increment count in active panel
  socket.on('player-answered-count', (count) => {
    activeQAnswers.textContent = count;
  });

  // Socket: timer-expired (countdown finishes)
  socket.on('timer-expired', () => {
    activeQStatus.textContent = 'انتهى وقت الإجابة!';
    activeQStatus.style.color = 'var(--color-red)';
  });

  // Reveal Answer button click
  btnRevealAnswer.addEventListener('click', () => {
    socket.emit('reveal-answer');
    activeQStatus.textContent = 'تم كشف الإجابة والنتائج';
    activeQStatus.style.color = 'var(--color-green)';
    btnRevealAnswer.disabled = true;
    btnRevealAnswer.style.opacity = '0.5';
  });

  // Start Game click
  btnStartGame.addEventListener('click', () => {
    socket.emit('start-game');
    dashboardRoomStatus.textContent = 'نشط (اللعبة تعمل)';
    dashboardRoomStatus.style.color = 'var(--color-green)';
    btnStartGame.style.display = 'none';
    btnEndGame.style.display = 'inline-flex';
    showSuccess('بدأت المسابقة! الآن اطرح الأسئلة للاعبين.');
  });

  // End Game click
  btnEndGame.addEventListener('click', () => {
    if (confirm('هل أنت متأكد من إنهاء المسابقة وعرض منصة التتويج؟')) {
      socket.emit('end-game');
      dashboardRoomStatus.textContent = 'منتهية';
      dashboardRoomStatus.style.color = 'var(--color-red)';
      btnEndGame.style.display = 'none';
      showSuccess('انتهت المسابقة وتم تتويج الفائزين!');
    }
  });

  // Add Question submission handler
  formAddQuestion.addEventListener('submit', (e) => {
    e.preventDefault();

    const qTextVal = document.getElementById('new-q-text').value.trim();
    const opt1 = document.getElementById('new-opt-1').value.trim();
    const opt2 = document.getElementById('new-opt-2').value.trim();
    const opt3 = document.getElementById('new-opt-3').value.trim();
    const opt4 = document.getElementById('new-opt-4').value.trim();
    const correct = document.getElementById('new-correct-opt').value;
    const cat = document.getElementById('new-category').value;

    socket.emit('add-new-question', {
      question_text: qTextVal,
      option1: opt1,
      option2: opt2,
      option3: opt3,
      option4: opt4,
      correct_option: correct,
      category: cat,
      difficulty: 'medium'
    });

    // Reset Form & Close
    formAddQuestion.reset();
    dialogAddQuestion.close();
  });

  socket.on('question-added-ack', (msg) => {
    showSuccess(msg);
  });

  // Export Results to CSV
  btnExportCsv.addEventListener('click', () => {
    if (playersList.length === 0) return;

    let csvContent = '\uFEFF'; // Add UTF-8 BOM for Arabic support
    csvContent += 'الترتيب,الاسم,اللون,النقاط\n';

    playersList.forEach((player, idx) => {
      csvContent += `${idx + 1},"${player.name.replace(/"/g, '""')}",${player.color},${player.score}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `mosabqah_results_room_${currentRoom ? currentRoom.id : 'unknown'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  // Error handling
  socket.on('error-msg', (msg) => {
    showError(msg);
  });
});
