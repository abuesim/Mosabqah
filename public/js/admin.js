document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  // State
  let currentRoom = null;
  let adminPassword = '';
  let questionsList = [];
  let playersList = [];

  // DOM Elements
  const screens = {
    setup: document.getElementById('admin-screen-setup'),
    dashboard: document.getElementById('admin-screen-dashboard')
  };

  const adminPassInput = document.getElementById('admin-pass');
  const gameTypeSelect = document.getElementById('game-type');
  const timerSecSelect = document.getElementById('timer-sec');
  const btnCreateRoom = document.getElementById('btn-create-room');

  const dashboardRoomCode = document.getElementById('dashboard-room-code');
  const dashboardRoomType = document.getElementById('dashboard-room-type');
  const dashboardRoomStatus = document.getElementById('dashboard-room-status');
  const btnStartGame = document.getElementById('btn-start-game');
  const btnEndGame = document.getElementById('btn-end-game');
  const linkTvPresenter = document.getElementById('link-tv-presenter');

  const activeQuestionNone = document.getElementById('active-question-none');
  const activeQuestionDetails = document.getElementById('active-question-details');
  const activeQText = document.getElementById('active-q-text');
  const activeQStatus = document.getElementById('active-q-status');
  const activeQAnswers = document.getElementById('active-q-answers');
  const btnRevealAnswer = document.getElementById('btn-reveal-answer');

  const questionsPool = document.getElementById('questions-pool');
  const adminPlayersList = document.getElementById('admin-players-list');
  const btnExportCsv = document.getElementById('btn-export-csv');

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

  if (btnModeIndividual && btnModeGroup) {
    btnModeIndividual.addEventListener('click', () => {
      gameTypeSelect.value = 'individual';
      btnModeIndividual.style.borderColor = 'var(--primary-accent)';
      btnModeIndividual.style.background = 'rgba(112, 161, 255, 0.15)';
      btnModeIndividual.style.boxShadow = '0 0 15px rgba(112, 161, 255, 0.2)';
      
      btnModeGroup.style.borderColor = 'var(--glass-border)';
      btnModeGroup.style.background = 'rgba(255,255,255,0.02)';
      btnModeGroup.style.boxShadow = 'none';
    });

    btnModeGroup.addEventListener('click', () => {
      gameTypeSelect.value = 'group';
      btnModeGroup.style.borderColor = 'var(--primary-accent)';
      btnModeGroup.style.background = 'rgba(112, 161, 255, 0.15)';
      btnModeGroup.style.boxShadow = '0 0 15px rgba(112, 161, 255, 0.2)';
      
      btnModeIndividual.style.borderColor = 'var(--glass-border)';
      btnModeIndividual.style.background = 'rgba(255,255,255,0.02)';
      btnModeIndividual.style.boxShadow = 'none';
    });
  }

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

    if (!password) {
      showError('يرجى إدخال كلمة المرور للمتابعة');
      return;
    }

    adminPassword = password;
    socket.emit('create-room', {
      type,
      timerDuration: timer,
      password
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
    
    showScreen('dashboard');
  });

  // Socket: Questions pool received
  socket.on('questions-list', (list) => {
    questionsList = list;
    renderQuestionsPool();
  });

  // Socket: Players list update
  socket.on('player-list-update', (players) => {
    playersList = players;
    renderPlayersList();
    if (players.length > 0) {
      btnExportCsv.style.display = 'inline-flex';
    } else {
      btnExportCsv.style.display = 'none';
    }
  });

  // Render Questions list in panel
  function renderQuestionsPool() {
    questionsPool.innerHTML = '';
    if (questionsList.length === 0) {
      questionsPool.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 20px;">لا توجد أسئلة مضافة حالياً.</div>';
      return;
    }

    questionsList.forEach(q => {
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
      `;

      const categoryText = q.category === 'islamic' ? 'إسلامي' : 
                           q.category === 'riddles' ? 'لغز' : 
                           q.category === 'science' ? 'علوم' : 'عام';

      card.innerHTML = `
        <div style="flex-grow: 1;">
          <div style="font-weight: bold; margin-bottom: 5px;">${q.question_text}</div>
          <div style="font-size: 12px; color: var(--text-secondary);">
            التصنيف: <strong>${categoryText}</strong> | 
            الإجابة الصحيحة: <span style="color: var(--color-green); font-weight: bold;">${q['option' + q.correct_option]}</span>
          </div>
        </div>
        <button class="btn btn-send-q" data-id="${q.id}" style="font-size: 13px; padding: 8px 16px; flex-shrink: 0;">
          طرح السؤال 🚀
        </button>
      `;

      questionsPool.appendChild(card);
    });

    // Add listeners to throw questions
    questionsPool.querySelectorAll('.btn-send-q').forEach(btn => {
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

  // Render connected players or teams
  function renderPlayersList() {
    adminPlayersList.innerHTML = '';
    if (playersList.length === 0) {
      adminPlayersList.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 20px;">لا يوجد لاعبون منضمون حالياً...</div>';
      return;
    }

    playersList.forEach(player => {
      const item = document.createElement('div');
      item.className = 'leaderboard-item';
      item.style.flexDirection = 'column';
      item.style.alignItems = 'stretch';
      item.style.gap = '10px';

      // Status indicator style
      const dotColor = player.is_active === 1 ? player.color : '#6b7280';
      const textDecor = player.is_active === 1 ? '' : 'text-decoration: line-through; opacity: 0.6;';

      item.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; ${textDecor}">
          <div class="player-info">
            <div class="player-dot" style="color: ${dotColor}; background-color: ${dotColor}"></div>
            <span class="player-name">${player.name}</span>
          </div>
          <span class="player-score" id="score-val-${player.id}">${player.score} نقطة</span>
        </div>
        
        <!-- Points Adjustment form -->
        <div style="display: flex; gap: 8px; justify-content: flex-end; align-items: center; margin-top: 5px;">
          <input type="number" id="adjust-input-${player.id}" class="form-input" value="50" style="width: 70px; padding: 4px 8px; font-size: 13px; text-align: center;" required>
          <button class="btn btn-adjust-plus" data-id="${player.id}" style="padding: 4px 10px; font-size: 12px; background: var(--color-green); box-shadow: none;">+ إضافة</button>
          <button class="btn btn-adjust-minus" data-id="${player.id}" style="padding: 4px 10px; font-size: 12px; background: var(--color-red); box-shadow: none;">- خصم</button>
        </div>
      `;

      adminPlayersList.appendChild(item);
    });

    // Score adjustments logic
    adminPlayersList.querySelectorAll('.btn-adjust-plus').forEach(btn => {
      btn.addEventListener('click', () => {
        const pId = btn.dataset.id;
        const val = parseInt(document.getElementById(`adjust-input-${pId}`).value) || 0;
        socket.emit('adjust-score', { playerId: pId, adjustment: val });
        showSuccess('تمت إضافة النقاط بنجاح');
      });
    });

    adminPlayersList.querySelectorAll('.btn-adjust-minus').forEach(btn => {
      btn.addEventListener('click', () => {
        const pId = btn.dataset.id;
        const val = -1 * (parseInt(document.getElementById(`adjust-input-${pId}`).value) || 0);
        socket.emit('adjust-score', { playerId: pId, adjustment: val });
        showSuccess('تم خصم النقاط بنجاح');
      });
    });
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
