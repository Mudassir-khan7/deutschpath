// ==========================================================================
// DeutschPath — Core Logic & Application Controller
// Offline-first, LocalStorage persistence, Lock mechanics,
// TTS Pronunciation, Multi-language Dictionary, Calendar & Reports
// ==========================================================================

// Global state keys
const STORAGE_KEY = 'deutschpath_state_v1';

// Default application state
const defaultAppState = {
  settings: {
    dailyGoalMins: 90,
    learnerName: 'Student',
    theme: 'dark',
    accent: 'emerald',
    a2Unlocked: false,
    lastBackupDate: null
  },
  // Map of completed roadmap days: { 1: true, 2: true, ... }
  completedDays: {},
  // Daily logs by YYYY-MM-DD: { "2026-10-15": { mins: 90, tasks: { grammar: true, duolingo: true, anki: true, listening: true }, customMins: 0 } }
  dailyLogs: {},
  // Topic notes by day number: { 1: "notes text...", 2: "..." }
  topicNotes: {},
  // Journal entries by date string YYYY-MM-DD: { "2026-10-15": "text..." }
  journalEntries: {},
  // Vocabulary bank list
  vocabulary: [...STARTER_VOCABULARY]
};

// In-memory active state
let state = { ...defaultAppState };

// Helper: Formatted local date YYYY-MM-DD
function getTodayDateString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Current viewed date for Daily Tasks & Journal
let activeTaskDate = getTodayDateString();
let activeJournalDate = getTodayDateString();
let activeCalendarMonth = new Date().getMonth();
let activeCalendarYear = new Date().getFullYear();
let activeNoteDay = 1;

// Load state from localStorage safely
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = {
        ...defaultAppState,
        ...parsed,
        settings: { ...defaultAppState.settings, ...(parsed.settings || {}) },
        completedDays: parsed.completedDays || {},
        dailyLogs: parsed.dailyLogs || {},
        topicNotes: parsed.topicNotes || {},
        journalEntries: parsed.journalEntries || {},
        vocabulary: (parsed.vocabulary && parsed.vocabulary.length > 0) ? parsed.vocabulary : [...STARTER_VOCABULARY]
      };
    }
  } catch (err) {
    console.error('Error loading state from localStorage:', err);
    state = { ...defaultAppState };
  }
}

// Save state to localStorage
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Error saving state to localStorage:', err);
    showToast('⚠️ Storage limit reached or localStorage disabled.');
  }
}

// Show a transient toast notification
function showToast(message) {
  const toast = document.getElementById('appToast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2800);
}

// ==========================================================================
// INITIALIZATION
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  applyThemeAndAccent();
  initNavigation();
  initTopBar();
  initDashboard();
  initDailyTasks();
  initRoadmap();
  initCalendar();
  initNotes();
  initJournal();
  initVocabulary();
  initTranslator();
  initPronunciation();
  initWeeklyReport();
  initSettings();
  initBackup();
});

// ==========================================================================
// NAVIGATION & SIDEBAR
// ==========================================================================
function initNavigation() {
  const navButtons = document.querySelectorAll('.nav-item');
  const panes = document.querySelectorAll('.tab-pane');
  const mobileToggle = document.getElementById('mobileMenuBtn');
  const sidebar = document.getElementById('sidebar');

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      navButtons.forEach(b => b.classList.remove('active'));
      panes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const activePane = document.getElementById(`tab-${targetTab}`);
      if (activePane) {
        activePane.classList.add('active');
      }

      // Refresh specific tab contents when opened
      if (targetTab === 'dashboard') updateDashboardView();
      if (targetTab === 'daily-tasks') renderDailyTasks();
      if (targetTab === 'study-calendar') renderCalendar();
      if (targetTab === 'weekly-report') renderWeeklyReport();
      if (targetTab === 'notes') renderNotesSidebar();

      // Close mobile sidebar if open
      closeMobileSidebar();
    });
  });

  const backdrop = document.getElementById('sidebarBackdrop');
  const closeBtn = document.getElementById('sidebarCloseBtn');

  function openMobileSidebar() {
    if (sidebar) sidebar.classList.add('open');
    if (backdrop) backdrop.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeMobileSidebar() {
    if (sidebar) sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.remove('active');
    document.body.style.overflow = '';
  }

  if (mobileToggle) {
    mobileToggle.addEventListener('click', () => {
      if (sidebar && sidebar.classList.contains('open')) {
        closeMobileSidebar();
      } else {
        openMobileSidebar();
      }
    });
  }

  if (backdrop) {
    backdrop.addEventListener('click', closeMobileSidebar);
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', closeMobileSidebar);
  }

  // Dashboard quick jump buttons
  const goToRoadmap = document.getElementById('dashGoToRoadmapBtn');
  if (goToRoadmap) {
    goToRoadmap.addEventListener('click', () => switchTab('roadmap'));
  }
  const goToTasks = document.getElementById('dashGoToTasksBtn');
  if (goToTasks) {
    goToTasks.addEventListener('click', () => switchTab('daily-tasks'));
  }
  const openLessonNotes = document.getElementById('dashOpenLessonNotesBtn');
  if (openLessonNotes) {
    openLessonNotes.addEventListener('click', () => {
      const currentDay = getCurrentRoadmapFocusDay();
      activeNoteDay = currentDay.day;
      switchTab('notes');
      renderNotesSidebar();
      loadNoteForDay(activeNoteDay);
    });
  }
  const checkA1Btn = document.getElementById('checkA1StatusBtn');
  if (checkA1Btn) {
    checkA1Btn.addEventListener('click', () => switchTab('roadmap'));
  }
}

function switchTab(tabId) {
  const btn = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  if (btn) btn.click();
}

// ==========================================================================
// TOPBAR & STREAK CALCULATIONS
// ==========================================================================
function initTopBar() {
  const dateEl = document.getElementById('headerDateDisplay');
  if (dateEl) {
    const today = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateEl.textContent = today.toLocaleDateString('en-US', options);
  }

  const quickSpeakBtn = document.getElementById('headerQuickSpeak');
  if (quickSpeakBtn) {
    quickSpeakBtn.addEventListener('click', () => {
      speakGermanText("Hallo! DeutschPath ist bereit. Viel Erfolg beim Deutschlernen!");
    });
  }

  updateTopBarStats();
}

function updateTopBarStats() {
  const streak = calculateCurrentStreak();
  const todayKey = getTodayDateString();
  const todayLog = state.dailyLogs[todayKey] || { mins: 0 };
  const goalMins = state.settings.dailyGoalMins || 90;

  const streakEl = document.getElementById('headerStreakVal');
  if (streakEl) streakEl.textContent = streak;

  const timeEl = document.getElementById('headerTimeSpent');
  if (timeEl) timeEl.textContent = `${todayLog.mins} / ${goalMins}`;

  // Update lock indicators in sidebar
  const a2LockPill = document.getElementById('a2LockStatusIcon');
  const activePhasePill = document.getElementById('activePhasePill');
  if (state.settings.a2Unlocked) {
    if (a2LockPill) {
      a2LockPill.textContent = '🔓 A2 Unlocked';
      a2LockPill.style.color = 'var(--primary-text)';
    }
    if (activePhasePill) {
      activePhasePill.textContent = 'Phase 2: A2';
    }
  } else {
    if (a2LockPill) {
      a2LockPill.textContent = '🔒 A2 Locked';
      a2LockPill.style.color = 'var(--accent-gold)';
    }
    if (activePhasePill) {
      activePhasePill.textContent = 'Phase 1: A1';
    }
  }
}

