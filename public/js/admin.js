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
  const btnToggleScoreboard = document.getElementById('btn-toggle-scoreboard');
  let scoreboardVisible = false;
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

  const btnDeleteAllQuestions = document.getElementById('btn-delete-all-questions');
  if (btnDeleteAllQuestions) {
    btnDeleteAllQuestions.addEventListener('click', () => {
      if (confirm('⚠️ تحذير هام جداً:\nهل أنت متأكد من رغبتك في حذف جميع الأسئلة الموجودة بقاعدة البيانات نهائياً؟ لا يمكن التراجع عن هذا الإجراء.')) {
        if (confirm('تأكيد أخير: هل تريد حقاً مسح كل بنك الأسئلة؟')) {
          socket.emit('delete-all-questions');
        }
      }
    });
  }

  // Handle Dialog Actions
  btnOpenAddDialog.addEventListener('click', () => {
    dialogAddQuestion.showModal();
  });

  btnCloseDialog.addEventListener('click', () => {
    dialogAddQuestion.close();
  });

  // Auth step logic and circular timer handlers
  const btnAuthAdmin = document.getElementById('btn-auth-admin');
  const btnBackToAuth = document.getElementById('btn-back-to-auth');
  const btnGenerateCode = document.getElementById('btn-generate-code');
  const timerOptionLabels = document.querySelectorAll('.timer-option-label');
  const timerSecHidden = document.getElementById('timer-sec');

  if (btnAuthAdmin) {
    btnAuthAdmin.addEventListener('click', () => {
      const password = adminPassInput.value.trim();
      if (!password) {
        showError('يرجى إدخال كلمة المرور للمتابعة');
        return;
      }
      socket.emit('check-password', { password });
    });
  }

  if (adminPassInput) {
    adminPassInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (btnAuthAdmin) btnAuthAdmin.click();
      }
    });
  }

  if (btnBackToAuth) {
    btnBackToAuth.addEventListener('click', () => {
      const setupStep1 = document.getElementById('setup-step-1');
      const setupStep2 = document.getElementById('setup-step-2');
      if (setupStep2) setupStep2.style.display = 'none';
      if (setupStep1) setupStep1.style.display = 'block';
      adminPassword = '';
      adminPassInput.value = '';
      setTimeout(() => adminPassInput.focus(), 100);
    });
  }

  if (btnGenerateCode && roomCodeInput) {
    btnGenerateCode.addEventListener('click', () => {
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      roomCodeInput.value = code;
    });
  }

  if (timerOptionLabels && timerSecHidden) {
    timerOptionLabels.forEach(label => {
      label.addEventListener('click', () => {
        timerOptionLabels.forEach(l => {
          l.classList.remove('active');
          l.style.borderColor = 'var(--glass-border)';
          l.style.background = 'rgba(255,255,255,0.02)';
          l.style.boxShadow = 'none';
        });
        label.classList.add('active');
        label.style.borderColor = 'var(--primary-accent)';
        label.style.background = 'rgba(112, 161, 255, 0.15)';
        label.style.boxShadow = '0 0 10px rgba(112, 161, 255, 0.2)';
        
        const radio = label.querySelector('input[type="radio"]');
        if (radio) {
          radio.checked = true;
          timerSecHidden.value = radio.value;
        }
      });
    });
  }

  // Admin QR Code Modal Bindings
  const adminQrcodeContainer = document.getElementById('admin-qrcode-container');
  const adminQrModal = document.getElementById('admin-qr-modal');
  const btnCloseAdminQr = document.getElementById('btn-close-admin-qr');
  const adminQrModalImageWrap = document.getElementById('admin-qr-modal-image-wrap');

  if (adminQrcodeContainer && adminQrModal) {
    adminQrcodeContainer.addEventListener('click', () => {
      adminQrModal.showModal();
    });
  }
  if (btnCloseAdminQr && adminQrModal) {
    btnCloseAdminQr.addEventListener('click', () => {
      adminQrModal.close();
    });
  }
  if (adminQrModalImageWrap) {
    adminQrModalImageWrap.addEventListener('click', () => {
      if (currentRoom) {
        const playerJoinUrl = `${window.location.origin}/player.html?room=${currentRoom.id}`;
        window.open(playerJoinUrl, '_blank');
      }
    });
  }

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
    
    if (room.status === 'active') {
      dashboardRoomStatus.textContent = 'المسابقة جارية 🎮';
      btnStartGame.style.display = 'none';
      btnEndGame.style.display = 'inline-flex';
      if (btnToggleScoreboard) btnToggleScoreboard.style.display = 'inline-flex';
    } else if (room.status === 'finished') {
      dashboardRoomStatus.textContent = 'انتهت المسابقة 🏆';
      btnStartGame.style.display = 'none';
      btnEndGame.style.display = 'none';
      if (btnToggleScoreboard) btnToggleScoreboard.style.display = 'none';
    } else {
      dashboardRoomStatus.textContent = 'بانتظار البدء';
      btnStartGame.style.display = 'inline-flex';
      btnEndGame.style.display = 'none';
      if (btnToggleScoreboard) btnToggleScoreboard.style.display = 'none';
    }

    scoreboardVisible = !!room.show_scoreboard;
    if (btnToggleScoreboard) {
      if (scoreboardVisible) {
        btnToggleScoreboard.textContent = '🙈 إخفاء الترتيب عن المتسابقين';
        btnToggleScoreboard.style.borderColor = 'var(--color-red)';
        btnToggleScoreboard.style.color = 'var(--color-red)';
      } else {
        btnToggleScoreboard.textContent = '📊 إظهار الترتيب للمتسابقين';
        btnToggleScoreboard.style.borderColor = 'var(--color-yellow)';
        btnToggleScoreboard.style.color = 'var(--color-yellow)';
      }
    }

    linkTvPresenter.href = `presenter.html?room=${room.id}`;
    linkTvPresenterControl.href = `presenter.html?room=${room.id}&control=true`;

    const linkMobileRemote = document.getElementById('link-mobile-remote');
    if (linkMobileRemote) {
      linkMobileRemote.href = `remote.html?room=${room.id}`;
    }

    // QR Code Generation for Admin Dashboard
    const adminQrcodeContainer = document.getElementById('admin-qrcode-container');
    const adminQrcode = document.getElementById('admin-qrcode');
    const adminQrcodeLarge = document.getElementById('admin-qrcode-large');
    const adminQrModalRoomCode = document.getElementById('admin-qr-modal-room-code');

    if (adminQrcodeContainer && adminQrcode) {
      const playerJoinUrl = `${window.location.origin}/player.html?room=${room.id}`;
      adminQrcode.src = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(playerJoinUrl)}`;
      if (adminQrcodeLarge) adminQrcodeLarge.src = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(playerJoinUrl)}`;
      if (adminQrModalRoomCode) adminQrModalRoomCode.textContent = room.id;
      adminQrcodeContainer.style.display = 'block';
    }
    
    showScreen('dashboard');
  });

  // Socket: Password checked
  socket.on('password-checked', ({ success }) => {
    if (success) {
      adminPassword = adminPassInput.value.trim();
      const setupStep1 = document.getElementById('setup-step-1');
      const setupStep2 = document.getElementById('setup-step-2');
      if (setupStep1) setupStep1.style.display = 'none';
      if (setupStep2) setupStep2.style.display = 'block';
    } else {
      showError('رمز المرور للوحة التحكم غير صحيح');
    }
  });

  // Socket: Sync current active question (on reload/join)
  socket.on('sync-question', ({ question, questionStatus, answeredCount: ansCount }) => {
    if (activeQuestionNone) activeQuestionNone.style.display = 'none';
    if (activeQuestionDetails) activeQuestionDetails.style.display = 'block';
    if (activeQText) activeQText.textContent = question.question_text;
    if (activeQAnswers) activeQAnswers.textContent = ansCount;

    if (activeQStatus) {
      if (questionStatus === 'showing') {
        activeQStatus.textContent = 'معروض ويستقبل الإجابات ⏳';
        activeQStatus.style.color = 'var(--primary-accent)';
        if (btnRevealAnswer) {
          btnRevealAnswer.disabled = false;
          btnRevealAnswer.style.opacity = '1';
        }
      } else if (questionStatus === 'revealed' || questionStatus === 'time_up') {
        activeQStatus.textContent = questionStatus === 'revealed' ? `تم كشف الإجابة: (${question['option' + question.correct_option]}) ✅` : 'انتهى الوقت المحدد للإجابة! ⌛';
        activeQStatus.style.color = questionStatus === 'revealed' ? 'var(--color-green)' : 'var(--color-red)';
        if (btnRevealAnswer) {
          btnRevealAnswer.disabled = true;
          btnRevealAnswer.style.opacity = '0.5';
        }
      }
    }
  });

  // Socket: Real question shown
  socket.on('question-shown', ({ question, isTrial }) => {
    if (activeQuestionNone) activeQuestionNone.style.display = 'none';
    if (activeQuestionDetails) activeQuestionDetails.style.display = 'block';
    if (activeQText) activeQText.textContent = question.question_text;
    if (activeQStatus) {
      activeQStatus.textContent = isTrial ? 'معروض ويستقبل الإجابات (تجريبي) 🎯' : 'معروض ويستقبل الإجابات ⏳';
      activeQStatus.style.color = isTrial ? 'var(--color-yellow)' : 'var(--primary-accent)';
    }
    if (activeQAnswers) activeQAnswers.textContent = '0';
    if (btnRevealAnswer) {
      btnRevealAnswer.disabled = false;
      btnRevealAnswer.style.opacity = '1';
    }
    if (trialBadge) trialBadge.style.display = isTrial ? 'block' : 'none';

    // If admin is currently on another tab, jump to Control so the reveal button is reachable
    activateTab('control');
  });

  // Socket: Answered count update
  socket.on('player-answered-count', (count) => {
    if (activeQAnswers) activeQAnswers.textContent = count;
  });

  // Socket: Question revealed
  socket.on('presenter-reveal', ({ correctOption, correctText }) => {
    if (activeQStatus) {
      activeQStatus.textContent = `تم كشف الإجابة: (${correctText}) ✅`;
      activeQStatus.style.color = 'var(--color-green)';
    }
    if (btnRevealAnswer) {
      btnRevealAnswer.disabled = true;
      btnRevealAnswer.style.opacity = '0.5';
    }
  });

  // Socket: Timer expired
  socket.on('timer-expired', () => {
    if (activeQStatus) {
      activeQStatus.textContent = 'انتهى الوقت المحدد للإجابة! ⌛';
      activeQStatus.style.color = 'var(--color-red)';
    }
    if (btnRevealAnswer) {
      btnRevealAnswer.disabled = true;
      btnRevealAnswer.style.opacity = '0.5';
    }
  });

  // Socket: Questions pool received (shuffle so admin sees random order 1st, 10th, 15th, 3rd...)
  socket.on('questions-list', (list) => {
    questionsList = shuffle(list);
    if (tabQuestionsCount) tabQuestionsCount.textContent = list.length;
    renderCategoryFilters();
    renderDifficultyFilters();
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

  // Categories and Difficulty filtering state
  let activeCategories = new Set();
  let activeDifficulties = new Set();

  function renderCategoryFilters() {
    const container = document.getElementById('category-filters-container');
    if (!container) return;

    // Get unique categories from questionsList
    const categories = Array.from(new Set(questionsList.map(q => q.category || 'عام')))
      .filter(cat => cat && cat.trim() !== '');

    container.innerHTML = '';

    // Create 'All' button
    const btnAll = document.createElement('button');
    btnAll.textContent = 'الكل 🌐';
    btnAll.className = `filter-btn ${activeCategories.size === 0 ? 'active' : ''}`;
    btnAll.style.cssText = activeCategories.size === 0
      ? 'padding: 6px 12px; font-size: 12px; border-radius: var(--radius-sm); border: 1px solid var(--primary-accent); background: rgba(112, 161, 255, 0.15); color: white; cursor: pointer; transition: all 0.2s;'
      : 'padding: 6px 12px; font-size: 12px; border-radius: var(--radius-sm); border: 1px solid var(--glass-border); background: rgba(255,255,255,0.02); color: var(--text-secondary); cursor: pointer; transition: all 0.2s;';

    btnAll.addEventListener('click', () => {
      activeCategories.clear();
      renderCategoryFilters();
      renderQuestionsPool();
    });
    container.appendChild(btnAll);

    // Create category buttons
    categories.forEach(cat => {
      const btn = document.createElement('button');
      btn.textContent = cat;
      const isActive = activeCategories.has(cat);
      btn.className = `filter-btn ${isActive ? 'active' : ''}`;
      btn.style.cssText = isActive
        ? 'padding: 6px 12px; font-size: 12px; border-radius: var(--radius-sm); border: 1px solid var(--primary-accent); background: rgba(112, 161, 255, 0.15); color: white; cursor: pointer; transition: all 0.2s;'
        : 'padding: 6px 12px; font-size: 12px; border-radius: var(--radius-sm); border: 1px solid var(--glass-border); background: rgba(255,255,255,0.02); color: var(--text-secondary); cursor: pointer; transition: all 0.2s;';

      btn.addEventListener('click', () => {
        if (activeCategories.has(cat)) {
          activeCategories.delete(cat);
        } else {
          activeCategories.add(cat);
        }
        renderCategoryFilters();
        renderQuestionsPool();
      });
      container.appendChild(btn);
    });
  }

  function renderDifficultyFilters() {
    const container = document.getElementById('difficulty-filters-container');
    if (!container) return;

    // Get unique difficulties from questionsList
    const difficulties = Array.from(new Set(questionsList.map(q => q.difficulty || 'medium')))
      .filter(diff => diff && diff.trim() !== '');

    container.innerHTML = '';

    // Create 'All' button
    const btnAll = document.createElement('button');
    btnAll.textContent = 'الكل 🌐';
    btnAll.className = `filter-btn ${activeDifficulties.size === 0 ? 'active' : ''}`;
    btnAll.style.cssText = activeDifficulties.size === 0
      ? 'padding: 6px 12px; font-size: 12px; border-radius: var(--radius-sm); border: 1px solid var(--primary-accent); background: rgba(112, 161, 255, 0.15); color: white; cursor: pointer; transition: all 0.2s;'
      : 'padding: 6px 12px; font-size: 12px; border-radius: var(--radius-sm); border: 1px solid var(--glass-border); background: rgba(255,255,255,0.02); color: var(--text-secondary); cursor: pointer; transition: all 0.2s;';

    btnAll.addEventListener('click', () => {
      activeDifficulties.clear();
      renderDifficultyFilters();
      renderQuestionsPool();
    });
    container.appendChild(btnAll);

    // Map difficulty values to user friendly Arabic text
    const labelsMap = {
      'easy': 'سهل 🟢',
      'medium': 'متوسط 🟡',
      'hard': 'صعب 🔴'
    };

    difficulties.forEach(diff => {
      const btn = document.createElement('button');
      btn.textContent = labelsMap[diff.toLowerCase()] || diff;
      const isActive = activeDifficulties.has(diff);
      btn.className = `filter-btn ${isActive ? 'active' : ''}`;
      btn.style.cssText = isActive
        ? 'padding: 6px 12px; font-size: 12px; border-radius: var(--radius-sm); border: 1px solid var(--primary-accent); background: rgba(112, 161, 255, 0.15); color: white; cursor: pointer; transition: all 0.2s;'
        : 'padding: 6px 12px; font-size: 12px; border-radius: var(--radius-sm); border: 1px solid var(--glass-border); background: rgba(255,255,255,0.02); color: var(--text-secondary); cursor: pointer; transition: all 0.2s;';

      btn.addEventListener('click', () => {
        if (activeDifficulties.has(diff)) {
          activeDifficulties.delete(diff);
        } else {
          activeDifficulties.add(diff);
        }
        renderDifficultyFilters();
        renderQuestionsPool();
      });
      container.appendChild(btn);
    });
  }

  // Render Questions list in panel
  function renderQuestionsPool() {
    questionsPool.innerHTML = '';
    
    // Filter questions list by activeCategories & activeDifficulties
    let filteredList = questionsList;
    if (activeCategories.size > 0) {
      filteredList = questionsList.filter(q => activeCategories.has(q.category || 'عام'));
    }
    if (activeDifficulties.size > 0) {
      filteredList = filteredList.filter(q => activeDifficulties.has(q.difficulty || 'medium'));
    }

    if (filteredList.length === 0) {
      questionsPool.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 20px;">لا توجد أسئلة تطابق التصنيف المختار.</div>';
      return;
    }

    // Show asked questions greyed out at the bottom, unasked at the top
    const unasked = filteredList.filter(q => !askedQuestionsSet.has(parseInt(q.id)));
    const asked = filteredList.filter(q => askedQuestionsSet.has(parseInt(q.id)));
    [...unasked, ...asked].forEach(q => {
      const isAsked = askedQuestionsSet.has(parseInt(q.id));
      const card = document.createElement('div');
      
      // Determine difficulty border color
      const diff = (q.difficulty || 'medium').toLowerCase();
      let borderStyle = 'border-right: 4px solid var(--color-yellow);'; // default medium
      if (diff === 'easy') borderStyle = 'border-right: 4px solid var(--color-green);';
      else if (diff === 'hard') borderStyle = 'border-right: 4px solid var(--color-red);';

      card.style.cssText = `
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid var(--glass-border);
        border-radius: var(--radius-sm);
        padding: 15px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 15px;
        ${borderStyle}
        ${isAsked ? 'opacity: 0.45; filter: grayscale(0.6);' : ''}
      `;

      // Determine Category badge
      const cat = (q.category || 'general').toLowerCase();
      let catBadgeHtml = '<span style="background: rgba(255, 255, 255, 0.08); color: var(--text-secondary); padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; border: 1px solid rgba(255, 255, 255, 0.15);">🌐 عام</span>';
      if (cat === 'islamic') {
        catBadgeHtml = '<span style="background: rgba(46, 213, 115, 0.15); color: #2ed573; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; border: 1px solid rgba(46, 213, 115, 0.3);">🕌 إسلامي</span>';
      } else if (cat === 'riddles') {
        catBadgeHtml = '<span style="background: rgba(255, 165, 2, 0.15); color: #ffa502; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; border: 1px solid rgba(255, 165, 2, 0.3);">🧩 لغز</span>';
      } else if (cat === 'science') {
        catBadgeHtml = '<span style="background: rgba(112, 161, 255, 0.15); color: #70a1ff; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; border: 1px solid rgba(112, 161, 255, 0.3);">🔬 علوم</span>';
      }

      // Determine Difficulty badge
      let diffBadgeHtml = '<span style="background: rgba(255, 165, 2, 0.15); color: #ffa502; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; border: 1px solid rgba(255, 165, 2, 0.3);">متوسط 🟡</span>';
      if (diff === 'easy') {
        diffBadgeHtml = '<span style="background: rgba(46, 213, 115, 0.15); color: #2ed573; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; border: 1px solid rgba(46, 213, 115, 0.3);">سهل 🟢</span>';
      } else if (diff === 'hard') {
        diffBadgeHtml = '<span style="background: rgba(255, 71, 87, 0.15); color: #ff4757; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; border: 1px solid rgba(255, 71, 87, 0.3);">صعب 🔴</span>';
      }

      const askedBadge = isAsked
        ? '<span style="background: var(--color-red); color: white; font-size: 10px; padding: 2px 8px; border-radius: 10px; margin-inline-start: 6px;">✓ تم عرضه</span>'
        : '';

      card.innerHTML = `
        <div style="flex-grow: 1;">
          <div style="font-weight: bold; margin-bottom: 8px;">${q.question_text}${askedBadge}</div>
          <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
            ${catBadgeHtml}
            ${diffBadgeHtml}
            <span style="font-size: 12px; color: var(--text-secondary); margin-inline-start: auto;">
              الإجابة: <span style="color: var(--color-green); font-weight: bold;">${q['option' + q.correct_option]}</span>
            </span>
          </div>
        </div>
        <div style="display: flex; gap: 8px; align-items: center; flex-shrink: 0;">
          <button class="btn btn-send-q" data-id="${q.id}" ${isAsked ? 'disabled' : ''} style="font-size: 13px; padding: 8px 16px; ${isAsked ? 'cursor: not-allowed; background: #555;' : ''}">
            ${isAsked ? 'تم عرضه' : 'طرح السؤال 🚀'}
          </button>
          <button class="btn-delete-q" data-id="${q.id}" data-text="${q.question_text}" title="حذف السؤال نهائياً" style="background: rgba(255, 71, 87, 0.15); border: 1px solid rgba(255, 71, 87, 0.4); color: var(--color-red); width: 36px; height: 36px; border-radius: var(--radius-sm); cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease;">
            🗑️
          </button>
        </div>
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

        // Jump to Control tab so the reveal button is immediately visible
        activateTab('control');
      });
    });

    // Add listeners to permanently delete questions
    questionsPool.querySelectorAll('.btn-delete-q').forEach(btn => {
      btn.addEventListener('click', () => {
        const qId = btn.dataset.id;
        const qText = btn.dataset.text;
        if (confirm(`هل أنت متأكد من رغبتك في حذف هذا السؤال نهائياً؟\n"${qText}"`)) {
          socket.emit('delete-question', { questionId: qId });
        }
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

  // Toggle Scoreboard click
  if (btnToggleScoreboard) {
    btnToggleScoreboard.addEventListener('click', () => {
      scoreboardVisible = !scoreboardVisible;
      socket.emit('toggle-scoreboard', { visible: scoreboardVisible });
    });
  }

  socket.on('scoreboard-visibility-update', ({ visible }) => {
    scoreboardVisible = visible;
    if (btnToggleScoreboard) {
      if (visible) {
        btnToggleScoreboard.textContent = '🙈 إخفاء الترتيب عن المتسابقين';
        btnToggleScoreboard.style.borderColor = 'var(--color-red)';
        btnToggleScoreboard.style.color = 'var(--color-red)';
      } else {
        btnToggleScoreboard.textContent = '📊 إظهار الترتيب للمتسابقين';
        btnToggleScoreboard.style.borderColor = 'var(--color-yellow)';
        btnToggleScoreboard.style.color = 'var(--color-yellow)';
      }
    }
  });

  // Start Game click
  btnStartGame.addEventListener('click', () => {
    socket.emit('start-game');
    dashboardRoomStatus.textContent = 'نشط (اللعبة تعمل)';
    dashboardRoomStatus.style.color = 'var(--color-green)';
    btnStartGame.style.display = 'none';
    btnEndGame.style.display = 'inline-flex';
    if (btnToggleScoreboard) btnToggleScoreboard.style.display = 'inline-flex';
    showSuccess('بدأت المسابقة! الآن اطرح الأسئلة للاعبين.');
  });

  // End Game click
  btnEndGame.addEventListener('click', () => {
    if (confirm('هل أنت متأكد من إنهاء المسابقة وعرض منصة التتويج؟')) {
      socket.emit('end-game');
      dashboardRoomStatus.textContent = 'منتهية';
      dashboardRoomStatus.style.color = 'var(--color-red)';
      btnEndGame.style.display = 'none';
      if (btnToggleScoreboard) btnToggleScoreboard.style.display = 'none';
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
