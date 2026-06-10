export const State = {
  isDev: false,
  profile: {},
  blockpost: [],
  rationData: null,
  currentCategory: 'Фрукти',
  currentSoulStates: [],
  quiz: {
    currentQuestion: 0,
    answers: {}
  }
};

export function saveToLocalStorage() {
  localStorage.setItem('ayurvedaProfile', JSON.stringify(State.profile));
}

export function loadFromLocalStorage() {
  const saved = localStorage.getItem('ayurvedaProfile');
  if (saved) {
    try {
      State.profile = JSON.parse(saved);
    } catch (e) {
      console.error('Local storage parse error', e);
    }
  }
}

export function checkLastActive() {
  const lastActive = localStorage.getItem('lastActiveTimestamp');
  const now = Date.now();
  const EIGHT_HOURS = 8 * 60 * 60 * 1000;
  
  if (lastActive && (now - parseInt(lastActive)) > EIGHT_HOURS) {
    document.getElementById('app').classList.add('hidden');
    document.getElementById('welcome-back-screen').classList.remove('hidden');
    return true; 
  }
  
  localStorage.setItem('lastActiveTimestamp', now.toString());
  return false;
}

export function resumeApp() {
  localStorage.setItem('lastActiveTimestamp', Date.now().toString());
  document.getElementById('welcome-back-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('app').style.animation = 'fadeIn 0.5s ease-in-out';
}

document.addEventListener('click', () => {
  localStorage.setItem('lastActiveTimestamp', Date.now().toString());
});