// Calculate streak in consecutive study days
function calculateCurrentStreak() {
  const dates = Object.keys(state.dailyLogs).filter(d => (state.dailyLogs[d].mins || 0) > 0);
  if (dates.length === 0) return 0;

  let streak = 0;
  let checkDate = new Date();

  // If today has 0 mins yet, check from yesterday so user doesn't lose streak before finishing today
  const todayStr = getTodayDateString(checkDate);
  if (!(state.dailyLogs[todayStr] && state.dailyLogs[todayStr].mins > 0)) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  while (true) {
    const key = getTodayDateString(checkDate);
    if (state.dailyLogs[key] && state.dailyLogs[key].mins > 0) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

// Find the current roadmap lesson that is next up
function getCurrentRoadmapFocusDay() {
  for (const week of ROADMAP_DATA) {
    for (const d of week.days) {
      if (!state.completedDays[d.day]) {
        return { ...d, weekTitle: `Week ${week.week} — ${week.title}`, phase: week.phase, weekGoal: week.goal };
      }
    }
  }
  return { day: 112, topic: "Final review + reflect: you've completed A2!", weekTitle: "Week 16 — Consolidation & Mock A2 Test", phase: "A2", weekGoal: "Completed" };
}

// ==========================================================================
// 1. DASHBOARD
// ==========================================================================
function initDashboard() {
  const markLessonBtn = document.getElementById('dashMarkLessonBtn');
  if (markLessonBtn) {
    markLessonBtn.addEventListener('click', () => {
      const focus = getCurrentRoadmapFocusDay();
      toggleDayCompletion(focus.day);
      updateDashboardView();
      renderRoadmap();
      showToast(`🎉 Day ${focus.day} marked as completed!`);
    });
  }
  updateDashboardView();
}

function updateDashboardView() {
  const todayKey = getTodayDateString();
  const todayLog = state.dailyLogs[todayKey] || { mins: 0, tasks: {} };
  const goalMins = state.settings.dailyGoalMins || 90;

  // KPI 1: Time
  const dashTodayTime = document.getElementById('dashTodayTime');
  const dashGoalTime = document.getElementById('dashGoalTime');
  const dashTimeProgress = document.getElementById('dashTimeProgress');
  const dashTimeRemaining = document.getElementById('dashTimeRemaining');

  if (dashTodayTime) dashTodayTime.textContent = todayLog.mins;
  if (dashGoalTime) dashGoalTime.textContent = goalMins;
  const timePercent = Math.min(100, Math.round((todayLog.mins / goalMins) * 100));
  if (dashTimeProgress) dashTimeProgress.style.width = `${timePercent}%`;
  if (dashTimeRemaining) {
    const rem = Math.max(0, goalMins - todayLog.mins);
    dashTimeRemaining.textContent = rem > 0 ? `${rem} mins remaining today` : '🎉 Daily goal achieved!';
  }

  // KPI 2: Tasks
  const defaultRoutine = ['grammar', 'duolingo', 'anki', 'listening'];
  const doneCount = defaultRoutine.filter(k => todayLog.tasks && todayLog.tasks[k]).length;
  const taskPercent = Math.round((doneCount / defaultRoutine.length) * 100);

  const dashTaskPercent = document.getElementById('dashTaskPercent');
  const dashTaskProgress = document.getElementById('dashTaskProgress');
  const dashTasksCompletedCount = document.getElementById('dashTasksCompletedCount');

  if (dashTaskPercent) dashTaskPercent.textContent = `${taskPercent}%`;
  if (dashTaskProgress) dashTaskProgress.style.width = `${taskPercent}%`;
  if (dashTasksCompletedCount) dashTasksCompletedCount.textContent = `${doneCount} of 4 routine activities done`;

  // KPI 3: Streak
  const streak = calculateCurrentStreak();
  const dashStreakCount = document.getElementById('dashStreakCount');
  if (dashStreakCount) dashStreakCount.textContent = streak;

  const dashStreakDots = document.getElementById('dashStreakDots');
  if (dashStreakDots) {
    dashStreakDots.innerHTML = '';
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = getTodayDateString(d);
      const isDone = (state.dailyLogs[k] && state.dailyLogs[k].mins > 0);
      const dot = document.createElement('div');
      dot.className = `streak-dot ${isDone ? 'active' : ''}`;
      dot.title = `${k}: ${isDone ? state.dailyLogs[k].mins + ' mins' : 'Missed'}`;
      dashStreakDots.appendChild(dot);
    }
  }

  // KPI 4: Overall Progress (112 Days)
  const completedTotal = Object.keys(state.completedDays).filter(k => state.completedDays[k]).length;
  const a1Done = Object.keys(state.completedDays).filter(k => Number(k) <= 56 && state.completedDays[k]).length;
  const a2Done = Object.keys(state.completedDays).filter(k => Number(k) > 56 && state.completedDays[k]).length;
  const overallPercent = Math.round((completedTotal / 112) * 100);

  const dashOverallPercent = document.getElementById('dashOverallPercent');
  const dashCompletedDaysCount = document.getElementById('dashCompletedDaysCount');
  const dashOverallProgress = document.getElementById('dashOverallProgress');
  const dashPhaseSplit = document.getElementById('dashPhaseSplit');

  if (dashOverallPercent) dashOverallPercent.textContent = `${overallPercent}%`;
  if (dashCompletedDaysCount) dashCompletedDaysCount.textContent = completedTotal;
  if (dashOverallProgress) dashOverallProgress.style.width = `${overallPercent}%`;
  if (dashPhaseSplit) {
    dashPhaseSplit.textContent = `A1: ${a1Done}/56 | A2: ${state.settings.a2Unlocked ? `${a2Done}/56` : 'Locked 🔒'}`;
  }

  // Current Lesson Card
  const currentFocus = getCurrentRoadmapFocusDay();
  const badgeEl = document.getElementById('dashCurrentDayBadge');
  const titleEl = document.getElementById('dashLessonTitle');
  const goalEl = document.getElementById('dashLessonGoal');
  const phaseEl = document.getElementById('dashLessonPhase');
  const weekEl = document.getElementById('dashLessonWeek');
  const markBtn = document.getElementById('dashMarkLessonBtn');

  if (badgeEl) badgeEl.textContent = `Day ${currentFocus.day}`;
  if (titleEl) titleEl.textContent = currentFocus.topic;
  if (goalEl) goalEl.textContent = `Goal: ${currentFocus.weekGoal}`;
  if (phaseEl) phaseEl.textContent = `Phase: ${currentFocus.phase}`;
  if (weekEl) weekEl.textContent = currentFocus.weekTitle;
  if (markBtn) {
    markBtn.textContent = state.completedDays[currentFocus.day] ? 'Marked as Done ✓' : 'Mark Lesson Done';
  }

  // Quick Routine Preview list
  const quickList = document.getElementById('dashQuickRoutineList');
  if (quickList) {
    quickList.innerHTML = '';
    const routineMeta = [
      { id: 'grammar', name: 'Grammar & Vocab Lesson', mins: 25, icon: '📖' },
      { id: 'duolingo', name: 'Duolingo Daily Session', mins: 20, icon: '🦉' },
      { id: 'anki', name: 'Anki Flashcard Deck Review', mins: 20, icon: '⚡' },
      { id: 'listening', name: 'Listening Practice (Easy German)', mins: 15, icon: '🎧' }
    ];

    routineMeta.forEach(r => {
      const isDone = todayLog.tasks && todayLog.tasks[r.id];
      const item = document.createElement('div');
      item.className = `quick-routine-item ${isDone ? 'done' : ''}`;
      item.innerHTML = `
        <div style="display:flex; align-items:center; gap:0.6rem;">
          <span>${r.icon}</span>
          <strong>${r.name}</strong>
        </div>
        <span class="task-mins-badge">${isDone ? 'Completed ✓' : `~${r.mins} min`}</span>
      `;
      quickList.appendChild(item);
    });
  }

  // Banner status
  const a2Banner = document.getElementById('a2BannerText');
  if (a2Banner) {
    if (state.settings.a2Unlocked) {
      a2Banner.textContent = `Phase 2 (A2) is Active! Completed: ${a2Done}/56 Days.`;
    } else {
      a2Banner.textContent = `A1 Progress: ${a1Done}/56 Days completed. A2 unlocks at 56/56.`;
    }
  }

  updateTopBarStats();
}

// ==========================================================================
// 2. DAILY TASKS
// ==========================================================================
function initDailyTasks() {
  const dateInput = document.getElementById('taskDateSelector');
  const todayBtn = document.getElementById('taskTodayBtn');
  const addCustomBtn = document.getElementById('addCustomMinutesBtn');

  if (dateInput) {
    dateInput.value = activeTaskDate;
    dateInput.addEventListener('change', (e) => {
      activeTaskDate = e.target.value;
      renderDailyTasks();
    });
  }

  if (todayBtn) {
    todayBtn.addEventListener('click', () => {
      activeTaskDate = getTodayDateString();
      if (dateInput) dateInput.value = activeTaskDate;
      renderDailyTasks();
    });
  }

  if (addCustomBtn) {
    addCustomBtn.addEventListener('click', () => {
      const nameInput = document.getElementById('customActivityName');
      const minsInput = document.getElementById('customActivityMins');
      const name = nameInput.value.trim() || 'Custom Study Session';
      const mins = parseInt(minsInput.value, 10);

      if (isNaN(mins) || mins <= 0) {
        showToast('Please enter a valid number of minutes.');
        return;
      }

      if (!state.dailyLogs[activeTaskDate]) {
        state.dailyLogs[activeTaskDate] = { mins: 0, tasks: {}, custom: [] };
      }
      if (!state.dailyLogs[activeTaskDate].custom) {
        state.dailyLogs[activeTaskDate].custom = [];
      }

      state.dailyLogs[activeTaskDate].custom.push({ name, mins });
      state.dailyLogs[activeTaskDate].mins += mins;
      saveState();

      nameInput.value = '';
      minsInput.value = '';
      renderDailyTasks();
      updateDashboardView();
      showToast(`Logged ${mins} mins for ${name}!`);
    });
  }

  renderDailyTasks();
}

function renderDailyTasks() {
  const container = document.getElementById('routineItemsContainer');
  if (!container) return;
  container.innerHTML = '';

  const dayLog = state.dailyLogs[activeTaskDate] || { mins: 0, tasks: {}, custom: [] };
  const goalMins = state.settings.dailyGoalMins || 90;

  // Determine if active viewing date is Sunday (Sunday = Light review only in user's roadmap)
  const dateObj = new Date(activeTaskDate + 'T00:00:00');
  const isSunday = dateObj.getDay() === 0;

  const routineItems = [
    {
      id: 'grammar',
      name: isSunday ? 'Sunday Weekly Revision & Consolidation' : 'Grammar & Vocabulary Lesson',
      desc: isSunday ? 'Light review day: revise the entire week, do not learn new topics' : 'Urdu-medium YouTube course, Nicos Weg modules, or PDF daily lesson',
      defaultMins: 25,
      icon: '📖'
    },
    {
      id: 'duolingo',
      name: 'Duolingo Daily Practice',
      desc: 'Consistency & habit building, 15–20 minutes',
      defaultMins: 20,
      icon: '🦉'
    },
    {
      id: 'anki',
      name: 'Anki Flashcard Review (Spaced Repetition)',
      desc: 'Non-negotiable rule: review your deck daily to lock words in long term',
      defaultMins: 20,
      icon: '⚡'
    },
    {
      id: 'listening',
      name: 'Listening & Speaking Practice',
      desc: 'Easy German video clip or repeating German sentences aloud',
      defaultMins: 15,
      icon: '🎧'
    }
  ];

  let tasksDone = 0;

  routineItems.forEach(item => {
    const isChecked = dayLog.tasks && dayLog.tasks[item.id];
    if (isChecked) tasksDone++;

    const card = document.createElement('div');
    card.className = `task-item-card ${isChecked ? 'completed' : ''}`;
    card.innerHTML = `
      <div class="task-item-left">
        <div class="custom-checkbox ${isChecked ? 'checked' : ''}" data-task="${item.id}"></div>
        <div>
          <span class="task-name">${item.icon} ${item.name}</span>
          <span class="task-desc">${item.desc}</span>
        </div>
      </div>
      <span class="task-mins-badge">+${item.defaultMins} min</span>
    `;

    const checkbox = card.querySelector('.custom-checkbox');
    checkbox.addEventListener('click', () => {
      toggleTask(activeTaskDate, item.id, item.defaultMins);
    });

    container.appendChild(card);
  });

  // Render any custom logged activities for this date
  if (dayLog.custom && dayLog.custom.length > 0) {
    const customHeader = document.createElement('h4');
    customHeader.style.margin = '1rem 0 0.5rem 0';
    customHeader.style.fontSize = '0.85rem';
    customHeader.style.color = 'var(--text-muted)';
    customHeader.textContent = 'Custom Sessions for this date:';
    container.appendChild(customHeader);

    dayLog.custom.forEach((c, idx) => {
      const cCard = document.createElement('div');
      cCard.className = 'task-item-card completed';
      cCard.innerHTML = `
        <div class="task-item-left">
          <span style="font-size:1.1rem;">⏱️</span>
          <div>
            <span class="task-name">${c.name}</span>
            <span class="task-desc">Custom logged session</span>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <span class="task-mins-badge">+${c.mins} min</span>
          <button class="btn-sm btn-outline" style="padding:0.2rem 0.5rem;" title="Delete">✕</button>
        </div>
      `;

      cCard.querySelector('button').addEventListener('click', () => {
        dayLog.mins -= c.mins;
        dayLog.custom.splice(idx, 1);
        saveState();
        renderDailyTasks();
        updateDashboardView();
      });

      container.appendChild(cCard);
    });
  }

  // Update Task summary stats
  const scorePercent = Math.round((tasksDone / routineItems.length) * 100);
  const scoreEl = document.getElementById('tasksScoreDisplay');
  if (scoreEl) scoreEl.textContent = `${scorePercent}%`;

  const totalLogEl = document.getElementById('taskTotalLoggedDisplay');
  if (totalLogEl) totalLogEl.textContent = `${dayLog.mins || 0} mins`;

  const goalDisplay = document.getElementById('taskGoalDisplay');
  if (goalDisplay) goalDisplay.textContent = `${goalMins} mins`;

  const statusBadge = document.getElementById('taskGoalStatusBadge');
  if (statusBadge) {
    if (dayLog.mins >= goalMins) {
      statusBadge.textContent = 'Goal Reached! 🌟';
      statusBadge.className = 'badge badge-accent';
    } else if (dayLog.mins > 0) {
      statusBadge.textContent = 'Partially Complete';
      statusBadge.className = 'badge';
    } else {
      statusBadge.textContent = 'Not Started';
      statusBadge.className = 'badge';
    }
  }

  const taskDayTitle = document.getElementById('taskDayTitle');
  if (taskDayTitle) {
    taskDayTitle.textContent = `${activeTaskDate} ${isSunday ? '· (Sunday: Light Review Day)' : ''}`;
  }

  const phaseLabel = document.getElementById('taskPhaseLabel');
  if (phaseLabel) {
    phaseLabel.textContent = state.settings.a2Unlocked ? 'Phase 2: A2 Active' : 'Phase 1: A1 Active';
  }
}

function toggleTask(dateKey, taskId, minutes) {
  if (!state.dailyLogs[dateKey]) {
    state.dailyLogs[dateKey] = { mins: 0, tasks: {}, custom: [] };
  }
  const log = state.dailyLogs[dateKey];
  if (!log.tasks) log.tasks = {};

  const wasChecked = !!log.tasks[taskId];
  log.tasks[taskId] = !wasChecked;

  if (!wasChecked) {
    log.mins = (log.mins || 0) + minutes;
  } else {
    log.mins = Math.max(0, (log.mins || 0) - minutes);
  }

  saveState();
  renderDailyTasks();
  updateDashboardView();
  updateTopBarStats();
}

// ==========================================================================
// 3. 16-WEEK ROADMAP (A1 & A2) & A2 LOCK POLICY
// ==========================================================================
let activeRoadmapFilter = 'all';

function initRoadmap() {
  const btnAll = document.getElementById('btnFilterAll');
  const btnA1 = document.getElementById('btnFilterA1');
  const btnA2 = document.getElementById('btnFilterA2');

  const filterBtns = [btnAll, btnA1, btnA2];
  filterBtns.forEach(btn => {
    if (!btn) return;
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (btn === btnAll) activeRoadmapFilter = 'all';
      if (btn === btnA1) activeRoadmapFilter = 'A1';
      if (btn === btnA2) activeRoadmapFilter = 'A2';
      renderRoadmap();
    });
  });

  const unlockBtn = document.getElementById('confirmUnlockA2Btn');
  if (unlockBtn) {
    unlockBtn.addEventListener('click', () => {
      const a1CompletedCount = Object.keys(state.completedDays).filter(d => Number(d) <= 56 && state.completedDays[d]).length;
      if (a1CompletedCount < 56) {
        alert(`You have completed ${a1CompletedCount}/56 A1 days. Please finish all 56 days of A1 first!`);
        return;
      }
      const confirmed = confirm("Herzlichen Glückwunsch! You have checked off all 56 days of A1. Confirm unlock of Phase 2 (A2 German)?");
      if (confirmed) {
        state.settings.a2Unlocked = true;
        saveState();
        renderRoadmap();
        updateDashboardView();
        updateTopBarStats();
        showToast("🎉 Phase 2: A2 German is now officially unlocked!");
      }
    });
  }

  renderRoadmap();
}

