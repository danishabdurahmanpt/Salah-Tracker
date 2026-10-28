
const prayers = [
  { name: "Fajr", symbol: "☾" },
  { name: "Dhuhr", symbol: "☀" },
  { name: "Asr", symbol: "◷" },
  { name: "Maghrib", symbol: "◉" },
  { name: "Isha", symbol: "☽" }
];

const CITY = "Kozhikode";
const COUNTRY = "India";
const STATE = "Kerala";

const CALCULATION_METHOD = 1;
const ASR_SCHOOL = 0;

const list = document.getElementById("prayerList");

let prayerTimes = {};
let tomorrowFajr = null;
let currentDay = getTodayKey();
let loadingTimings = false;
let timingsError = false;

let calendarDate = new Date();
let selectedDateKey = getTodayKey();

function getTodayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function dateFromKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatApiDate(date) {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();

  return `${d}-${m}-${y}`;
}

function getSavedData(dateKey = getTodayKey()) {
  try {
    return JSON.parse(
      localStorage.getItem("salahtrack-" + dateKey)
    ) || {};
  } catch (error) {
    return {};
  }
}

function saveData(data, dateKey = getTodayKey()) {
  localStorage.setItem(
    "salahtrack-" + dateKey,
    JSON.stringify(data)
  );
}

function isDayComplete(dateKey) {
  const data = getSavedData(dateKey);

  return prayers.every(
    prayer => data[prayer.name] === "prayed"
  );
}

function getRecordedCount(dateKey) {
  const data = getSavedData(dateKey);

  return prayers.filter(
    prayer => data[prayer.name] === "prayed"
  ).length;
}

function getAllRecordedDates() {
  const dates = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);

    if (key && /^salahtrack-\d{4}-\d{2}-\d{2}$/.test(key)) {
      dates.push(key.replace("salahtrack-", ""));
    }
  }

  return dates.sort();
}

function parsePrayerTime(timeString, date = new Date()) {
  const match = String(timeString).match(/(\d{1,2}):(\d{2})/);

  if (!match) {
    throw new Error("Invalid prayer time: " + timeString);
  }

  const result = new Date(date);
  result.setHours(Number(match[1]), Number(match[2]), 0, 0);

  return result;
}

function formatTime(date) {
  if (!date) return "--:--";

  return date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata"
  });
}

