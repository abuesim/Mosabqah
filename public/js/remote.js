document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  // Screens
  const screenSetup = document.getElementById('remote-screen-setup');
  const screenDashboard = document.getElementById('remote-screen-dashboard');

  // DOM Elements - Auth Step 1
  const authStep1 = document.getElementById('remote-auth-step-1');
  const roomCodeInput = document.getElementById('room-code');
  const btnCheckRoom = document.getElementById('btn-check-room');

  // DOM Elements - Auth Step 2
  const authStep2 = document.getElementById('remote-auth-step-2');
  const validatedRoomName = document.getElementById('validated-room-name');
  const adminPassInput = document.getElementById('admin-pass');
  const btnAuthRemote = document.getElementById('btn-auth-remote');
  const btnBackToStep1 = document.getElementById('btn-back-to-step-1');

  // DOM Elements - Dashboard Room Summary
  const dashboardRoomCode = document.getElementById('dashboard-room-code');
  const dashboardRoomType = document.getElementById('dashboard-room-type');

  // DOM Elements - Active Question Panel
  const activeQuestionNone = document.getElementById('active-question-none');
  const activeQuestionDetails = document.getElementById('active-question-details');
  const activeQText = document.getElementById('active-q-text');
  const activeQStatus = document.getElementById('active-q-status');
  const activeQAnswers = document.getElementById('active-q-answers');

  // DOM Elements - Remote control buttons
  const btnStartEndGame = document.getElementById('btn-start-end-game');
  const btnRemoteConfirmAnswer = document.getElementById('btn-remote-confirm-answer');
  const btnRandomQ = document.getElementById('btn-random-q');
  const btnTrialQ = document.getElementById('btn-trial-q');
  const btnGroupNextQ = document.getElementById('btn-group-next-q');

  // DOM Elements - Lists
  const remotePlayersList = document.getElementById('remote-players-list');
  const remoteCategoryFilters = document.getElementById('remote-category-filters');
  const remoteDifficultyFilters = document.getElementById('remote-difficulty-filters');
  const remoteQuestionsPool = document.getElementById('remote-questions-pool');

  // Toast Helpers
  const errorToast = document.getElementById('error-toast');
  const successToast = document.getElementById('success-toast');

  function showError(msg) {
    errorToast.textContent = msg;
    errorToast.style.display = 'block';
    setTimeout(() => { errorToast.style.display = 'none'; }, 3000);
  }

  function showSuccess(msg) {
    successToast.textContent = msg;
    successToast.style.display = 'block';
    setTimeout(() => { successToast.style.display = 'none'; }, 3000);
  }

  function updateStartEndGameButton() {
    if (!btnStartEndGame) return;
    if (currentRoomStatus === 'waiting' || currentRoomStatus === 'idle') {
      btnStartEndGame.textContent = 'بدء المسابقة ▶️';
      btnStartEndGame.style.background = 'linear-gradient(135deg, var(--primary-accent), #3b82f6)';
      btnStartEndGame.disabled = false;
    } else if (currentRoomStatus === 'playing') {
      btnStartEndGame.textContent = 'إنهاء المسابقة 🏁';
      btnStartEndGame.style.background = 'linear-gradient(135deg, var(--color-red), #ee5253)';
      btnStartEndGame.disabled = false;
    } else if (currentRoomStatus === 'finished') {
      btnStartEndGame.textContent = 'المسابقة انتهت 🏁';
      btnStartEndGame.style.background = '#475569';
      btnStartEndGame.disabled = true;
    }
  }

  function startRemoteTimer(duration, startTimeMs) {
    clearInterval(remoteTimerInterval);
    if (!startTimeMs) return;
    const update = () => {
      const elapsed = Math.round((Date.now() - startTimeMs) / 1000);
      const remaining = Math.max(0, duration - elapsed);
      
      if (btnStartEndGame && currentRoomStatus === 'playing') {
        btnStartEndGame.innerHTML = `إنهاء المسابقة 🏁 <span style="background: rgba(255,255,255,0.2); padding: 3px 8px; border-radius: 4px; font-size: 12px; margin-inline-start: 8px; font-family: monospace;">⏱️ ${remaining}ث</span>`;
      }

      if (remaining <= 0) {
        clearInterval(remoteTimerInterval);
      }
    };
    update();
    remoteTimerInterval = setInterval(update, 1000);
  }

  // State Variables
  let currentRoom = null;
  let adminPassword = '';
  let questionsList = [];
  let playersList = [];
  let askedQuestionsSet = new Set();
  let activeCategories = new Set();
  let activeDifficulties = new Set();
  let currentRoomStatus = 'waiting';
  let remoteTimerInterval = null;

  // URL Query parameter check (auto-prefill room code)
  const urlParams = new URLSearchParams(window.location.search);
  const urlRoomCode = urlParams.get('room');
  if (urlRoomCode) {
    roomCodeInput.value = urlRoomCode;
    socket.emit('check-room', { roomCode: urlRoomCode });
    // Transition to loading step 2 directly
    authStep1.style.display = 'none';
    authStep2.style.display = 'block';
    validatedRoomName.textContent = `مسابقة ${urlRoomCode}`;
    setTimeout(() => adminPassInput.focus(), 100);
  }

  // --- Step 1 Events ---
  btnCheckRoom.addEventListener('click', () => {
    const code = roomCodeInput.value.trim();
    if (!code || code.length < 4) {
      showError('يرجى إدخال رمز غرفة صحيح يتكون من 4 أرقام على الأقل');
      return;
    }
    socket.emit('check-room', { roomCode: code });
  });

  roomCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      btnCheckRoom.click();
    }
  });

  socket.on('room-checked', ({ exists, roomCode, name }) => {
    if (exists) {
      validatedRoomName.textContent = name;
      authStep1.style.display = 'none';
      authStep2.style.display = 'block';
      setTimeout(() => adminPassInput.focus(), 100);
    } else {
      showError('عذراً، رقم المسابقة غير موجود. يرجى التأكد منه.');
      // Re-enable step 1 if prefilled in background
      authStep2.style.display = 'none';
      authStep1.style.display = 'block';
    }
  });

  // --- Step 2 Events ---
  btnBackToStep1.addEventListener('click', () => {
    authStep2.style.display = 'none';
    authStep1.style.display = 'block';
    roomCodeInput.value = '';
    setTimeout(() => roomCodeInput.focus(), 100);
  });

  btnAuthRemote.addEventListener('click', () => {
    const password = adminPassInput.value.trim();
    if (!password) {
      showError('يرجى إدخال كلمة المرور للمتابعة');
      return;
    }
    socket.emit('check-password', { password });
  });

  adminPassInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      btnAuthRemote.click();
    }
  });

  socket.on('password-checked', ({ success }) => {
    if (success) {
      adminPassword = adminPassInput.value.trim();
      const code = roomCodeInput.value.trim();
      // Join room as admin role so we receive all dashboard data
      socket.emit('join-room', {
        roomCode: code,
        role: 'admin',
        password: adminPassword
      });
    } else {
      showError('رمز المرور للوحة التحكم غير صحيح');
    }
  });

  // --- Socket: Room Joined ---
  socket.on('admin-joined', ({ room }) => {
    currentRoom = room;
    currentRoomStatus = room.status;
    dashboardRoomCode.textContent = room.id;
    dashboardRoomType.textContent = room.type === 'individual' ? 'لعب فردي' : 'لعب جماعي';
    btnGroupNextQ.style.display = room.type === 'group' ? 'flex' : 'none';

    updateStartEndGameButton();

    screenSetup.style.display = 'none';
    screenDashboard.style.display = 'block';
    showSuccess('تم توصيل جهاز التحكم بنجاح! 🕹️');
  });

  socket.on('error-msg', (msg) => {
    showError(msg);
  });

  socket.on('game-started', () => {
    currentRoomStatus = 'playing';
    updateStartEndGameButton();
    showSuccess('بدأت المسابقة! 🏁');
  });

  socket.on('game-finished', () => {
    currentRoomStatus = 'finished';
    updateStartEndGameButton();
    clearInterval(remoteTimerInterval);
    showSuccess('انتهت المسابقة وتم عرض لوحة التتويج! 🏆');
  });

  // --- Control Button Listeners ---
  if (btnStartEndGame) {
    btnStartEndGame.addEventListener('click', () => {
      if (currentRoomStatus === 'waiting' || currentRoomStatus === 'idle') {
        socket.emit('start-game');
        showSuccess('تم بدء المسابقة بنجاح ▶️');
      } else if (currentRoomStatus === 'playing') {
        if (confirm('هل أنت متأكد من رغبتك في إنهاء المسابقة وعرض النتائج الختامية؟')) {
          socket.emit('end-game');
          showSuccess('تم إنهاء المسابقة 🏁');
        }
      }
    });
  }

  if (btnRemoteConfirmAnswer) {
    btnRemoteConfirmAnswer.addEventListener('click', () => {
      socket.emit('reveal-answer');
      showSuccess('تم اعتماد الإجابة وكشف النتيجة 🔔');
    });
  }

  btnRandomQ.addEventListener('click', () => {
    socket.emit('admin-random-question');
    showSuccess('طرح سؤال عشوائي 🎲');
  });

  btnTrialQ.addEventListener('click', () => {
    socket.emit('start-trial-question');
    showSuccess('طرح سؤال تجريبي 🎯');
  });

  btnGroupNextQ.addEventListener('click', () => {
    socket.emit('group-next-question');
    showSuccess('طرح السؤال التالي للفرق ⏭️');
  });

  // --- Active Question Sync/Listeners ---
  socket.on('sync-question', ({ question, questionStatus, answeredCount, timerDuration, startTime }) => {
    updateActiveQuestionDisplay(question, questionStatus, answeredCount);
    if (questionStatus === 'showing' || questionStatus === 'showing_trial') {
      startRemoteTimer(timerDuration || 30, startTime || Date.now());
    } else {
      clearInterval(remoteTimerInterval);
      updateStartEndGameButton();
    }
  });

  socket.on('question-shown', ({ question, isTrial, timerDuration, startTime }) => {
    const status = isTrial ? 'showing_trial' : 'showing';
    updateActiveQuestionDisplay(question, status, 0);
    startRemoteTimer(timerDuration || 30, startTime || Date.now());
  });

  socket.on('player-answered-count', (count) => {
    if (activeQAnswers) activeQAnswers.textContent = count;
  });

  socket.on('presenter-reveal', ({ correctText }) => {
    if (activeQStatus) {
      activeQStatus.textContent = `تم كشف الإجابة: (${correctText}) ✅`;
      activeQStatus.style.color = 'var(--color-green)';
    }
    if (btnRemoteConfirmAnswer) {
      btnRemoteConfirmAnswer.style.display = 'none';
    }
    clearInterval(remoteTimerInterval);
    updateStartEndGameButton();
  });

  socket.on('timer-expired', () => {
    if (activeQStatus) {
      activeQStatus.textContent = 'انتهى وقت الإجابة! ⌛';
      activeQStatus.style.color = 'var(--color-red)';
    }
    if (btnRemoteConfirmAnswer) {
      btnRemoteConfirmAnswer.style.display = 'none';
    }
    clearInterval(remoteTimerInterval);
    updateStartEndGameButton();
  });

  function updateActiveQuestionDisplay(question, questionStatus, answeredCount) {
    if (!question) {
      activeQuestionNone.style.display = 'block';
      activeQuestionDetails.style.display = 'none';
      return;
    }
    activeQuestionNone.style.display = 'none';
    activeQuestionDetails.style.display = 'block';
    activeQText.textContent = question.question_text;
    activeQAnswers.textContent = answeredCount || 0;

    if (questionStatus === 'showing' || questionStatus === 'showing_trial') {
      activeQStatus.textContent = questionStatus === 'showing_trial' ? 'يستقبل الإجابات (تجريبي) 🎯' : 'يستقبل الإجابات ⏳';
      activeQStatus.style.color = 'var(--primary-accent)';
      if (btnRemoteConfirmAnswer) {
        btnRemoteConfirmAnswer.style.display = 'block';
        btnRemoteConfirmAnswer.disabled = false;
        btnRemoteConfirmAnswer.textContent = (questionStatus === 'showing_trial') ? 'اعتماد الإجابة (تجريبي) 🎯' : 'اعتماد وكشف الإجابة 🔔';
      }
    } else if (questionStatus === 'revealed') {
      const correctOptText = question['option' + question.correct_option] || '';
      activeQStatus.textContent = `تم كشف الإجابة: (${correctOptText}) ✅`;
      activeQStatus.style.color = 'var(--color-green)';
      if (btnRemoteConfirmAnswer) {
        btnRemoteConfirmAnswer.style.display = 'none';
      }
      clearInterval(remoteTimerInterval);
      updateStartEndGameButton();
    } else if (questionStatus === 'time_up') {
      activeQStatus.textContent = 'انتهى وقت الإجابة! ⌛';
      activeQStatus.style.color = 'var(--color-red)';
      if (btnRemoteConfirmAnswer) {
        btnRemoteConfirmAnswer.style.display = 'none';
      }
      clearInterval(remoteTimerInterval);
      updateStartEndGameButton();
    }
  }

  // --- Scoreboard / Players list ---
  socket.on('player-list-update', (players) => {
    playersList = players;
    renderPlayersScoreboard();
  });

  function renderPlayersScoreboard() {
    remotePlayersList.innerHTML = '';
    if (playersList.length === 0) {
      remotePlayersList.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 20px; font-size: 13px;">لا يوجد متسابقين متصلين حالياً.</div>';
      return;
    }

    const sorted = [...playersList].sort((a, b) => (b.score || 0) - (a.score || 0));
    sorted.forEach(player => {
      const item = document.createElement('div');
      item.className = 'scoreboard-item-mobile';
      item.style.borderRight = `4px solid ${player.color}`;

      const decor = player.is_active === 1 ? '' : 'text-decoration: line-through; opacity: 0.6;';
      const statusIcon = player.is_active === 1 ? '🟢' : '⚫';

      item.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; ${decor}">
          <span style="font-weight: bold; font-size: 15px;">${statusIcon} ${player.name}</span>
          <span style="font-weight: 800; color: var(--color-yellow); font-size: 15px;">${player.score} نقطة</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed rgba(255,255,255,0.06); padding-top: 8px;">
          <div style="display: flex; gap: 6px;">
            <button class="btn-qty btn-plus" data-id="${player.id}" data-val="10">+10</button>
            <button class="btn-qty btn-plus" data-id="${player.id}" data-val="50">+50</button>
            <button class="btn-qty btn-plus" data-id="${player.id}" data-val="100">+100</button>
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn-qty btn-minus" data-id="${player.id}" data-val="-10" style="background: rgba(255,71,87,0.1); color: var(--color-red);">-10</button>
            <button class="btn-qty btn-minus" data-id="${player.id}" data-val="-50" style="background: rgba(255,71,87,0.1); color: var(--color-red);">-50</button>
          </div>
        </div>
      `;
      remotePlayersList.appendChild(item);
    });

    // Score adjustment clicks
    remotePlayersList.querySelectorAll('.btn-plus, .btn-minus').forEach(btn => {
      btn.addEventListener('click', () => {
        const playerId = btn.dataset.id;
        const val = parseInt(btn.dataset.val);
        socket.emit('adjust-score', { playerId, adjustment: val });
        showSuccess('تم رصد وتحديث النقاط 📊');
      });
    });
  }

  // --- Dynamic Manual Questions List & Filters ---
  socket.on('questions-list', (list) => {
    questionsList = list;
    renderCategoryFilters();
    renderDifficultyFilters();
    renderQuestionsPool();
  });

  socket.on('asked-questions-update', (askedIds) => {
    askedQuestionsSet = new Set((askedIds || []).map(id => parseInt(id)));
    renderQuestionsPool();
  });

  function renderCategoryFilters() {
    remoteCategoryFilters.innerHTML = '';
    const categories = Array.from(new Set(questionsList.map(q => q.category || 'عام')))
      .filter(cat => cat && cat.trim() !== '');

    // All button
    const btnAll = document.createElement('button');
    btnAll.textContent = 'الكل 🌐';
    btnAll.style.cssText = activeCategories.size === 0
      ? 'padding: 5px 10px; font-size: 11px; border-radius: var(--radius-sm); border: 1px solid var(--primary-accent); background: rgba(112, 161, 255, 0.15); color: white; cursor: pointer;'
      : 'padding: 5px 10px; font-size: 11px; border-radius: var(--radius-sm); border: 1px solid var(--glass-border); background: rgba(255,255,255,0.02); color: var(--text-secondary); cursor: pointer;';
    btnAll.addEventListener('click', () => {
      activeCategories.clear();
      renderCategoryFilters();
      renderQuestionsPool();
    });
    remoteCategoryFilters.appendChild(btnAll);

    categories.forEach(cat => {
      const btn = document.createElement('button');
      btn.textContent = cat;
      const isActive = activeCategories.has(cat);
      btn.style.cssText = isActive
        ? 'padding: 5px 10px; font-size: 11px; border-radius: var(--radius-sm); border: 1px solid var(--primary-accent); background: rgba(112, 161, 255, 0.15); color: white; cursor: pointer;'
        : 'padding: 5px 10px; font-size: 11px; border-radius: var(--radius-sm); border: 1px solid var(--glass-border); background: rgba(255,255,255,0.02); color: var(--text-secondary); cursor: pointer;';

      btn.addEventListener('click', () => {
        if (activeCategories.has(cat)) {
          activeCategories.delete(cat);
        } else {
          activeCategories.add(cat);
        }
        renderCategoryFilters();
        renderQuestionsPool();
      });
      remoteCategoryFilters.appendChild(btn);
    });
  }

  function renderDifficultyFilters() {
    remoteDifficultyFilters.innerHTML = '';
    const difficulties = Array.from(new Set(questionsList.map(q => q.difficulty || 'medium')))
      .filter(diff => diff && diff.trim() !== '');

    // All button
    const btnAll = document.createElement('button');
    btnAll.textContent = 'الكل 🌐';
    btnAll.style.cssText = activeDifficulties.size === 0
      ? 'padding: 5px 10px; font-size: 11px; border-radius: var(--radius-sm); border: 1px solid var(--primary-accent); background: rgba(112, 161, 255, 0.15); color: white; cursor: pointer;'
      : 'padding: 5px 10px; font-size: 11px; border-radius: var(--radius-sm); border: 1px solid var(--glass-border); background: rgba(255,255,255,0.02); color: var(--text-secondary); cursor: pointer;';
    btnAll.addEventListener('click', () => {
      activeDifficulties.clear();
      renderDifficultyFilters();
      renderQuestionsPool();
    });
    remoteDifficultyFilters.appendChild(btnAll);

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
      btn.style.cssText = isActive
        ? 'padding: 5px 10px; font-size: 11px; border-radius: var(--radius-sm); border: 1px solid var(--primary-accent); background: rgba(112, 161, 255, 0.15); color: white; cursor: pointer;'
        : 'padding: 5px 10px; font-size: 11px; border-radius: var(--radius-sm); border: 1px solid var(--glass-border); background: rgba(255,255,255,0.02); color: var(--text-secondary); cursor: pointer;';

      btn.addEventListener('click', () => {
        if (activeDifficulties.has(diff)) {
          activeDifficulties.delete(diff);
        } else {
          activeDifficulties.add(diff);
        }
        renderDifficultyFilters();
        renderQuestionsPool();
      });
      remoteDifficultyFilters.appendChild(btn);
    });
  }

  function renderQuestionsPool() {
    remoteQuestionsPool.innerHTML = '';
    let filteredList = questionsList;
    if (activeCategories.size > 0) {
      filteredList = questionsList.filter(q => activeCategories.has(q.category || 'عام'));
    }
    if (activeDifficulties.size > 0) {
      filteredList = filteredList.filter(q => activeDifficulties.has(q.difficulty || 'medium'));
    }

    if (filteredList.length === 0) {
      remoteQuestionsPool.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 15px; font-size: 12px;">لا توجد أسئلة تطابق التصنيف المختار.</div>';
      return;
    }

    // Sort: unasked first, then asked
    const unasked = filteredList.filter(q => !askedQuestionsSet.has(parseInt(q.id)));
    const asked = filteredList.filter(q => askedQuestionsSet.has(parseInt(q.id)));

    [...unasked, ...asked].forEach(q => {
      const isAsked = askedQuestionsSet.has(parseInt(q.id));
      const card = document.createElement('div');
      card.className = 'remote-q-card';
      
      // Determine difficulty border color
      const diff = (q.difficulty || 'medium').toLowerCase();
      let borderStyle = 'border-right: 4px solid var(--color-yellow);'; // default medium
      if (diff === 'easy') borderStyle = 'border-right: 4px solid var(--color-green);';
      else if (diff === 'hard') borderStyle = 'border-right: 4px solid var(--color-red);';
      
      card.style.cssText = `
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid var(--glass-border);
        border-radius: var(--radius-sm);
        padding: 12px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin-bottom: 8px;
        ${borderStyle}
        ${isAsked ? 'opacity: 0.45; filter: grayscale(0.6);' : ''}
      `;

      // Determine Category badge
      const cat = (q.category || 'general').toLowerCase();
      let catBadgeHtml = '<span style="background: rgba(255, 255, 255, 0.08); color: var(--text-secondary); padding: 2px 6px; border-radius: 12px; font-size: 10px; font-weight: bold; border: 1px solid rgba(255, 255, 255, 0.15);">🌐 عام</span>';
      if (cat === 'islamic') {
        catBadgeHtml = '<span style="background: rgba(46, 213, 115, 0.15); color: #2ed573; padding: 2px 6px; border-radius: 12px; font-size: 10px; font-weight: bold; border: 1px solid rgba(46, 213, 115, 0.3);">🕌 إسلامي</span>';
      } else if (cat === 'riddles') {
        catBadgeHtml = '<span style="background: rgba(255, 165, 2, 0.15); color: #ffa502; padding: 2px 6px; border-radius: 12px; font-size: 10px; font-weight: bold; border: 1px solid rgba(255, 165, 2, 0.3);">🧩 لغز</span>';
      } else if (cat === 'science') {
        catBadgeHtml = '<span style="background: rgba(112, 161, 255, 0.15); color: #70a1ff; padding: 2px 6px; border-radius: 12px; font-size: 10px; font-weight: bold; border: 1px solid rgba(112, 161, 255, 0.3);">🔬 علوم</span>';
      }

      // Determine Difficulty badge
      let diffBadgeHtml = '<span style="background: rgba(255, 165, 2, 0.15); color: #ffa502; padding: 2px 6px; border-radius: 12px; font-size: 10px; font-weight: bold; border: 1px solid rgba(255, 165, 2, 0.3);">متوسط 🟡</span>';
      if (diff === 'easy') {
        diffBadgeHtml = '<span style="background: rgba(46, 213, 115, 0.15); color: #2ed573; padding: 2px 6px; border-radius: 12px; font-size: 10px; font-weight: bold; border: 1px solid rgba(46, 213, 115, 0.3);">سهل 🟢</span>';
      } else if (diff === 'hard') {
        diffBadgeHtml = '<span style="background: rgba(255, 71, 87, 0.15); color: #ff4757; padding: 2px 6px; border-radius: 12px; font-size: 10px; font-weight: bold; border: 1px solid rgba(255, 71, 87, 0.3);">صعب 🔴</span>';
      }

      card.innerHTML = `
        <div style="flex-grow: 1; text-align: right;">
          <div style="font-weight: bold; font-size: 13px; color: white; margin-bottom: 6px;">${q.question_text}</div>
          <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
            ${catBadgeHtml}
            ${diffBadgeHtml}
          </div>
        </div>
        <div style="display: flex; gap: 6px; align-items: center; flex-shrink: 0;">
          <button class="btn btn-send-q" data-id="${q.id}" ${isAsked ? 'disabled style="background: rgba(255,255,255,0.05); color: var(--text-muted); opacity: 0.5;"' : 'style="padding: 6px 12px; font-size: 11px; min-width: 60px;"'}>
            ${isAsked ? 'تم طرحه' : 'طرح 🚀'}
          </button>
          <button class="btn-delete-q" data-id="${q.id}" data-text="${q.question_text}" style="background: rgba(255, 71, 87, 0.15); border: 1px solid rgba(255, 71, 87, 0.4); color: var(--color-red); width: 28px; height: 28px; border-radius: var(--radius-sm); cursor: pointer; font-size: 11px; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease;">
            🗑️
          </button>
        </div>
      `;
      remoteQuestionsPool.appendChild(card);
    });

    remoteQuestionsPool.querySelectorAll('.btn-send-q:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => {
        const questionId = btn.dataset.id;
        socket.emit('show-question', { questionId });
        showSuccess('تم طرح السؤال المختار بنجاح! 🚀');
      });
    });

    // Add listeners to permanently delete questions from remote
    remoteQuestionsPool.querySelectorAll('.btn-delete-q').forEach(btn => {
      btn.addEventListener('click', () => {
        const qId = btn.dataset.id;
        const qText = btn.dataset.text;
        if (confirm(`هل أنت متأكد من رغبتك في حذف هذا السؤال نهائياً؟\n"${qText}"`)) {
          socket.emit('delete-question', { questionId: qId });
        }
      });
    });
  }
});