function toggleDayCompletion(dayNum) {
  state.completedDays[dayNum] = !state.completedDays[dayNum];
  saveState();
  renderRoadmap();
  updateDashboardView();
}

function renderRoadmap() {
  const container = document.getElementById('weeksAccordionContainer');
  if (!container) return;
  container.innerHTML = '';

  const a1CompletedCount = Object.keys(state.completedDays).filter(d => Number(d) <= 56 && state.completedDays[d]).length;
  const a1AllDone = a1CompletedCount >= 56;

  // Update Callout Status
  const a1CountEl = document.getElementById('a1ChecklistCount');
  if (a1CountEl) a1CountEl.textContent = `${a1CompletedCount} / 56`;

  const unlockBtn = document.getElementById('confirmUnlockA2Btn');
  const unlockReq = document.getElementById('unlockRequirementNote');
  if (unlockBtn) {
    if (state.settings.a2Unlocked) {
      unlockBtn.textContent = '✅ A2 Unlocked and Active';
      unlockBtn.disabled = true;
      if (unlockReq) unlockReq.textContent = 'All 112 roadmap days are accessible.';
    } else {
      unlockBtn.disabled = !a1AllDone;
      if (unlockReq) {
        unlockReq.textContent = a1AllDone ? 'Ready to unlock!' : `Complete ${56 - a1CompletedCount} more A1 day(s) to enable unlock.`;
      }
    }
  }

  ROADMAP_DATA.forEach(week => {
    // Filter by phase tab if chosen
    if (activeRoadmapFilter !== 'all' && week.phase !== activeRoadmapFilter) {
      return;
    }

    const isA2 = week.phase === 'A2';
    const isLocked = isA2 && !state.settings.a2Unlocked;

    const completedInWeek = week.days.filter(d => state.completedDays[d.day]).length;
    const weekAllDone = completedInWeek === week.days.length;

    const weekCard = document.createElement('div');
    weekCard.className = `week-card ${isLocked ? 'week-locked' : ''}`;

    weekCard.innerHTML = `
      <div class="week-header">
        <div class="week-title-wrap">
          <span class="week-badge ${isA2 ? 'a2-badge' : ''}">${isLocked ? '🔒 ' : ''}Week ${week.week} (${week.phase})</span>
          <strong style="font-size:0.95rem;">${week.title}</strong>
        </div>
        <div class="week-progress-indicator">
          ${isLocked ? '<span style="color:var(--accent-gold);">Locked until A1 done</span>' : `${completedInWeek} / 7 days done ${weekAllDone ? '✓' : ''}`}
        </div>
      </div>
      <div class="week-body" style="${week.week === 1 || completedInWeek > 0 ? '' : 'display: none;'}">
        <div class="week-goal-text"><strong>Weekly Goal:</strong> ${week.goal}</div>
        <div class="days-grid"></div>
        <div class="week-home-practice">
          <strong>🏠 Home Practice (Week ${week.week}):</strong>
          <p style="margin-top:0.3rem;">${week.homePractice}</p>
        </div>
      </div>
    `;

    // Collapsible accordion behavior
    const header = weekCard.querySelector('.week-header');
    const body = weekCard.querySelector('.week-body');
    header.addEventListener('click', () => {
      body.style.display = (body.style.display === 'none') ? 'block' : 'none';
    });

    const daysGrid = weekCard.querySelector('.days-grid');

    week.days.forEach(d => {
      const isDayDone = !!state.completedDays[d.day];
      const dayCard = document.createElement('div');
      dayCard.className = `day-item-card ${isDayDone ? 'completed' : ''}`;

      dayCard.innerHTML = `
        <div>
          <div class="day-top-row">
            <span class="day-num-tag">Day ${d.day}</span>
            <span style="font-size:0.75rem; color:var(--text-muted);">${week.phase}</span>
          </div>
          <p class="day-text">${d.topic}</p>
        </div>
        <div class="day-btn-row">
          <button class="btn-sm ${isDayDone ? 'btn-secondary' : 'btn-primary'}" data-day="${d.day}" ${isLocked ? 'disabled' : ''}>
            ${isDayDone ? 'Done ✓' : 'Mark Done'}
          </button>
          <button class="btn-sm btn-outline note-btn" data-day="${d.day}">
            📝 Notes
          </button>
        </div>
      `;

      // Complete toggle
      const markBtn = dayCard.querySelector('button[data-day]');
      markBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isLocked) {
          alert('Phase 2 is locked! Complete all 56 days of A1 first.');
          return;
        }
        toggleDayCompletion(d.day);
      });

      // Notes button
      const noteBtn = dayCard.querySelector('.note-btn');
      noteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        activeNoteDay = d.day;
        switchTab('notes');
        renderNotesSidebar();
        loadNoteForDay(d.day);
      });

      daysGrid.appendChild(dayCard);
    });

    container.appendChild(weekCard);
  });
}