async function fetchTimingsForDate(date) {
  const params = new URLSearchParams({
    city: CITY,
    country: COUNTRY,
    state: STATE,
    method: String(CALCULATION_METHOD),
    school: String(ASR_SCHOOL),
    timezonestring: "Asia/Kolkata"
  });

  const url =
    "https://api.aladhan.com/v1/timingsByCity/" +
    `${formatApiDate(date)}?${params}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Prayer-time service returned an error.");
  }

  const result = await response.json();

  if (result.code !== 200 || !result.data?.timings) {
    throw new Error("Prayer timings were not returned.");
  }

  return result.data.timings;
}

async function loadPrayerTimings() {
  if (loadingTimings) return;

  loadingTimings = true;
  timingsError = false;

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  document.getElementById("location").textContent =
    `Loading prayer times for ${CITY}, ${STATE}...`;

  try {
    const [todayData, tomorrowData] = await Promise.all([
      fetchTimingsForDate(today),
      fetchTimingsForDate(tomorrow)
    ]);

    if (getTodayKey() !== currentDay) return;

    const newTimes = {};

    prayers.forEach(prayer => {
      newTimes[prayer.name] = parsePrayerTime(
        todayData[prayer.name],
        today
      );
    });

    prayerTimes = newTimes;
    tomorrowFajr = parsePrayerTime(tomorrowData.Fajr, tomorrow);

    document.getElementById("location").textContent =
      `${CITY}, ${STATE}, ${COUNTRY} · Asia/Kolkata`;

    renderPrayers();
    updateNextPrayer();
  } catch (error) {
    console.error("Could not load prayer timings:", error);
    timingsError = true;

    document.getElementById("location").textContent =
      "Couldn't load prayer times. Check your internet and refresh.";

    document.getElementById("nextName").textContent =
      "Timings unavailable";

    document.getElementById("nextTime").textContent = "--:--";
    document.getElementById("nextMessage").textContent =
      "Please check your internet connection.";
    document.getElementById("countdown").textContent =
      "Waiting for connection";

    renderPrayers();
  } finally {
    loadingTimings = false;
  }
}

function renderPrayers() {
  const saved = getSavedData();

  const messages = {
    pending: "Keep up your daily routine",
    prayed: "Prayer completed",
    missed: "Marked as missed"
  };

  list.innerHTML = prayers.map(prayer => {
    const status = saved[prayer.name] || "pending";
    const time = prayerTimes[prayer.name];

    return `
      <article class="prayer-card">
        <div class="prayer-left">
          <div class="prayer-symbol">${prayer.symbol}</div>
          <div>
            <h3>${prayer.name}</h3>
            <p>${messages[status] || messages.pending}</p>
          </div>
        </div>

        <div class="prayer-actions">
          <span class="prayer-time">
            ${time ? formatTime(time) : "--:--"}
          </span>

          <div class="status-buttons">
            ${["pending", "prayed", "missed"].map(statusOption => `
              <button
                type="button"
                class="status-btn ${statusOption} ${
                  status === statusOption ? "active" : ""
                }"
                data-prayer="${prayer.name}"
                data-status="${statusOption}"
                aria-pressed="${status === statusOption}">
                ${statusOption.charAt(0).toUpperCase() + statusOption.slice(1)}
              </button>
            `).join("")}
          </div>
        </div>
      </article>
    `;
  }).join("");

  list.querySelectorAll(".status-btn").forEach(button => {
    button.addEventListener("click", event => {
      const target = event.currentTarget;
      const data = getSavedData();

      data[target.dataset.prayer] = target.dataset.status;

      saveData(data);
      renderPrayers();
    });
  });

  updateProgress();
}

function updateProgress() {
  const data = getSavedData();

  const completed = prayers.filter(
    prayer => data[prayer.name] === "prayed"
  ).length;

  const percent = Math.round(completed / prayers.length * 100);

  document.getElementById("progressCount").textContent =
    `${completed} / ${prayers.length}`;

  document.getElementById("progressPercent").textContent =
    `${percent}%`;

  document.getElementById("progressFill").style.width =
    `${percent}%`;

  renderHistoryStats();
  renderCalendar();
  renderSelectedDay();
}

function renderHistoryStats() {
  const todayKey = getTodayKey();
  const todayComplete = isDayComplete(todayKey);

  // If today's prayers are not all complete yet,
  // the current streak can continue from yesterday.
  let streak = 0;
  const streakStart = dateFromKey(todayKey);

  if (!todayComplete) {
    streakStart.setDate(streakStart.getDate() - 1);
  }

  while (true) {
    const key = getTodayKey(streakStart);

    if (!isDayComplete(key)) break;

    streak++;
    streakStart.setDate(streakStart.getDate() - 1);
  }

  // Calculate the best streak from dates actually recorded.
  const completeDates = getAllRecordedDates()
    .filter(key => key <= todayKey && isDayComplete(key));

  let bestStreak = 0;
  let runningStreak = 0;
  let previousDate = null;

  completeDates.forEach(key => {
    const date = dateFromKey(key);

    if (previousDate) {
      const difference = Math.round(
        (date - previousDate) / 86400000
      );

      runningStreak = difference === 1 ? runningStreak + 1 : 1;
    } else {
      runningStreak = 1;
    }

    bestStreak = Math.max(bestStreak, runningStreak);
    previousDate = date;
  });

  // Last seven calendar days, including today.
  let weekCompleted = 0;
  const weekDate = new Date();

  for (let i = 0; i < 7; i++) {
    weekCompleted += getRecordedCount(getTodayKey(weekDate));
    weekDate.setDate(weekDate.getDate() - 1);
  }

  const weekPercent = Math.round(weekCompleted / 35 * 100);

  document.getElementById("currentStreak").textContent =
    `${streak} ${streak === 1 ? "day" : "days"}`;

  document.getElementById("bestStreak").textContent =
    `${bestStreak} ${bestStreak === 1 ? "day" : "days"}`;

  document.getElementById("weekCount").textContent =
    `${weekCompleted} / 35`;

  document.getElementById("weekNote").textContent =
    `${weekPercent}% of this week's prayers`;

  document.getElementById("weekFill").style.width =
    `${weekPercent}%`;
}

