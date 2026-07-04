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
  }


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

    // Join room
    socket.emit('join-room', {
      roomCode,
      role: 'player',
      name: playerName,
      color: selectedColor
    });
  });

  // Socket: Error handling
  socket.on('error-msg', (msg) => {
    showError(msg);
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
    
    showScreen('lobby');
  });

  // Socket: Sync list update (useful for score synchronizations)
  socket.on('player-list-update', (players) => {
    if (playerDetails) {
      const self = players.find(p => p.id === playerDetails.id);
      if (self) {
        activeScore = self.score;
        playerScoreVal.textContent = activeScore;
      }
    }
  });

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
  socket.on('question-shown', ({ question, timerDuration }) => {
    currentQuestion = question;
    
    // Fill text and options
    questionCategory.textContent = question.category === 'islamic' ? 'إسلامي' : 
                                   question.category === 'riddles' ? 'لغز' : 
                                   question.category === 'science' ? 'علوم' : 'عام';
    questionText.textContent = question.question_text;
    
    document.getElementById('opt-text-1').textContent = question.option1;
    document.getElementById('opt-text-2').textContent = question.option2;
    document.getElementById('opt-text-3').textContent = question.option3;
    document.getElementById('opt-text-4').textContent = question.option4;
    
    // Re-enable and reset options
    optionButtons.forEach(btn => {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.style.transform = 'none';
      btn.classList.remove('selected-option');
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
    countdownInterval = setInterval(() => {
      secondsLeft--;
      timerText.textContent = secondsLeft;
      
      // Play soft tick sound during last 5 seconds
      if (secondsLeft <= 5 && secondsLeft > 0) {
        sounds.playTick();
      }

      if (secondsLeft <= 0) {
        clearInterval(countdownInterval);
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

      // Emit
      socket.emit('submit-answer', {
        questionId: currentQuestion.id,
        chosenOption: chosen
      });
    });
  });

  // Socket: Answer submitted ack
  socket.on('answer-submitted-ack', ({ isCorrect, chosenOption }) => {
    feedbackIcon.textContent = '⏳';
    feedbackTitle.textContent = 'تم تسجيل الإجابة!';
    feedbackDesc.textContent = 'بانتظار المقدم لكشف النتيجة أو انتهاء وقت البقية...';
    scoreEarnedPanel.style.display = 'none';
    feedbackTotalScore.textContent = activeScore;
    
    showScreen('feedback');
  });

  // Socket: Timer expired
  socket.on('timer-expired', () => {
    clearInterval(countdownInterval);
    // If player didn't answer yet, lock options
    if (screens.question.classList.contains('active')) {
      optionButtons.forEach(b => b.disabled = true);
      feedbackIcon.textContent = '⏰';
      feedbackTitle.textContent = 'انتهى الوقت!';
      feedbackDesc.textContent = 'بانتظار المقدم لكشف النتيجة...';
      scoreEarnedPanel.style.display = 'none';
      feedbackTotalScore.textContent = activeScore;
      showScreen('feedback');
    }
  });

  // Socket: Reveal Answer results
  socket.on('answer-revealed', ({ correctOption, correctText, isCorrect, chosenOption, pointsEarned, totalScore }) => {
    activeScore = totalScore;
    feedbackTotalScore.textContent = totalScore;
    
    if (isCorrect) {
      feedbackIcon.textContent = '✅';
      feedbackTitle.textContent = 'إجابة صحيحة!';
      feedbackTitle.style.color = 'var(--color-green)';
      feedbackDesc.innerHTML = `الإجابة هي بالفعل: <strong>${correctText}</strong>`;
      
      scoreEarnedPanel.style.display = 'block';
      feedbackPoints.textContent = `+${pointsEarned}`;
      feedbackPoints.style.color = 'var(--color-green)';
      
      sounds.playCorrect();
      // Device vibration API for physical feedback
      if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
    } else {
      feedbackIcon.textContent = '❌';
      feedbackTitle.textContent = 'إجابة خاطئة!';
      feedbackTitle.style.color = 'var(--color-red)';
      
      if (chosenOption) {
        feedbackDesc.innerHTML = `لقد اخترت إجابة خاطئة.<br>الإجابة الصحيحة هي: <strong>${correctText}</strong>`;
      } else {
        feedbackDesc.innerHTML = `فاتك الوقت للأسف!<br>الإجابة الصحيحة هي: <strong>${correctText}</strong>`;
      }
      
      scoreEarnedPanel.style.display = 'none';
      
      sounds.playIncorrect();
      if (navigator.vibrate) {
        navigator.vibrate(300);
      }
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
        color: playerDetails.color
      });
    }
  });
});