// ==========================================================================
// 4. STUDY CALENDAR
// ==========================================================================
function initCalendar() {
  const prevBtn = document.getElementById('calPrevMonthBtn');
  const nextBtn = document.getElementById('calNextMonthBtn');
  const todayBtn = document.getElementById('calTodayBtn');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      activeCalendarMonth--;
      if (activeCalendarMonth < 0) {
        activeCalendarMonth = 11;
        activeCalendarYear--;
      }
      renderCalendar();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      activeCalendarMonth++;
      if (activeCalendarMonth > 11) {
        activeCalendarMonth = 0;
        activeCalendarYear++;
      }
      renderCalendar();
    });
  }

  if (todayBtn) {
    todayBtn.addEventListener('click', () => {
      const now = new Date();
      activeCalendarMonth = now.getMonth();
      activeCalendarYear = now.getFullYear();
      renderCalendar();
    });
  }

  renderCalendar();
}

function renderCalendar() {
  const label = document.getElementById('calMonthYearLabel');
  const grid = document.getElementById('calendarDaysGrid');
  if (!label || !grid) return;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  label.textContent = `${monthNames[activeCalendarMonth]} ${activeCalendarYear}`;
  grid.innerHTML = '';

  const firstDayIndex = new Date(activeCalendarYear, activeCalendarMonth, 1).getDay();
  // Adjust so Monday is 0 and Sunday is 6
  const startingDay = (firstDayIndex === 0) ? 6 : firstDayIndex - 1;
  const daysInMonth = new Date(activeCalendarYear, activeCalendarMonth + 1, 0).getDate();
  const prevMonthDays = new Date(activeCalendarYear, activeCalendarMonth, 0).getDate();

  const goalMins = state.settings.dailyGoalMins || 90;
  const todayStr = getTodayDateString();

  // Prev month padding cells
  for (let i = startingDay; i > 0; i--) {
    const dayNum = prevMonthDays - i + 1;
    const cell = document.createElement('div');
    cell.className = 'cal-day-cell other-month';
    cell.innerHTML = `<span class="cal-day-num">${dayNum}</span>`;
    grid.appendChild(cell);
  }

  // Current month cells
  for (let d = 1; d <= daysInMonth; d++) {
    const monthStr = String(activeCalendarMonth + 1).padStart(2, '0');
    const dayStr = String(d).padStart(2, '0');
    const dateKey = `${activeCalendarYear}-${monthStr}-${dayStr}`;

    const cell = document.createElement('div');
    const isToday = (dateKey === todayStr);
    const dayLog = state.dailyLogs[dateKey];
    const mins = dayLog ? (dayLog.mins || 0) : 0;

    let statusClass = 'dot-future';
    if (dateKey <= todayStr) {
      if (mins >= goalMins) statusClass = 'status-full';
      else if (mins > 0) statusClass = 'status-partial';
      else statusClass = 'status-missed';
    }

    cell.className = `cal-day-cell ${statusClass} ${isToday ? 'selected' : ''}`;
    cell.innerHTML = `
      <span class="cal-day-num">${d}</span>
      <span class="cal-day-mins">${mins > 0 ? mins + 'm' : (dateKey <= todayStr ? '0m' : '')}</span>
    `;

    cell.addEventListener('click', () => {
      document.querySelectorAll('.cal-day-cell').forEach(c => c.classList.remove('selected'));
      cell.classList.add('selected');
      renderCalendarDetail(dateKey, mins, dayLog);
    });

    grid.appendChild(cell);
  }

  // Pre-load today's detail
  renderCalendarDetail(todayStr, state.dailyLogs[todayStr]?.mins || 0, state.dailyLogs[todayStr]);
}