function renderCalendar() {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();

  document.getElementById("calendarMonth").textContent =
    calendarDate.toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric"
    });

  const grid = document.getElementById("calendarGrid");
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Convert Sunday-first index to Monday-first.
  const startingOffset = (firstDay + 6) % 7;
  const todayKey = getTodayKey();

  let html = "";

  for (let i = 0; i < startingOffset; i++) {
    html += `<span class="calendar-empty"></span>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const key = getTodayKey(date);
    const data = getSavedData(key);

    const isFuture = key > todayKey;
    const complete = isDayComplete(key);
    const hasMissed = prayers.some(
      prayer => data[prayer.name] === "missed"
    );
    const hasRecords = prayers.some(
      prayer => ["prayed", "missed"].includes(data[prayer.name])
    );

    let classes = "calendar-day";

    if (complete) {
      classes += " complete";
    } else if (hasMissed) {
      classes += " missed";
    } else if (hasRecords) {
      classes += " partial";
    }

    if (key === todayKey) classes += " today";
    if (key === selectedDateKey) classes += " selected";
    if (isFuture) classes += " future";

    html += `
      <button
        type="button"
        class="${classes}"
        data-date="${key}"
        ${isFuture ? "disabled" : ""}
        aria-label="${key}${complete ? ", all prayers completed" : ""}"
        ${key === selectedDateKey ? 'aria-pressed="true"' : 'aria-pressed="false"'}>
        ${day}
      </button>
    `;
  }

  grid.innerHTML = html;

  grid.querySelectorAll(".calendar-day:not(.future)").forEach(button => {
    button.addEventListener("click", () => {
      selectedDateKey = button.dataset.date;
      renderCalendar();
      renderSelectedDay();
    });
  });

  const nextMonthButton = document.getElementById("nextMonth");
  const currentMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1
  );

  const displayedMonth = new Date(year, month, 1);
  nextMonthButton.disabled = displayedMonth >= currentMonth;
}

function renderSelectedDay() {
  const key = selectedDateKey;
  const data = getSavedData(key);
  const date = dateFromKey(key);
  const todayKey = getTodayKey();

  document.getElementById("selectedDateTitle").textContent =
    key === todayKey
      ? "Today's record"
      : date.toLocaleDateString("en-IN", {
          day: "numeric",
          month: "long",
          year: "numeric"
        });

  const completed = getRecordedCount(key);

  document.getElementById("selectedDayCount").textContent =
    `${completed} / 5`;

  const hasRecords = prayers.some(
    prayer => ["prayed", "missed"].includes(data[prayer.name])
  );

  document.getElementById("historyEmpty").hidden = hasRecords;

  document.getElementById("detailPrayers").innerHTML = prayers.map(prayer => {
    const status = data[prayer.name] || "pending";

    const label = {
      prayed: "Prayed",
      missed: "Missed",
      pending: "Not recorded"
    }[status] || "Not recorded";

    return `
      <div class="detail-prayer">
        <span>${prayer.name}</span>
        <span class="detail-status ${status}">${label}</span>
      </div>
    `;
  }).join("");
}

document.getElementById("prevMonth").addEventListener("click", () => {
  calendarDate.setMonth(calendarDate.getMonth() - 1);
  renderCalendar();
});

document.getElementById("nextMonth").addEventListener("click", () => {
  const now = new Date();
  const next = new Date(
    calendarDate.getFullYear(),
    calendarDate.getMonth() + 1,
    1
  );
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  if (next <= currentMonth) {
    calendarDate = next;
    renderCalendar();
  }
});

function updateClock() {
  const now = new Date();

  document.getElementById("clock").textContent =
    now.toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });

  document.getElementById("today").textContent =
    now.toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric"
    });
}

function updateNextPrayer() {
  if (timingsError || Object.keys(prayerTimes).length === 0) {
    return;
  }

  const now = new Date();
  let next = null;

  for (const prayer of prayers) {
    const time = prayerTimes[prayer.name];

    if (time && time > now) {
      next = { name: prayer.name, time };
      break;
    }
  }

  if (!next && tomorrowFajr) {
    next = { name: "Fajr", time: tomorrowFajr };
  }

  if (!next) return;

  document.getElementById("nextName").textContent = next.name;
  document.getElementById("nextTime").textContent = formatTime(next.time);

  document.getElementById("nextMessage").textContent =
    next.name === "Fajr" && next.time.getDate() !== now.getDate()
      ? "Tomorrow's first prayer"
      : "Time remaining until " + next.name;

  const remaining = Math.max(0, next.time.getTime() - now.getTime());
  const totalSeconds = Math.floor(remaining / 1000);

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  document.getElementById("countdown").textContent =
    `${String(hours).padStart(2, "0")}:` +
    `${String(minutes).padStart(2, "0")}:` +
    `${String(seconds).padStart(2, "0")}`;
}

async function checkNewDay() {
  const newDay = getTodayKey();

  if (newDay !== currentDay) {
    currentDay = newDay;
    selectedDateKey = newDay;
    calendarDate = new Date();
    prayerTimes = {};
    tomorrowFajr = null;
    timingsError = false;

    renderPrayers();
    await loadPrayerTimings();
  }
}

renderPrayers();
updateClock();
loadPrayerTimings();

setInterval(updateClock, 1000);
setInterval(updateNextPrayer, 1000);
setInterval(checkNewDay, 15000);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .catch((error) => {
        console.error("SalahTrack offline setup failed:", error);
      });
  });
}