function renderCalendarDetail(dateKey, mins, log) {
  const title = document.getElementById('calDetailDate');
  const badge = document.getElementById('calDetailStatusBadge');
  const body = document.getElementById('calDetailBody');
  const goalMins = state.settings.dailyGoalMins || 90;

  if (title) title.textContent = `Study Record for ${dateKey}`;
  if (badge) {
    if (mins >= goalMins) {
      badge.textContent = 'Goal Completed 🌟';
      badge.className = 'badge badge-accent';
    } else if (mins > 0) {
      badge.textContent = `${mins} mins (Partial)`;
      badge.className = 'badge';
    } else {
      badge.textContent = 'No Study Logged';
      badge.className = 'badge';
    }
  }

  if (body) {
    const tasks = log && log.tasks ? log.tasks : {};
    const taskNames = [];
    if (tasks.grammar) taskNames.push('Grammar & Vocab');
    if (tasks.duolingo) taskNames.push('Duolingo');
    if (tasks.anki) taskNames.push('Anki Flashcards');
    if (tasks.listening) taskNames.push('Listening / Speaking');

    const journal = state.journalEntries[dateKey];

    body.innerHTML = `
      <p><strong>Total Study Time:</strong> ${mins} minutes (Daily Goal: ${goalMins} min)</p>
      <p style="margin-top:0.3rem;"><strong>Completed Rituals:</strong> ${taskNames.length > 0 ? taskNames.join(', ') : 'None'}</p>
      <p style="margin-top:0.3rem;"><strong>Journal Entry:</strong> ${journal ? `"${journal.slice(0, 120)}..."` : 'No journal entry recorded for this day.'}</p>
    `;
  }
}

// ==========================================================================
// 5. TOPIC NOTES
// ==========================================================================
function initNotes() {
  const phaseSelect = document.getElementById('notesPhaseSelect');
  const searchInput = document.getElementById('notesSearchInput');
  const saveBtn = document.getElementById('saveNoteBtn');
  const clearBtn = document.getElementById('clearNoteBtn');
  const textarea = document.getElementById('activeNoteTextarea');

  if (phaseSelect) {
    phaseSelect.addEventListener('change', renderNotesSidebar);
  }

  if (searchInput) {
    searchInput.addEventListener('input', renderNotesSidebar);
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      state.topicNotes[activeNoteDay] = textarea.value;
      saveState();
      const status = document.getElementById('noteSaveStatus');
      if (status) status.textContent = `Saved at ${new Date().toLocaleTimeString()} ✓`;
      showToast(`Notes for Day ${activeNoteDay} saved!`);
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (confirm(`Clear notes for Day ${activeNoteDay}?`)) {
        textarea.value = '';
        delete state.topicNotes[activeNoteDay];
        saveState();
      }
    });
  }

  renderNotesSidebar();
  loadNoteForDay(activeNoteDay);
}

function renderNotesSidebar() {
  const list = document.getElementById('notesTopicList');
  if (!list) return;
  list.innerHTML = '';

  const phase = document.getElementById('notesPhaseSelect')?.value || 'A1';
  const query = (document.getElementById('notesSearchInput')?.value || '').toLowerCase();

  ROADMAP_DATA.forEach(week => {
    if (week.phase !== phase) return;
    week.days.forEach(d => {
      if (query && !d.topic.toLowerCase().includes(query) && !String(d.day).includes(query)) {
        return;
      }
      const item = document.createElement('div');
      item.className = `topic-list-item ${d.day === activeNoteDay ? 'active' : ''}`;
      item.innerHTML = `
        <span class="topic-item-day">Day ${d.day} (${week.phase})</span>
        <span class="topic-item-title">${d.topic}</span>
      `;
      item.addEventListener('click', () => {
        activeNoteDay = d.day;
        document.querySelectorAll('.topic-list-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        loadNoteForDay(d.day);
      });
      list.appendChild(item);
    });
  });
}

function loadNoteForDay(dayNum) {
  let target = null;
  ROADMAP_DATA.forEach(w => {
    const found = w.days.find(d => d.day === dayNum);
    if (found) target = { ...found, week: w.week, phase: w.phase };
  });

  const titleEl = document.getElementById('activeNoteDayTitle');
  const subEl = document.getElementById('activeNoteSubtitle');
  const textarea = document.getElementById('activeNoteTextarea');
  const statusEl = document.getElementById('noteSaveStatus');

  if (target) {
    if (titleEl) titleEl.textContent = `Day ${target.day} Notes (${target.phase})`;
    if (subEl) subEl.textContent = target.topic;
  }
  if (textarea) {
    textarea.value = state.topicNotes[dayNum] || '';
  }
  if (statusEl) {
    statusEl.textContent = state.topicNotes[dayNum] ? 'Notes loaded.' : 'No notes written yet.';
  }
}

// ==========================================================================
// 6. DAILY JOURNAL
// ==========================================================================
function initJournal() {
  const picker = document.getElementById('journalDatePicker');
  const todayBtn = document.getElementById('journalTodayBtn');
  const saveBtn = document.getElementById('saveJournalBtn');
  const textarea = document.getElementById('journalTextarea');

  if (picker) {
    picker.value = activeJournalDate;
    picker.addEventListener('change', (e) => {
      activeJournalDate = e.target.value;
      loadJournalForDate(activeJournalDate);
    });
  }

  if (todayBtn) {
    todayBtn.addEventListener('click', () => {
      activeJournalDate = getTodayDateString();
      if (picker) picker.value = activeJournalDate;
      loadJournalForDate(activeJournalDate);
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const text = textarea.value.trim();
      state.journalEntries[activeJournalDate] = text;
      saveState();
      renderJournalHistory();
      showToast(`Journal entry for ${activeJournalDate} saved!`);
    });
  }

  if (textarea) {
    textarea.addEventListener('input', () => {
      const count = textarea.value.trim().split(/\s+/).filter(Boolean).length;
      const countEl = document.getElementById('journalWordCount');
      if (countEl) countEl.textContent = `${count} word${count === 1 ? '' : 's'} written`;
    });
  }

  loadJournalForDate(activeJournalDate);
  renderJournalHistory();
}

function loadJournalForDate(dateKey) {
  const textarea = document.getElementById('journalTextarea');
  const title = document.getElementById('journalEntryTitle');
  if (title) title.textContent = `Journal Entry for ${dateKey}`;

  if (textarea) {
    textarea.value = state.journalEntries[dateKey] || '';
    const count = textarea.value.trim().split(/\s+/).filter(Boolean).length;
    const countEl = document.getElementById('journalWordCount');
    if (countEl) countEl.textContent = `${count} word${count === 1 ? '' : 's'} written`;
  }
}

function renderJournalHistory() {
  const list = document.getElementById('journalHistoryList');
  const countBadge = document.getElementById('journalTotalEntriesCount');
  if (!list) return;
  list.innerHTML = '';

  const entries = Object.keys(state.journalEntries).filter(k => state.journalEntries[k] && state.journalEntries[k].trim() !== '');
  if (countBadge) countBadge.textContent = `${entries.length} entries`;

  if (entries.length === 0) {
    list.innerHTML = `<p class="text-muted text-center" style="padding:1rem;">No past journal entries yet. Write your first reflection today!</p>`;
    return;
  }

  // Sort descending by date
  entries.sort().reverse().forEach(dateKey => {
    const text = state.journalEntries[dateKey];
    const item = document.createElement('div');
    item.className = 'journal-entry-item';
    item.innerHTML = `
      <div class="journal-entry-date">${dateKey}</div>
      <div class="journal-entry-preview">${text}</div>
    `;
    item.addEventListener('click', () => {
      activeJournalDate = dateKey;
      const picker = document.getElementById('journalDatePicker');
      if (picker) picker.value = dateKey;
      loadJournalForDate(dateKey);
    });
    list.appendChild(item);
  });
}

// ==========================================================================
// 7. VOCABULARY BANK (German, English, Urdu)
// ==========================================================================
function initVocabulary() {
  const form = document.getElementById('vocabForm');
  const searchInput = document.getElementById('vocabFilterInput');
  const genderFilter = document.getElementById('vocabFilterGender');
  const levelFilter = document.getElementById('vocabFilterLevel');

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const gender = document.getElementById('vocabGender').value;
      const german = document.getElementById('vocabGerman').value.trim();
      const english = document.getElementById('vocabEnglish').value.trim();
      const urdu = document.getElementById('vocabUrdu').value.trim();
      const example = document.getElementById('vocabExample').value.trim();
      const level = document.getElementById('vocabLevel').value;

      if (!german || !english) {
        showToast('Please provide at least the German word and English meaning.');
        return;
      }

      const newWord = {
        id: 'w_' + Date.now(),
        gender,
        german,
        english,
        urdu,
        example,
        level
      };

      state.vocabulary.unshift(newWord);
      saveState();

      form.reset();
      renderVocabulary();
      showToast(`Added "${german}" to your vocabulary bank!`);
    });
  }

  if (searchInput) searchInput.addEventListener('input', renderVocabulary);
  if (genderFilter) genderFilter.addEventListener('change', renderVocabulary);
  if (levelFilter) levelFilter.addEventListener('change', renderVocabulary);

  renderVocabulary();
}

function renderVocabulary() {
  const tbody = document.getElementById('vocabTableBody');
  const countBadge = document.getElementById('vocabCountBadge');
  if (!tbody) return;
  tbody.innerHTML = '';

  const query = (document.getElementById('vocabFilterInput')?.value || '').toLowerCase();
  const genderFilter = document.getElementById('vocabFilterGender')?.value || 'all';
  const levelFilter = document.getElementById('vocabFilterLevel')?.value || 'all';

  const filtered = state.vocabulary.filter(v => {
    if (genderFilter !== 'all' && v.gender !== genderFilter) return false;
    if (levelFilter !== 'all' && v.level !== levelFilter) return false;
    if (query) {
      const matchDe = v.german.toLowerCase().includes(query);
      const matchEn = v.english.toLowerCase().includes(query);
      const matchUr = (v.urdu || '').toLowerCase().includes(query);
      if (!matchDe && !matchEn && !matchUr) return false;
    }
    return true;
  });

  if (countBadge) countBadge.textContent = `${filtered.length} words saved`;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding:1.5rem;">No vocabulary words found.</td></tr>`;
    return;
  }

  filtered.forEach(v => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <button class="btn-sm btn-outline speak-word-btn" style="padding:0.2rem 0.5rem;" title="Listen to German audio">🔊</button>
      </td>
      <td>
        <span class="gender-tag gender-${v.gender.split(' ')[0]}">${v.gender}</span>
        <strong>${v.german}</strong>
      </td>
      <td>${v.english}</td>
      <td class="urdu-col urdu-text">${v.urdu || '—'}</td>
      <td style="font-size:0.8rem; color:var(--text-muted);">${v.example || '—'}</td>
      <td><span class="badge">${v.level}</span></td>
      <td>
        <button class="btn-sm btn-danger delete-word-btn" style="padding:0.2rem 0.5rem;" title="Delete">✕</button>
      </td>
    `;

    tr.querySelector('.speak-word-btn').addEventListener('click', () => {
      const phrase = (v.gender.startsWith('der') || v.gender.startsWith('die') || v.gender.startsWith('das'))
        ? `${v.gender} ${v.german}`
        : v.german;
      speakGermanText(phrase);
    });

    tr.querySelector('.delete-word-btn').addEventListener('click', () => {
      if (confirm(`Delete "${v.german}" from your vocabulary bank?`)) {
        state.vocabulary = state.vocabulary.filter(item => item.id !== v.id);
        saveState();
        renderVocabulary();
      }
    });

    tbody.appendChild(tr);
  });
}

// ==========================================================================
// 8. TRANSLATOR & OFFLINE DICTIONARY
// ==========================================================================
function initTranslator() {
  const searchInput = document.getElementById('dictSearchQuery');
  const searchBtn = document.getElementById('dictSearchBtn');
  const onlineBadge = document.getElementById('onlineStatusBadge');

  if (searchBtn && searchInput) {
    searchBtn.addEventListener('click', performDictionarySearch);
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') performDictionarySearch();
    });
  }

  function updateOnlineStatus() {
    if (!onlineBadge) return;
    if (navigator.onLine) {
      onlineBadge.textContent = '🟢 Online (External tools active)';
      onlineBadge.className = 'badge badge-accent';
    } else {
      onlineBadge.textContent = '🟡 Offline Mode (Local dictionary only)';
      onlineBadge.className = 'badge';
    }
  }

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();
}

function performDictionarySearch() {
  const query = document.getElementById('dictSearchQuery')?.value.trim().toLowerCase();
  const resultsBox = document.getElementById('dictResultsBox');
  if (!resultsBox) return;

  if (!query) {
    resultsBox.innerHTML = '<p class="text-muted text-center" style="padding:1rem;">Please enter a search term.</p>';
    return;
  }

  const matches = state.vocabulary.filter(v => {
    return v.german.toLowerCase().includes(query) ||
           v.english.toLowerCase().includes(query) ||
           (v.urdu && v.urdu.toLowerCase().includes(query));
  });

  if (matches.length === 0) {
    resultsBox.innerHTML = `
      <div style="padding:1rem; text-align:center;">
        <p class="text-muted">No matches in your local vocabulary bank for "<strong>${query}</strong>".</p>
        <p style="font-size:0.8rem; margin-top:0.5rem;">Tip: You can add it into your Vocabulary Bank tab or use DeepL / Google Translate when online.</p>
      </div>
    `;
    return;
  }

  resultsBox.innerHTML = '';
  matches.forEach(m => {
    const item = document.createElement('div');
    item.className = 'dict-result-item';
    item.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <span class="gender-tag gender-${m.gender.split(' ')[0]}">${m.gender}</span>
          <strong style="font-size:1.1rem;">${m.german}</strong>
          <span style="margin: 0 0.5rem; color:var(--text-dim);">→</span>
          <span style="font-weight:600;">${m.english}</span>
          <span class="urdu-text" style="margin-left:0.75rem; color:var(--primary-text);">${m.urdu || ''}</span>
        </div>
        <button class="btn-sm btn-outline speak-dict-btn">🔊 Listen</button>
      </div>
      ${m.example ? `<p style="font-size:0.82rem; color:var(--text-muted); margin-top:0.4rem;"><em>Example:</em> ${m.example}</p>` : ''}
    `;
    item.querySelector('.speak-dict-btn').addEventListener('click', () => {
      speakGermanText(m.german);
    });
    resultsBox.appendChild(item);
  });
}

// ==========================================================================
// 9. PRONUNCIATION PRACTICE (Web Speech API)
// ==========================================================================
let germanVoices = [];

function initPronunciation() {
  const voiceSelect = document.getElementById('germanVoiceSelect');
  const playBtn = document.getElementById('playPronounceBtn');
  const stopBtn = document.getElementById('stopPronounceBtn');
  const rateSlider = document.getElementById('speechRate');
  const pitchSlider = document.getElementById('speechPitch');
  const rateVal = document.getElementById('rateVal');
  const pitchVal = document.getElementById('pitchVal');

  if (rateSlider && rateVal) {
    rateSlider.addEventListener('input', () => {
      rateVal.textContent = `${rateSlider.value}x`;
    });
  }

  if (pitchSlider && pitchVal) {
    pitchSlider.addEventListener('input', () => {
      pitchVal.textContent = pitchSlider.value;
    });
  }

  // Populate browser voices
  function loadVoices() {
    if (!('speechSynthesis' in window)) return;
    const all = window.speechSynthesis.getVoices();
    germanVoices = all.filter(v => v.lang.startsWith('de'));

    if (voiceSelect) {
      voiceSelect.innerHTML = '';
      if (germanVoices.length > 0) {
        germanVoices.forEach((v, idx) => {
          const opt = document.createElement('option');
          opt.value = idx;
          opt.textContent = `${v.name} (${v.lang})`;
          voiceSelect.appendChild(opt);
        });
      } else {
        const opt = document.createElement('option');
        opt.textContent = 'Default German Voice';
        voiceSelect.appendChild(opt);
      }
    }
  }

  loadVoices();
  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  if (playBtn) {
    playBtn.addEventListener('click', () => {
      const text = document.getElementById('pronounceTextInput')?.value.trim();
      if (!text) {
        showToast('Please type something for German speech synthesis.');
        return;
      }
      speakGermanText(text);
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener('click', () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    });
  }

  renderPronunciationDrills();
}

function speakGermanText(text) {
  if (!('speechSynthesis' in window)) {
    alert('Sorry, text-to-speech is not supported by your browser.');
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'de-DE';

  const rate = parseFloat(document.getElementById('speechRate')?.value || 0.9);
  const pitch = parseFloat(document.getElementById('speechPitch')?.value || 1.0);
  utterance.rate = rate;
  utterance.pitch = pitch;

  const voiceSelect = document.getElementById('germanVoiceSelect');
  if (voiceSelect && germanVoices.length > 0) {
    const chosenIndex = parseInt(voiceSelect.value, 10);
    if (!isNaN(chosenIndex) && germanVoices[chosenIndex]) {
      utterance.voice = germanVoices[chosenIndex];
    }
  }

  window.speechSynthesis.speak(utterance);
}

function renderPronunciationDrills() {
  const container = document.getElementById('pronounceDrillsList');
  if (!container) return;
  container.innerHTML = '';

  PRONUNCIATION_DRILLS.forEach(drill => {
    const item = document.createElement('div');
    item.className = 'drill-item';
    item.innerHTML = `
      <div>
        <span class="drill-de">${drill.de}</span>
        <span class="drill-trans">${drill.en} · <span class="urdu-text" style="font-size:0.9rem;">${drill.ur}</span></span>
      </div>
      <button class="btn-sm btn-primary drill-play-btn">🔊 Listen</button>
    `;

    item.querySelector('.drill-play-btn').addEventListener('click', () => {
      speakGermanText(drill.de);
    });

    container.appendChild(item);
  });
}

// ==========================================================================
// 10. WEEKLY REPORT
// ==========================================================================
function initWeeklyReport() {
  const select = document.getElementById('reportWeekSelect');
  if (!select) return;

  select.innerHTML = '';
  ROADMAP_DATA.forEach(w => {
    const opt = document.createElement('option');
    opt.value = w.week;
    opt.textContent = `Week ${w.week}: ${w.title} (${w.phase})`;
    select.appendChild(opt);
  });

  select.addEventListener('change', renderWeeklyReport);
  renderWeeklyReport();
}

function renderWeeklyReport() {
  const select = document.getElementById('reportWeekSelect');
  const weekNum = parseInt(select?.value || 1, 10);
  const weekData = ROADMAP_DATA.find(w => w.week === weekNum) || ROADMAP_DATA[0];

  const badge = document.getElementById('reportWeekBadge');
  if (badge) badge.textContent = `Week ${weekData.week} (${weekData.phase})`;

  // Calculate stats for roadmap lessons in this week
  const completedLessonsInWeek = weekData.days.filter(d => state.completedDays[d.day]).length;
  const lessonsEl = document.getElementById('reportLessonsDone');
  if (lessonsEl) lessonsEl.textContent = `${completedLessonsInWeek} / 7`;

  // Aggregate past 7 days logged time as sample week window
  let totalMins = 0;
  let daysActive = 0;
  const taskTotals = { grammar: 0, duolingo: 0, anki: 0, listening: 0 };

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = getTodayDateString(d);
    const log = state.dailyLogs[key];
    if (log && log.mins > 0) {
      totalMins += log.mins;
      daysActive++;
      if (log.tasks) {
        if (log.tasks.grammar) taskTotals.grammar += 25;
        if (log.tasks.duolingo) taskTotals.duolingo += 20;
        if (log.tasks.anki) taskTotals.anki += 20;
        if (log.tasks.listening) taskTotals.listening += 15;
      }
    }
  }

  const timeEl = document.getElementById('reportTotalTime');
  if (timeEl) timeEl.textContent = `${totalMins} min`;

  const daysActiveEl = document.getElementById('reportDaysActive');
  if (daysActiveEl) daysActiveEl.textContent = `${daysActive} / 7`;

  const vocabAddedEl = document.getElementById('reportVocabAdded');
  if (vocabAddedEl) vocabAddedEl.textContent = state.vocabulary.length;

  // Activity breakdown bars
  const barsContainer = document.getElementById('activityBarsContainer');
  if (barsContainer) {
    barsContainer.innerHTML = '';
    const items = [
      { name: 'Grammar & Vocab Lessons', mins: taskTotals.grammar, color: 'var(--primary)' },
      { name: 'Duolingo Daily Sessions', mins: taskTotals.duolingo, color: 'var(--accent-gold)' },
      { name: 'Anki Spaced Flashcards', mins: taskTotals.anki, color: 'var(--accent-blue)' },
      { name: 'Listening & Audio Drills', mins: taskTotals.listening, color: 'var(--accent-purple)' }
    ];

    const maxMins = Math.max(1, ...items.map(i => i.mins));

    items.forEach(it => {
      const percent = Math.min(100, Math.round((it.mins / maxMins) * 100));
      const row = document.createElement('div');
      row.className = 'activity-bar-row';
      row.innerHTML = `
        <div class="activity-bar-label">
          <span>${it.name}</span>
          <strong>${it.mins} min</strong>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width: ${percent}%; background: ${it.color};"></div>
        </div>
      `;
      barsContainer.appendChild(row);
    });
  }

  // Weekly Home practice from PDF
  const homeBox = document.getElementById('weeklyHomePracticeContainer');
  if (homeBox) {
    homeBox.innerHTML = `
      <p style="font-weight:700; margin-bottom:0.5rem; color:var(--text-main);">
        🎯 Goal: ${weekData.goal}
      </p>
      <p style="color:var(--text-muted); font-size:0.9rem;">
        ${weekData.homePractice}
      </p>
    `;
  }
}

// ==========================================================================
// 11. SETTINGS & THEMES
// ==========================================================================
function initSettings() {
  const goalInput = document.getElementById('settingDailyGoalMins');
  const nameInput = document.getElementById('settingLearnerName');
  const saveBtn = document.getElementById('saveSettingsBtn');

  if (goalInput) goalInput.value = state.settings.dailyGoalMins || 90;
  if (nameInput) nameInput.value = state.settings.learnerName || 'Student';

  // Theme choices
  const themeButtons = document.querySelectorAll('.theme-choice-btn');
  themeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      themeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const theme = btn.getAttribute('data-set-theme');
      state.settings.theme = theme;
      applyThemeAndAccent();
      saveState();
    });
  });

  // Accent color dots
  const colorDots = document.querySelectorAll('.color-dot');
  colorDots.forEach(dot => {
    dot.addEventListener('click', () => {
      colorDots.forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
      const accent = dot.getAttribute('data-color');
      state.settings.accent = accent;
      applyThemeAndAccent();
      saveState();
    });
  });

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const goalVal = parseInt(goalInput.value, 10);
      if (!isNaN(goalVal) && goalVal >= 15 && goalVal <= 360) {
        state.settings.dailyGoalMins = goalVal;
      }
      state.settings.learnerName = nameInput.value.trim() || 'Student';
      saveState();
      updateDashboardView();
      renderDailyTasks();
      updateTopBarStats();
      showToast('Settings saved successfully!');
    });
  }
}

function applyThemeAndAccent() {
  const theme = state.settings.theme || 'dark';
  const accent = state.settings.accent || 'emerald';

  document.body.setAttribute('data-theme', theme);
  document.body.setAttribute('data-accent', accent);

  // Sync settings UI buttons if on page
  document.querySelectorAll('.theme-choice-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-set-theme') === theme);
  });
  document.querySelectorAll('.color-dot').forEach(dot => {
    dot.classList.toggle('active', dot.getAttribute('data-color') === accent);
  });
}

// ==========================================================================
// 12. BACKUP & EXPORT / IMPORT
// ==========================================================================
function initBackup() {
  const exportBtn = document.getElementById('exportDataBtn');
  const importBtn = document.getElementById('importDataBtn');
  const resetBtn = document.getElementById('resetDataBtn');
  const fileInput = document.getElementById('importFileInput');
  const backupDisplay = document.getElementById('lastBackupDisplay');

  if (backupDisplay && state.settings.lastBackupDate) {
    backupDisplay.textContent = `Last Export: ${state.settings.lastBackupDate}`;
  }

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const now = new Date();
      state.settings.lastBackupDate = now.toLocaleDateString();
      saveState();

      const jsonStr = JSON.stringify(state, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `deutschpath_backup_${getTodayDateString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (backupDisplay) backupDisplay.textContent = `Last Export: ${state.settings.lastBackupDate}`;
      showToast('Backup JSON downloaded successfully!');
    });
  }

  if (importBtn && fileInput) {
    importBtn.addEventListener('click', () => {
      const file = fileInput.files[0];
      if (!file) {
        showToast('Please select a .json backup file first.');
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target.result);
          if (imported.completedDays && imported.dailyLogs) {
            state = imported;
            saveState();
            applyThemeAndAccent();
            updateDashboardView();
            renderRoadmap();
            renderDailyTasks();
            renderVocabulary();
            showToast('Progress successfully restored from backup!');
            setTimeout(() => window.location.reload(), 1200);
          } else {
            alert('Invalid DeutschPath backup file format.');
          }
        } catch (err) {
          console.error(err);
          alert('Could not parse the backup file.');
        }
      };
      reader.readAsText(file);
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      const first = confirm('⚠️ Are you sure you want to reset all your learning progress? This cannot be undone.');
      if (first) {
        const second = prompt('Type RESET in all capital letters to confirm:');
        if (second === 'RESET') {
          localStorage.removeItem(STORAGE_KEY);
          state = { ...defaultAppState };
          saveState();
          alert('DeutschPath has been reset to Day 1.');
          window.location.reload();
        }
      }
    });
  }
}
